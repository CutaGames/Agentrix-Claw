import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * L8 D5 回归测试：AutoPay（C-01 资金模型统一为 ERC20 transferFrom，钱从用户钱包出）。
 */
describe("AutoPay audit regressions (L8 D5)", function () {
  const SINGLE = 100n;
  const DAILY = 300n;
  const DURATION = 86400 * 30;
  const pid = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));

  async function setup(tokenKind: "std" | "noReturn" | "falseReturn" = "std") {
    const [owner, user, agent, recipient, stranger] = await ethers.getSigners();
    let token: any;
    if (tokenKind === "std") {
      token = await (await ethers.getContractFactory("MockERC20")).deploy("USDC", "USDC", 1_000_000n);
    } else if (tokenKind === "noReturn") {
      token = await (await ethers.getContractFactory("MockNoReturnERC20")).deploy("USDT", "USDT", 18, 1_000_000n);
    } else {
      token = await (await ethers.getContractFactory("MockFalseReturnERC20")).deploy(1_000_000n);
    }
    const autoPay: any = await (await ethers.getContractFactory("AutoPay")).deploy();
    await autoPay.setPaymentToken(await token.getAddress());
    await token.transfer(user.address, 10_000n);
    return { owner, user, agent, recipient, stranger, token, autoPay };
  }

  describe("C-01 钱从用户钱包出", function () {
    it("createGrant 只登记额度，不动钱；合约自己不持有用户的钱", async function () {
      const { autoPay, token, user, agent } = await setup();
      const before = await token.balanceOf(user.address);
      await autoPay.connect(user).createGrant(agent.address, SINGLE, DAILY, DURATION);
      expect(await token.balanceOf(user.address)).to.equal(before);
      expect(await token.balanceOf(await autoPay.getAddress())).to.equal(0n);
      expect(await ethers.provider.getBalance(await autoPay.getAddress())).to.equal(0n);
    });

    it("执行付款：用户钱包减少，收款人增加，合约余额始终是 0", async function () {
      const { autoPay, token, user, agent, recipient } = await setup();
      await autoPay.connect(user).createGrant(agent.address, SINGLE, DAILY, DURATION);
      await token.connect(user).approve(await autoPay.getAddress(), 1000n);

      await autoPay.connect(agent).executeAutoPayment(pid("a"), user.address, recipient.address, 60n);

      expect(await token.balanceOf(user.address)).to.equal(10_000n - 60n);
      expect(await token.balanceOf(recipient.address)).to.equal(60n);
      expect(await token.balanceOf(await autoPay.getAddress())).to.equal(0n);
      expect(await token.balanceOf(agent.address)).to.equal(0n);
    });

    it("有授权额度但用户没在代币合约上 approve：付款失败，不会改用别的资金", async function () {
      const { autoPay, token, user, agent, recipient } = await setup();
      // 合约里放一笔别人的钱，确认不会被挪用
      await token.transfer(await autoPay.getAddress(), 5000n);
      await autoPay.connect(user).createGrant(agent.address, SINGLE, DAILY, DURATION);

      await expect(
        autoPay.connect(agent).executeAutoPayment(pid("b"), user.address, recipient.address, 50n)
      ).to.be.reverted;
      expect(await token.balanceOf(await autoPay.getAddress())).to.equal(5000n);
      expect(await token.balanceOf(recipient.address)).to.equal(0n);
    });

    it("USDT 式代币（transferFrom 不返回值）能正常付款", async function () {
      const { autoPay, token, user, agent, recipient } = await setup("noReturn");
      await autoPay.connect(user).createGrant(agent.address, SINGLE, DAILY, DURATION);
      await token.connect(user).approve(await autoPay.getAddress(), 1000n);
      await autoPay.connect(agent).executeAutoPayment(pid("c"), user.address, recipient.address, 40n);
      expect(await token.balanceOf(recipient.address)).to.equal(40n);
    });

    it("转账失败但不 revert（返回 false）的代币：整笔回滚，额度不被占用", async function () {
      const { autoPay, token, user, agent, recipient } = await setup("falseReturn");
      await token.transfer(await autoPay.getAddress(), 5000n);
      await autoPay.connect(user).createGrant(agent.address, SINGLE, DAILY, DURATION);

      await expect(
        autoPay.connect(agent).executeAutoPayment(pid("d"), user.address, recipient.address, 40n)
      ).to.be.revertedWith("SafeERC20: ERC20 operation did not succeed");
      const grant = await autoPay.getGrant(user.address, agent.address);
      expect(grant.usedToday).to.equal(0n);
      expect((await autoPay.getAutoPayment(pid("d"))).executed).to.equal(false);
    });
  });

  describe("授权边界", function () {
    it("同一个 paymentId 只能执行一次，已记录的付款不会被覆盖", async function () {
      const { autoPay, token, user, agent, recipient } = await setup();
      await autoPay.connect(user).createGrant(agent.address, SINGLE, DAILY, DURATION);
      await token.connect(user).approve(await autoPay.getAddress(), 1000n);
      await autoPay.connect(agent).executeAutoPayment(pid("e"), user.address, recipient.address, 50n);

      await expect(
        autoPay.connect(agent).executeAutoPayment(pid("e"), user.address, recipient.address, 50n)
      ).to.be.revertedWith("Payment already executed");
      expect((await autoPay.getGrant(user.address, agent.address)).usedToday).to.equal(50n);
      expect(await token.balanceOf(recipient.address)).to.equal(50n);
    });

    it("收款人不能是零地址，金额不能是 0", async function () {
      const { autoPay, token, user, agent, recipient } = await setup();
      await autoPay.connect(user).createGrant(agent.address, SINGLE, DAILY, DURATION);
      await token.connect(user).approve(await autoPay.getAddress(), 1000n);
      await expect(
        autoPay.connect(agent).executeAutoPayment(pid("f"), user.address, ethers.ZeroAddress, 10n)
      ).to.be.revertedWith("Invalid recipient");
      await expect(
        autoPay.connect(agent).executeAutoPayment(pid("g"), user.address, recipient.address, 0n)
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("授权过期后不能付款；撤销授权后不能付款；用户收回 approve 后不能付款", async function () {
      const { autoPay, token, user, agent, recipient } = await setup();
      await autoPay.connect(user).createGrant(agent.address, SINGLE, DAILY, 100);
      await token.connect(user).approve(await autoPay.getAddress(), 1000n);

      await token.connect(user).approve(await autoPay.getAddress(), 0n);
      await expect(
        autoPay.connect(agent).executeAutoPayment(pid("h"), user.address, recipient.address, 10n)
      ).to.be.reverted;
      await token.connect(user).approve(await autoPay.getAddress(), 1000n);

      await time.increase(200);
      await expect(
        autoPay.connect(agent).executeAutoPayment(pid("i"), user.address, recipient.address, 10n)
      ).to.be.revertedWith("Grant expired");

      await autoPay.connect(user).createGrant(agent.address, SINGLE, DAILY, DURATION);
      await autoPay.connect(user).revokeGrant(agent.address);
      await expect(
        autoPay.connect(agent).executeAutoPayment(pid("j"), user.address, recipient.address, 10n)
      ).to.be.revertedWith("Grant not active");
    });

    it("别的 Agent 不能用这位用户的授权", async function () {
      const { autoPay, token, user, agent, recipient, stranger } = await setup();
      await autoPay.connect(user).createGrant(agent.address, SINGLE, DAILY, DURATION);
      await token.connect(user).approve(await autoPay.getAddress(), 1000n);
      await expect(
        autoPay.connect(stranger).executeAutoPayment(pid("k"), user.address, recipient.address, 10n)
      ).to.be.revertedWith("Grant not active");
    });
  });
});
