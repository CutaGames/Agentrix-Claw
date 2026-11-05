import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, getAddress } from "ethers";
import {
  FACTORY_IFACE,
  FACTORY_STAKER,
  KERNEL_FACTORY,
  RECOVERY_IFACE,
  RECOVERY_NONCE_KEY,
  SOCIAL_RECOVERY,
  WEBAUTHN_IFACE,
  WEBAUTHN_VALIDATOR,
  buildOp,
  codeAt,
  credentialIdOf,
  deployAccount,
  deploySetupCallData,
  entryPoint,
  fund,
  guardianSignature,
  initCodeOf,
  initDataOf,
  installRecoveryCall,
  isRecoveryInstalled,
  localKernelAddress,
  newSoftP256,
  opValues,
  refusal,
  revertTo,
  saltOf,
  signRoot,
  snapshot,
  sortedGuardians,
  submit,
  useVendor,
  vectors,
} from "./fixture";

/**
 * L8-6 S2: account address and deployment (design W1.1, R2-M4; E137 97 deploys through KernelFactory directly).
 */
describe("own wallet account (Kernel v3.1, local chain 97)", function () {
  useVendor();

  it("fixed vectors: the local formula = KernelFactory.getAddress = the address read on 97 and 84532", async function () {
    const factory = new Contract(KERNEL_FACTORY, FACTORY_IFACE, ethers.provider);
    const cases = vectors().kernelAddress;
    expect(cases.length).to.be.greaterThanOrEqual(5);
    for (const c of cases) {
      if (c.initConfigEmpty) expect(initDataOf({ x: BigInt(c.pubKeyX), y: BigInt(c.pubKeyY) }).toLowerCase(), c.name).to.equal(c.initData.toLowerCase());
      expect(saltOf(c.kind, c.saltIndex), c.name).to.equal(c.salt);
      expect(localKernelAddress(c.initData, c.salt).toLowerCase(), c.name).to.equal(c.expectedAddress);
      // ethers v6: `factory.getAddress()` is BaseContract's own (the contract's address); the ABI method goes through getFunction
      expect((await factory.getFunction("getAddress")(c.initData, c.salt)).toLowerCase(), c.name).to.equal(c.expectedAddress);
    }
  });

  it("initConfig is part of the address: a non-empty initConfig gives another address (so it must stay empty)", async function () {
    const cases = vectors().kernelAddress;
    const plain = cases.find((c: any) => c.initConfigEmpty && c.kind === "agent" && c.saltIndex === 0 && c.name.includes("key A"));
    const withConfig = cases.find((c: any) => !c.initConfigEmpty);
    expect(plain.pubKeyX).to.equal(withConfig.pubKeyX);
    expect(plain.expectedAddress).to.not.equal(withConfig.expectedAddress);
  });

  it("the salt has no platform id: different indexes and kinds give different addresses for the same key", async function () {
    const key = newSoftP256();
    const data = initDataOf(key);
    const a0 = localKernelAddress(data, saltOf("agent", 0));
    const a1 = localKernelAddress(data, saltOf("agent", 1));
    const v0 = localKernelAddress(data, saltOf("owner_vault", 0));
    expect(new Set([a0, a1, v0]).size).to.equal(3);
  });

  it("fixed vectors: EntryPoint.getUserOpHash on this chain equals the value read on 97", async function () {
    const c = vectors().userOpHash.find((v: any) => v.chainId === 97);
    const op = { ...c.userOp, nonce: BigInt(c.userOp.nonce), preVerificationGas: BigInt(c.userOp.preVerificationGas) };
    expect(await entryPoint().getUserOpHash(opValues(op))).to.equal(c.expected);
  });

  it("deploy_setup through KernelFactory (97): UserOperationEvent.sender = local address, SocialRecovery installed, guardians sorted", async function () {
    const g = sortedGuardians([ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address]);
    const acct = await deployAccount({ guardians: g, threshold: 1 });
    expect(acct.outcome.success).to.equal(true);
    expect(acct.outcome.sender).to.equal(getAddress(acct.address));
    expect(acct.outcome.deployedBy).to.equal(getAddress(KERNEL_FACTORY));
    expect(await codeAt(acct.address)).to.not.equal("0x");
    expect(await isRecoveryInstalled(acct.address)).to.equal(true);
    const recovery = new Contract(SOCIAL_RECOVERY, RECOVERY_IFACE, ethers.provider);
    expect((await recovery.getGuardians(acct.address)).map((a: string) => a.toLowerCase()).sort()).to.deep.equal(g.map((a) => a.toLowerCase()).sort());
    const webauthn = new Contract(WEBAUTHN_VALIDATOR, WEBAUTHN_IFACE, ethers.provider);
    expect(await webauthn.getCredentialIds(acct.address)).to.deep.equal([credentialIdOf(acct.key, acct.address)]);
  });

  it("97: FactoryStaker has not approved the v3.1 factory, so its path is refused (AA13) and the direct path is the one used", async function () {
    const key = newSoftP256();
    const data = initDataOf(key);
    const salt = saltOf("agent", 0);
    const address = localKernelAddress(data, salt);
    await fund(address);
    const op = await signRoot(await buildOp({ sender: address, initCode: initCodeOf(data, salt, "factory_staker"), callData: deploySetupCallData(address, 1, sortedGuardians([ethers.Wallet.createRandom().address])) }), key);
    expect(await refusal(op)).to.match(/AA13/);
    expect(await codeAt(address)).to.equal("0x");
  });

  it("a non-root validator only has execute (0xe9ae5c53): a guardian UserOp calling installModule directly is refused", async function () {
    const guardian = ethers.Wallet.createRandom();
    const acct = await deployAccount({ guardians: [guardian.address], threshold: 1 });
    const op = await buildOp({ sender: acct.address, callData: installRecoveryCall(1, [guardian.address]), nonceKey: RECOVERY_NONCE_KEY });
    op.signature = await guardianSignature(op, [guardian]);
    expect(await refusal(op)).to.match(/AA2[34]/);
  });

  it("money sent to the counterfactual address before deployment is in the account after deployment", async function () {
    const [payer] = await ethers.getSigners();
    const key = newSoftP256();
    const data = initDataOf(key);
    const salt = saltOf("agent", 3);
    const address = localKernelAddress(data, salt);
    await (await payer.sendTransaction({ to: address, value: ethers.parseEther("0.25") })).wait();
    await fund(address);
    const op = await signRoot(await buildOp({ sender: address, initCode: initCodeOf(data, salt, "kernel_factory_direct"), callData: deploySetupCallData(address, 1, sortedGuardians([ethers.Wallet.createRandom().address])) }), key);
    expect((await submit(op)).success).to.equal(true);
    expect(await ethers.provider.getBalance(address)).to.equal(ethers.parseEther("0.25"));
  });
});

describe("own wallet account on the 84532 profile (FactoryStaker approved)", function () {
  useVendor({ chainProfile: 84532 });

  it("FactoryStaker.deployWithFactory and KernelFactory.createAccount give the same address (E137)", async function () {
    const key = newSoftP256();
    const data = initDataOf(key);
    const salt = saltOf("agent", 0);
    const predicted = localKernelAddress(data, salt);
    const guardians = sortedGuardians([ethers.Wallet.createRandom().address]);
    const results: string[] = [];
    for (const via of ["factory_staker", "kernel_factory_direct"] as const) {
      const id = await snapshot();
      await fund(predicted);
      const op = await signRoot(await buildOp({ sender: predicted, initCode: initCodeOf(data, salt, via), callData: deploySetupCallData(predicted, 1, guardians) }), key);
      const outcome = await submit(op);
      expect(outcome.success, via).to.equal(true);
      expect(outcome.deployedBy, via).to.equal(getAddress(via === "factory_staker" ? FACTORY_STAKER : KERNEL_FACTORY));
      results.push(outcome.sender);
      await revertTo(id);
    }
    expect(results[0]).to.equal(getAddress(predicted));
    expect(results[1]).to.equal(getAddress(predicted));
  });
});
