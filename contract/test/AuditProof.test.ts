import { expect } from "chai";
import { ethers } from "hardhat";
import { AuditProof, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("AuditProof", function () {
  let auditProof: AuditProof;
  let usdc: MockERC20;
  let owner: SignerWithAddress;
  let creator: SignerWithAddress;
  let executor: SignerWithAddress;
  let auditor: SignerWithAddress;
  let treasury: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseUnits("1000000", 18);
  const TASK_AMOUNT = ethers.parseUnits("1000", 18);

  beforeEach(async function () {
    [owner, creator, executor, auditor, treasury] = await ethers.getSigners();

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    usdc = (await MockERC20Factory.deploy("Mock USDC", "USDC", INITIAL_SUPPLY)) as MockERC20;

    const AuditProofFactory = await ethers.getContractFactory("AuditProof");
    auditProof = (await AuditProofFactory.deploy(treasury.address)) as AuditProof;

    // Give creator tokens
    await usdc.transfer(creator.address, ethers.parseUnits("100000", 18));
    await usdc.connect(creator).approve(await auditProof.getAddress(), ethers.MaxUint256);
  });

  // ── Deployment ───────────────────────────────────────────────

  describe("Deployment", function () {
    it("should set owner and treasury", async function () {
      expect(await auditProof.owner()).to.equal(owner.address);
      expect(await auditProof.platformTreasury()).to.equal(treasury.address);
    });

    it("should have default platform fee rate of 100 bps (1%)", async function () {
      expect(await auditProof.defaultPlatformFeeRate()).to.equal(100);
    });
  });

  // ── Admin ────────────────────────────────────────────────────

  describe("Admin", function () {
    it("should set trusted auditor", async function () {
      await auditProof.setTrustedAuditor(auditor.address, true);
      expect(await auditProof.trustedAuditors(auditor.address)).to.be.true;
    });

    it("should update platform treasury", async function () {
      await auditProof.setPlatformTreasury(creator.address);
      expect(await auditProof.platformTreasury()).to.equal(creator.address);
    });

    it("should revert setPlatformTreasury with zero address", async function () {
      await expect(auditProof.setPlatformTreasury(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid treasury");
    });

    it("should update platform fee rate", async function () {
      await auditProof.setDefaultPlatformFeeRate(200);
      expect(await auditProof.defaultPlatformFeeRate()).to.equal(200);
    });

    it("should revert fee rate above 10%", async function () {
      await expect(auditProof.setDefaultPlatformFeeRate(1001))
        .to.be.revertedWith("Fee rate too high");
    });
  });

  // ── Task Creation (HASH_MATCH) ───────────────────────────────

  describe("createTask (HASH_MATCH)", function () {
    const taskId = ethers.keccak256(ethers.toUtf8Bytes("task-hash-1"));
    const expectedHash = ethers.keccak256(ethers.toUtf8Bytes("expected-result"));
    let deadline: number;

    beforeEach(async function () {
      deadline = (await time.latest()) + 86400;
    });

    it("should create a HASH_MATCH task", async function () {
      await auditProof.connect(creator).createTask(
        taskId, executor.address, await usdc.getAddress(), TASK_AMOUNT,
        1, // HASH_MATCH
        expectedHash, [], 0, deadline
      );
      const task = await auditProof.getTask(taskId);
      expect(task.creator).to.equal(creator.address);
      expect(task.executor).to.equal(executor.address);
      expect(task.amount).to.equal(TASK_AMOUNT);
      expect(task.status).to.equal(0); // CREATED
    });

    it("should emit TaskCreated event", async function () {
      await expect(
        auditProof.connect(creator).createTask(
          taskId, executor.address, await usdc.getAddress(), TASK_AMOUNT,
          1, expectedHash, [], 0, deadline
        )
      ).to.emit(auditProof, "TaskCreated");
    });

    it("should revert duplicate taskId", async function () {
      await auditProof.connect(creator).createTask(
        taskId, executor.address, await usdc.getAddress(), TASK_AMOUNT,
        1, expectedHash, [], 0, deadline
      );
      await expect(
        auditProof.connect(creator).createTask(
          taskId, executor.address, await usdc.getAddress(), TASK_AMOUNT,
          1, expectedHash, [], 0, deadline
        )
      ).to.be.revertedWith("Task exists");
    });

    it("should revert with zero executor", async function () {
      await expect(
        auditProof.connect(creator).createTask(
          taskId, ethers.ZeroAddress, await usdc.getAddress(), TASK_AMOUNT,
          1, expectedHash, [], 0, deadline
        )
      ).to.be.revertedWith("Invalid executor");
    });

    it("should revert with zero amount", async function () {
      await expect(
        auditProof.connect(creator).createTask(
          taskId, executor.address, await usdc.getAddress(), 0,
          1, expectedHash, [], 0, deadline
        )
      ).to.be.revertedWith("Invalid amount");
    });

    it("should revert HASH_MATCH without hash", async function () {
      await expect(
        auditProof.connect(creator).createTask(
          taskId, executor.address, await usdc.getAddress(), TASK_AMOUNT,
          1, ethers.ZeroHash, [], 0, deadline
        )
      ).to.be.revertedWith("Hash required");
    });
  });

  // ── Fund Task ────────────────────────────────────────────────

  describe("fundTask", function () {
    const taskId = ethers.keccak256(ethers.toUtf8Bytes("task-fund-1"));
    const expectedHash = ethers.keccak256(ethers.toUtf8Bytes("result"));
    let deadline: number;

    beforeEach(async function () {
      deadline = (await time.latest()) + 86400;
      await auditProof.connect(creator).createTask(
        taskId, executor.address, await usdc.getAddress(), TASK_AMOUNT,
        1, expectedHash, [], 0, deadline
      );
    });

    it("should fund task with ERC20", async function () {
      await auditProof.connect(creator).fundTask(taskId);
      const task = await auditProof.getTask(taskId);
      expect(task.status).to.equal(1); // FUNDED
    });

    it("should emit TaskFunded event", async function () {
      await expect(auditProof.connect(creator).fundTask(taskId))
        .to.emit(auditProof, "TaskFunded");
    });

    it("should revert funding non-existent task", async function () {
      await expect(auditProof.connect(creator).fundTask(ethers.ZeroHash))
        .to.be.revertedWith("Task not found");
    });

    it("should revert double funding", async function () {
      await auditProof.connect(creator).fundTask(taskId);
      await expect(auditProof.connect(creator).fundTask(taskId))
        .to.be.revertedWith("Invalid status");
    });
  });

  // ── Submit Result & Auto-verify (HASH_MATCH) ────────────────

  describe("submitResult (HASH_MATCH auto-verify)", function () {
    const taskId = ethers.keccak256(ethers.toUtf8Bytes("task-submit-1"));
    const expectedHash = ethers.keccak256(ethers.toUtf8Bytes("correct-result"));
    let deadline: number;

    beforeEach(async function () {
      deadline = (await time.latest()) + 86400;
      await auditProof.connect(creator).createTask(
        taskId, executor.address, await usdc.getAddress(), TASK_AMOUNT,
        1, expectedHash, [], 0, deadline
      );
      await auditProof.connect(creator).fundTask(taskId);
    });

    it("should auto-verify and release on matching hash", async function () {
      const executorBefore = await usdc.balanceOf(executor.address);
      await auditProof.connect(executor).submitResult(taskId, expectedHash);
      const task = await auditProof.getTask(taskId);
      expect(task.status).to.equal(4); // RELEASED
      const executorAfter = await usdc.balanceOf(executor.address);
      expect(executorAfter - executorBefore).to.equal(TASK_AMOUNT);
    });

    it("should not auto-release on mismatched hash", async function () {
      const wrongHash = ethers.keccak256(ethers.toUtf8Bytes("wrong-result"));
      await auditProof.connect(executor).submitResult(taskId, wrongHash);
      const task = await auditProof.getTask(taskId);
      expect(task.status).to.equal(2); // SUBMITTED
    });

    it("should revert if not executor", async function () {
      await expect(
        auditProof.connect(creator).submitResult(taskId, expectedHash)
      ).to.be.revertedWith("Not executor");
    });

    it("should revert if task not funded", async function () {
      const taskId2 = ethers.keccak256(ethers.toUtf8Bytes("task-unfunded"));
      deadline = (await time.latest()) + 86400;
      await auditProof.connect(creator).createTask(
        taskId2, executor.address, await usdc.getAddress(), TASK_AMOUNT,
        1, expectedHash, [], 0, deadline
      );
      await expect(
        auditProof.connect(executor).submitResult(taskId2, expectedHash)
      ).to.be.revertedWith("Task not funded");
    });
  });

  // ── Creator Confirm Release ──────────────────────────────────

  describe("confirmRelease", function () {
    const taskId = ethers.keccak256(ethers.toUtf8Bytes("task-confirm-1"));
    const expectedHash = ethers.keccak256(ethers.toUtf8Bytes("result"));
    let deadline: number;

    beforeEach(async function () {
      deadline = (await time.latest()) + 86400;
      await auditProof.connect(creator).createTask(
        taskId, executor.address, await usdc.getAddress(), TASK_AMOUNT,
        1, expectedHash, [], 0, deadline
      );
      await auditProof.connect(creator).fundTask(taskId);
      // Submit wrong hash (no auto-release)
      const wrongHash = ethers.keccak256(ethers.toUtf8Bytes("different"));
      await auditProof.connect(executor).submitResult(taskId, wrongHash);
    });

    it("creator can manually confirm and release funds", async function () {
      const executorBefore = await usdc.balanceOf(executor.address);
      await auditProof.connect(creator).confirmRelease(taskId, 85);
      const task = await auditProof.getTask(taskId);
      expect(task.status).to.equal(4); // RELEASED
      expect(await usdc.balanceOf(executor.address) - executorBefore).to.equal(TASK_AMOUNT);
    });

    it("should revert if not creator", async function () {
      await expect(
        auditProof.connect(executor).confirmRelease(taskId, 85)
      ).to.be.revertedWith("Not creator");
    });
  });

  // ── Dispute ──────────────────────────────────────────────────

  describe("disputeTask", function () {
    const taskId = ethers.keccak256(ethers.toUtf8Bytes("task-dispute-1"));
    const expectedHash = ethers.keccak256(ethers.toUtf8Bytes("result"));
    let deadline: number;

    beforeEach(async function () {
      deadline = (await time.latest()) + 86400;
      await auditProof.connect(creator).createTask(
        taskId, executor.address, await usdc.getAddress(), TASK_AMOUNT,
        1, expectedHash, [], 0, deadline
      );
      await auditProof.connect(creator).fundTask(taskId);
      const wrongHash = ethers.keccak256(ethers.toUtf8Bytes("wrong"));
      await auditProof.connect(executor).submitResult(taskId, wrongHash);
    });

    it("creator can dispute submitted task", async function () {
      await auditProof.connect(creator).disputeTask(taskId, "Bad quality");
      const task = await auditProof.getTask(taskId);
      expect(task.status).to.equal(5); // DISPUTED = 5
    });

    it("executor can dispute submitted task", async function () {
      await auditProof.connect(executor).disputeTask(taskId, "Scope changed");
      const task = await auditProof.getTask(taskId);
      expect(task.status).to.equal(5); // DISPUTED = 5
    });

    it("third party cannot dispute", async function () {
      await expect(
        auditProof.connect(auditor).disputeTask(taskId, "Spam")
      ).to.be.revertedWith("Not participant");
    });
  });

  // ── Resolve Dispute ──────────────────────────────────────────

  describe("resolveDispute", function () {
    const taskId = ethers.keccak256(ethers.toUtf8Bytes("task-resolve-1"));
    const expectedHash = ethers.keccak256(ethers.toUtf8Bytes("result"));
    let deadline: number;

    beforeEach(async function () {
      deadline = (await time.latest()) + 86400;
      await auditProof.connect(creator).createTask(
        taskId, executor.address, await usdc.getAddress(), TASK_AMOUNT,
        1, expectedHash, [], 0, deadline
      );
      await auditProof.connect(creator).fundTask(taskId);
      const wrongHash = ethers.keccak256(ethers.toUtf8Bytes("wrong"));
      await auditProof.connect(executor).submitResult(taskId, wrongHash);
      await auditProof.connect(creator).disputeTask(taskId, "Bad");
    });

    it("owner can resolve dispute in favor of executor", async function () {
      const executorBefore = await usdc.balanceOf(executor.address);
      await auditProof.resolveDispute(taskId, true, 7000); // 70% to executor
      const executorAfter = await usdc.balanceOf(executor.address);
      expect(executorAfter - executorBefore).to.equal((TASK_AMOUNT * 7000n) / 10000n);
    });

    it("owner can resolve dispute with full refund to creator", async function () {
      const platformFee = (TASK_AMOUNT * 100n) / 10000n;
      const totalFunded = TASK_AMOUNT + platformFee;
      const creatorBefore = await usdc.balanceOf(creator.address);
      await auditProof.resolveDispute(taskId, false, 0);
      const creatorAfter = await usdc.balanceOf(creator.address);
      expect(creatorAfter - creatorBefore).to.equal(totalFunded);
    });

    it("non-owner cannot resolve dispute", async function () {
      await expect(
        auditProof.connect(creator).resolveDispute(taskId, true, 5000)
      ).to.be.reverted;
    });
  });

  // ── Refund Expired ───────────────────────────────────────────

  describe("refundExpired", function () {
    const taskId = ethers.keccak256(ethers.toUtf8Bytes("task-refund-1"));
    const expectedHash = ethers.keccak256(ethers.toUtf8Bytes("result"));

    it("should refund after deadline + dispute window", async function () {
      const now = await time.latest();
      const deadline = now + 3600; // 1 hour
      await auditProof.connect(creator).createTask(
        taskId, executor.address, await usdc.getAddress(), TASK_AMOUNT,
        1, expectedHash, [], 0, deadline
      );
      await auditProof.connect(creator).fundTask(taskId);

      // Fast-forward past deadline + 24h dispute window
      await time.increase(3600 + 86400 + 1);

      const platformFee = (TASK_AMOUNT * 100n) / 10000n;
      const totalRefund = TASK_AMOUNT + platformFee;
      const creatorBefore = await usdc.balanceOf(creator.address);
      await auditProof.connect(creator).refundExpired(taskId);
      const creatorAfter = await usdc.balanceOf(creator.address);
      expect(creatorAfter - creatorBefore).to.equal(totalRefund);
    });

    it("should revert if not expired yet", async function () {
      const now = await time.latest();
      const deadline = now + 86400 * 7; // 7 days
      await auditProof.connect(creator).createTask(
        taskId, executor.address, await usdc.getAddress(), TASK_AMOUNT,
        1, expectedHash, [], 0, deadline
      );
      await auditProof.connect(creator).fundTask(taskId);
      await expect(
        auditProof.connect(creator).refundExpired(taskId)
      ).to.be.revertedWith("Not expired");
    });
  });

  // ── Pausable ─────────────────────────────────────────────────

  describe("Pausable", function () {
    it("owner can pause and unpause", async function () {
      await auditProof.pause();
      expect(await auditProof.paused()).to.be.true;
      await auditProof.unpause();
      expect(await auditProof.paused()).to.be.false;
    });
  });

  // ── ETH Task Flow ────────────────────────────────────────────

  describe("ETH task flow", function () {
    const taskId = ethers.keccak256(ethers.toUtf8Bytes("task-eth-1"));
    const expectedHash = ethers.keccak256(ethers.toUtf8Bytes("eth-result"));
    const ethAmount = ethers.parseEther("1");

    it("should create, fund with ETH, and auto-release on hash match", async function () {
      const deadline = (await time.latest()) + 86400;
      await auditProof.connect(creator).createTask(
        taskId, executor.address, ethers.ZeroAddress, ethAmount,
        1, expectedHash, [], 0, deadline
      );

      const platformFee = (ethAmount * 100n) / 10000n;
      const totalRequired = ethAmount + platformFee;

      await auditProof.connect(creator).fundTask(taskId, { value: totalRequired });

      const executorBefore = await ethers.provider.getBalance(executor.address);
      await auditProof.connect(executor).submitResult(taskId, expectedHash);
      const executorAfter = await ethers.provider.getBalance(executor.address);
      // Executor receives amount minus gas costs for submitResult tx
      expect(executorAfter).to.be.gt(executorBefore);
    });
  });
});
