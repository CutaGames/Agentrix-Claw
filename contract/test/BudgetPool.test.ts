import { expect } from "chai";
import { ethers } from "hardhat";
import { BudgetPool, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("BudgetPool", function () {
  let budgetPool: BudgetPool;
  let usdc: MockERC20;
  let owner: SignerWithAddress;
  let poolOwner: SignerWithAddress;
  let participant1: SignerWithAddress;
  let participant2: SignerWithAddress;
  let approver: SignerWithAddress;
  let treasury: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseUnits("10000000", 18);
  const POOL_BUDGET = ethers.parseUnits("10000", 18);
  const PLATFORM_FEE_BPS = 200; // 2%
  const BASIS_POINTS = 10000;

  beforeEach(async function () {
    [owner, poolOwner, participant1, participant2, approver, treasury] =
      await ethers.getSigners();

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    usdc = (await MockERC20Factory.deploy("Mock USDC", "USDC", INITIAL_SUPPLY)) as MockERC20;

    const BudgetPoolFactory = await ethers.getContractFactory("BudgetPool");
    budgetPool = (await BudgetPoolFactory.deploy(
      await usdc.getAddress(),
      treasury.address,
      PLATFORM_FEE_BPS
    )) as BudgetPool;

    // Fund poolOwner
    await usdc.transfer(poolOwner.address, ethers.parseUnits("100000", 18));
    await usdc.connect(poolOwner).approve(await budgetPool.getAddress(), ethers.MaxUint256);
  });

  // ── Deployment ───────────────────────────────────────────────

  describe("Deployment", function () {
    it("should set owner, token, treasury, and fee", async function () {
      expect(await budgetPool.owner()).to.equal(owner.address);
      expect(await budgetPool.platformTreasury()).to.equal(treasury.address);
      expect(await budgetPool.platformFeeBps()).to.equal(PLATFORM_FEE_BPS);
    });

    it("should revert with zero token", async function () {
      const Factory = await ethers.getContractFactory("BudgetPool");
      await expect(
        Factory.deploy(ethers.ZeroAddress, treasury.address, PLATFORM_FEE_BPS)
      ).to.be.revertedWith("Invalid token");
    });

    it("should revert with zero treasury", async function () {
      const Factory = await ethers.getContractFactory("BudgetPool");
      await expect(
        Factory.deploy(await usdc.getAddress(), ethers.ZeroAddress, PLATFORM_FEE_BPS)
      ).to.be.revertedWith("Invalid treasury");
    });

    it("should revert with fee too high", async function () {
      const Factory = await ethers.getContractFactory("BudgetPool");
      await expect(
        Factory.deploy(await usdc.getAddress(), treasury.address, 501)
      ).to.be.revertedWith("Fee too high");
    });
  });

  // ── Admin ────────────────────────────────────────────────────

  describe("Admin", function () {
    it("should update platform fee", async function () {
      await budgetPool.setPlatformFee(300);
      expect(await budgetPool.platformFeeBps()).to.equal(300);
    });

    it("should revert fee above 5%", async function () {
      await expect(budgetPool.setPlatformFee(501)).to.be.revertedWith("Fee too high");
    });

    it("should update treasury", async function () {
      await budgetPool.setPlatformTreasury(owner.address);
      expect(await budgetPool.platformTreasury()).to.equal(owner.address);
    });

    it("should set operator", async function () {
      await budgetPool.setOperator(approver.address, true);
      expect(await budgetPool.operators(approver.address)).to.be.true;
    });
  });

  // ── Pool Creation ────────────────────────────────────────────

  describe("createPool", function () {
    it("should create a pool", async function () {
      const deadline = (await time.latest()) + 86400 * 30;
      const qualityGate = { minQualityScore: 60, requiresApproval: true, autoReleaseDelay: 0 };

      const tx = await budgetPool.connect(poolOwner).createPool(
        "Test Pool", "A test budget pool", POOL_BUDGET, deadline, qualityGate
      );
      await expect(tx).to.emit(budgetPool, "PoolCreated");

      const pools = await budgetPool.getOwnerPools(poolOwner.address);
      expect(pools.length).to.equal(1);
    });

    it("should revert with budget too low", async function () {
      const deadline = (await time.latest()) + 86400;
      const qualityGate = { minQualityScore: 60, requiresApproval: true, autoReleaseDelay: 0 };
      await expect(
        budgetPool.connect(poolOwner).createPool("Low", "desc", 100, deadline, qualityGate)
      ).to.be.revertedWith("Budget too low");
    });

    it("should revert with past deadline", async function () {
      const qualityGate = { minQualityScore: 60, requiresApproval: true, autoReleaseDelay: 0 };
      await expect(
        budgetPool.connect(poolOwner).createPool("Past", "desc", POOL_BUDGET, 1, qualityGate)
      ).to.be.revertedWith("Invalid deadline");
    });
  });

  // ── Full Lifecycle ───────────────────────────────────────────

  describe("Full lifecycle: create → fund → milestone → approve → release → claim", function () {
    let poolId: string;
    let milestoneId: string;
    const qualityGate = { minQualityScore: 60, requiresApproval: true, autoReleaseDelay: 0 };

    beforeEach(async function () {
      const deadline = (await time.latest()) + 86400 * 30;

      // 1. Create pool
      const tx = await budgetPool.connect(poolOwner).createPool(
        "Full Lifecycle Pool", "Test", POOL_BUDGET, deadline, qualityGate
      );
      const receipt = await tx.wait();
      const event = receipt?.logs.find((log: any) => {
        try {
          return budgetPool.interface.parseLog(log as any)?.name === "PoolCreated";
        } catch { return false; }
      });
      poolId = budgetPool.interface.parseLog(event as any)?.args[0];

      // 2. Create milestone (50% of pool, split 60/40 between two participants)
      const msTx = await budgetPool.connect(poolOwner).createMilestone(
        poolId, "Milestone 1", "First deliverable", 5000,
        [participant1.address, participant2.address],
        [6000, 4000]
      );
      const msReceipt = await msTx.wait();
      const msEvent = msReceipt?.logs.find((log: any) => {
        try {
          return budgetPool.interface.parseLog(log as any)?.name === "MilestoneCreated";
        } catch { return false; }
      });
      milestoneId = budgetPool.interface.parseLog(msEvent as any)?.args[0];

      // 3. Fund pool
      await budgetPool.connect(poolOwner).fundPool(poolId, POOL_BUDGET);

      // 4. Add approver
      await budgetPool.connect(poolOwner).addApprover(poolId, approver.address);

      // 5. Activate pool
      await budgetPool.connect(poolOwner).activatePool(poolId);
    });

    it("pool should be ACTIVE after activation", async function () {
      const pool = await budgetPool.getPool(poolId);
      expect(pool.status).to.equal(2); // ACTIVE
    });

    it("milestone should be PENDING", async function () {
      const ms = await budgetPool.getMilestone(milestoneId);
      expect(ms.status).to.equal(0); // PENDING
    });

    it("participant can start milestone", async function () {
      await budgetPool.connect(participant1).startMilestone(milestoneId);
      const ms = await budgetPool.getMilestone(milestoneId);
      expect(ms.status).to.equal(1); // IN_PROGRESS
    });

    it("full lifecycle: start → submit → approve → release → claim", async function () {
      // Start
      await budgetPool.connect(participant1).startMilestone(milestoneId);

      // Submit
      const deliverableHash = ethers.keccak256(ethers.toUtf8Bytes("deliverable-1"));
      await budgetPool.connect(participant1).submitMilestone(milestoneId, deliverableHash);
      let ms = await budgetPool.getMilestone(milestoneId);
      expect(ms.status).to.equal(2); // SUBMITTED

      // Approve
      await budgetPool.connect(approver).approveMilestone(milestoneId, 85);
      ms = await budgetPool.getMilestone(milestoneId);
      expect(ms.status).to.equal(3); // APPROVED

      // Release
      await budgetPool.releaseMilestoneFunds(milestoneId);
      ms = await budgetPool.getMilestone(milestoneId);
      expect(ms.status).to.equal(5); // RELEASED

      // Check pending balances
      const pending1 = await budgetPool.getPendingBalance(participant1.address);
      const pending2 = await budgetPool.getPendingBalance(participant2.address);
      expect(pending1).to.be.gt(0);
      expect(pending2).to.be.gt(0);

      // Claim
      const bal1Before = await usdc.balanceOf(participant1.address);
      await budgetPool.connect(participant1).claim();
      const bal1After = await usdc.balanceOf(participant1.address);
      expect(bal1After - bal1Before).to.equal(pending1);
      expect(await budgetPool.getPendingBalance(participant1.address)).to.equal(0);
    });

    it("should revert approve with low quality score", async function () {
      await budgetPool.connect(participant1).startMilestone(milestoneId);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("d"));
      await budgetPool.connect(participant1).submitMilestone(milestoneId, hash);
      await expect(
        budgetPool.connect(approver).approveMilestone(milestoneId, 50) // below 60
      ).to.be.revertedWith("Quality too low");
    });

    it("approver can reject milestone", async function () {
      await budgetPool.connect(participant1).startMilestone(milestoneId);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("d"));
      await budgetPool.connect(participant1).submitMilestone(milestoneId, hash);
      await budgetPool.connect(approver).rejectMilestone(milestoneId, "Incomplete");
      const ms = await budgetPool.getMilestone(milestoneId);
      expect(ms.status).to.equal(4); // REJECTED
    });

    it("non-participant cannot start milestone", async function () {
      await expect(
        budgetPool.connect(approver).startMilestone(milestoneId)
      ).to.be.revertedWith("Not authorized");
    });

    it("non-participant cannot submit milestone", async function () {
      await budgetPool.connect(participant1).startMilestone(milestoneId);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("d"));
      await expect(
        budgetPool.connect(approver).submitMilestone(milestoneId, hash)
      ).to.be.revertedWith("Not participant");
    });
  });

  // ── Fund Pool ────────────────────────────────────────────────

  describe("fundPool", function () {
    let poolId: string;

    beforeEach(async function () {
      const deadline = (await time.latest()) + 86400 * 30;
      const qualityGate = { minQualityScore: 60, requiresApproval: true, autoReleaseDelay: 0 };
      const tx = await budgetPool.connect(poolOwner).createPool(
        "Fund Test", "desc", POOL_BUDGET, deadline, qualityGate
      );
      const receipt = await tx.wait();
      const event = receipt?.logs.find((log: any) => {
        try { return budgetPool.interface.parseLog(log as any)?.name === "PoolCreated"; }
        catch { return false; }
      });
      poolId = budgetPool.interface.parseLog(event as any)?.args[0];
    });

    it("should cap funding at total budget", async function () {
      // Fund more than needed
      await budgetPool.connect(poolOwner).fundPool(poolId, POOL_BUDGET + ethers.parseUnits("5000", 18));
      const pool = await budgetPool.getPool(poolId);
      expect(pool.fundedAmount).to.equal(POOL_BUDGET);
      expect(pool.status).to.equal(1); // FUNDED
    });

    it("should allow partial funding", async function () {
      const half = POOL_BUDGET / 2n;
      await budgetPool.connect(poolOwner).fundPool(poolId, half);
      const pool = await budgetPool.getPool(poolId);
      expect(pool.fundedAmount).to.equal(half);
      expect(pool.status).to.equal(0); // still DRAFT
    });
  });

  // ── Milestone Shares Validation ──────────────────────────────

  describe("Milestone shares validation", function () {
    let poolId: string;

    beforeEach(async function () {
      const deadline = (await time.latest()) + 86400 * 30;
      const qualityGate = { minQualityScore: 60, requiresApproval: true, autoReleaseDelay: 0 };
      const tx = await budgetPool.connect(poolOwner).createPool(
        "Shares Test", "desc", POOL_BUDGET, deadline, qualityGate
      );
      const receipt = await tx.wait();
      const event = receipt?.logs.find((log: any) => {
        try { return budgetPool.interface.parseLog(log as any)?.name === "PoolCreated"; }
        catch { return false; }
      });
      poolId = budgetPool.interface.parseLog(event as any)?.args[0];
    });

    it("should revert if shares don't sum to 100%", async function () {
      await expect(
        budgetPool.connect(poolOwner).createMilestone(
          poolId, "Bad Shares", "desc", 5000,
          [participant1.address, participant2.address],
          [5000, 4000] // sums to 9000, not 10000
        )
      ).to.be.revertedWith("Shares must equal 100%");
    });

    it("should revert if participants/shares length mismatch", async function () {
      await expect(
        budgetPool.connect(poolOwner).createMilestone(
          poolId, "Mismatch", "desc", 5000,
          [participant1.address],
          [5000, 5000]
        )
      ).to.be.revertedWith("Length mismatch");
    });
  });

  // ── Pausable ─────────────────────────────────────────────────

  describe("Pausable", function () {
    it("owner can pause and unpause", async function () {
      await budgetPool.pause();
      expect(await budgetPool.paused()).to.be.true;
      await budgetPool.unpause();
      expect(await budgetPool.paused()).to.be.false;
    });

    it("non-owner cannot pause", async function () {
      await expect(budgetPool.connect(poolOwner).pause()).to.be.reverted;
    });
  });

  // ── Claim ────────────────────────────────────────────────────

  describe("claim", function () {
    it("should revert with nothing to claim", async function () {
      await expect(budgetPool.connect(participant1).claim())
        .to.be.revertedWith("Nothing to claim");
    });
  });
});
