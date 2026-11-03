import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * L8 D5：CommissionV2 测试（这个合约之前没有测试文件）。
 * 审计 C-03 / H-02 / H-05 在 V2 上的对应项：SafeERC20、分账不留零头、按代币精度算最低费用。
 * 评审后修复（H1 / H2 / M2）：付款人把全额付进合约、费率不由建方案的人定、同一会话只能执行一次。
 */
describe("CommissionV2 (L8 D5)", function () {
  const SUPPLY = ethers.parseUnits("1000000", 18);

  async function deploy(decimals: number) {
    const [owner, relayer, treasury, alice, bob, carol, dave] = await ethers.getSigners();
    const token: any = await (await ethers.getContractFactory("MockDecimalsERC20")).deploy("T", "T", decimals, SUPPLY);
    const v2: any = await (await ethers.getContractFactory("CommissionV2")).deploy(await token.getAddress(), treasury.address);
    await v2.setRelayer(relayer.address, true);
    // relayer 是付款人：持有代币，并且批准过合约
    await token.mint(relayer.address, ethers.parseUnits("1000000", decimals));
    await token.connect(relayer).approve(await v2.getAddress(), ethers.MaxUint256);
    return { owner, relayer, treasury, alice, bob, carol, dave, token, v2 };
  }

  async function createPlan(v2: any, creator: any, recipients: string[], shares: number[]) {
    const roles = recipients.map((_, i) => `r${i}`);
    const receipt = await (await v2.connect(creator).createSplitPlan("p", recipients, shares, roles)).wait();
    return v2.interface.parseLog(receipt.logs[0]).args[0] as string;
  }

  const sid = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));

  describe("H-05 最低费用按代币精度算", function () {
    it("6 位代币：最低费用 0.1 个代币 = 100000", async function () {
      const { v2 } = await deploy(6);
      expect(await v2.tokenDecimals()).to.equal(6n);
      expect((await v2.defaultFeeConfig()).minSplitFee).to.equal(100_000n);
    });

    it("18 位代币：最低费用 0.1 个代币 = 1e17（以前写死 100000，几乎等于没有）", async function () {
      const { v2 } = await deploy(18);
      expect((await v2.defaultFeeConfig()).minSplitFee).to.equal(10n ** 17n);
    });

    it("精度离谱的代币不能部署；零地址不能部署", async function () {
      const [, , treasury] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("CommissionV2");
      const weird: any = await (await ethers.getContractFactory("MockDecimalsERC20")).deploy("W", "W", 37, 1n);
      await expect(factory.deploy(await weird.getAddress(), treasury.address)).to.be.revertedWith("Unsupported decimals");
      await expect(factory.deploy(ethers.ZeroAddress, treasury.address)).to.be.revertedWith("Invalid token");
    });
  });

  describe("H-02 分账精度", function () {
    it("三方 3333/3333/3334 bps 分 1000：零头给第一位，分配总额正好等于可分金额", async function () {
      const { v2, relayer, alice, bob, carol } = await deploy(6);
      const planId = await createPlan(v2, alice, [alice.address, bob.address, carol.address], [3333, 3333, 3334]);

      // 纯链上支付不收平台费
      await v2.connect(relayer).executeSplit(planId, ethers.ZeroHash, 1000n, 0);
      const pending = [
        await v2.getPendingBalance(alice.address),
        await v2.getPendingBalance(bob.address),
        await v2.getPendingBalance(carol.address),
      ];
      expect(pending.reduce((a: bigint, b: bigint) => a + b, 0n)).to.equal(1000n);
      expect(pending[0]).to.equal(334n); // 333 + 1 的零头
    });

    it("分成比例之和不是 100% 的方案不能创建", async function () {
      const { v2, alice, bob } = await deploy(6);
      await expect(
        v2.connect(alice).createSplitPlan("bad", [alice.address, bob.address], [5000, 4000], ["a", "b"])
      ).to.be.revertedWith("Shares must equal 100%");
    });
  });

  describe("权限", function () {
    it("只有 relayer 能执行分账", async function () {
      const { v2, alice } = await deploy(6);
      const planId = await createPlan(v2, alice, [alice.address], [10000]);
      await expect(v2.connect(alice).executeSplit(planId, ethers.ZeroHash, 1000n, 0)).to.be.revertedWith("Not relayer");
    });
  });

  describe("H1 付款人付全额，合约里有钱撑着", function () {
    it("执行后付款人少了全额、Treasury 收到平台费、合约余额正好等于所有未领取份额之和", async function () {
      const { v2, token, relayer, treasury, alice, bob } = await deploy(6);
      const planId = await createPlan(v2, alice, [alice.address, bob.address], [7000, 3000]);
      const amount = 1_000_000n; // 1 个代币
      const payerBefore = await token.balanceOf(relayer.address);

      // ONRAMP：0.3% = 3000，低于最低费 100000，取最低费；再加 onramp 0.1% = 1000
      await v2.connect(relayer).executeSplit(planId, sid("s1"), amount, 1);
      const fee = 101_000n;

      expect(payerBefore - (await token.balanceOf(relayer.address))).to.equal(amount);
      expect(await token.balanceOf(treasury.address)).to.equal(fee);
      const contractBalance = await token.balanceOf(await v2.getAddress());
      expect(contractBalance).to.equal(amount - fee);
      const pendingSum = (await v2.getPendingBalance(alice.address)) + (await v2.getPendingBalance(bob.address));
      expect(contractBalance).to.equal(pendingSum);

      // 收款人领取，用的是付款人付进来的钱；全部领完合约里一分不剩
      await v2.connect(alice).claimAll();
      await v2.connect(bob).claimAll();
      expect(await token.balanceOf(alice.address)).to.equal(((amount - fee) * 7000n) / 10000n);
      expect(await token.balanceOf(bob.address)).to.equal(amount - fee - ((amount - fee) * 7000n) / 10000n);
      expect(await token.balanceOf(await v2.getAddress())).to.equal(0n);
    });

    it("纯链上支付不收平台费：全额都进收款人的待领取余额", async function () {
      const { v2, token, relayer, treasury, alice } = await deploy(6);
      const planId = await createPlan(v2, alice, [alice.address], [10000]);
      await v2.connect(relayer).executeSplit(planId, sid("direct"), 5000n, 0);
      expect(await token.balanceOf(treasury.address)).to.equal(0n);
      expect(await token.balanceOf(await v2.getAddress())).to.equal(5000n);
      expect(await v2.getPendingBalance(alice.address)).to.equal(5000n);
    });

    it("付款人没有批准、或余额不够：回滚，什么都没记", async function () {
      const { v2, token, relayer, owner, alice } = await deploy(6);
      const planId = await createPlan(v2, alice, [alice.address], [10000]);

      await token.connect(relayer).approve(await v2.getAddress(), 999n);
      await expect(v2.connect(relayer).executeSplit(planId, sid("a"), 1000n, 0)).to.be.reverted;

      // owner 也是 relayer 身份时同样要付钱：owner 没批准
      await expect(v2.connect(owner).executeSplit(planId, sid("b"), 1000n, 0)).to.be.reverted;

      const poor = (await ethers.getSigners())[8];
      await v2.setRelayer(poor.address, true);
      await token.connect(poor).approve(await v2.getAddress(), ethers.MaxUint256);
      await expect(v2.connect(poor).executeSplit(planId, sid("c"), 1000n, 0)).to.be.reverted;

      expect(await v2.getPendingBalance(alice.address)).to.equal(0n);
      expect(await token.balanceOf(await v2.getAddress())).to.equal(0n);
    });

    it("合约里别人的钱（误转或别的执行）不会被收款人领走：全部领完后无关余额原封不动", async function () {
      const { v2, token, relayer, owner, alice, bob } = await deploy(6);
      await token.connect(owner).transfer(await v2.getAddress(), 5000n); // 与分账无关的余额
      const planId = await createPlan(v2, alice, [alice.address, bob.address], [5000, 5000]);
      await v2.connect(relayer).executeSplit(planId, sid("s"), 1000n, 0);
      await v2.connect(alice).claimAll();
      await v2.connect(bob).claimAll();
      expect(await token.balanceOf(await v2.getAddress())).to.equal(5000n);
    });

    it("返还不足额的代币（转账扣费型）被拒绝", async function () {
      const [owner, relayer, treasury, alice] = await ethers.getSigners();
      const fee: any = await (await ethers.getContractFactory("MockFeeOnTransferERC20")).deploy(SUPPLY);
      const v2: any = await (await ethers.getContractFactory("CommissionV2")).deploy(await fee.getAddress(), treasury.address);
      await v2.setRelayer(relayer.address, true);
      await fee.connect(owner).transfer(relayer.address, ethers.parseEther("1000"));
      await fee.connect(relayer).approve(await v2.getAddress(), ethers.MaxUint256);
      const planId = await createPlan(v2, alice, [alice.address], [10000]);
      await expect(v2.connect(relayer).executeSplit(planId, sid("f"), ethers.parseEther("10"), 0)).to.be.revertedWith(
        "Fee-on-transfer token"
      );
    });
  });

  describe("H2 费率由 owner 定，建方案的人影响不了", function () {
    it("createSplitPlan 不再接收费率参数；方案里读到的就是 owner 的默认费率", async function () {
      const { v2, alice } = await deploy(6);
      expect(v2.interface.getFunction("createSplitPlan")!.inputs.length).to.equal(4);
      const planId = await createPlan(v2, alice, [alice.address], [10000]);
      const plan = await v2.getSplitPlan(planId);
      expect(plan.feeConfig.splitFeeBps).to.equal(30n);
      expect(plan.feeConfig.minSplitFee).to.equal(100_000n);
    });

    it("任何方案执行时都收默认费率（旧代码里 0 费率的方案平台一分钱收不到）", async function () {
      const { v2, token, relayer, treasury, alice } = await deploy(6);
      const planId = await createPlan(v2, alice, [alice.address], [10000]);
      await v2.connect(relayer).executeSplit(planId, sid("fee"), 100_000_000n, 3); // MIXED：0.3% + 0.1% + 0.1% = 0.5%
      expect(await token.balanceOf(treasury.address)).to.equal(500_000n);
    });

    it("小额付款（本金小于最低费）不下溢：平台费封顶为本金，可分金额为 0", async function () {
      const { v2, token, relayer, treasury, alice } = await deploy(6);
      const planId = await createPlan(v2, alice, [alice.address], [10000]);
      await v2.connect(relayer).executeSplit(planId, sid("tiny"), 50_000n, 1);
      expect(await token.balanceOf(treasury.address)).to.equal(50_000n);
      expect(await token.balanceOf(await v2.getAddress())).to.equal(0n);
      expect(await v2.getPendingBalance(alice.address)).to.equal(0n);
    });

    it("只有 owner 能改默认费率；最低费有上限（1 个代币），费率仍有上限", async function () {
      const { v2, token, relayer, treasury, alice } = await deploy(6);
      await expect(v2.connect(alice).updateDefaultFeeConfig(0, 0, 0, 0)).to.be.reverted;
      await expect(v2.updateDefaultFeeConfig(10, 10, 30, 1_000_001n)).to.be.revertedWith("Min fee too high");
      await expect(v2.updateDefaultFeeConfig(10, 10, 101, 0)).to.be.revertedWith("Split fee too high");
      await v2.updateDefaultFeeConfig(0, 0, 100, 0); // 1%，无最低费
      const planId = await createPlan(v2, alice, [alice.address], [10000]);
      await v2.connect(relayer).executeSplit(planId, sid("cfg"), 10_000_000n, 1);
      expect(await token.balanceOf(treasury.address)).to.equal(100_000n);
    });
  });

  describe("M2 同一会话只能执行一次", function () {
    it("同一个 (planId, sessionId) 再执行一次回滚：不会重复扣款、重复记账", async function () {
      const { v2, token, relayer, alice } = await deploy(6);
      const planId = await createPlan(v2, alice, [alice.address], [10000]);
      await v2.connect(relayer).executeSplit(planId, sid("once"), 1000n, 0);
      await expect(v2.connect(relayer).executeSplit(planId, sid("once"), 1000n, 0)).to.be.revertedWith("Already executed");
      expect(await v2.getPendingBalance(alice.address)).to.equal(1000n);
      expect(await token.balanceOf(await v2.getAddress())).to.equal(1000n);
      // 过几个区块再重试也一样
      await ethers.provider.send("evm_mine", []);
      await expect(v2.connect(relayer).executeSplit(planId, sid("once"), 1000n, 0)).to.be.revertedWith("Already executed");
      // 另一个会话、另一个方案各自可以执行
      await v2.connect(relayer).executeSplit(planId, sid("twice"), 1000n, 0);
      expect(await v2.getPendingBalance(alice.address)).to.equal(2000n);
    });

    it("领取只能领一次", async function () {
      const { v2, relayer, alice } = await deploy(6);
      const planId = await createPlan(v2, alice, [alice.address], [10000]);
      await v2.connect(relayer).executeSplit(planId, sid("claim"), 1000n, 0);
      await v2.connect(alice).claimAll();
      await expect(v2.connect(alice).claimAll()).to.be.revertedWith("Nothing to claim");
    });
  });
});
