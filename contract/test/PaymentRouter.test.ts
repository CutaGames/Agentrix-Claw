import { expect } from "chai";
import { ethers } from "hardhat";
import { PaymentRouter } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("PaymentRouter", function () {
  let router: PaymentRouter;
  let owner: SignerWithAddress;
  let payer: SignerWithAddress;
  let recipient: SignerWithAddress;
  let x402Channel: SignerWithAddress;

  beforeEach(async function () {
    [owner, payer, recipient, x402Channel] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("PaymentRouter");
    router = (await Factory.deploy()) as PaymentRouter;

    // Set up X402 channel (method=2)
    await router.setPaymentChannel(
      2, // X402
      x402Channel.address,
      true,
      1,
      0,
      ethers.MaxUint256
    );

    // Set up WALLET channel (method=1)
    await router.setPaymentChannel(
      1, // WALLET
      ethers.ZeroAddress,
      true,
      0,
      ethers.parseEther("0.001"),
      ethers.parseEther("1000")
    );
  });

  // ── Deployment ───────────────────────────────────────────────

  describe("Deployment", function () {
    it("should set owner correctly", async function () {
      expect(await router.owner()).to.equal(owner.address);
    });
  });

  // ── Payment Channel Config ───────────────────────────────────

  describe("setPaymentChannel", function () {
    it("should configure a payment channel", async function () {
      const channel = await router.paymentChannels(2); // X402
      expect(channel.channelAddress).to.equal(x402Channel.address);
      expect(channel.isActive).to.be.true;
    });

    it("non-owner cannot set payment channel", async function () {
      await expect(
        router.connect(payer).setPaymentChannel(0, payer.address, true, 1, 0, ethers.MaxUint256)
      ).to.be.reverted;
    });
  });

  // ── Route Payment (WALLET) ───────────────────────────────────

  describe("routePayment (WALLET)", function () {
    const paymentId = ethers.keccak256(ethers.toUtf8Bytes("pay-1"));
    const amount = ethers.parseEther("1");
    const sessionId = ethers.keccak256(ethers.toUtf8Bytes("session-1"));

    it("should route a WALLET payment and credit balance", async function () {
      await router.connect(payer).routePayment(
        paymentId, recipient.address, amount, 1, sessionId, amount, 0,
        { value: amount }
      );
      const payment = await router.getPayment(paymentId);
      expect(payment.completed).to.be.true;
      expect(payment.payer).to.equal(payer.address);
      expect(payment.recipient).to.equal(recipient.address);
      expect(payment.amount).to.equal(amount);
      expect(await router.balances(recipient.address)).to.equal(amount);
    });

    it("should emit PaymentRouted event", async function () {
      await expect(
        router.connect(payer).routePayment(
          paymentId, recipient.address, amount, 1, sessionId, amount, 0,
          { value: amount }
        )
      ).to.emit(router, "PaymentRouted");
    });

    it("should emit PaymentCompleted event for WALLET", async function () {
      await expect(
        router.connect(payer).routePayment(
          paymentId, recipient.address, amount, 1, sessionId, amount, 0,
          { value: amount }
        )
      ).to.emit(router, "PaymentCompleted");
    });

    it("should revert with zero recipient", async function () {
      await expect(
        router.connect(payer).routePayment(
          paymentId, ethers.ZeroAddress, amount, 1, sessionId, amount, 0,
          { value: amount }
        )
      ).to.be.revertedWith("Invalid recipient");
    });

    it("should revert with zero amount", async function () {
      await expect(
        router.connect(payer).routePayment(
          paymentId, recipient.address, 0, 1, sessionId, 0, 0,
          { value: 0 }
        )
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("should revert with insufficient ETH", async function () {
      await expect(
        router.connect(payer).routePayment(
          paymentId, recipient.address, amount, 1, sessionId, amount, 0,
          { value: ethers.parseEther("0.5") }
        )
      ).to.be.revertedWith("Insufficient payment");
    });

    it("should revert for inactive channel", async function () {
      // Deactivate WALLET
      await router.setPaymentChannel(1, ethers.ZeroAddress, false, 0, 0, ethers.MaxUint256);
      await expect(
        router.connect(payer).routePayment(
          paymentId, recipient.address, amount, 1, sessionId, amount, 0,
          { value: amount }
        )
      ).to.be.revertedWith("Payment channel not active");
    });

    it("should revert for amount out of range", async function () {
      const tooSmall = ethers.parseEther("0.0001"); // below 0.001 min
      await expect(
        router.connect(payer).routePayment(
          paymentId, recipient.address, tooSmall, 1, sessionId, tooSmall, 0,
          { value: tooSmall }
        )
      ).to.be.revertedWith("Amount out of range");
    });
  });

  // ── Route Payment (X402 — no auto-complete) ──────────────────

  describe("routePayment (X402)", function () {
    const paymentId = ethers.keccak256(ethers.toUtf8Bytes("x402-pay-1"));
    const amount = ethers.parseEther("1");

    it("should create record but not complete for X402", async function () {
      await router.connect(payer).routePayment(
        paymentId, recipient.address, amount, 2, ethers.ZeroHash, amount, 0
      );
      const payment = await router.getPayment(paymentId);
      expect(payment.completed).to.be.false;
      expect(payment.method).to.equal(2); // X402
    });
  });

  // ── Complete Payment ─────────────────────────────────────────

  describe("completePayment", function () {
    const paymentId = ethers.keccak256(ethers.toUtf8Bytes("x402-complete-1"));
    const amount = ethers.parseEther("1");

    beforeEach(async function () {
      await router.connect(payer).routePayment(
        paymentId, recipient.address, amount, 2, ethers.ZeroHash, amount, 0
      );
    });

    it("channel address can complete payment", async function () {
      await router.connect(x402Channel).completePayment(paymentId);
      const payment = await router.getPayment(paymentId);
      expect(payment.completed).to.be.true;
      expect(await router.balances(recipient.address)).to.equal(amount);
    });

    it("should revert if caller is not channel address", async function () {
      await expect(
        router.connect(payer).completePayment(paymentId)
      ).to.be.revertedWith("Unauthorized");
    });

    it("should revert if already completed", async function () {
      await router.connect(x402Channel).completePayment(paymentId);
      await expect(
        router.connect(x402Channel).completePayment(paymentId)
      ).to.be.revertedWith("Payment already completed");
    });
  });

  // ── Withdraw ─────────────────────────────────────────────────

  describe("withdraw", function () {
    const paymentId = ethers.keccak256(ethers.toUtf8Bytes("withdraw-test"));
    const amount = ethers.parseEther("1");

    beforeEach(async function () {
      await router.connect(payer).routePayment(
        paymentId, recipient.address, amount, 1, ethers.ZeroHash, amount, 0,
        { value: amount }
      );
    });

    it("recipient can withdraw balance", async function () {
      const balBefore = await ethers.provider.getBalance(recipient.address);
      const tx = await router.connect(recipient).withdraw(amount);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(recipient.address);
      expect(balAfter - balBefore + gasCost).to.equal(amount);
      expect(await router.balances(recipient.address)).to.equal(0);
    });

    it("should revert with insufficient balance", async function () {
      await expect(
        router.connect(payer).withdraw(amount)
      ).to.be.revertedWith("Insufficient balance");
    });
  });

  // ── Legacy route ─────────────────────────────────────────────

  describe("routePaymentLegacy", function () {
    const paymentId = ethers.keccak256(ethers.toUtf8Bytes("legacy-1"));
    const amount = ethers.parseEther("1");

    it("should route legacy payment", async function () {
      await router.connect(payer).routePaymentLegacy(
        paymentId, recipient.address, amount, 1,
        { value: amount }
      );
      const payment = await router.getPayment(paymentId);
      expect(payment.completed).to.be.true;
      expect(payment.sessionId).to.equal(ethers.ZeroHash);
    });
  });

  // ── Pausable ─────────────────────────────────────────────────

  describe("Pausable", function () {
    it("owner can pause", async function () {
      await router.pause();
      expect(await router.paused()).to.be.true;
    });

    it("should revert routePayment when paused", async function () {
      await router.pause();
      const paymentId = ethers.keccak256(ethers.toUtf8Bytes("paused-pay"));
      await expect(
        router.connect(payer).routePayment(
          paymentId, recipient.address, ethers.parseEther("1"), 1,
          ethers.ZeroHash, ethers.parseEther("1"), 0,
          { value: ethers.parseEther("1") }
        )
      ).to.be.reverted;
    });
  });

  // ── Receive ETH ──────────────────────────────────────────────

  describe("receive", function () {
    it("should accept ETH", async function () {
      await payer.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("1"),
      });
      expect(await ethers.provider.getBalance(await router.getAddress())).to.be.gte(
        ethers.parseEther("1")
      );
    });
  });
});
