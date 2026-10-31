import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SpendingLimitValidator } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * T8 · 限额 validator 模块单测(需求 3.1/3.2)。
 * 单笔/日/月上限 + 目标白名单 + 失败闭合 + 日/月桶滚动。
 */
describe("SpendingLimitValidator", function () {
  let v: SpendingLimitValidator;
  let ctrl: SignerWithAddress;
  const account = "0x000000000000000000000000000000000000A001";
  const targetA = "0x000000000000000000000000000000000000C001";
  const targetB = "0x000000000000000000000000000000000000C002";

  beforeEach(async function () {
    [ctrl] = await ethers.getSigners();
    const F = await ethers.getContractFactory("SpendingLimitValidator");
    v = (await F.deploy()) as SpendingLimitValidator;
  });

  it("enforces single limit", async function () {
    await v.configure(account, 100, 1000, 5000, false);
    const [ok1] = await v.canSpend(account, targetA, 100);
    expect(ok1).to.be.true;
    const [ok2, reason2] = await v.canSpend(account, targetA, 101);
    expect(ok2).to.be.false;
    expect(reason2).to.equal("exceeds single limit");
    await expect(v.checkAndRecord(account, targetA, 101)).to.be.revertedWith("exceeds single limit");
  });

  it("enforces daily limit and accumulates", async function () {
    await v.configure(account, 100, 150, 5000, false);
    await v.checkAndRecord(account, targetA, 100);
    expect(await v.usedToday(account)).to.equal(100);
    // 再花 100 会超日限 150
    await expect(v.checkAndRecord(account, targetA, 100)).to.be.revertedWith("exceeds daily limit");
    // 花 50 正好到 150
    await v.checkAndRecord(account, targetA, 50);
    expect(await v.usedToday(account)).to.equal(150);
  });

  it("resets daily bucket after 1 day", async function () {
    await v.configure(account, 150, 150, 5000, false);
    await v.checkAndRecord(account, targetA, 150);
    await time.increase(86400 + 1);
    // 新的一天,日用量重置
    await v.checkAndRecord(account, targetA, 100);
    expect(await v.usedToday(account)).to.equal(100);
  });

  it("enforces monthly limit", async function () {
    await v.configure(account, 1000, 100000, 250, false);
    await v.checkAndRecord(account, targetA, 200);
    await time.increase(86400 + 1); // 跨天但同月
    await expect(v.checkAndRecord(account, targetA, 100)).to.be.revertedWith("exceeds monthly limit");
    await v.checkAndRecord(account, targetA, 50);
    expect(await v.usedMonth(account)).to.equal(250);
  });

  it("whitelistOnly blocks non-whitelisted targets", async function () {
    await v.configure(account, 1000, 10000, 100000, true);
    await expect(v.checkAndRecord(account, targetA, 10)).to.be.revertedWith("target not whitelisted");
    await v.setWhitelist(account, targetA, true);
    await v.checkAndRecord(account, targetA, 10); // now allowed
    // targetB 仍被拦
    const [ok, reason] = await v.canSpend(account, targetB, 10);
    expect(ok).to.be.false;
    expect(reason).to.equal("target not whitelisted");
  });

  it("unconfigured account is denied (fail-closed)", async function () {
    const [ok, reason] = await v.canSpend(account, targetA, 1);
    expect(ok).to.be.false;
    expect(reason).to.equal("not configured");
    await expect(v.checkAndRecord(account, targetA, 1)).to.be.revertedWith("not configured");
  });

  it("only controller can reconfigure / set whitelist", async function () {
    await v.configure(account, 100, 1000, 5000, false);
    const [, other] = await ethers.getSigners();
    await expect(v.connect(other).setWhitelist(account, targetA, true)).to.be.revertedWith("not controller");
    await expect(v.connect(other).configure(account, 1, 1, 1, false)).to.be.revertedWith("not controller");
  });

  it("limit 0 means unlimited for that dimension", async function () {
    await v.configure(account, 0, 0, 0, false);
    await v.checkAndRecord(account, targetA, ethers.parseUnits("1", 18));
    const [ok] = await v.canSpend(account, targetA, ethers.parseUnits("999999", 18));
    expect(ok).to.be.true;
  });
});
