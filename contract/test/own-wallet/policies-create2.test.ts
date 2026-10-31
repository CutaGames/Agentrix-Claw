import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, concat, getAddress, getCreate2Address, keccak256 } from "ethers";
import {
  CREATE2_DEPLOYER,
  FACTORY_IFACE,
  FACTORY_STAKER,
  KERNEL_FACTORY,
  codeAt,
  initDataOf,
  localKernelAddress,
  manifest,
  newSoftP256,
  policiesCreate2,
  saltOf,
  useVendor,
} from "./fixture";

/**
 * L8-6 S2, E137: on 97 the vendor did not deploy ValueLimit, TimeFrame and UsageLimit. The rehearsal preparation step
 * deploys their official initcode with the official salt through the same CREATE2 deployer; the address and the
 * runtime codehash must equal 84532. Idempotent: an address that already has code is only checked, no transaction.
 */
async function deployPolicyIfMissing(policy: any): Promise<{ sent: boolean }> {
  const code = await codeAt(policy.address);
  if (code !== "0x") {
    if (keccak256(code) !== policy.runtimeCodehash) throw new Error(`${policy.name}: code at ${policy.address} has another codehash`);
    return { sent: false };
  }
  const [funder] = await ethers.getSigners();
  await (await funder.sendTransaction({ to: CREATE2_DEPLOYER, data: concat([policy.salt, policy.initcode]) })).wait();
  const deployed = await codeAt(policy.address);
  if (deployed === "0x" || keccak256(deployed) !== policy.runtimeCodehash) throw new Error(`${policy.name}: deployed code does not match`);
  return { sent: true };
}

describe("own wallet policies by CREATE2 on 97 (E137)", function () {
  useVendor({ withoutRehearsalPolicies: true });

  it("policies-create2.json recomputes the pinned addresses and matches the manifest codehashes", function () {
    const pinned = new Map(manifest().contracts.map((c) => [c.name, c]));
    const list = policiesCreate2().policies;
    expect(list.map((p: any) => p.name)).to.deep.equal(["valueLimitPolicy", "timeFramePolicy", "usageLimitPolicy"]);
    for (const p of list) {
      expect(getAddress(p.deployer)).to.equal(getAddress(CREATE2_DEPLOYER));
      expect(keccak256(p.initcode)).to.equal(p.initcodeHash);
      expect(getCreate2Address(CREATE2_DEPLOYER, p.salt, p.initcodeHash)).to.equal(getAddress(p.address));
      expect(getAddress(p.address)).to.equal(getAddress(pinned.get(p.name)!.address));
      expect(p.runtimeCodehash).to.equal(pinned.get(p.name)!.codehash);
    }
  });

  it("deploys each missing policy once with the official salt and initcode; a second run sends nothing", async function () {
    const [funder] = await ethers.getSigners();
    for (const p of policiesCreate2().policies) {
      expect(await codeAt(p.address), `${p.name} starts without code (97 state)`).to.equal("0x");
      expect((await deployPolicyIfMissing(p)).sent).to.equal(true);
      expect(keccak256(await codeAt(p.address))).to.equal(p.runtimeCodehash);
    }
    const nonce = await ethers.provider.getTransactionCount(funder.address);
    for (const p of policiesCreate2().policies) expect((await deployPolicyIfMissing(p)).sent).to.equal(false);
    expect(await ethers.provider.getTransactionCount(funder.address)).to.equal(nonce);
    // the deployer itself refuses a second CREATE2 at the same address
    const p = policiesCreate2().policies[0];
    await expect(funder.sendTransaction({ to: CREATE2_DEPLOYER, data: concat([p.salt, p.initcode]) })).to.be.reverted;
  });

  it("other code at a policy address is refused without a transaction", async function () {
    const p = policiesCreate2().policies[2];
    await network.provider.send("hardhat_setCode", [p.address, "0x6000"]);
    const [funder] = await ethers.getSigners();
    const nonce = await ethers.provider.getTransactionCount(funder.address);
    let message = "";
    try {
      await deployPolicyIfMissing(p);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).to.match(/another codehash/);
    expect(await ethers.provider.getTransactionCount(funder.address)).to.equal(nonce);
  });
});

describe("own wallet account address: KernelFactory direct and FactoryStaker agree (E137)", function () {
  useVendor({ chainProfile: 84532 });

  it("getAddress, createAccount and deployWithFactory return the same address (the 97 refusal is in account.test.ts)", async function () {
    const [caller] = await ethers.getSigners();
    const data = initDataOf(newSoftP256());
    const salt = saltOf("agent", 5);
    const factory = new Contract(KERNEL_FACTORY, FACTORY_IFACE, caller);
    const staker = new Contract(FACTORY_STAKER, FACTORY_IFACE, caller);
    const predicted = getAddress(localKernelAddress(data, salt));
    // ethers v6: `factory.getAddress()` is BaseContract's own (the contract's address); the ABI method goes through getFunction
    expect(getAddress(await factory.getFunction("getAddress")(data, salt))).to.equal(predicted);
    expect(getAddress(await factory.createAccount.staticCall(data, salt))).to.equal(predicted);
    expect(getAddress(await staker.deployWithFactory.staticCall(KERNEL_FACTORY, data, salt))).to.equal(predicted);
  });
});
