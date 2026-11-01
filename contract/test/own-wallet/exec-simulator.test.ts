import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { artifacts, ethers, network } from "hardhat";
import { Contract, ZeroAddress, dataSlice } from "ethers";
import {
  ENTRY_POINT,
  REGISTRY,
  REGISTRY_IFACE,
  SOCIAL_RECOVERY,
  PackedUserOp,
  buildOp,
  codeAt,
  deploySetupCallData,
  executeSingle,
  fund,
  initCodeOf,
  initDataOf,
  isRecoveryInstalled,
  localKernelAddress,
  newSoftP256,
  refusal,
  revertTo,
  saltOf,
  signRoot,
  snapshot,
  sortedGuardians,
  submit,
  useVendor,
} from "./fixture";

/**
 * L8-6 S2: the pre-flight simulator (design 7.3 "预演", A40, R3-M2, R4-L1) against the real EntryPoint as the baseline.
 *
 * The backend puts the simulator's code at the EntryPoint address with an eth_call state override. Here the same is
 * done with hardhat_setCode inside a snapshot that is reverted right after the eth_call, so nothing persists.
 */
const BYTECODE_JSON = path.join(__dirname, "..", "..", "..", "backend", "src", "modules", "agent-own-wallet", "userop", "exec-simulator.bytecode.json");
const OUTCOME = { ok: 0, deployFailed: 1, deployOutOfGas: 2, senderNotDeployed: 3, executionFailed: 4, executionOutOfGas: 5 };

