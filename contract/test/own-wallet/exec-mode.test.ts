import { expect } from "chai";
import { ethers, network } from "hardhat";
import { solidityPacked, toBeHex } from "ethers";
import {
  KERNEL_IFACE,
  MODE_DELEGATECALL,
  VALUE_SELECTOR,
  deployAccount,
  installSessionsCall,
  latestTimestamp,
  newSoftP256,
  permissionIdOf,
  policyAddress,
  refusal,
  rootOp,
  sessionOp,
  singleExecution,
  submit,
  timeFrameInit,
  useVendor,
  valueLimitInit,
} from "./fixture";

/**
 * L8-6 S2: ExecMode (design W2.5 (d), R3-L6). Kernel lets the root run delegatecall, which can rewrite the account's
 * storage, so the signing side (wallet origin, device) must refuse every mode except single/batch + default. Under a
 * session, SmartSessions refuses delegatecall and the try exec type on chain as well.
 */
const STORAGE_WRITER = "0x00000000000000000000000000000000000a6e17";
// PUSH1 0x01, PUSH2 0x1234, SSTORE, STOP: writes 1 into slot 0x1234 of whoever delegatecalls it.
const STORAGE_WRITER_CODE = "0x60016112345500";

describe("own wallet ExecMode", function () {
  useVendor();

  it("root-signed delegatecall changes the account's storage (why the signer must refuse it)", async function () {
    await network.provider.send("hardhat_setCode", [STORAGE_WRITER, STORAGE_WRITER_CODE]);
    const acct = await deployAccount();
    const call = KERNEL_IFACE.encodeFunctionData("execute", [MODE_DELEGATECALL, solidityPacked(["address", "bytes"], [STORAGE_WRITER, "0x"])]);
    expect((await submit(await rootOp(acct, call))).success).to.equal(true);
    expect(await ethers.provider.getStorage(acct.address, 0x1234)).to.equal(toBeHex(1, 32));
  });

  it("session-signed delegatecall and the try exec type are refused by SmartSessions", async function () {
    const acct = await deployAccount();
    const device = newSoftP256();
    const payee = ethers.Wallet.createRandom().address;
    const spec = { device, actions: [[VALUE_SELECTOR, payee, [[policyAddress("valueLimitPolicy"), valueLimitInit(1000n)], [policyAddress("timeFramePolicy"), timeFrameInit((await latestTimestamp()) + 3600)]]]] as Array<[string, string, Array<[string, string]>]> };
    expect((await submit(await rootOp(acct, installSessionsCall(acct.address, [spec])))).success).to.equal(true);
    const pid = permissionIdOf(spec);
    const delegate = KERNEL_IFACE.encodeFunctionData("execute", [MODE_DELEGATECALL, solidityPacked(["address", "bytes"], [STORAGE_WRITER, "0x"])]);
    expect(await refusal(await sessionOp(acct.address, pid, device, delegate)), "delegatecall").to.match(/AA2[34]/);
    const tryMode = "0x0001" + "00".repeat(30);
    const tryExec = KERNEL_IFACE.encodeFunctionData("execute", [tryMode, singleExecution(payee, 1n, "0x")]);
    expect(await refusal(await sessionOp(acct.address, pid, device, tryExec)), "try exec type").to.match(/AA2[34]/);
    // the same payment in single + default passes
    const [payer] = await ethers.getSigners();
    await (await payer.sendTransaction({ to: acct.address, value: 10n })).wait();
    const single = KERNEL_IFACE.encodeFunctionData("execute", ["0x" + "00".repeat(32), singleExecution(payee, 1n, "0x")]);
    expect((await submit(await sessionOp(acct.address, pid, device, single))).success).to.equal(true);
    expect(await ethers.provider.getBalance(payee)).to.equal(1n);
  });
});
