import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  RECOVERY_IFACE,
  SOCIAL_RECOVERY,
  buildOp,
  codeAt,
  deploySetupCallData,
  executeSingle,
  fund,
  initCodeOf,
  initDataOf,
  installRecoveryCall,
  isRecoveryInstalled,
  localKernelAddress,
  newSoftP256,
  rootOp,
  saltOf,
  signRoot,
  sortedGuardians,
  submit,
  useVendor,
} from "./fixture";

/**
 * L8-6 S2: a failed first UserOp (design R3-M2). EntryPoint v0.7 deploys the account during validation; a failing
 * callData only sets UserOperationEvent.success = false and does not undo the deployment. The account is deployed,
 * SocialRecovery is not installed, the money sent before is still there, and install_recovery fixes it afterwards.
 */
describe("own wallet: deploy_setup that fails in execution", function () {
  useVendor();

  async function failing(callDataOf: (address: string, guardians: string[]) => string, callGasLimit?: bigint) {
    const [payer] = await ethers.getSigners();
    const key = newSoftP256();
    const data = initDataOf(key);
    const salt = saltOf("agent", 0);
    const address = localKernelAddress(data, salt);
    const guardians = sortedGuardians([ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address]);
    await (await payer.sendTransaction({ to: address, value: 12345n })).wait();
    await fund(address);
    const op = await signRoot(await buildOp({ sender: address, initCode: initCodeOf(data, salt, "kernel_factory_direct"), callData: callDataOf(address, guardians), callGasLimit }), key);
    const outcome = await submit(op);
    return { key, address, guardians, outcome, account: { key, address, initData: data, salt, guardians } };
  }

  const cases: Array<[string, (a: string, g: string[]) => string, bigint | undefined]> = [
    ["guardians not sorted (NotSortedAndUnique)", (a, g) => deploySetupCallData(a, 1, [...g].reverse()), undefined],
    ["registry call reverts (reserved key)", (a, g) => deploySetupCallData(a, 1, g, { uri: "https://x", metadata: [["agentWallet", "0x01"]] }), undefined],
    ["execution gas too small", (a, g) => deploySetupCallData(a, 1, g), 60_000n],
  ];

  for (const [name, callDataOf, gas] of cases) {
    it(`${name}: success false, account deployed, recovery not installed, money still there; install_recovery then works`, async function () {
      const r = await failing(callDataOf, gas);
      expect(r.outcome.success).to.equal(false);
      expect(await codeAt(r.address)).to.not.equal("0x");
      expect(await isRecoveryInstalled(r.address)).to.equal(false);
      expect(await ethers.provider.getBalance(r.address)).to.equal(12345n);

      const install = await rootOp(r.account, executeSingle(r.address, 0n, installRecoveryCall(1, r.guardians)));
      expect((await submit(install)).success).to.equal(true);
      expect(await isRecoveryInstalled(r.address)).to.equal(true);
      const recovery = new Contract(SOCIAL_RECOVERY, RECOVERY_IFACE, ethers.provider);
      expect((await recovery.getGuardians(r.address)).length).to.equal(2);
    });
  }
});
