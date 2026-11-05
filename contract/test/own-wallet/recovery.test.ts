import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  MODE_BATCH,
  RECOVERY_IFACE,
  RECOVERY_NONCE_KEY,
  SOCIAL_RECOVERY,
  WEBAUTHN_IFACE,
  WEBAUTHN_VALIDATOR,
  KERNEL_IFACE,
  addCredentialExecution,
  buildOp,
  coder,
  deployAccount,
  executeSingle,
  guardianSignature,
  newSoftP256,
  refusal,
  signRoot,
  sortedGuardians,
  submit,
  useVendor,
} from "./fixture";

/**
 * L8-6 S2: SocialRecovery thresholds (design W4.3, 5.4). Guardians sign personal_sign(userOpHash) with an injected
 * EIP-1193 wallet (A43). They can only send a single execution to an installed validator: in practice, adding a new
 * passkey to the WebAuthnValidator. Refusing platform addresses as guardians is the backend's job, not tested here.
 */
describe("own wallet recovery (SocialRecovery)", function () {
  useVendor();

  async function recoveryOp(account: string, callData: string, signers: Array<{ signMessage(m: Uint8Array): Promise<string> }>) {
    const op = await buildOp({ sender: account, callData, nonceKey: RECOVERY_NONCE_KEY });
    return { ...op, signature: await guardianSignature(op, signers) };
  }

  it("2 of 3: one guardian is AA24, two guardians add a new passkey, and the new passkey alone can then move money", async function () {
    const gs = [ethers.Wallet.createRandom(), ethers.Wallet.createRandom(), ethers.Wallet.createRandom()];
    const acct = await deployAccount({ guardians: sortedGuardians(gs.map((g) => g.address)), threshold: 2 });
    const recovery = new Contract(SOCIAL_RECOVERY, RECOVERY_IFACE, ethers.provider);
    expect(await recovery.threshold(acct.address)).to.equal(2n);
    const fresh = newSoftP256();

    // fewer signatures than the threshold: CheckNSignatures may revert (AA23) or the count falls short (AA24)
    expect(await refusal(await recoveryOp(acct.address, addCredentialExecution(fresh), [gs[0]]))).to.match(/AA2[34]/);
    expect(await refusal(await recoveryOp(acct.address, addCredentialExecution(fresh), [gs[1], gs[1]])), "same guardian twice").to.match(/AA24/);
    expect(await refusal(await recoveryOp(acct.address, addCredentialExecution(fresh), [gs[0], ethers.Wallet.createRandom()])), "one stranger").to.match(/AA24/);
    expect((await submit(await recoveryOp(acct.address, addCredentialExecution(fresh), [gs[2], gs[0]]))).success).to.equal(true);
    const ids = await new Contract(WEBAUTHN_VALIDATOR, WEBAUTHN_IFACE, ethers.provider).getCredentialIds(acct.address);
    expect(ids.length).to.equal(2);

    const [payer] = await ethers.getSigners();
    await (await payer.sendTransaction({ to: acct.address, value: 5000n })).wait();
    const to = ethers.Wallet.createRandom().address;
    const op = await signRoot(await buildOp({ sender: acct.address, callData: executeSingle(to, 5000n, "0x") }), fresh);
    expect((await submit(op)).success).to.equal(true);
    expect(await ethers.provider.getBalance(to)).to.equal(5000n);
  });

  it("guardians cannot move money, call a non-validator, batch, or replay a used recovery UserOp", async function () {
    const g = ethers.Wallet.createRandom();
    const acct = await deployAccount({ guardians: [g.address], threshold: 1 });
    const [payer] = await ethers.getSigners();
    await (await payer.sendTransaction({ to: acct.address, value: 5000n })).wait();
    const thief = ethers.Wallet.createRandom().address;
    expect(await refusal(await recoveryOp(acct.address, executeSingle(thief, 5000n, "0x"), [g])), "transfer").to.match(/AA24/);
    const batch = KERNEL_IFACE.encodeFunctionData("execute", [MODE_BATCH, coder.encode(["tuple(address,uint256,bytes)[]"], [[[WEBAUTHN_VALIDATOR, 0n, WEBAUTHN_IFACE.encodeFunctionData("addCredential", [1n, 2n, true])]]])]);
    expect(await refusal(await recoveryOp(acct.address, batch, [g])), "batch").to.match(/AA24/);
    const used = await recoveryOp(acct.address, addCredentialExecution(newSoftP256()), [g]);
    expect((await submit(used)).success).to.equal(true);
    expect(await refusal(used), "replay").to.match(/AA25/);
  });

  it("thresholds at install: 0, above the guardian count, unsorted or duplicate guardians all fail the install", async function () {
    const a = ethers.Wallet.createRandom().address;
    const b = ethers.Wallet.createRandom().address;
    const [lo, hi] = sortedGuardians([a, b]);
    for (const [name, threshold, list] of [
      ["threshold 0", 0, [lo, hi]],
      ["threshold above count", 3, [lo, hi]],
      ["unsorted", 1, [hi, lo]],
      ["duplicate", 1, [lo, lo]],
    ] as Array<[string, number, string[]]>) {
      const acct = await deployAccount({ guardians: list, threshold });
      expect(acct.outcome.success, name).to.equal(false);
    }
  });
});
