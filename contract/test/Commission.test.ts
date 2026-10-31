import { expect } from "chai";
import { ethers } from "hardhat";
import { Commission, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Commission", function () {
  let commission: Commission;
  let usdc: MockERC20;
  let owner: SignerWithAddress;
  let relayer: SignerWithAddress;
  let merchant: SignerWithAddress;
  let referrer: SignerWithAddress;
  let executor: SignerWithAddress;
  let treasury: SignerWithAddress;
  let rebatePool: SignerWithAddress;
  let auditor: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseUnits("1000000", 18);
  const ORDER_AMOUNT = ethers.parseUnits("1000", 18);

  beforeEach(async function () {
    [owner, relayer, merchant, referrer, executor, treasury, rebatePool, auditor] =
      await ethers.getSigners();

    // Deploy MockERC20
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    usdc = (await MockERC20Factory.deploy("Mock USDC", "USDC", INITIAL_SUPPLY)) as MockERC20;

    // Deploy Commission
    const CommissionFactory = await ethers.getContractFactory("Commission");
    commission = (await CommissionFactory.deploy()) as Commission;

    // Configure
    await commission.configureSettlementToken(
      await usdc.getAddress(),
      treasury.address,
      rebatePool.address
    );
    await commission.setRelayer(relayer.address, true);
  });

  // ── Deployment & Config ──────────────────────────────────────

  describe("Deployment", function () {
    it("should set the owner correctly", async function () {
      expect(await commission.owner()).to.equal(owner.address);
    });

    it("should configure settlement token", async function () {
      expect(await commission.paymindTreasury()).to.equal(treasury.address);
      expect(await commission.systemRebatePool()).to.equal(rebatePool.address);
    });

    it("should set relayer", async function () {
      expect(await commission.relayers(relayer.address)).to.be.true;
    });

    it("should revert configureSettlementToken with zero addresses", async function () {
      await expect(
        commission.configureSettlementToken(ethers.ZeroAddress, treasury.address, rebatePool.address)
      ).to.be.revertedWith("Invalid addresses");
    });
  });

  // ── Pausable ─────────────────────────────────────────────────

  describe("Pausable", function () {
    it("owner can pause and unpause", async function () {
      await commission.pause();
      expect(await commission.paused()).to.be.true;
      await commission.unpause();
      expect(await commission.paused()).to.be.false;
    });

    it("non-owner cannot pause", async function () {
      await expect(commission.connect(merchant).pause()).to.be.reverted;
    });
  });

  // ── Record Commission ────────────────────────────────────────

  describe("recordCommission", function () {
    it("should record a commission and update pending balance", async function () {
      const amount = ethers.parseUnits("100", 18);
      await commission.recordCommission(
        merchant.address,
        0, // AGENT
        0, // EXECUTION
        amount,
        await usdc.getAddress(),
        amount,
        0,
        ethers.keccak256(ethers.toUtf8Bytes("session-1"))
      );
      const pending = await commission.getPendingBalance(merchant.address, await usdc.getAddress());
      expect(pending).to.equal(amount);
    });

    it("should revert with zero payee", async function () {
      await expect(
        commission.recordCommission(
          ethers.ZeroAddress, 0, 0, 100, await usdc.getAddress(), 100, 0, ethers.ZeroHash
        )
      ).to.be.revertedWith("Invalid payee address");
    });

    it("should revert with zero amount", async function () {
      await expect(
        commission.recordCommission(
          merchant.address, 0, 0, 0, await usdc.getAddress(), 0, 0, ethers.ZeroHash
        )
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("only owner can record commission", async function () {
      await expect(
        commission.connect(merchant).recordCommission(
          merchant.address, 0, 0, 100, await usdc.getAddress(), 100, 0, ethers.ZeroHash
        )
      ).to.be.reverted;
    });
  });

  // ── Legacy Record Commission ─────────────────────────────────

  describe("recordCommissionLegacy", function () {
    it("should record legacy commission", async function () {
      const amount = ethers.parseUnits("50", 18);
      await commission.recordCommissionLegacy(
        merchant.address, 1, amount, await usdc.getAddress()
      );
      const pending = await commission.getPendingBalance(merchant.address, await usdc.getAddress());
      expect(pending).to.equal(amount);
    });
  });

  // ── Settlement ───────────────────────────────────────────────

  describe("createSettlement & executeSettlement", function () {
    const amount = ethers.parseUnits("200", 18);

    beforeEach(async function () {
      await commission.recordCommission(
        merchant.address, 1, 0, amount, await usdc.getAddress(), amount, 0, ethers.ZeroHash
      );
    });

    it("should create settlement", async function () {
      const tx = await commission.createSettlement(merchant.address, 1, await usdc.getAddress());
      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;
    });

    it("should revert with no pending balance", async function () {
      await expect(
        commission.createSettlement(referrer.address, 0, await usdc.getAddress())
      ).to.be.revertedWith("No pending balance");
    });

    it("should execute settlement and transfer tokens", async function () {
      // Fund the commission contract
      await usdc.transfer(await commission.getAddress(), amount);

      const tx = await commission.createSettlement(merchant.address, 1, await usdc.getAddress());
      const receipt = await tx.wait();

      // Extract settlementId from event
      const event = receipt?.logs.find((log: any) => {
        try {
          return commission.interface.parseLog(log as any)?.name === "SettlementCreated";
        } catch { return false; }
      });
      const parsed = commission.interface.parseLog(event as any);
      const settlementId = parsed?.args[0];

      const balBefore = await usdc.balanceOf(merchant.address);
      await commission.executeSettlement(settlementId);
      const balAfter = await usdc.balanceOf(merchant.address);
      expect(balAfter - balBefore).to.equal(amount);
    });
  });

  // ── SyncOrder & distributeCommission (legacy path) ───────────

  describe("syncOrder + distributeCommission (legacy)", function () {
    const orderId = ethers.keccak256(ethers.toUtf8Bytes("order-1"));
    const merchantAmt = ethers.parseUnits("700", 18);
    const referralFee = ethers.parseUnits("50", 18);
    const executionFee = ethers.parseUnits("100", 18);
    const platformFee = ethers.parseUnits("150", 18);
    const total = merchantAmt + referralFee + executionFee + platformFee;

    beforeEach(async function () {
      await usdc.transfer(await commission.getAddress(), total);
      await commission.syncOrder(
        orderId,
        merchant.address,
        referrer.address,
        executor.address,
        merchantAmt,
        referralFee,
        executionFee,
        platformFee,
        0, // settlementTime (immediate)
        true, // executorHasWallet
        false, // isDisputed
        3 // DELIVERED
      );
    });

    it("should distribute commission correctly", async function () {
      const merchantBefore = await usdc.balanceOf(merchant.address);
      const referrerBefore = await usdc.balanceOf(referrer.address);
      const executorBefore = await usdc.balanceOf(executor.address);
      const treasuryBefore = await usdc.balanceOf(treasury.address);

      await commission.distributeCommission(orderId);

      expect(await usdc.balanceOf(merchant.address) - merchantBefore).to.equal(merchantAmt);
      expect(await usdc.balanceOf(referrer.address) - referrerBefore).to.equal(referralFee);
      expect(await usdc.balanceOf(executor.address) - executorBefore).to.equal(executionFee);
      expect(await usdc.balanceOf(treasury.address) - treasuryBefore).to.equal(platformFee);
    });

    it("should revert for non-existent order", async function () {
      await expect(
        commission.distributeCommission(ethers.ZeroHash)
      ).to.be.revertedWith("Order not found");
    });

    it("should revert when disputed", async function () {
      await commission.setOrderDispute(orderId, true);
      await expect(
        commission.distributeCommission(orderId)
      ).to.be.revertedWith("Order not ready");
    });
  });

  // ── SplitConfig path ─────────────────────────────────────────

  describe("setSplitConfig + quickPaySplit", function () {
    const orderId = ethers.keccak256(ethers.toUtf8Bytes("split-order-1"));
    const merchantAmt = ethers.parseUnits("600", 18);
    const referralFee = ethers.parseUnits("50", 18);
    const executionFee = ethers.parseUnits("100", 18);
    const platformFee = ethers.parseUnits("50", 18);
    const total = merchantAmt + referralFee + executionFee + platformFee;

    beforeEach(async function () {
      const config = {
        merchantMPCWallet: merchant.address,
        merchantAmount: merchantAmt,
        referrer: referrer.address,
        referralFee: referralFee,
        executor: executor.address,
        executionFee: executionFee,
        platformFee: platformFee,
        offRampFee: 0,
        executorHasWallet: true,
        settlementTime: 0,
        isDisputed: false,
        sessionId: ethers.ZeroHash,
        proofHash: ethers.ZeroHash,
        auditor: ethers.ZeroAddress,
        requiresProof: false,
        proofVerified: false,
      };
      await commission.setSplitConfig(orderId, config);
      // User approves and funds
      await usdc.approve(await commission.getAddress(), total);
    });

    it("should execute quickPaySplit and distribute correctly", async function () {
      const merchantBefore = await usdc.balanceOf(merchant.address);
      await commission.quickPaySplit(orderId, total);
      expect(await usdc.balanceOf(merchant.address) - merchantBefore).to.equal(merchantAmt);
    });

    it("should revert quickPaySplit when paused", async function () {
      await commission.pause();
      await expect(commission.quickPaySplit(orderId, total)).to.be.reverted;
    });
  });

  // ── Audit Proof integration ──────────────────────────────────

  describe("Audit Proof", function () {
    const orderId = ethers.keccak256(ethers.toUtf8Bytes("proof-order-1"));
    const proofHash = ethers.keccak256(ethers.toUtf8Bytes("expected-result"));
    const total = ethers.parseUnits("500", 18);

    beforeEach(async function () {
      const config = {
        merchantMPCWallet: merchant.address,
        merchantAmount: total,
        referrer: ethers.ZeroAddress,
        referralFee: 0,
        executor: executor.address,
        executionFee: 0,
        platformFee: 0,
        offRampFee: 0,
        executorHasWallet: true,
        settlementTime: 0,
        isDisputed: false,
        sessionId: ethers.ZeroHash,
        proofHash: ethers.ZeroHash,
        auditor: ethers.ZeroAddress,
        requiresProof: false,
        proofVerified: false,
      };
      await commission.setSplitConfig(orderId, config);
      await commission.setRelayer(relayer.address, true);
      await commission.connect(relayer).setProofRequirement(orderId, proofHash, auditor.address);
    });

    it("should block distribution when proof not verified", async function () {
      await usdc.transfer(await commission.getAddress(), total);
      await expect(commission.distributeCommission(orderId)).to.be.revertedWith("Proof not verified");
    });

    it("should allow distribution after proof auto-verified", async function () {
      await usdc.transfer(await commission.getAddress(), total);
      // Submit matching proof from executor
      await commission.connect(executor).submitProof(orderId, proofHash);
      // Now should work
      await commission.distributeCommission(orderId);
    });

    it("auditor can verify proof manually", async function () {
      await usdc.transfer(await commission.getAddress(), total);
      // Submit different hash
      const resultHash = ethers.keccak256(ethers.toUtf8Bytes("different-result"));
      await commission.connect(executor).submitProof(orderId, resultHash);
      // Auditor verifies
      await commission.connect(auditor).verifyProof(orderId, true, 80);
      await commission.distributeCommission(orderId);
    });

    it("should set trusted auditor", async function () {
      await commission.setTrustedAuditor(auditor.address, true);
      expect(await commission.trustedAuditors(auditor.address)).to.be.true;
    });
  });

  // ── Emergency ────────────────────────────────────────────────

  describe("Emergency", function () {
    it("owner can emergency withdraw tokens", async function () {
      const amount = ethers.parseUnits("100", 18);
      await usdc.transfer(await commission.getAddress(), amount);
      await commission.emergencyWithdrawToken(
        await usdc.getAddress(), owner.address, amount
      );
      expect(await usdc.balanceOf(await commission.getAddress())).to.equal(0);
    });

    it("non-owner cannot emergency withdraw", async function () {
      await expect(
        commission.connect(merchant).emergencyWithdrawToken(
          await usdc.getAddress(), merchant.address, 100
        )
      ).to.be.reverted;
    });
  });
});
