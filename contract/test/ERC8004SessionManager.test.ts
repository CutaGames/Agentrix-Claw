import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * L8 D5：ERC8004SessionManager 测试（这个合约之前没有任何测试文件）。
 * 覆盖审计 H-03（批量内部调用、可分段）、H-05（多链 decimals）、H-04（relayer 角色和事件）、M-04（sessionId 碰撞）。
 */
describe("ERC8004SessionManager (L8 D5)", function () {
  const SINGLE = 100_000_000n; // 100 个代币，按 6 位记账
  const DAILY = 1_000_000_000n;
  const pay = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));

  type TokenKind = "usdc6" | "usdt18" | "usdt18NoReturn" | "tiny3";

  async function deployToken(kind: TokenKind) {
    const supply = ethers.parseUnits("1000000", 18);
    if (kind === "usdc6") return (await ethers.getContractFactory("MockDecimalsERC20")).deploy("USDC", "USDC", 6, supply);
    if (kind === "usdt18") return (await ethers.getContractFactory("MockDecimalsERC20")).deploy("USDT", "USDT", 18, supply);
    if (kind === "tiny3") return (await ethers.getContractFactory("MockDecimalsERC20")).deploy("TINY", "TNY", 3, supply);
    return (await ethers.getContractFactory("MockNoReturnERC20")).deploy("USDT", "USDT", 18, supply);
  }

  async function setup(kind: TokenKind = "usdc6") {
    const [owner, relayer, user, sessionKey, recipient, stranger, other] = await ethers.getSigners();
    const token: any = await deployToken(kind);
    const manager: any = await (await ethers.getContractFactory("ERC8004SessionManager")).deploy(await token.getAddress());
    await manager.setRelayer(relayer.address);
    await token.transfer(user.address, ethers.parseUnits("100000", 18));
    await token.connect(user).approve(await manager.getAddress(), ethers.MaxUint256);
    return { owner, relayer, user, sessionKey, recipient, stranger, other, token, manager };
  }

  async function newSession(ctx: Awaited<ReturnType<typeof setup>>, single = SINGLE, daily = DAILY) {
    const expiry = (await time.latest()) + 86400;
    const receipt = await (await ctx.manager.connect(ctx.user).createSession(ctx.sessionKey.address, single, daily, expiry)).wait();
    for (const log of receipt.logs) {
      try {
        const parsed = ctx.manager.interface.parseLog(log);
        if (parsed && parsed.name === "SessionCreated") return parsed.args[0] as string;
      } catch {
        // 不是 manager 的日志
      }
    }
    throw new Error("SessionCreated not found");
  }

  async function sign(ctx: Awaited<ReturnType<typeof setup>>, sessionId: string, to: string, amount: bigint, paymentId: string, signer = ctx.sessionKey) {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const hash = ethers.solidityPackedKeccak256(
      ["bytes32", "address", "uint256", "bytes32", "uint256"],
      [sessionId, to, amount, paymentId, chainId]
    );
    return signer.signMessage(ethers.getBytes(hash));
  }

  describe("H-05 多链 decimals", function () {
    it("6 位的 USDC：额度按 6 位记账，转账也是 6 位", async function () {
      const ctx = await setup("usdc6");
      expect(await ctx.manager.tokenDecimals()).to.equal(6n);
      const sessionId = await newSession(ctx);
      const amount = 5_000_000n; // 5 个代币
      const sig = await sign(ctx, sessionId, ctx.recipient.address, amount, pay("a"));
      await ctx.manager.connect(ctx.relayer).executeWithSession(sessionId, ctx.recipient.address, amount, pay("a"), sig);
      expect(await ctx.token.balanceOf(ctx.recipient.address)).to.equal(5_000_000n);
    });

    it("18 位的 USDT（BNB 链）：同样的 5 个代币，实际转 5e18", async function () {
      const ctx = await setup("usdt18");
      expect(await ctx.manager.tokenDecimals()).to.equal(18n);
      const sessionId = await newSession(ctx);
      const amount = 5_000_000n;
      const sig = await sign(ctx, sessionId, ctx.recipient.address, amount, pay("b"));
      await ctx.manager.connect(ctx.relayer).executeWithSession(sessionId, ctx.recipient.address, amount, pay("b"), sig);
      expect(await ctx.token.balanceOf(ctx.recipient.address)).to.equal(ethers.parseUnits("5", 18));
      expect((await ctx.manager.getSession(sessionId)).usedToday).to.equal(amount);
    });

    it("不返回值的 18 位 USDT 也能付款", async function () {
      const ctx = await setup("usdt18NoReturn");
      const sessionId = await newSession(ctx);
      const sig = await sign(ctx, sessionId, ctx.recipient.address, 1_000_000n, pay("c"));
      await ctx.manager.connect(ctx.relayer).executeWithSession(sessionId, ctx.recipient.address, 1_000_000n, pay("c"), sig);
      expect(await ctx.token.balanceOf(ctx.recipient.address)).to.equal(ethers.parseUnits("1", 18));
    });

    it("精度比 6 位还低的代币：换算后为 0 的付款被拒绝，不会记了额度却没转钱", async function () {
      const ctx = await setup("tiny3");
      const sessionId = await newSession(ctx);
      const sig = await sign(ctx, sessionId, ctx.recipient.address, 500n, pay("d")); // 500 / 1000 = 0
      await expect(
        ctx.manager.connect(ctx.relayer).executeWithSession(sessionId, ctx.recipient.address, 500n, pay("d"), sig)
      ).to.be.revertedWith("Amount rounds to zero");
      expect((await ctx.manager.getSession(sessionId)).usedToday).to.equal(0n);
    });

    it("构造函数拒绝零地址和精度离谱的代币", async function () {
      const factory = await ethers.getContractFactory("ERC8004SessionManager");
      await expect(factory.deploy(ethers.ZeroAddress)).to.be.revertedWith("Invalid USDC address");
      const weird: any = await (await ethers.getContractFactory("MockDecimalsERC20")).deploy("W", "W", 37, 1n);
      await expect(factory.deploy(await weird.getAddress())).to.be.revertedWith("Unsupported decimals");
    });
  });

  describe("签名、限额、权限", function () {
    it("session key 以外的人签的名被拒绝", async function () {
      const ctx = await setup();
      const sessionId = await newSession(ctx);
      const sig = await sign(ctx, sessionId, ctx.recipient.address, 1_000_000n, pay("e"), ctx.stranger);
      await expect(
        ctx.manager.connect(ctx.relayer).executeWithSession(sessionId, ctx.recipient.address, 1_000_000n, pay("e"), sig)
      ).to.be.revertedWith("Invalid signature");
    });

    it("单笔限额、每日限额都生效", async function () {
      const ctx = await setup();
      const sessionId = await newSession(ctx, 10_000_000n, 15_000_000n);
      const sigBig = await sign(ctx, sessionId, ctx.recipient.address, 10_000_001n, pay("f"));
      await expect(
        ctx.manager.connect(ctx.relayer).executeWithSession(sessionId, ctx.recipient.address, 10_000_001n, pay("f"), sigBig)
      ).to.be.revertedWith("Exceeds single limit");

      const sig1 = await sign(ctx, sessionId, ctx.recipient.address, 10_000_000n, pay("g"));
      await ctx.manager.connect(ctx.relayer).executeWithSession(sessionId, ctx.recipient.address, 10_000_000n, pay("g"), sig1);
      const sig2 = await sign(ctx, sessionId, ctx.recipient.address, 6_000_000n, pay("h"));
      await expect(
        ctx.manager.connect(ctx.relayer).executeWithSession(sessionId, ctx.recipient.address, 6_000_000n, pay("h"), sig2)
      ).to.be.revertedWith("Exceeds daily limit");
    });

    it("只有 relayer 能执行；撤换 relayer 有事件，旧的立刻失效", async function () {
      const ctx = await setup();
      const sessionId = await newSession(ctx);
      const sig = await sign(ctx, sessionId, ctx.recipient.address, 1_000_000n, pay("i"));
      await expect(
        ctx.manager.connect(ctx.stranger).executeWithSession(sessionId, ctx.recipient.address, 1_000_000n, pay("i"), sig)
      ).to.be.revertedWith("Only relayer can execute");

      await expect(ctx.manager.setRelayer(ctx.other.address))
        .to.emit(ctx.manager, "RelayerChanged").withArgs(ctx.relayer.address, ctx.other.address);
      await expect(
        ctx.manager.connect(ctx.relayer).executeWithSession(sessionId, ctx.recipient.address, 1_000_000n, pay("i"), sig)
      ).to.be.revertedWith("Only relayer can execute");
      await ctx.manager.connect(ctx.other).executeWithSession(sessionId, ctx.recipient.address, 1_000_000n, pay("i"), sig);
    });

    it("只有 owner 能设置 relayer，不能直接 grantRole", async function () {
      const ctx = await setup();
      const RELAYER = await ctx.manager.RELAYER_ROLE();
      await expect(ctx.manager.connect(ctx.stranger).setRelayer(ctx.stranger.address)).to.be.reverted;
      await expect(ctx.manager.connect(ctx.stranger).grantRole(RELAYER, ctx.stranger.address)).to.be.reverted;
      await expect(ctx.manager.setRelayer(ethers.ZeroAddress)).to.be.revertedWith("Invalid relayer");
    });

    it("L5 owner 也不能绕过 setRelayer 直接 grantRole / revokeRole；relayer 不能自己 renounceRole", async function () {
      const ctx = await setup();
      const RELAYER = await ctx.manager.RELAYER_ROLE();
      await expect(ctx.manager.grantRole(RELAYER, ctx.stranger.address)).to.be.revertedWith("Use setRelayer");
      await expect(ctx.manager.revokeRole(RELAYER, ctx.relayer.address)).to.be.revertedWith("Use setRelayer");
      await expect(ctx.manager.connect(ctx.relayer).renounceRole(RELAYER, ctx.relayer.address)).to.be.revertedWith("Use setRelayer");
      expect(await ctx.manager.hasRole(RELAYER, ctx.relayer.address)).to.equal(true);
      expect(await ctx.manager.hasRole(RELAYER, ctx.stranger.address)).to.equal(false);
      // 经 setRelayer 换人仍然可以，角色和变量一致
      await ctx.manager.setRelayer(ctx.other.address);
      expect(await ctx.manager.relayer()).to.equal(ctx.other.address);
      expect(await ctx.manager.hasRole(RELAYER, ctx.other.address)).to.equal(true);
      expect(await ctx.manager.hasRole(RELAYER, ctx.relayer.address)).to.equal(false);
    });
    it("撤销的 session 和暂停都会停掉付款", async function () {
      const ctx = await setup();
      const sessionId = await newSession(ctx);
      const sig = await sign(ctx, sessionId, ctx.recipient.address, 1_000_000n, pay("j"));
      await ctx.manager.pause();
      await expect(
        ctx.manager.connect(ctx.relayer).executeWithSession(sessionId, ctx.recipient.address, 1_000_000n, pay("j"), sig)
      ).to.be.revertedWith("Pausable: paused");
      await ctx.manager.unpause();
      await ctx.manager.connect(ctx.user).revokeSession(sessionId);
      await expect(
        ctx.manager.connect(ctx.relayer).executeWithSession(sessionId, ctx.recipient.address, 1_000_000n, pay("j"), sig)
      ).to.be.revertedWith("Session not active");
    });
  });

  describe("H-03 批量执行", function () {
    async function buildBatch(ctx: Awaited<ReturnType<typeof setup>>, sessionId: string, count: number, tag: string) {
      const recipients: string[] = [];
      const amounts: bigint[] = [];
      const paymentIds: string[] = [];
      const signatures: string[] = [];
      for (let i = 0; i < count; i++) {
        const paymentId = pay(`${tag}-${i}`);
        recipients.push(ctx.recipient.address);
        amounts.push(1_000_000n);
        paymentIds.push(paymentId);
        signatures.push(await sign(ctx, sessionId, ctx.recipient.address, 1_000_000n, paymentId));
      }
      return { sessionIds: Array(count).fill(sessionId), recipients, amounts, paymentIds, signatures };
    }

    it("默认上限 50，超过的批次整个拒绝；owner 可以调到 100，不能更高", async function () {
      const ctx = await setup();
      expect(await ctx.manager.maxBatchSize()).to.equal(50n);
      const n = 51;
      const args = [
        Array(n).fill(ethers.ZeroHash),
        Array(n).fill(ctx.recipient.address),
        Array(n).fill(1n),
        Array(n).fill(ethers.ZeroHash),
        Array(n).fill("0x"),
      ];
      await expect(ctx.manager.connect(ctx.relayer).executeBatchWithSession(...args)).to.be.revertedWith("Invalid batch size");

      await expect(ctx.manager.setMaxBatchSize(101)).to.be.revertedWith("Invalid max batch size");
      await expect(ctx.manager.setMaxBatchSize(0)).to.be.revertedWith("Invalid max batch size");
      await expect(ctx.manager.connect(ctx.stranger).setMaxBatchSize(10)).to.be.reverted;
      await expect(ctx.manager.setMaxBatchSize(100)).to.emit(ctx.manager, "MaxBatchSizeChanged").withArgs(100n);
      // 上限放到 100 之后，51 笔不再因为批量大小被拒（而是因为 session 不存在）
      await expect(ctx.manager.connect(ctx.relayer).executeBatchWithSession(...args)).to.be.revertedWith("Session not found");
    });

    it("大批量拆成几段提交，每一段都成功", async function () {
      const ctx = await setup();
      const sessionId = await newSession(ctx);
      await ctx.manager.setMaxBatchSize(10);
      const first = await buildBatch(ctx, sessionId, 10, "chunk-a");
      const second = await buildBatch(ctx, sessionId, 10, "chunk-b");
      await ctx.manager.connect(ctx.relayer).executeBatchWithSession(first.sessionIds, first.recipients, first.amounts, first.paymentIds, first.signatures);
      await ctx.manager.connect(ctx.relayer).executeBatchWithSession(second.sessionIds, second.recipients, second.amounts, second.paymentIds, second.signatures);
      expect(await ctx.token.balanceOf(ctx.recipient.address)).to.equal(20_000_000n);
    });

    it("一段里有一笔签名不对：这一段整体回滚，一分钱都不转", async function () {
      const ctx = await setup();
      const sessionId = await newSession(ctx);
      const batch = await buildBatch(ctx, sessionId, 5, "bad");
      batch.signatures[3] = await sign(ctx, sessionId, ctx.recipient.address, 1_000_000n, batch.paymentIds[3], ctx.stranger);
      await expect(
        ctx.manager.connect(ctx.relayer).executeBatchWithSession(batch.sessionIds, batch.recipients, batch.amounts, batch.paymentIds, batch.signatures)
      ).to.be.revertedWith("Invalid signature");
      expect(await ctx.token.balanceOf(ctx.recipient.address)).to.equal(0n);
      expect((await ctx.manager.getSession(sessionId)).usedToday).to.equal(0n);
    });

    it("数组长度不一致、空批次都被拒绝", async function () {
      const ctx = await setup();
      await expect(
        ctx.manager.connect(ctx.relayer).executeBatchWithSession([ethers.ZeroHash], [], [], [], [])
      ).to.be.revertedWith("Array length mismatch");
      await expect(
        ctx.manager.connect(ctx.relayer).executeBatchWithSession([], [], [], [], [])
      ).to.be.revertedWith("Invalid batch size");
    });
  });

  describe("M-04 sessionId 碰撞", function () {
    it("同一个区块里同一个用户连开两个相同参数的 session：id 不同，都成功", async function () {
      const ctx = await setup();
      const expiry = (await time.latest()) + 86400;
      await network.provider.send("evm_setAutomine", [false]);
      try {
        const tx1 = await ctx.manager.connect(ctx.user).createSession(ctx.sessionKey.address, SINGLE, DAILY, expiry, { gasLimit: 500_000 });
        const tx2 = await ctx.manager.connect(ctx.user).createSession(ctx.sessionKey.address, SINGLE, DAILY, expiry, { gasLimit: 500_000 });
        await network.provider.send("evm_mine", []);
        const r1 = await tx1.wait();
        const r2 = await tx2.wait();
        expect(r1.blockNumber).to.equal(r2.blockNumber);
        expect(r1.status).to.equal(1);
        expect(r2.status).to.equal(1);
      } finally {
        await network.provider.send("evm_setAutomine", [true]);
      }
      expect((await ctx.manager.getUserSessions(ctx.user.address)).length).to.equal(2);
    });
  });
});
