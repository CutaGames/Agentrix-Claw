import { expect } from "chai";
import { ethers } from "hardhat";
import { AutoPay, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("AutoPay", function () {
  let autoPay: AutoPay;
  let usdc: MockERC20;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let agent: SignerWithAddress;
  let recipient: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseUnits("1000000", 18);
  const SINGLE_LIMIT = ethers.parseUnits("100", 18);
  const DAILY_LIMIT = ethers.parseUnits("500", 18);
  const DURATION = 86400 * 30; // 30 days

  beforeEach(async function () {
    [owner, user, agent, recipient] = await ethers.getSigners();

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    usdc = (await MockERC20Factory.deploy("Mock USDC", "USDC", INITIAL_SUPPLY)) as MockERC20;

    const AutoPayFactory = await ethers.getContractFactory("AutoPay");
    autoPay = (await AutoPayFactory.deploy()) as AutoPay;

    await autoPay.setPaymentToken(await usdc.getAddress());

    // Give user tokens and approve
    await usdc.transfer(user.address, ethers.parseUnits("10000", 18));
    await usdc.connect(user).approve(await autoPay.getAddress(), ethers.MaxUint256);
  });

  // ── Deployment ───────────────────────────────────────────────

  describe("Deployment", function () {
    it("should set owner correctly", async function () {
      expect(await autoPay.owner()).to.equal(owner.address);
    });

    it("should set payment token", async function () {
      const tokenAddr = await autoPay.paymentToken();
      expect(tokenAddr).to.equal(await usdc.getAddress());
    });

    it("should revert setPaymentToken with zero address", async function () {
      await expect(autoPay.setPaymentToken(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid token address");
    });

    it("non-owner cannot set payment token", async function () {
      await expect(autoPay.connect(user).setPaymentToken(await usdc.getAddress()))
        .to.be.reverted;
    });
  });

  // ── Grant Creation ───────────────────────────────────────────

  describe("createGrant", function () {
    it("should create a grant", async function () {
      await autoPay.connect(user).createGrant(agent.address, SINGLE_LIMIT, DAILY_LIMIT, DURATION);
      const grant = await autoPay.getGrant(user.address, agent.address);
      expect(grant.isActive).to.be.true;
      expect(grant.singleLimit).to.equal(SINGLE_LIMIT);
      expect(grant.dailyLimit).to.equal(DAILY_LIMIT);
    });

    it("should emit GrantCreated event", async function () {
      await expect(
        autoPay.connect(user).createGrant(agent.address, SINGLE_LIMIT, DAILY_LIMIT, DURATION)
      ).to.emit(autoPay, "GrantCreated");
    });

    it("should revert with zero agent address", async function () {
      await expect(
        autoPay.connect(user).createGrant(ethers.ZeroAddress, SINGLE_LIMIT, DAILY_LIMIT, DURATION)
      ).to.be.revertedWith("Invalid agent address");
    });

    it("should revert with zero limits", async function () {
      await expect(
        autoPay.connect(user).createGrant(agent.address, 0, DAILY_LIMIT, DURATION)
      ).to.be.revertedWith("Invalid limits");
    });

    it("should revert when single limit exceeds daily limit", async function () {
      await expect(
        autoPay.connect(user).createGrant(agent.address, DAILY_LIMIT + 1n, DAILY_LIMIT, DURATION)
      ).to.be.revertedWith("Single limit exceeds daily limit");
    });
  });

  // ── Grant Revocation ─────────────────────────────────────────

  describe("revokeGrant", function () {
    beforeEach(async function () {
      await autoPay.connect(user).createGrant(agent.address, SINGLE_LIMIT, DAILY_LIMIT, DURATION);
    });

    it("should revoke a grant", async function () {
      await autoPay.connect(user).revokeGrant(agent.address);
      const grant = await autoPay.getGrant(user.address, agent.address);
      expect(grant.isActive).to.be.false;
    });

    it("should revert revoking non-existent grant", async function () {
      await expect(
        autoPay.connect(user).revokeGrant(recipient.address)
      ).to.be.revertedWith("Grant not found or inactive");
    });
  });

  // ── Auto Payment Execution ───────────────────────────────────

  describe("executeAutoPayment", function () {
    const paymentAmount = ethers.parseUnits("50", 18);
    const paymentId = ethers.keccak256(ethers.toUtf8Bytes("payment-1"));

    beforeEach(async function () {
      await autoPay.connect(user).createGrant(agent.address, SINGLE_LIMIT, DAILY_LIMIT, DURATION);
    });

    it("should execute auto payment successfully", async function () {
      const recipientBefore = await usdc.balanceOf(recipient.address);
      await autoPay.connect(agent).executeAutoPayment(
        paymentId, user.address, recipient.address, paymentAmount
      );
      const recipientAfter = await usdc.balanceOf(recipient.address);
      expect(recipientAfter - recipientBefore).to.equal(paymentAmount);
    });

    it("should emit AutoPaymentExecuted event", async function () {
      await expect(
        autoPay.connect(agent).executeAutoPayment(
          paymentId, user.address, recipient.address, paymentAmount
        )
      ).to.emit(autoPay, "AutoPaymentExecuted");
    });

    it("should record auto payment", async function () {
      await autoPay.connect(agent).executeAutoPayment(
        paymentId, user.address, recipient.address, paymentAmount
      );
      const payment = await autoPay.getAutoPayment(paymentId);
      expect(payment.executed).to.be.true;
      expect(payment.amount).to.equal(paymentAmount);
    });

    it("should update daily usage", async function () {
      await autoPay.connect(agent).executeAutoPayment(
        paymentId, user.address, recipient.address, paymentAmount
      );
      const grant = await autoPay.getGrant(user.address, agent.address);
      expect(grant.usedToday).to.equal(paymentAmount);
    });

    it("should revert when exceeding single limit", async function () {
      const tooMuch = SINGLE_LIMIT + 1n;
      await expect(
        autoPay.connect(agent).executeAutoPayment(
          paymentId, user.address, recipient.address, tooMuch
        )
      ).to.be.revertedWith("Amount exceeds single limit");
    });

    it("should revert when exceeding daily limit", async function () {
      // Use up most of daily limit
      for (let i = 0; i < 5; i++) {
        const pid = ethers.keccak256(ethers.toUtf8Bytes(`payment-${i}`));
        await autoPay.connect(agent).executeAutoPayment(
          pid, user.address, recipient.address, SINGLE_LIMIT
        );
      }
      // This should exceed daily limit
      const pid = ethers.keccak256(ethers.toUtf8Bytes("payment-overflow"));
      await expect(
        autoPay.connect(agent).executeAutoPayment(
          pid, user.address, recipient.address, SINGLE_LIMIT
        )
      ).to.be.revertedWith("Amount exceeds daily limit");
    });

    it("should revert when grant is revoked", async function () {
      await autoPay.connect(user).revokeGrant(agent.address);
      await expect(
        autoPay.connect(agent).executeAutoPayment(
          paymentId, user.address, recipient.address, paymentAmount
        )
      ).to.be.revertedWith("Grant not active");
    });

    it("should revert when called by wrong agent", async function () {
      await expect(
        autoPay.connect(recipient).executeAutoPayment(
          paymentId, user.address, recipient.address, paymentAmount
        )
      ).to.be.revertedWith("Grant not active");
    });

    it("should revert when paused", async function () {
      await autoPay.pause();
      await expect(
        autoPay.connect(agent).executeAutoPayment(
          paymentId, user.address, recipient.address, paymentAmount
        )
      ).to.be.reverted;
    });
  });

  // ── Pausable ─────────────────────────────────────────────────

  describe("Pausable", function () {
    it("owner can pause", async function () {
      await autoPay.pause();
      expect(await autoPay.paused()).to.be.true;
    });

    it("owner can unpause", async function () {
      await autoPay.pause();
      await autoPay.unpause();
      expect(await autoPay.paused()).to.be.false;
    });

    it("non-owner cannot pause", async function () {
      await expect(autoPay.connect(user).pause()).to.be.reverted;
    });
  });

  // ── Emergency ────────────────────────────────────────────────

  describe("emergencyWithdraw", function () {
    it("owner can emergency withdraw", async function () {
      const amount = ethers.parseUnits("100", 18);
      await usdc.transfer(await autoPay.getAddress(), amount);
      await autoPay.emergencyWithdraw(await usdc.getAddress(), owner.address, amount);
      expect(await usdc.balanceOf(await autoPay.getAddress())).to.equal(0);
    });

    it("revert with zero recipient", async function () {
      await expect(
        autoPay.emergencyWithdraw(await usdc.getAddress(), ethers.ZeroAddress, 100)
      ).to.be.revertedWith("Invalid recipient");
    });
  });
});
