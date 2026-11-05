import { expect } from "chai";
import { ethers } from "hardhat";
import { concat } from "ethers";
import {
  AUTH_TUPLE,
  ForeignKey,
  RECOVERY_NONCE_KEY,
  SESSION_NONCE_KEY,
  VALUE_SELECTOR,
  addCredentialExecution,
  authValues,
  buildOp,
  coder,
  credentialIdOf,
  deployAccount,
  executeSingle,
  foreignAssertion,
  installSessionsCall,
  latestTimestamp,
  newSoftP256,
  p256ForeignKey,
  permissionIdOf,
  policyAddress,
  refusal,
  rootOp,
  secp256k1ServerKey,
  submit,
  timeFrameInit,
  useVendor,
  userOpHashOf,
  valueLimitInit,
} from "./fixture";

/**
 * L8-6 S2: W3.2. Every key the platform holds (here: fresh test keys standing for the submitter, the attester, the
 * payment relayer and an MPC custody key, plus a random P-256 key and a login passkey on rp id agentrix.top) is
 * refused as root, as guardian and as session key: AA24, never executed. A valid UserOp replayed is AA25.
 */
describe("own wallet: server-held keys cannot sign alone", function () {
  useVendor();

  const serverKeys = (): ForeignKey[] => [
    secp256k1ServerKey("submitter"),
    secp256k1ServerKey("attester"),
    secp256k1ServerKey("payment relayer"),
    secp256k1ServerKey("mpc custody"),
    p256ForeignKey("random p-256"),
    p256ForeignKey("login passkey"),
  ];

  async function prepared() {
    const guardian = ethers.Wallet.createRandom();
    const acct = await deployAccount({ guardians: [guardian.address], threshold: 1 });
    const [payer] = await ethers.getSigners();
    await (await payer.sendTransaction({ to: acct.address, value: ethers.parseEther("1") })).wait();
    const device = newSoftP256();
    const payee = ethers.Wallet.createRandom().address;
    const spec = { device, actions: [[VALUE_SELECTOR, payee, [[policyAddress("valueLimitPolicy"), valueLimitInit(10n ** 18n)], [policyAddress("timeFramePolicy"), timeFrameInit((await latestTimestamp()) + 3600)]]]] as Array<[string, string, Array<[string, string]>]> };
    expect((await submit(await rootOp(acct, installSessionsCall(acct.address, [spec])))).success).to.equal(true);
    return { acct, guardian, payee, permissionId: permissionIdOf(spec) };
  }

  it("root mode: every server key is AA24 (signature in the validator's format with the account's credential id)", async function () {
    const { acct, payee } = await prepared();
    for (const key of serverKeys()) {
      const op = await buildOp({ sender: acct.address, callData: executeSingle(payee, 1n, "0x") });
      const opts = key.label === "login passkey" ? { rpId: "agentrix.top", origin: "https://agentrix.top" } : {};
      const auth = foreignAssertion(key, await userOpHashOf(op), opts);
      const signature = coder.encode(["bytes32[]", "bool", `${AUTH_TUPLE}[]`], [[credentialIdOf(acct.key, acct.address)], true, [authValues(auth)]]);
      expect(await refusal({ ...op, signature }), key.label).to.match(/AA24/);
      if (key.wallet) {
        const raw = await key.wallet.signMessage(ethers.getBytes(await userOpHashOf(op)));
        expect(await refusal({ ...op, signature: raw }), `${key.label} raw ECDSA`).to.match(/AA2[34]/);
      }
    }
  });

  it("SocialRecovery mode: server keys are not guardians, AA24; the real guardian's signature on the same kind of UserOp passes", async function () {
    const { acct, guardian } = await prepared();
    // an execution a guardian is allowed to send (add a passkey), so only the signer decides
    const callData = addCredentialExecution(newSoftP256());
    for (const key of serverKeys()) {
      const op = await buildOp({ sender: acct.address, callData, nonceKey: RECOVERY_NONCE_KEY });
      const hash = ethers.getBytes(await userOpHashOf(op));
      // P-256 keys cannot make a secp256k1 signature at all; they send 65 bytes of their own, which never recovers a guardian
      const signature = key.wallet ? await key.wallet.signMessage(hash) : concat(["0x" + "11".repeat(64), "0x1b"]);
      expect(await refusal({ ...op, signature }), key.label).to.match(key.wallet ? /AA24/ : /AA2[34]/);
    }
    const op = await buildOp({ sender: acct.address, callData, nonceKey: RECOVERY_NONCE_KEY });
    op.signature = await guardian.signMessage(ethers.getBytes(await userOpHashOf(op)));
    expect((await submit(op)).success, "control: the real guardian").to.equal(true);
  });

  it("SmartSessions mode: server keys signing with an enabled permission id are AA24", async function () {
    const { acct, payee, permissionId } = await prepared();
    for (const key of serverKeys()) {
      const op = await buildOp({ sender: acct.address, callData: executeSingle(payee, 1n, "0x"), nonceKey: SESSION_NONCE_KEY });
      const auth = foreignAssertion(key, await userOpHashOf(op), { device: true });
      const signature = concat(["0x00", permissionId, coder.encode([`${AUTH_TUPLE}[]`], [[authValues(auth)]])]);
      expect(await refusal({ ...op, signature }), key.label).to.match(/AA24/);
    }
  });

  it("a valid root UserOp cannot be replayed (AA25)", async function () {
    const { acct, payee } = await prepared();
    const op = await rootOp(acct, executeSingle(payee, 1n, "0x"));
    expect((await submit(op)).success).to.equal(true);
    expect(await refusal(op)).to.match(/AA25/);
  });
});
