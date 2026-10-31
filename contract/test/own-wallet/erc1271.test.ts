import { expect } from "chai";
import { ethers } from "hardhat";
import { concat, keccak256, toUtf8Bytes } from "ethers";
import {
  AUTH_TUPLE,
  SMART_SESSIONS,
  SOCIAL_RECOVERY,
  VALUE_SELECTOR,
  authValues,
  assertion,
  coder,
  credentialIdOf,
  deployAccount,
  foreignAssertion,
  installSessionsCall,
  isMagic,
  kernelWrappedHash,
  latestTimestamp,
  newSoftP256,
  p256ForeignKey,
  permissionIdOf,
  policyAddress,
  rootOp,
  rootSignature,
  secp256k1ServerKey,
  submit,
  timeFrameInit,
  useVendor,
  valueLimitInit,
} from "./fixture";

/**
 * L8-6 S2: ERC-1271 (design M6). Only the root passkey can produce a valid isValidSignature; server keys, random keys,
 * the session key and SocialRecovery cannot.
 */
describe("own wallet ERC-1271", function () {
  useVendor();

  it("root passkey over the Kernel-wrapped hash: magic value; the same signature for another hash: not", async function () {
    const acct = await deployAccount();
    const hash = keccak256(toUtf8Bytes("agentrix 1271 message"));
    const wrapped = await kernelWrappedHash(acct.address, hash);
    expect(await isMagic(acct.address, hash, concat(["0x00", rootSignature(acct.key, acct.address, wrapped)]))).to.equal(true);
    expect(await isMagic(acct.address, keccak256(hash), concat(["0x00", rootSignature(acct.key, acct.address, wrapped)]))).to.equal(false);
    expect(await isMagic(acct.address, hash, concat(["0x00", rootSignature(acct.key, acct.address, hash)])), "unwrapped hash").to.equal(false);
  });

  it("server keys (submitter, attester, relayer, MPC custody), a random P-256 key and the login passkey never give the magic value", async function () {
    const acct = await deployAccount();
    const hash = keccak256(toUtf8Bytes("agentrix 1271 server keys"));
    const wrapped = await kernelWrappedHash(acct.address, hash);
    const keys = [
      secp256k1ServerKey("submitter"),
      secp256k1ServerKey("attester"),
      secp256k1ServerKey("relayer"),
      secp256k1ServerKey("mpc custody"),
      p256ForeignKey("random p-256"),
      p256ForeignKey("login passkey (rp agentrix.top)"),
    ];
    for (const key of keys) {
      const opts = key.label.startsWith("login") ? { rpId: "agentrix.top", origin: "https://agentrix.top" } : {};
      const auth = foreignAssertion(key, wrapped, opts);
      const formatted = concat(["0x00", coder.encode(["bytes32[]", "bool", `${AUTH_TUPLE}[]`], [[credentialIdOf(acct.key, acct.address)], true, [authValues(auth)]])]);
      expect(await isMagic(acct.address, hash, formatted), key.label).to.equal(false);
      if (key.wallet) {
        const raw = await key.wallet.signMessage(ethers.getBytes(hash));
        expect(await isMagic(acct.address, hash, concat(["0x00", raw])), `${key.label} raw ECDSA`).to.equal(false);
        expect(await isMagic(acct.address, hash, raw), `${key.label} raw ECDSA no prefix`).to.equal(false);
      }
    }
  });

  it("the SocialRecovery validator and the session key cannot sign ERC-1271", async function () {
    const guardian = ethers.Wallet.createRandom();
    const acct = await deployAccount({ guardians: [guardian.address], threshold: 1 });
    const device = newSoftP256();
    const spec = { device, actions: [[VALUE_SELECTOR, ethers.Wallet.createRandom().address, [[policyAddress("valueLimitPolicy"), valueLimitInit(10n)], [policyAddress("timeFramePolicy"), timeFrameInit((await latestTimestamp()) + 3600)]]]] as Array<[string, string, Array<[string, string]>]> };
    expect((await submit(await rootOp(acct, installSessionsCall(acct.address, [spec])))).success).to.equal(true);

    const hash = keccak256(toUtf8Bytes("agentrix 1271 validators"));
    const wrapped = await kernelWrappedHash(acct.address, hash);
    const guardianSig = await guardian.signMessage(ethers.getBytes(wrapped));
    expect(await isMagic(acct.address, hash, concat(["0x01", SOCIAL_RECOVERY, guardianSig])), "SocialRecovery").to.equal(false);

    const sessionAuth = assertion(device, wrapped, { device: true });
    const sessionSig = concat([permissionIdOf(spec), coder.encode([`${AUTH_TUPLE}[]`], [[authValues(sessionAuth)]])]);
    expect(await isMagic(acct.address, hash, concat(["0x01", SMART_SESSIONS, sessionSig])), "session key").to.equal(false);
    expect(await isMagic(acct.address, hash, concat(["0x01", SMART_SESSIONS, "0x00", sessionSig])), "session key, USE prefix").to.equal(false);
  });
});
