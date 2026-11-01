import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * L8 D5 回归测试：PaymentRouter（H-01 重入、H-05 通道授权和入账）。
 */
describe("PaymentRouter audit regressions (L8 D5)", function () {
  const ONE = ethers.parseEther("1");

  async function setup() {
    const [owner, payer, recipient, channel, attackerOwner, stranger, fiatChannel] = await ethers.getSigners();
    const router: any = await (await ethers.getContractFactory("PaymentRouter")).deploy();
    await router.setPaymentChannel(2, channel.address, true, 1, 0, ethers.MaxUint256); // X402
    await router.setPaymentChannel(1, ethers.ZeroAddress, true, 0, 0, ethers.MaxUint256); // WALLET
    await router.setPaymentChannel(0, fiatChannel.address, true, 0, 0, ethers.MaxUint256); // STRIPE（法币，链下结算）
    return { router, owner, payer, recipient, channel, attackerOwner, stranger, fiatChannel };
  }

  const id = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));

  describe("H-01 withdraw 重入", function () {
    it("收款合约在 receive 里再次 withdraw：重入那一笔被挡掉，外层照常到账，账不会多扣少扣", async function () {
      const { router, payer } = await setup();
      const attacker: any = await (await ethers.getContractFactory("ReentrantWithdrawer")).deploy(await router.getAddress());
      const attackerAddr = await attacker.getAddress();

      // 攻击合约名下有 2 ETH：如果能重入，两次各取 1 ETH 都会成功
      await router.connect(payer).routePayment(id("p1"), attackerAddr, 2n * ONE, 1, ethers.ZeroHash, 2n * ONE, 0, { value: 2n * ONE });
      expect(await router.balances(attackerAddr)).to.equal(2n * ONE);

      await attacker.attack(ONE);

      expect(await attacker.reentered()).to.equal(false);
      const reason: string = await attacker.reentryError();
      // Error(string) = 0x08c379a0 + abi.encode(string)
      const [message] = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + reason.slice(10));
      expect(message).to.equal("ReentrancyGuard: reentrant call");
      expect(await router.balances(attackerAddr)).to.equal(ONE);
      expect(await ethers.provider.getBalance(attackerAddr)).to.equal(ONE);
      expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(ONE);
    });
  });

  describe("H-05 通道完成支付和入账", function () {
    it("通道完成支付但没把钱送进来：拒绝（以前只记账，router 里的账没有 ETH 撑着）", async function () {
      const { router, payer, recipient, channel } = await setup();
      await router.connect(payer).routePayment(id("x1"), recipient.address, ONE, 2, ethers.ZeroHash, ONE, 0);

      await expect(router.connect(channel).completePayment(id("x1"))).to.be.revertedWith("Value mismatch");
      await expect(router.connect(channel).completePayment(id("x1"), { value: ONE - 1n })).to.be.revertedWith("Value mismatch");
      await expect(router.connect(channel).completePayment(id("x1"), { value: ONE + 1n })).to.be.revertedWith("Value mismatch");
      expect(await router.balances(recipient.address)).to.equal(0n);
    });

    it("没有钱撑着的记账不能取走别人的钱：router 的 ETH 总额始终等于所有 balances 之和", async function () {
      const { router, payer, recipient, channel, stranger } = await setup();
      // 别人（stranger）通过 WALLET 付了 1 ETH，放在 router 里
      await router.connect(payer).routePayment(id("w1"), stranger.address, ONE, 1, ethers.ZeroHash, ONE, 0, { value: ONE });
      // 一笔 X402 记录，通道没有送钱
      await router.connect(payer).routePayment(id("x2"), recipient.address, ONE, 2, ethers.ZeroHash, ONE, 0);
      await expect(router.connect(channel).completePayment(id("x2"))).to.be.reverted;

      // recipient 想把 stranger 的钱取走
      await expect(router.connect(recipient).withdraw(ONE)).to.be.revertedWith("Insufficient balance");
      expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(ONE);

      // 通道把钱送进来之后，才记账
      await router.connect(channel).completePayment(id("x2"), { value: ONE });
      expect(await router.balances(recipient.address)).to.equal(ONE);
      expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(2n * ONE);
      await router.connect(recipient).withdraw(ONE);
      expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(ONE);
      expect(await router.balances(stranger.address)).to.equal(ONE);
    });

    it("不存在的支付不能被完成", async function () {
      const { router, channel } = await setup();
      await expect(router.connect(channel).completePayment(id("nope"), { value: 0 })).to.be.revertedWith("Payment not found");
    });

    it("非通道地址不能完成支付，即使带了钱", async function () {
      const { router, payer, recipient, stranger } = await setup();
      await router.connect(payer).routePayment(id("x3"), recipient.address, ONE, 2, ethers.ZeroHash, ONE, 0);
      await expect(router.connect(stranger).completePayment(id("x3"), { value: ONE })).to.be.revertedWith("Unauthorized");
    });

    it("同一个 paymentId 不能重复登记：已完成的支付不会被覆盖成「未完成」再完成一次", async function () {
      const { router, payer, recipient, channel } = await setup();
      await router.connect(payer).routePayment(id("dup"), recipient.address, ONE, 2, ethers.ZeroHash, ONE, 0);
      await router.connect(channel).completePayment(id("dup"), { value: ONE });
      expect(await router.balances(recipient.address)).to.equal(ONE);

      await expect(
        router.connect(payer).routePayment(id("dup"), recipient.address, ONE, 2, ethers.ZeroHash, ONE, 0)
      ).to.be.revertedWith("Payment already exists");
      await expect(
        router.connect(payer).routePaymentLegacy(id("dup"), recipient.address, ONE, 2)
      ).to.be.revertedWith("Payment already exists");
      // 记录没有被改回未完成
      expect((await router.getPayment(id("dup"))).completed).to.equal(true);
      await expect(router.connect(channel).completePayment(id("dup"), { value: ONE })).to.be.revertedWith("Payment already completed");
    });

    it("M3 法币通道（STRIPE）能完成支付：不带 ETH，只标记完成，不往 balances 记没有钱撑着的账", async function () {
      const { router, payer, recipient, fiatChannel, stranger } = await setup();
      // 别人在 router 里有 1 ETH，收款人不能借法币完成取走它
      await router.connect(payer).routePayment(id("w9"), stranger.address, ONE, 1, ethers.ZeroHash, ONE, 0, { value: ONE });
      await router.connect(payer).routePayment(id("fiat1"), recipient.address, ONE, 0, ethers.ZeroHash, ONE, 0);

      await expect(router.connect(fiatChannel).completePayment(id("fiat1")))
        .to.emit(router, "PaymentCompleted").withArgs(id("fiat1"), recipient.address, ONE);
      expect((await router.getPayment(id("fiat1"))).completed).to.equal(true);
      expect(await router.balances(recipient.address)).to.equal(0n);
      await expect(router.connect(recipient).withdraw(1n)).to.be.revertedWith("Insufficient balance");
      expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(ONE);
      // 只能完成一次
      await expect(router.connect(fiatChannel).completePayment(id("fiat1"))).to.be.revertedWith("Payment already completed");
    });

    it("M3 法币通道带了 ETH 也拒绝；非法币通道的完成仍然必须带够金额", async function () {
      const { router, payer, recipient, fiatChannel, channel } = await setup();
      await router.connect(payer).routePayment(id("fiat2"), recipient.address, ONE, 0, ethers.ZeroHash, ONE, 0);
      await expect(router.connect(fiatChannel).completePayment(id("fiat2"), { value: 1n })).to.be.revertedWith("Value mismatch");
      // 别的通道地址不能完成法币支付
      await expect(router.connect(channel).completePayment(id("fiat2"))).to.be.revertedWith("Unauthorized");
      // X402 仍然要求带值
      await router.connect(payer).routePayment(id("x9"), recipient.address, ONE, 2, ethers.ZeroHash, ONE, 0);
      await expect(router.connect(channel).completePayment(id("x9"))).to.be.revertedWith("Value mismatch");
    });

    it("暂停后通道不能完成支付", async function () {
      const { router, payer, recipient, channel } = await setup();
      await router.connect(payer).routePayment(id("x4"), recipient.address, ONE, 2, ethers.ZeroHash, ONE, 0);
      await router.pause();
      await expect(router.connect(channel).completePayment(id("x4"), { value: ONE })).to.be.revertedWith("Pausable: paused");
    });
  });
});
