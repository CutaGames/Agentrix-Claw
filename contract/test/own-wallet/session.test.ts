import { expect } from "chai";
import * as path from "path";
import { ethers } from "hardhat";
import { Contract, Interface, concat, getAddress, getBytes, solidityPacked } from "ethers";
import {
  AUTH_TUPLE,
  P256_N,
  SESSION_CONFIG_ACCOUNT,
  SMART_SESSIONS_CONFIG_MAX_BYTES,
  assertion,
  authValues,
  canonicalSessionValidatorData,
  credentialIdOf,
  sessionValidatorData,
  userOpHashOf,
  ENTRY_POINT,
  EXECUTE_SELECTOR,
  KERNEL_FACTORY,
  MODE_BATCH,
  REGISTRY,
  SESSION_NONCE_KEY,
  SMART_SESSIONS,
  SMART_SESSIONS_IFACE,
  SOCIAL_RECOVERY,
  VALUE_SELECTOR,
  VENDOR_DIR,
  WEBAUTHN_IFACE,
  WEBAUTHN_VALIDATOR,
  KERNEL_IFACE,
  SessionSpec,
  buildOp,
  coder,
  deployAccount,
  executeSingle,
  increaseTime,
  installSessionsCall,
  latestTimestamp,
  newSoftP256,
  permissionIdOf,
  policyAddress,
  readJson,
  refusal,
  rootOp,
  sessionOp,
  signSession,
  spendingLimitInit,
  submit,
  timeFrameInit,
  uniActionTransferInit,
  usageLimitInit,
  useVendor,
  valueLimitInit,
} from "./fixture";

/**
 * L8-6 S2: device session keys under SmartSessions v1.0.0 (design 1b H4, W2.3, R2-M10).
 *
 * Sessions are enabled by installing SmartSessions with UNSAFE_ENABLE install data. v1.0.0's `enableSessions` (and
 * ENABLE mode) always ask the ERC-7484 registry 0x…51B2 about every policy and the session validator, which needs the
 * account to trust attesters there; S7 has to settle that path (recorded in progress.json notes).
 *
 * The session validator config is layout B (coord 10-29 19:3x): SmartSessions v1.0.0 stores at most 320 bytes of it,
 * the canonical WebAuthnValidator encoding is 384. Layout B: usePrecompile false (software P-256), account address(1),
 * requireUV false. Its golden vector, the 384-byte negative evidence and the cross-account replay test are below.
 */
const ERC20 = new Interface(["function transfer(address to, uint256 amount) returns (bool)", "function balanceOf(address) view returns (uint256)", "function mint(address to, uint256 amount)"]);

