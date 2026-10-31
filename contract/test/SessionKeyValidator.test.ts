import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { assertSmartAccountTestnet, SMART_ACCOUNT_TESTNET_CHAIN_IDS } from "../scripts/lib/testnet-guard";

/**
 * L8 D6 · SessionKeyValidator: the chain itself keeps an Agent's session key inside its limits.
 * The mock account stands in for Kernel + EntryPoint (see MockSessionAccount.sol); the validator sees the account as
 * msg.sender exactly as it would from a real Kernel.
 */
describe("SessionKeyValidator", function () {
  const MODE_BATCH = "0x01" + "00".repeat(31);
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const ETH = (n: string) => ethers.parseEther(n);

  let owner: any, outsider: any;
  let validator: any, account: any;
  let validatorAddr: string, accountAddr: string;
  let key: any, payeeA: string, payeeB: string, stranger: string;
  let nonce = 0;

  const later = async (seconds: number) => (await time.latest()) + seconds;

  async function ownerCall(to: string, data: string) {
    return account.connect(owner).ownerCall(to, data);
  }
  async function grant(opts: { single?: bigint; daily?: bigint; monthly?: bigint; until?: number; targets?: string[]; key?: any } = {}) {
    const k = opts.key ?? key;
    const data = validator.interface.encodeFunctionData("grantSession", [
      k.address,
      opts.single ?? ETH("1"),
      opts.daily ?? ETH("3"),
      opts.monthly ?? ETH("10"),
      opts.until ?? (await later(86400)),
      opts.targets ?? [payeeA],
    ]);
    return ownerCall(validatorAddr, data);
  }

  function execCallData(execs: Array<[string, bigint, string]>, mode = MODE_BATCH) {
    const exec = coder.encode(["tuple(address target,uint256 value,bytes callData)[]"], [execs]);
    return account.interface.encodeFunctionData("execute", [mode, exec]);
  }
  function payment(target: string, value: bigint, opts: { recordKey?: string; recordTarget?: string; recordAmount?: bigint; data?: string } = {}) {
    const record = validator.interface.encodeFunctionData("recordSpend", [opts.recordKey ?? key.address, opts.recordTarget ?? target, opts.recordAmount ?? value]);
    return execCallData([
      [validatorAddr, 0n, record],
      [target, value, opts.data ?? "0x"],
    ]);
  }
  async function signedOp(callData: string, signer: any = key) {
    nonce += 1;
    const hash = ethers.keccak256(coder.encode(["bytes", "uint256"], [callData, nonce]));
    const signature = await signer.signMessage(ethers.getBytes(hash));
    const op = {
      sender: accountAddr,
      nonce,
      initCode: "0x",
      callData,
      accountGasLimits: ethers.ZeroHash,
      preVerificationGas: 0,
      gasFees: ethers.ZeroHash,
      paymasterAndData: "0x",
      signature,
    };
    return { op, hash };
  }
  async function send(callData: string, signer: any = key) {
    const { op, hash } = await signedOp(callData, signer);
    return account.handleOp(validatorAddr, op, hash);
  }

  beforeEach(async function () {
    [owner, outsider] = await ethers.getSigners();
    const V = await ethers.getContractFactory("SessionKeyValidator");
    validator = await V.deploy();
    validatorAddr = await validator.getAddress();
    const A = await ethers.getContractFactory("MockSessionAccount");
    account = await A.deploy(owner.address);
    accountAddr = await account.getAddress();
    await owner.sendTransaction({ to: accountAddr, value: ETH("20") });
    key = ethers.Wallet.createRandom();
    payeeA = ethers.Wallet.createRandom().address;
    payeeB = ethers.Wallet.createRandom().address;
    stranger = ethers.Wallet.createRandom().address;
    await ownerCall(validatorAddr, validator.interface.encodeFunctionData("onInstall", ["0x"]));
  });

  describe("a good session", function () {
    it("lets the key pay a listed payee inside the limits, and counts it", async function () {
      await grant();
      await send(payment(payeeA, ETH("0.5")));
      expect(await ethers.provider.getBalance(payeeA)).to.equal(ETH("0.5"));
      const s = await validator.session(accountAddr, key.address);
      expect(s.usedDay).to.equal(ETH("0.5"));
      expect(s.usedMonth).to.equal(ETH("0.5"));
      const [ok] = await validator.canSpend(accountAddr, key.address, payeeA, ETH("1"));
      expect(ok).to.equal(true);
    });

    it("is a module of type 1 and reports installed", async function () {
      expect(await validator.isModuleType(1)).to.equal(true);
      expect(await validator.isModuleType(2)).to.equal(false);
      expect(await validator.isInitialized(accountAddr)).to.equal(true);
      expect(await validator.isInitialized(outsider.address)).to.equal(false);
    });

    it("returns the expiry in validationData for the EntryPoint to enforce", async function () {
      const until = await later(86400);
      await grant({ until });
      const { op, hash } = await signedOp(payment(payeeA, ETH("0.1")));
      const vd = await account.validateOnly(validatorAddr, op, hash);
      expect(vd >> 160n).to.equal(BigInt(until));
      expect(vd & ((1n << 160n) - 1n)).to.equal(0n);
    });
  });

  describe("negative (money): the chain says no", function () {
    it("a payment over the single limit reverts", async function () {
      await grant({ single: ETH("1") });
      await expect(send(payment(payeeA, ETH("1.01")))).to.be.revertedWith("exceeds single limit");
      expect(await ethers.provider.getBalance(payeeA)).to.equal(0n);
    });

    it("payments over the daily limit revert, and the whole operation is undone", async function () {
      await grant({ single: ETH("1"), daily: ETH("1.5"), monthly: ETH("10") });
      await send(payment(payeeA, ETH("1")));
      await expect(send(payment(payeeA, ETH("1")))).to.be.revertedWith("exceeds daily limit");
      expect(await ethers.provider.getBalance(payeeA)).to.equal(ETH("1"));
      await send(payment(payeeA, ETH("0.5")));
      expect(await ethers.provider.getBalance(payeeA)).to.equal(ETH("1.5"));
    });

    it("the daily bucket rolls over after a day", async function () {
      await grant({ single: ETH("1"), daily: ETH("1"), monthly: ETH("10"), until: await later(10 * 86400) });
      await send(payment(payeeA, ETH("1")));
      await time.increase(86400 + 1);
      await send(payment(payeeA, ETH("1")));
      expect(await ethers.provider.getBalance(payeeA)).to.equal(ETH("2"));
    });

    it("payments over the monthly limit revert", async function () {
      // Start just after a 30-day bucket boundary so "tomorrow" is still the same bucket (otherwise this is flaky 1 in 30).
      const bucket = 30 * 86400;
      await time.increaseTo((Math.floor((await time.latest()) / bucket) + 1) * bucket + 3600);
      await grant({ single: ETH("1"), daily: ETH("1"), monthly: ETH("1.5"), until: await later(10 * 86400) });
      await send(payment(payeeA, ETH("1")));
      await time.increase(86400 + 1);
      await expect(send(payment(payeeA, ETH("1")))).to.be.revertedWith("exceeds monthly limit");
    });

    it("a payee that is not on the list is refused, at validation", async function () {
      await grant({ targets: [payeeA] });
      await expect(send(payment(payeeB, ETH("0.1")))).to.be.revertedWith("target not whitelisted");
      await expect(send(payment(stranger, ETH("0.1")))).to.be.revertedWith("target not whitelisted");
    });

    it("a zero payment is refused", async function () {
      await grant();
      await expect(send(payment(payeeA, 0n))).to.be.revertedWith("zero amount");
    });
  });

  describe("negative (permissions): the shape of the operation is fixed", function () {
    beforeEach(async function () {
      await grant();
    });

    it("the first call must record exactly the payment that follows", async function () {
      await expect(send(payment(payeeA, ETH("0.5"), { recordAmount: ETH("0.1") }))).to.be.revertedWith("record call mismatch");
      await expect(send(payment(payeeA, ETH("0.5"), { recordTarget: payeeB }))).to.be.revertedWith("record call mismatch");
      await expect(send(payment(payeeA, ETH("0.5"), { recordKey: ethers.Wallet.createRandom().address }))).to.be.revertedWith("record call mismatch");
    });

    it("a lone payment with no record call is refused", async function () {
      await expect(send(execCallData([[payeeA, ETH("0.1"), "0x"]]))).to.be.revertedWith("batch shape");
    });

    it("three calls, or a record call that is not first, are refused", async function () {
      const record = validator.interface.encodeFunctionData("recordSpend", [key.address, payeeA, ETH("0.1")]);
      await expect(send(execCallData([[validatorAddr, 0n, record], [payeeA, ETH("0.1"), "0x"], [payeeA, ETH("0.1"), "0x"]]))).to.be.revertedWith("batch shape");
      await expect(send(execCallData([[payeeA, ETH("0.1"), "0x"], [validatorAddr, 0n, record]]))).to.be.revertedWith("first call must record");
    });

    it("a call with data (any other contract, any token transfer) is refused", async function () {
      await expect(send(payment(payeeA, ETH("0.1"), { data: "0xa9059cbb" }))).to.be.revertedWith("plain transfers only");
    });

    it("the key cannot use the validator's own management functions to widen itself", async function () {
      const grantData = validator.interface.encodeFunctionData("grantSession", [key.address, ETH("100"), ETH("100"), ETH("100"), await later(86400), [payeeA]]);
      await expect(send(execCallData([[validatorAddr, 0n, grantData], [payeeA, ETH("0.1"), "0x"]]))).to.be.revertedWith("record call mismatch");
      const revokeData = validator.interface.encodeFunctionData("revokeSession", [key.address]);
      await expect(send(execCallData([[validatorAddr, 0n, revokeData], [payeeA, ETH("0.1"), "0x"]]))).to.be.revertedWith("record call mismatch");
    });

    it("single call mode and other modes are refused", async function () {
      const record = validator.interface.encodeFunctionData("recordSpend", [key.address, payeeA, ETH("0.1")]);
      const single = ethers.solidityPacked(["address", "uint256", "bytes"], [payeeA, ETH("0.1"), "0x"]);
      const callData = account.interface.encodeFunctionData("execute", ["0x" + "00".repeat(32), single]);
      await expect(send(callData)).to.be.revertedWith("mode not allowed");
      const tryMode = "0x0100" + "00".repeat(29) + "01"; // batch, but not the default exec type / has payload
      const exec = coder.encode(["tuple(address target,uint256 value,bytes callData)[]"], [[[validatorAddr, 0n, record], [payeeA, ETH("0.1"), "0x"]]]);
      await expect(send(account.interface.encodeFunctionData("execute", [tryMode, exec]))).to.be.revertedWith("mode not allowed");
    });

    it("something that is not execute(bytes32,bytes) is refused", async function () {
      const data = account.interface.encodeFunctionData("ownerCall", [payeeA, "0x"]);
      await expect(send(data)).to.be.revertedWith("not execute");
      await expect(send("0x")).to.be.revertedWith("not execute");
    });

    it("call data with trailing bytes (a second reading of the same bytes) is refused", async function () {
      const good = payment(payeeA, ETH("0.1"));
      await expect(send(good + "deadbeef")).to.be.revertedWith("non canonical call data");
    });

    it("the key cannot sign for the account (ERC-1271)", async function () {
      const sig = await key.signMessage("hello");
      expect(await validator.isValidSignatureWithSender(accountAddr, ethers.id("hello"), sig)).to.equal("0xffffffff");
    });
  });

  describe("negative (permissions): signatures and sessions", function () {
    it("a key that was never granted is refused", async function () {
      await grant();
      const other = ethers.Wallet.createRandom();
      await expect(send(payment(payeeA, ETH("0.1")), other)).to.be.revertedWith("signature failed");
    });

    it("the owner revokes the key and the next operation fails at once", async function () {
      await grant();
      await send(payment(payeeA, ETH("0.1")));
      await ownerCall(validatorAddr, validator.interface.encodeFunctionData("revokeSession", [key.address]));
      await expect(send(payment(payeeA, ETH("0.1")))).to.be.revertedWith("signature failed");
      await expect(validator.recordSpend(key.address, payeeA, 1n)).to.be.revertedWith("unknown session");
      const [ok, reason] = await validator.canSpend(accountAddr, key.address, payeeA, 1n);
      expect([ok, reason]).to.deep.equal([false, "session revoked"]);
    });

    it("a revoked key can never be granted again", async function () {
      await grant();
      await ownerCall(validatorAddr, validator.interface.encodeFunctionData("revokeSession", [key.address]));
      await expect(grant()).to.be.revertedWith("session exists");
    });

    it("an expired key is refused by the clock, and by recordSpend itself", async function () {
      await grant({ until: await later(120) });
      await time.increase(200);
      await expect(send(payment(payeeA, ETH("0.1")))).to.be.revertedWith("expired");
      const record = validator.interface.encodeFunctionData("recordSpend", [key.address, payeeA, ETH("0.1")]);
      await expect(ownerCall(validatorAddr, record)).to.be.revertedWith("session expired");
    });

    it("a signature with a high s (the malleable twin), the wrong length or a wrong v is refused", async function () {
      await grant();
      const callData = payment(payeeA, ETH("0.1"));
      const { op, hash } = await signedOp(callData);
      const sig = ethers.Signature.from(op.signature);
      const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
      const highS = ethers.toBeHex(n - BigInt(sig.s), 32);
      const twin = ethers.concat([sig.r, highS, ethers.toBeHex(sig.v === 27 ? 28 : 27, 1)]);
      expect(await account.validateOnly(validatorAddr, { ...op, signature: twin }, hash)).to.equal(1n);
      expect(await account.validateOnly(validatorAddr, { ...op, signature: op.signature.slice(0, -2) }, hash)).to.equal(1n);
      expect(await account.validateOnly(validatorAddr, { ...op, signature: op.signature.slice(0, -2) + "05" }, hash)).to.equal(1n);
      expect(await account.validateOnly(validatorAddr, op, hash)).to.not.equal(1n);
    });

    it("a signature over another hash does not validate this operation", async function () {
      await grant();
      const { op } = await signedOp(payment(payeeA, ETH("0.1")));
      expect(await account.validateOnly(validatorAddr, op, ethers.id("another operation"))).to.equal(1n);
    });

    it("an operation whose sender is not the calling account is refused", async function () {
      await grant();
      const { op, hash } = await signedOp(payment(payeeA, ETH("0.1")));
      expect(await account.validateOnly(validatorAddr, { ...op, sender: outsider.address }, hash)).to.equal(1n);
    });

    it("after uninstall every session is dead", async function () {
      await grant();
      await ownerCall(validatorAddr, validator.interface.encodeFunctionData("onUninstall", ["0x"]));
      await expect(send(payment(payeeA, ETH("0.1")))).to.be.revertedWith("signature failed");
    });
  });

  describe("negative (permissions): nobody else can touch the account's allowance", function () {
    it("an outsider cannot grant, revoke or record for the account", async function () {
      await grant();
      await expect(validator.connect(outsider).grantSession(key.address, 1n, 1n, 1n, await later(86400), [payeeA])).to.be.revertedWith("not installed");
      await expect(validator.connect(outsider).revokeSession(key.address)).to.be.revertedWith("unknown session");
      await expect(validator.connect(outsider).recordSpend(key.address, payeeA, 1n)).to.be.revertedWith("unknown session");
      const s = await validator.session(accountAddr, key.address);
      expect(s.usedDay).to.equal(0n);
      expect(s.revoked).to.equal(false);
    });

    it("an outsider who installs the module for itself still cannot reach the account's sessions", async function () {
      await grant();
      await validator.connect(outsider).onInstall("0x");
      await expect(validator.connect(outsider).recordSpend(key.address, payeeA, ETH("0.1"))).to.be.revertedWith("unknown session");
      const s = await validator.session(accountAddr, key.address);
      expect(s.usedDay).to.equal(0n);
    });
  });

  describe("granting needs sane terms", function () {
    it("refuses zero limits, unordered limits and an expiry in the past", async function () {
      await expect(grant({ single: 0n })).to.be.revertedWith("limits not ordered");
      await expect(grant({ single: ETH("2"), daily: ETH("1") })).to.be.revertedWith("limits not ordered");
      await expect(grant({ daily: ETH("5"), monthly: ETH("4") })).to.be.revertedWith("limits not ordered");
      await expect(grant({ until: (await time.latest()) - 1 })).to.be.revertedWith("expiry in the past");
    });

    it("refuses an empty, duplicate, zero, self or oversized payee list", async function () {
      await expect(grant({ targets: [] })).to.be.revertedWith("bad target count");
      await expect(grant({ targets: [payeeA, payeeA] })).to.be.revertedWith("duplicate target");
      await expect(grant({ targets: [ethers.ZeroAddress] })).to.be.revertedWith("bad target");
      await expect(grant({ targets: [accountAddr] })).to.be.revertedWith("bad target");
      await expect(grant({ targets: [validatorAddr] })).to.be.revertedWith("bad target");
      const many = Array.from({ length: 21 }, () => ethers.Wallet.createRandom().address);
      await expect(grant({ targets: many })).to.be.revertedWith("bad target count");
    });

    it("refuses a zero key and the account itself as the key", async function () {
      await expect(grant({ key: { address: ethers.ZeroAddress } })).to.be.revertedWith("bad key");
      await expect(grant({ key: { address: accountAddr } })).to.be.revertedWith("bad key");
    });
  });
});

describe("smart account testnet guard (scripts)", function () {
  it("allows exactly the two testnets", function () {
    expect([...SMART_ACCOUNT_TESTNET_CHAIN_IDS]).to.deep.equal([97, 84532]);
    expect(assertSmartAccountTestnet(97)).to.equal(97);
    expect(assertSmartAccountTestnet(84532n)).to.equal(84532);
    expect(assertSmartAccountTestnet("97")).to.equal(97);
  });

  it("negative: every mainnet and every odd value is refused", function () {
    for (const id of [1, 56, 8453, 10, 137, 42161, 1776, 0, -1, 97.5, NaN]) expect(() => assertSmartAccountTestnet(id as number)).to.throw(/refusing to run/);
    for (const id of ["56", "0x61", " 97", "97 ", "1e2", "", "bsc", undefined, null, 56n, 1n]) expect(() => assertSmartAccountTestnet(id as never)).to.throw(/refusing to run/);
  });
});
