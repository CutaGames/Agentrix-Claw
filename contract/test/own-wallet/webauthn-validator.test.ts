import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { ethers } from "hardhat";
import { Contract, ZeroAddress, getBytes, keccak256 } from "ethers";
import {
  AUTH_TUPLE,
  P256_N,
  VENDOR_DIR,
  WEBAUTHN_IFACE,
  WEBAUTHN_VALIDATOR,
  assertion,
  authValues,
  buildOp,
  coder,
  credentialIdOf,
  deployAccount,
  executeSingle,
  newSoftP256,
  refusal,
  rootOp,
  signRoot,
  submit,
  useVendor,
  userOpHashOf,
  vectors,
} from "./fixture";

/**
 * L8-6 S2: Rhinestone WebAuthnValidator 0x…3F33 as root (design 1a H1; candidate commits in manifest.json).
 */
describe("own wallet root: WebAuthnValidator", function () {
  useVendor();
  const validator = () => new Contract(WEBAUTHN_VALIDATOR, WEBAUTHN_IFACE, ethers.provider);

  async function stateless(hash: string, signature: string, data: string): Promise<boolean | "revert"> {
    try {
      return await validator().validateSignatureWithData(hash, signature, data);
    } catch {
      return "revert";
    }
  }

  it("is the pinned module: name WebAuthnValidator, version 1.0.0", async function () {
    expect(await validator().name()).to.equal("WebAuthnValidator");
    expect(await validator().version()).to.equal("1.0.0");
  });

  it("fixed vectors (soft key, expected from eth_call on 97): valid passes, every tampered byte and a high s fail", async function () {
    const cases = vectors().webauthnSignature;
    expect(cases.filter((c: any) => c.expected === true).length).to.equal(2);
    for (const c of cases) {
      const got = await stateless(c.hash, c.statelessSignature, c.statelessData);
      expect(got === true, c.name).to.equal(c.expected === true);
    }
  });

  it("real passkey vectors (R15, recorded by coord on localhost)", async function () {
    const file = path.join(VENDOR_DIR, "webauthn-real-vectors.json");
    if (!fs.existsSync(file)) {
      // Recorded by a person with a real authenticator (plan section 5 item 5); impl.md says so while it is missing.
      this.skip();
    }
    const real = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const v of real.vectors) {
      const x = BigInt(v.pubKeyX);
      const y = BigInt(v.pubKeyY);
      const data = coder.encode(["tuple(bool,uint256,bytes32[],tuple(uint256,uint256,bool)[])", "address"], [[true, 1, [credentialIdOf({ x, y }, ZeroAddress)], [[x, y, v.requireUV]]], ZeroAddress]);
      const auth = { ...v.auth, r: BigInt(v.auth.r), s: BigInt(v.auth.s) };
      const sig = coder.encode([`${AUTH_TUPLE}[]`], [[authValues(auth)]]);
      expect(await stateless(v.hash, sig, data), v.name).to.equal(true);
      const tampered = coder.encode([`${AUTH_TUPLE}[]`], [[authValues({ ...auth, s: P256_N - auth.s })]]);
      expect(await stateless(v.hash, tampered, data), `${v.name} high s`).to.not.equal(true);
    }
  });

  it("credential id = keccak256(abi.encode(x, y, account))", async function () {
    const key = newSoftP256();
    const account = ethers.Wallet.createRandom().address;
    expect(await validator().generateCredentialId(key.x, key.y, account)).to.equal(keccak256(coder.encode(["uint256", "uint256", "address"], [key.x, key.y, account])));
  });

  it("root UserOps: valid passes (precompile and software path); tampered authenticatorData, r, s or a high s are AA24", async function () {
    const acct = await deployAccount();
    const payee = ethers.Wallet.createRandom().address;
    const [payer] = await ethers.getSigners();
    await (await payer.sendTransaction({ to: acct.address, value: ethers.parseEther("1") })).wait();
    const call = executeSingle(payee, 1000n, "0x");

    for (const usePrecompile of [true, false]) {
      const op = await signRoot(await buildOp({ sender: acct.address, callData: call }), acct.key, usePrecompile);
      expect((await submit(op)).success, `usePrecompile ${usePrecompile}`).to.equal(true);
    }
    expect(await ethers.provider.getBalance(payee)).to.equal(2000n);

    const base = await buildOp({ sender: acct.address, callData: call });
    const hash = await userOpHashOf(base);
    const good = assertion(acct.key, hash);
    const ad = getBytes(good.authenticatorData);
    ad[33] ^= 0x01;
    const variants = {
      authenticatorData: { ...good, authenticatorData: ethers.hexlify(ad) },
      r: { ...good, r: good.r ^ 1n },
      s: { ...good, s: good.s ^ 1n },
      highS: { ...good, s: P256_N - good.s },
      otherChallenge: assertion(acct.key, keccak256(hash)),
    };
    for (const [name, auth] of Object.entries(variants)) {
      const signature = coder.encode(["bytes32[]", "bool", `${AUTH_TUPLE}[]`], [[credentialIdOf(acct.key, acct.address)], true, [authValues(auth)]]);
      expect(await refusal({ ...base, signature }), name).to.match(/AA24/);
    }
  });

  it("a credential id that is not the account's is refused", async function () {
    const acct = await deployAccount();
    const stranger = newSoftP256();
    const base = await buildOp({ sender: acct.address, callData: executeSingle(acct.address, 0n, "0x") });
    const hash = await userOpHashOf(base);
    const signature = coder.encode(["bytes32[]", "bool", `${AUTH_TUPLE}[]`], [[credentialIdOf(stranger, acct.address)], true, [authValues(assertion(stranger, hash))]]);
    expect(await refusal({ ...base, signature })).to.match(/AA2[34]/);
  });

  it("addCredential, setThreshold and removeCredential work; removing down to the threshold is refused", async function () {
    const acct = await deployAccount();
    const second = newSoftP256();
    const v = validator();
    const add = executeSingle(WEBAUTHN_VALIDATOR, 0n, WEBAUTHN_IFACE.encodeFunctionData("addCredential", [second.x, second.y, true]));
    expect((await submit(await rootOp(acct, add))).success).to.equal(true);
    expect((await v.getCredentialIds(acct.address)).length).to.equal(2);

    // the second passkey alone can now sign a root UserOp
    const bySecond = await signRoot(await buildOp({ sender: acct.address, callData: executeSingle(acct.address, 0n, "0x") }), second);
    expect((await submit(bySecond)).success).to.equal(true);

    const setTwo = executeSingle(WEBAUTHN_VALIDATOR, 0n, WEBAUTHN_IFACE.encodeFunctionData("setThreshold", [2]));
    expect((await submit(await rootOp(acct, setTwo))).success).to.equal(true);
    expect(await v.threshold(acct.address)).to.equal(2n);

    // threshold 2: one signature is not enough
    expect(await refusal(await rootOp(acct, executeSingle(acct.address, 0n, "0x")))).to.match(/AA24/);

    // two signatures, credential ids sorted ascending
    const op2 = await buildOp({ sender: acct.address, callData: executeSingle(WEBAUTHN_VALIDATOR, 0n, WEBAUTHN_IFACE.encodeFunctionData("setThreshold", [1])) });
    const hash = await userOpHashOf(op2);
    const pairs = [acct.key, second].map((k) => ({ id: credentialIdOf(k, acct.address), auth: assertion(k, hash) })).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    const both = coder.encode(["bytes32[]", "bool", `${AUTH_TUPLE}[]`], [pairs.map((p) => p.id), true, pairs.map((p) => authValues(p.auth))]);
    expect((await submit({ ...op2, signature: both })).success).to.equal(true);
    expect(await v.threshold(acct.address)).to.equal(1n);

    const remove = executeSingle(WEBAUTHN_VALIDATOR, 0n, WEBAUTHN_IFACE.encodeFunctionData("removeCredential", [second.x, second.y]));
    expect((await submit(await rootOp(acct, remove))).success).to.equal(true);
    expect((await v.getCredentialIds(acct.address)).length).to.equal(1);

    const removeLast = executeSingle(WEBAUTHN_VALIDATOR, 0n, WEBAUTHN_IFACE.encodeFunctionData("removeCredential", [acct.key.x, acct.key.y]));
    expect((await submit(await rootOp(acct, removeLast))).success, "count <= threshold").to.equal(false);
    expect((await v.getCredentialIds(acct.address)).length).to.equal(1);
  });
});