describe("own wallet pre-flight simulator (OwnWalletExecSimulator)", function () {
  useVendor();

  it("the backend's pinned runtime bytecode equals the compiled simulator (plan P5)", async function () {
    const artifact = await artifacts.readArtifact("OwnWalletExecSimulator");
    const pinned = JSON.parse(fs.readFileSync(BYTECODE_JSON, "utf8")).runtimeBytecode;
    if (pinned !== artifact.deployedBytecode) {
      // The CI result.md carries this line; coord copies it into exec-simulator.bytecode.json (S4 first step).
      throw new Error(`exec-simulator.bytecode.json differs from the compiled simulator. Copy this line into its runtimeBytecode:\nEXEC_SIMULATOR_RUNTIME=${artifact.deployedBytecode}`);
    }
  });

  async function simulate(op: PackedUserOp) {
    const artifact = await artifacts.readArtifact("OwnWalletExecSimulator");
    const id = await snapshot();
    try {
      await network.provider.send("hardhat_setCode", [ENTRY_POINT, artifact.deployedBytecode]);
      const [caller] = await ethers.getSigners();
      const sim = new Contract(ENTRY_POINT, artifact.abi, caller);
      const deployed = op.initCode === "0x";
      const verificationGasLimit = BigInt(dataSlice(op.accountGasLimits, 0, 16));
      const callGasLimit = BigInt(dataSlice(op.accountGasLimits, 16, 32));
      return await sim.simulate.staticCall(
        deployed ? ZeroAddress : dataSlice(op.initCode, 0, 20),
        deployed ? "0x" : dataSlice(op.initCode, 20),
        op.sender,
        op.callData,
        SOCIAL_RECOVERY,
        REGISTRY,
        verificationGasLimit,
        callGasLimit,
        { gasLimit: 15_000_000 },
      );
    } finally {
      await revertTo(id);
    }
  }

  async function firstOp(callDataOf: (a: string, g: string[]) => string, gas: { verificationGasLimit?: bigint; callGasLimit?: bigint } = {}) {
    const key = newSoftP256();
    const data = initDataOf(key);
    const salt = saltOf("agent", 0);
    const address = localKernelAddress(data, salt);
    const guardians = sortedGuardians([ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address]);
    await fund(address);
    const op = await buildOp({ sender: address, initCode: initCodeOf(data, salt, "kernel_factory_direct"), callData: callDataOf(address, guardians), ...gas });
    return { key, address, op };
  }

  const registryBalance = (a: string) => new Contract(REGISTRY, REGISTRY_IFACE, ethers.provider).balanceOf(a);

  it("success: simulator and EntryPoint agree (deployed, recovery installed, one NFT)", async function () {
    const { key, address, op } = await firstOp((a, g) => deploySetupCallData(a, 1, g, { uri: "https://api.agentrix.top/sim", metadata: [] }));
    const sim = await simulate(op);
    expect(Number(sim.outcome)).to.equal(OUTCOME.ok);
    expect(sim.deployedBefore).to.equal(false);
    expect(sim.deployed).to.equal(true);
    expect(sim.recoveryInstalled).to.equal(true);
    expect(sim.registryBalance).to.equal(1n);
    expect(await codeAt(address), "simulation left nothing behind").to.equal("0x");

    const outcome = await submit(await signRoot(op, key));
    expect(outcome.success).to.equal(true);
    expect(await isRecoveryInstalled(address)).to.equal(sim.recoveryInstalled);
    expect(await registryBalance(address)).to.equal(sim.registryBalance);

    // an already deployed account: no factory, deployedBefore true
    const later = await buildOp({ sender: address, callData: executeSingle(address, 0n, "0x") });
    const sim2 = await simulate(later);
    expect(Number(sim2.outcome)).to.equal(OUTCOME.ok);
    expect(sim2.deployedBefore).to.equal(true);
  });

  const failures: Array<[string, (a: string, g: string[]) => string, { verificationGasLimit?: bigint; callGasLimit?: bigint }, number[]]> = [
    ["guardians not sorted", (a, g) => deploySetupCallData(a, 1, [...g].reverse()), {}, [OUTCOME.executionFailed]],
    ["registry reverts", (a, g) => deploySetupCallData(a, 1, g, { uri: "https://x", metadata: [["agentWallet", "0x01"]] }), {}, [OUTCOME.executionFailed]],
    ["callGasLimit too small", (a, g) => deploySetupCallData(a, 1, g), { callGasLimit: 60_000n }, [OUTCOME.executionOutOfGas]],
  ];
  for (const [name, callDataOf, gas, expected] of failures) {
    it(`execution failure (${name}): simulator reports it, EntryPoint records success = false with the same module state`, async function () {
      const { key, address, op } = await firstOp(callDataOf, gas);
      const sim = await simulate(op);
      expect(expected, `outcome ${sim.outcome}`).to.include(Number(sim.outcome));
      expect(sim.deployed).to.equal(true);
      expect(sim.recoveryInstalled).to.equal(false);
      const outcome = await submit(await signRoot(op, key));
      expect(outcome.success).to.equal(false);
      expect(await codeAt(address)).to.not.equal("0x");
      expect(await isRecoveryInstalled(address)).to.equal(sim.recoveryInstalled);
      expect(await registryBalance(address)).to.equal(sim.registryBalance);
    });
  }

  it("verificationGasLimit too small: simulator reports a deploy failure, EntryPoint refuses (AA13) and nothing is deployed", async function () {
    const { key, address, op } = await firstOp((a, g) => deploySetupCallData(a, 1, g), { verificationGasLimit: 100_000n });
    const sim = await simulate(op);
    expect([OUTCOME.deployFailed, OUTCOME.deployOutOfGas]).to.include(Number(sim.outcome));
    expect(sim.deployed).to.equal(false);
    expect(await refusal(await signRoot(op, key))).to.match(/AA13/);
    expect(await codeAt(address)).to.equal("0x");
  });

  it("normal gas: both succeed (same op as the first case, other key)", async function () {
    const { key, op } = await firstOp((a, g) => deploySetupCallData(a, 1, g));
    expect(Number((await simulate(op)).outcome)).to.equal(OUTCOME.ok);
    expect((await submit(await signRoot(op, key))).success).to.equal(true);
  });
});