describe("own wallet sessions (SmartSessions + WebAuthnValidator stateless, device format)", function () {
  useVendor();

  it("fixed device-format vectors (expected from eth_call on 97): valid passes, tampered bytes and a high s fail", async function () {
    const file = readJson(path.join(VENDOR_DIR, "session-signature-vectors.json"));
    const validator = new Contract(WEBAUTHN_VALIDATOR, WEBAUTHN_IFACE, ethers.provider);
    expect(file.cases[0].expected).to.equal(true);
    for (const c of file.cases) {
      let got: boolean;
      try {
        got = await validator.validateSignatureWithData(c.hash, c.signature, c.sessionValidatorData);
      } catch {
        got = false;
      }
      expect(got, c.name).to.equal(c.expected === true);
    }
  });

  async function setup(extra: Partial<SessionSpec> = {}, opts: { nativeLimit?: bigint; validUntil?: number } = {}) {
    const acct = await deployAccount();
    const device = newSoftP256();
    const payee = ethers.Wallet.createRandom().address;
    const [payer] = await ethers.getSigners();
    await (await payer.sendTransaction({ to: acct.address, value: ethers.parseEther("1") })).wait();
    const validUntil = opts.validUntil ?? (await latestTimestamp()) + 3600;
    const spec: SessionSpec = {
      device,
      actions: [[VALUE_SELECTOR, payee, [[policyAddress("valueLimitPolicy"), valueLimitInit(opts.nativeLimit ?? 1000n)], [policyAddress("timeFramePolicy"), timeFrameInit(validUntil)]]]],
      ...extra,
    };
    const install = await rootOp(acct, installSessionsCall(acct.address, [spec]));
    const installed = await submit(install);
    expect(installed.success, `install SmartSessions with the session (revert data ${installed.revertReason ?? "-"})`).to.equal(true);
    const permissionId = permissionIdOf(spec);
    const ss = new Contract(SMART_SESSIONS, SMART_SESSIONS_IFACE, ethers.provider);
    expect(await ss.isPermissionEnabled(permissionId, acct.address)).to.equal(true);
    return { acct, device, payee, permissionId, spec, validUntil };
  }

  it("native: within the cumulative limit passes; the payment that goes over it is refused", async function () {
    const { acct, device, payee, permissionId } = await setup({}, { nativeLimit: 1000n });
    expect((await submit(await sessionOp(acct.address, permissionId, device, executeSingle(payee, 600n, "0x")))).success).to.equal(true);
    expect(await refusal(await sessionOp(acct.address, permissionId, device, executeSingle(payee, 600n, "0x")))).to.match(/AA2[34]/);
    expect(await ethers.provider.getBalance(payee)).to.equal(600n);
  });

  it("expired session: refused (TimeFrame, AA22)", async function () {
    const { acct, device, payee, permissionId, validUntil } = await setup();
    await increaseTime(validUntil - (await latestTimestamp()) + 10);
    expect(await refusal(await sessionOp(acct.address, permissionId, device, executeSingle(payee, 1n, "0x")))).to.match(/AA22|AA2[34]/);
  });

  it("revoked session (removeSession by root): refused, and a replayed signed UserOp is refused by nonce", async function () {
    const { acct, device, payee, permissionId } = await setup();
    const signed = await sessionOp(acct.address, permissionId, device, executeSingle(payee, 1n, "0x"));
    expect((await submit(signed)).success).to.equal(true);
    expect(await refusal(signed)).to.match(/AA25/);
    const remove = executeSingle(SMART_SESSIONS, 0n, SMART_SESSIONS_IFACE.encodeFunctionData("removeSession", [permissionId]));
    expect((await submit(await rootOp(acct, remove))).success).to.equal(true);
    expect(await refusal(await sessionOp(acct.address, permissionId, device, executeSingle(payee, 1n, "0x")))).to.match(/AA2[34]/);
  });

  it("A's session key cannot sign for B (B's permission id or A's)", async function () {
    const a = await setup();
    const b = await setup();
    expect(await refusal(await sessionOp(b.acct.address, b.permissionId, a.device, executeSingle(b.payee, 1n, "0x")))).to.match(/AA24/);
    expect(await refusal(await sessionOp(b.acct.address, a.permissionId, a.device, executeSingle(a.payee, 1n, "0x")))).to.match(/AA2[34]/);
  });

  it("a tampered device signature byte or a high s is refused", async function () {
    const { acct, device, payee, permissionId } = await setup();
    const op = await sessionOp(acct.address, permissionId, device, executeSingle(payee, 1n, "0x"));
    const sig = getBytes(op.signature);
    sig[sig.length - 40] ^= 0x01;
    expect(await refusal({ ...op, signature: ethers.hexlify(sig) })).to.match(/AA2[34]/);

    const base = await buildOp({ sender: acct.address, callData: executeSingle(payee, 1n, "0x"), nonceKey: SESSION_NONCE_KEY });
    const auth = assertion(device, await userOpHashOf(base), { device: true });
    const high = { ...auth, s: P256_N - auth.s };
    const signature = concat(["0x00", permissionId, coder.encode([`${AUTH_TUPLE}[]`], [[authValues(high)]])]);
    expect(await refusal({ ...base, signature }), "high s").to.match(/AA2[34]/);

    // wrong public key: a well-formed device signature from another key under this session's permission id
    const stranger = newSoftP256();
    expect(await refusal(await signSession(base, permissionId, stranger)), "wrong public key").to.match(/AA24/);
  });

  it("layout B golden vector: 320 bytes (the SmartSessions v1.0.0 limit), the bytes and every decoded field are what we want, and the validator gives 97's eth_call answers", async function () {
    const file = readJson(path.join(VENDOR_DIR, "session-config-layout-b-vectors.json"));
    const key = { x: BigInt(file.key.pubKeyX), y: BigInt(file.key.pubKeyY) };
    const data = sessionValidatorData(key);
    expect(data.toLowerCase()).to.equal(file.sessionValidatorData.toLowerCase());
    expect(getBytes(data).length).to.equal(file.length).and.to.be.at.most(SMART_SESSIONS_CONFIG_MAX_BYTES);
    const [ctx, account] = coder.decode(["tuple(bool,uint256,bytes32[],tuple(uint256,uint256,bool)[])", "address"], data);
    expect(ctx[0], "usePrecompile").to.equal(false);
    expect(ctx[1], "threshold").to.equal(1n);
    expect([...ctx[2]], "credentialIds").to.deep.equal([credentialIdOf(key, SESSION_CONFIG_ACCOUNT)]);
    expect([...ctx[2]]).to.deep.equal(file.decoded.credentialIds);
    expect(ctx[3].map((c: unknown[]) => [c[0], c[1], c[2]]), "credentialData").to.deep.equal([[key.x, key.y, false]]);
    expect(account, "account").to.equal(getAddress(SESSION_CONFIG_ACCOUNT));
    expect(file.decoded).to.deep.equal({ usePrecompile: false, threshold: 1, credentialIds: [credentialIdOf(key, SESSION_CONFIG_ACCOUNT)], credentialData: [[file.key.pubKeyX, file.key.pubKeyY, false]], account: SESSION_CONFIG_ACCOUNT });

    const validator = new Contract(WEBAUTHN_VALIDATOR, WEBAUTHN_IFACE, ethers.provider);
    expect(file.cases[0].expected, file.cases[0].name).to.equal(true);
    expect(file.cases.filter((c: any) => c.expected === false).length).to.be.at.least(3);
    for (const c of file.cases) {
      let got: boolean;
      try {
        got = await validator.validateSignatureWithData(file.hash, c.signature, c.sessionValidatorData);
      } catch {
        got = false;
      }
      expect(got, c.name).to.equal(c.expected === true);
    }
    // 97 eth_call evidence: layout B installs; the canonical 384 bytes and 321 bytes revert with empty data
    expect(file.installOn97.layoutB320.installs).to.equal(true);
    expect(file.installOn97.canonical384).to.deep.equal({ installs: false, revertData: "0x" });
    expect(file.installOn97.random321).to.deep.equal({ installs: false, revertData: "0x" });
  });

  it("negative evidence: the canonical 384-byte config cannot be stored by SmartSessions v1.0.0, so the install UserOp fails and nothing is installed", async function () {
    const acct = await deployAccount();
    const device = newSoftP256();
    const spec: SessionSpec = {
      device,
      validatorData: canonicalSessionValidatorData(device),
      actions: [[VALUE_SELECTOR, ethers.Wallet.createRandom().address, [[policyAddress("valueLimitPolicy"), valueLimitInit(1000n)], [policyAddress("timeFramePolicy"), timeFrameInit((await latestTimestamp()) + 3600)]]]],
    };
    expect(getBytes(spec.validatorData!).length).to.equal(384);
    const outcome = await submit(await rootOp(acct, installSessionsCall(acct.address, [spec])));
    expect(outcome.success).to.equal(false);
    expect(await new Contract(acct.address, KERNEL_IFACE, ethers.provider).isModuleInstalled(1, SMART_SESSIONS, "0x")).to.equal(false);
    // the same session with layout B installs
    const fixed = { ...spec, validatorData: undefined };
    expect((await submit(await rootOp(acct, installSessionsCall(acct.address, [fixed])))).success).to.equal(true);
  });

  it("cross-account replay: a session signature for account X is refused on account Y; the binding is SmartSessions' per-account storage, not the config's account field", async function () {
    const device = newSoftP256();
    const payee = ethers.Wallet.createRandom().address;
    const validUntil = (await latestTimestamp()) + 3600;
    const actions: SessionSpec["actions"] = [[VALUE_SELECTOR, payee, [[policyAddress("valueLimitPolicy"), valueLimitInit(1000n)], [policyAddress("timeFramePolicy"), timeFrameInit(validUntil)]]]];
    const spec: SessionSpec = { device, actions };
    // Y has SmartSessions with the same device key but another session (another salt, so another permission id)
    const specY: SessionSpec = { device, actions, salt: "0x" + "00".repeat(31) + "01" };
    const pid = permissionIdOf(spec);
    const pidY = permissionIdOf(specY);
    expect(pidY).to.not.equal(pid);
    const [payer] = await ethers.getSigners();
    const x = await deployAccount();
    const y = await deployAccount();
    const z = await deployAccount();
    for (const [acct, s] of [[x, spec], [y, specY], [z, spec]] as const) {
      await (await payer.sendTransaction({ to: acct.address, value: ethers.parseEther("1") })).wait();
      expect((await submit(await rootOp(acct, installSessionsCall(acct.address, [s])))).success).to.equal(true);
    }
    // every config carries the same constant account field: it cannot be what tells X from Y
    expect(sessionValidatorData(device).slice(2 + 64, 2 + 128)).to.equal("00".repeat(31) + "01");

    // (a) a correct device signature over Y's own userOpHash under X's permission id: the stateless check passes,
    //     yet Y refuses, because Y's SmartSessions storage has no such permission
    const onY = await sessionOp(y.address, pid, device, executeSingle(payee, 1n, "0x"));
    const validator = new Contract(WEBAUTHN_VALIDATOR, WEBAUTHN_IFACE, ethers.provider);
    const devicePart = "0x" + onY.signature.slice(2 + 2 + 64);
    expect(await validator.validateSignatureWithData(await userOpHashOf(onY), devicePart, sessionValidatorData(device)), "stateless check of the same signature").to.equal(true);
    expect(await refusal(onY), "X's permission on Y").to.match(/AA2[34]/);
    // control: Y's own permission with the same device key works
    expect((await submit(await sessionOp(y.address, pidY, device, executeSingle(payee, 1n, "0x")))).success, "Y's own session").to.equal(true);

    // (b) Z has the very same permission id as X; X's signed UserOp moved onto Z (same callData, same nonce key) is
    //     refused: the signed hash covers the sender
    const onX = await sessionOp(x.address, pid, device, executeSingle(payee, 1n, "0x"));
    const zOp = await buildOp({ sender: z.address, callData: executeSingle(payee, 1n, "0x"), nonceKey: SESSION_NONCE_KEY });
    expect(zOp.nonce).to.equal(onX.nonce);
    expect(await refusal({ ...zOp, signature: onX.signature }), "X's signature on Z").to.match(/AA24/);
    expect((await submit(onX)).success, "X's own UserOp").to.equal(true);
    expect(await refusal(onX), "replay on X").to.match(/AA25/);
  });

  it("actions outside the whitelist are refused: another payee, the account itself, the module, the registry, the EntryPoint, the factory, an unconfigured selector", async function () {
    const { acct, device, permissionId } = await setup();
    const targets: Array<[string, string, bigint, string]> = [
      ["other payee", ethers.Wallet.createRandom().address, 1n, "0x"],
      ["account execute", acct.address, 0n, KERNEL_IFACE.encodeFunctionData("execute", ["0x" + "00".repeat(32), "0x"])],
      ["account installModule", acct.address, 0n, KERNEL_IFACE.encodeFunctionData("installModule", [1, SOCIAL_RECOVERY, "0x"])],
      ["SmartSessions", SMART_SESSIONS, 0n, SMART_SESSIONS_IFACE.encodeFunctionData("removeSession", [permissionId])],
      ["WebAuthnValidator", WEBAUTHN_VALIDATOR, 0n, WEBAUTHN_IFACE.encodeFunctionData("addCredential", [1n, 1n, false])],
      ["registry", REGISTRY, 0n, "0x"],
      ["EntryPoint", ENTRY_POINT, 1n, "0x"],
      ["factory", KERNEL_FACTORY, 0n, "0x"],
    ];
    for (const [name, target, value, data] of targets) {
      expect(await refusal(await sessionOp(acct.address, permissionId, device, executeSingle(target, value, data))), name).to.match(/AA2[34]/);
    }
  });

  it("a session UserOp may only carry execute: other selectors on the account are refused by Kernel", async function () {
    const { acct, device, permissionId } = await setup();
    const call = KERNEL_IFACE.encodeFunctionData("installModule", [1, SOCIAL_RECOVERY, "0x"]);
    expect(call.slice(0, 10)).to.not.equal(EXECUTE_SELECTOR);
    expect(await refusal(await sessionOp(acct.address, permissionId, device, call))).to.match(/AA2[34]/);
  });

  it("a batch in a session UserOp needs a policy for every item; one unconfigured item refuses the whole UserOp", async function () {
    const { acct, device, payee, permissionId } = await setup();
    const other = ethers.Wallet.createRandom().address;
    const batch = KERNEL_IFACE.encodeFunctionData("execute", [MODE_BATCH, coder.encode(["tuple(address,uint256,bytes)[]"], [[[payee, 1n, "0x"], [other, 1n, "0x"]]])]);
    expect(await refusal(await sessionOp(acct.address, permissionId, device, batch))).to.match(/AA2[34]/);
  });

  it("token: within the per-transfer and cumulative limits passes; a single transfer over the per-transfer limit and the one that goes over the total are refused", async function () {
    const Token = await ethers.getContractFactory("MockUSDC");
    const token = await Token.deploy();
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    const payee = ethers.Wallet.createRandom().address;
    const validUntil = (await latestTimestamp()) + 3600;
    const spec = (device: ReturnType<typeof newSoftP256>): SessionSpec => ({
      device,
      actions: [[ERC20.getFunction("transfer")!.selector, tokenAddress, [
        [policyAddress("erc20SpendingLimitPolicy"), spendingLimitInit(tokenAddress, 1000n)],
        [policyAddress("uniActionPolicy"), uniActionTransferInit(payee, 600n)],
        [policyAddress("timeFramePolicy"), timeFrameInit(validUntil)],
      ]]],
    });
    const acct = await deployAccount();
    const device = newSoftP256();
    await (await token.mint(acct.address, 10_000n)).wait();
    const installed = await submit(await rootOp(acct, installSessionsCall(acct.address, [spec(device)])));
    expect(installed.success, `install SmartSessions with the token session (revert data ${installed.revertReason ?? "-"})`).to.equal(true);
    const pid = permissionIdOf(spec(device));
    const transfer = (to: string, amount: bigint) => executeSingle(tokenAddress, 0n, ERC20.encodeFunctionData("transfer", [to, amount]));
    expect(await refusal(await sessionOp(acct.address, pid, device, transfer(payee, 601n))), "single over 600").to.match(/AA2[34]/);
    expect(await refusal(await sessionOp(acct.address, pid, device, transfer(ethers.Wallet.createRandom().address, 10n))), "other recipient").to.match(/AA2[34]/);
    expect((await submit(await sessionOp(acct.address, pid, device, transfer(payee, 600n)))).success).to.equal(true);
    expect((await submit(await sessionOp(acct.address, pid, device, transfer(payee, 400n)))).success).to.equal(true);
    expect(await refusal(await sessionOp(acct.address, pid, device, transfer(payee, 1n))), "total over 1000").to.match(/AA2[34]/);
    expect(await token.balanceOf(payee)).to.equal(1000n);
  });

  it("paymaster rule (R2-M10): without permitERC4337Paymaster a paymaster is refused; with it and TimeFrame + UsageLimit UserOp policies it passes until the count or the time runs out", async function () {
    const Paymaster = await ethers.getContractFactory("OwnWalletTestPaymaster");
    const paymaster = await Paymaster.deploy(ENTRY_POINT);
    await paymaster.waitForDeployment();
    await (await paymaster.deposit({ value: ethers.parseEther("1") })).wait();
    const pmData = solidityPacked(["address", "uint128", "uint128"], [await paymaster.getAddress(), 200_000n, 0n]);

    const plain = await setup();
    expect(await refusal(await sessionOp(plain.acct.address, plain.permissionId, plain.device, executeSingle(plain.payee, 1n, "0x"), { paymasterAndData: pmData })), "not permitted").to.match(/AA2[34]/);

    const until = (await latestTimestamp()) + 3600;
    const permitted = await setup({ permitERC4337Paymaster: true, userOpPolicies: [[policyAddress("timeFramePolicy"), timeFrameInit(until)], [policyAddress("usageLimitPolicy"), usageLimitInit(2)]] }, { nativeLimit: 100n });
    const op = () => sessionOp(permitted.acct.address, permitted.permissionId, permitted.device, executeSingle(permitted.payee, 1n, "0x"), { paymasterAndData: pmData });
    expect((await submit(await op())).success).to.equal(true);
    expect((await submit(await op())).success).to.equal(true);
    expect(await refusal(await op()), "third UserOp over UsageLimit 2").to.match(/AA2[34]/);

    const later = await setup({ permitERC4337Paymaster: true, userOpPolicies: [[policyAddress("timeFramePolicy"), timeFrameInit((await latestTimestamp()) + 600)], [policyAddress("usageLimitPolicy"), usageLimitInit(5)]] }, { nativeLimit: 100n });
    await increaseTime(700);
    expect(await refusal(await sessionOp(later.acct.address, later.permissionId, later.device, executeSingle(later.payee, 1n, "0x"), { paymasterAndData: pmData })), "past TimeFrame").to.match(/AA22|AA2[34]/);
  });
});
