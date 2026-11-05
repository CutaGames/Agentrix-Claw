import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * L8 D5：X402Adapter 测试（这个合约之前没有任何测试文件）。
 * 覆盖审计 C-02（EIP-712 签名：sessionId / amount / recipient / expiry / nonce，防重放）
 * 和 H-05（通道完成支付时把钱交给 PaymentRouter，核对 router 记录）。
 */
describe("X402Adapter (L8 D5)", function () {
  const AMOUNT = ethers.parseEther("1");
  const TYPES = {
    X402Payment: [
      { name: "sessionId", type: "bytes32" },
      { name: "paymentId", type: "bytes32" },
      { name: "payer", type: "address" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "expiry", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
  };
  const paymentIdOf = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));

  async function setup(opts: { fundPayer?: boolean } = {}) {
    const [owner, relayer, payer, recipient, stranger, other] = await ethers.getSigners();
    const router: any = await (await ethers.getContractFactory("PaymentRouter")).deploy();
    const adapter: any = await (await ethers.getContractFactory("X402Adapter")).deploy(await router.getAddress());
    await router.setPaymentChannel(2, await adapter.getAddress(), true, 1, 0, ethers.MaxUint256);
    await adapter.setRelayer(relayer.address);
    // M1：付款人自己预存；钱按付款人记账，只有他签名的会话才能动用
    if (opts.fundPayer !== false) {
      await adapter.connect(payer).deposit({ value: 10n * AMOUNT });
    }
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const domain = {
      name: "AgentrixX402Adapter",
      version: "1",
      chainId,
      verifyingContract: await adapter.getAddress(),
    };
    return { owner, relayer, payer, recipient, stranger, other, router, adapter, domain };
  }

  /** router 登记 + 付款人建会话；返回会话和待签的值 */
  async function openSession(
    ctx: Awaited<ReturnType<typeof setup>>,
    opts: { label?: string; amount?: bigint; sessionAmount?: bigint; ttl?: number } = {}
  ) {
    const { router, adapter, payer, recipient } = ctx;
    const amount = opts.amount ?? AMOUNT;
    const paymentId = paymentIdOf(opts.label ?? "x402-1");
    await router.connect(payer).routePayment(paymentId, recipient.address, amount, 2, ethers.ZeroHash, amount, 0);
    const expiry = (await time.latest()) + (opts.ttl ?? 3600);
    const receipt = await (
      await adapter.connect(payer).createSession(paymentId, recipient.address, opts.sessionAmount ?? amount, "0x", expiry)
    ).wait();
    let sessionId = "";
    for (const log of receipt.logs) {
      try {
        const parsed = adapter.interface.parseLog(log);
        if (parsed && parsed.name === "X402SessionCreated") sessionId = parsed.args[0];
      } catch {
        // 不是 adapter 的日志
      }
    }
    expect(sessionId).to.not.equal("");
    const session = await adapter.getSession(sessionId);
    const value = {
      sessionId,
      paymentId,
      payer: payer.address,
      recipient: recipient.address,
      amount: session.amount,
      expiry: session.expiresAt,
      nonce: session.nonce,
    };
    return { sessionId, paymentId, value };
  }

  describe("C-02 EIP-712 签名", function () {
    it("正确签名：relayer 执行成功，钱经 router 记到收款人名下，收款人可以取走", async function () {
      const ctx = await setup();
      const { adapter, router, relayer, payer, recipient, domain } = ctx;
      const { sessionId, paymentId, value } = await openSession(ctx);
      const signature = await payer.signTypedData(domain, TYPES, value);
      expect(await adapter.paymentDigest(sessionId)).to.equal(ethers.TypedDataEncoder.hash(domain, TYPES, value));

      await expect(adapter.connect(relayer).executePayment(sessionId, signature))
        .to.emit(adapter, "X402PaymentExecuted");

      expect((await adapter.getSession(sessionId)).executed).to.equal(true);
      expect((await router.getPayment(paymentId)).completed).to.equal(true);
      expect(await router.balances(recipient.address)).to.equal(AMOUNT);
      expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(AMOUNT);
      expect(await ethers.provider.getBalance(await adapter.getAddress())).to.equal(9n * AMOUNT);
      expect(await adapter.deposits(payer.address)).to.equal(9n * AMOUNT);

      await router.connect(recipient).withdraw(AMOUNT);
      expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(0n);
    });

    it("同一个签名不能重放", async function () {
      const ctx = await setup();
      const { adapter, relayer, payer, domain } = ctx;
      const { sessionId, value } = await openSession(ctx);
      const signature = await payer.signTypedData(domain, TYPES, value);
      await adapter.connect(relayer).executePayment(sessionId, signature);
      await expect(adapter.connect(relayer).executePayment(sessionId, signature)).to.be.revertedWith(
        "Payment already executed"
      );
    });

    it("别人签的名、乱码签名都不行", async function () {
      const ctx = await setup();
      const { adapter, relayer, stranger, domain } = ctx;
      const { sessionId, value } = await openSession(ctx);
      const forged = await stranger.signTypedData(domain, TYPES, value);
      await expect(adapter.connect(relayer).executePayment(sessionId, forged)).to.be.revertedWith("Invalid signature");
      await expect(adapter.connect(relayer).executePayment(sessionId, "0x1234")).to.be.reverted;
    });

    it("签名里的每个字段都被绑定：改任何一个，付款人的签名都对不上", async function () {
      const ctx = await setup();
      const { adapter, relayer, payer, other, domain } = ctx;
      const { sessionId, value } = await openSession(ctx);
      const mutated: Record<string, any> = {
        sessionId: ethers.keccak256("0x01"),
        paymentId: ethers.keccak256("0x02"),
        payer: other.address,
        recipient: other.address,
        amount: value.amount + 1n,
        expiry: BigInt(value.expiry) + 1n,
        nonce: BigInt(value.nonce) + 1n,
      };
      for (const field of Object.keys(mutated)) {
        const signature = await payer.signTypedData(domain, TYPES, { ...value, [field]: mutated[field] });
        await expect(
          adapter.connect(relayer).executePayment(sessionId, signature),
          `field ${field}`
        ).to.be.revertedWith("Invalid signature");
      }
    });

    it("换链、换合约、换名字的域签的名都不行", async function () {
      const ctx = await setup();
      const { adapter, relayer, payer, other, domain } = ctx;
      const { sessionId, value } = await openSession(ctx);
      const variants = [
        { ...domain, chainId: 56n },
        { ...domain, verifyingContract: other.address },
        { ...domain, name: "SomethingElse" },
        { ...domain, version: "2" },
      ];
      for (const d of variants) {
        const signature = await payer.signTypedData(d, TYPES, value);
        await expect(adapter.connect(relayer).executePayment(sessionId, signature)).to.be.revertedWith("Invalid signature");
      }
    });

    it("旧的 EIP-191 签名方式（sessionId/paymentId/recipient/amount/chainid 拼接）不再被接受", async function () {
      const ctx = await setup();
      const { adapter, relayer, payer, recipient } = ctx;
      const { sessionId, paymentId } = await openSession(ctx);
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const legacyHash = ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32", "address", "uint256", "uint256"],
        [sessionId, paymentId, recipient.address, AMOUNT, chainId]
      );
      const legacySignature = await payer.signMessage(ethers.getBytes(legacyHash));
      await expect(adapter.connect(relayer).executePayment(sessionId, legacySignature)).to.be.revertedWith(
        "Invalid signature"
      );
    });

    it("s 值可延展的签名变体被拒绝", async function () {
      const ctx = await setup();
      const { adapter, relayer, payer, domain } = ctx;
      const { sessionId, value } = await openSession(ctx);
      const signature = ethers.Signature.from(await payer.signTypedData(domain, TYPES, value));
      const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
      const highS = N - BigInt(signature.s);
      const flippedV = signature.v === 27 ? 28 : 27;
      const malleable = ethers.concat([signature.r, ethers.toBeHex(highS, 32), ethers.toBeHex(flippedV, 1)]);
      await expect(adapter.connect(relayer).executePayment(sessionId, malleable)).to.be.revertedWith(
        "ECDSA: invalid signature 's' value"
      );
    });

    it("会话过期后不能执行", async function () {
      const ctx = await setup();
      const { adapter, relayer, payer, domain } = ctx;
      const { sessionId, value } = await openSession(ctx, { ttl: 60 });
      const signature = await payer.signTypedData(domain, TYPES, value);
      await time.increase(120);
      await expect(adapter.connect(relayer).executePayment(sessionId, signature)).to.be.revertedWith("Session expired");
    });

    it("付款人作废 nonce 之后，已经发出去的签名失效；别人不能替他作废", async function () {
      const ctx = await setup();
      const { adapter, relayer, payer, stranger, domain } = ctx;
      const { sessionId, value } = await openSession(ctx);
      const signature = await payer.signTypedData(domain, TYPES, value);

      await expect(adapter.connect(stranger).cancelNonce(value.nonce)).to.be.revertedWith("Unknown nonce");
      await expect(adapter.connect(payer).cancelNonce(value.nonce))
        .to.emit(adapter, "NonceCancelled").withArgs(payer.address, value.nonce);
      await expect(adapter.connect(relayer).executePayment(sessionId, signature)).to.be.revertedWith("Nonce already used");
      await expect(adapter.connect(payer).cancelNonce(value.nonce)).to.be.revertedWith("Nonce already used");
    });

    it("同一付款人的每个会话有各自的 nonce", async function () {
      const ctx = await setup();
      const first = await openSession(ctx, { label: "n-1" });
      const second = await openSession(ctx, { label: "n-2" });
      expect(second.value.nonce).to.equal(BigInt(first.value.nonce) + 1n);
    });
  });

  describe("执行权限", function () {
    it("只有 relayer 能执行（付款人自己、陌生人、已被撤换的旧 relayer 都不行）", async function () {
      const ctx = await setup();
      const { adapter, relayer, payer, stranger, other, domain } = ctx;
      const { sessionId, value } = await openSession(ctx);
      const signature = await payer.signTypedData(domain, TYPES, value);

      await expect(adapter.connect(payer).executePayment(sessionId, signature)).to.be.revertedWith("Only relayer can execute");
      await expect(adapter.connect(stranger).executePayment(sessionId, signature)).to.be.revertedWith("Only relayer can execute");

      await expect(adapter.setRelayer(other.address))
        .to.emit(adapter, "RelayerChanged").withArgs(relayer.address, other.address);
      await expect(adapter.connect(relayer).executePayment(sessionId, signature)).to.be.revertedWith("Only relayer can execute");
      await expect(adapter.connect(other).executePayment(sessionId, signature)).to.emit(adapter, "X402PaymentExecuted");
    });

    it("只有 owner 能设置 relayer，零地址不行", async function () {
      const { adapter, stranger } = await setup();
      await expect(adapter.connect(stranger).setRelayer(stranger.address)).to.be.reverted;
      await expect(adapter.setRelayer(ethers.ZeroAddress)).to.be.revertedWith("Invalid relayer");
    });

    it("L5 owner 也不能绕过 setRelayer 直接 grantRole / revokeRole；relayer 不能自己 renounceRole", async function () {
      const { adapter, relayer, stranger } = await setup();
      const RELAYER = await adapter.RELAYER_ROLE();
      await expect(adapter.grantRole(RELAYER, stranger.address)).to.be.revertedWith("Use setRelayer");
      await expect(adapter.revokeRole(RELAYER, relayer.address)).to.be.revertedWith("Use setRelayer");
      await expect(adapter.connect(relayer).renounceRole(RELAYER, relayer.address)).to.be.revertedWith("Use setRelayer");
      expect(await adapter.relayer()).to.equal(relayer.address);
      expect(await adapter.hasRole(RELAYER, relayer.address)).to.equal(true);
      expect(await adapter.hasRole(RELAYER, stranger.address)).to.equal(false);
    });

    it("暂停后不能执行", async function () {
      const ctx = await setup();
      const { adapter, relayer, payer, domain } = ctx;
      const { sessionId, value } = await openSession(ctx);
      const signature = await payer.signTypedData(domain, TYPES, value);
      await adapter.pause();
      await expect(adapter.connect(relayer).executePayment(sessionId, signature)).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("H-05 与 PaymentRouter 的对账", function () {
    it("会话金额和 router 里登记的金额不一致：拒绝（不会会话付一份、router 记另一份）", async function () {
      const ctx = await setup();
      const { adapter, relayer, payer, domain } = ctx;
      const { sessionId, value } = await openSession(ctx, { amount: AMOUNT, sessionAmount: 2n * AMOUNT });
      const signature = await payer.signTypedData(domain, TYPES, value);
      await expect(adapter.connect(relayer).executePayment(sessionId, signature)).to.be.revertedWith("Router record mismatch");
    });

    it("router 里登记的是别的收款人：拒绝", async function () {
      const ctx = await setup();
      const { adapter, router, relayer, payer, other, domain } = ctx;
      const paymentId = paymentIdOf("mismatch-recipient");
      await router.connect(payer).routePayment(paymentId, other.address, AMOUNT, 2, ethers.ZeroHash, AMOUNT, 0);
      const expiry = (await time.latest()) + 3600;
      const receipt = await (await adapter.connect(payer).createSession(paymentId, ctx.recipient.address, AMOUNT, "0x", expiry)).wait();
      const sessionId = adapter.interface.parseLog(receipt.logs[0]).args[0];
      const session = await adapter.getSession(sessionId);
      const signature = await payer.signTypedData(domain, TYPES, {
        sessionId,
        paymentId,
        payer: payer.address,
        recipient: ctx.recipient.address,
        amount: AMOUNT,
        expiry: session.expiresAt,
        nonce: session.nonce,
      });
      await expect(adapter.connect(relayer).executePayment(sessionId, signature)).to.be.revertedWith("Router record mismatch");
    });

    it("付款人的存款不够：拒绝", async function () {
      const ctx = await setup();
      const { adapter, relayer, payer, domain } = ctx;
      await adapter.connect(payer).withdrawDeposit(10n * AMOUNT);
      const { sessionId, value } = await openSession(ctx);
      const signature = await payer.signTypedData(domain, TYPES, value);
      await expect(adapter.connect(relayer).executePayment(sessionId, signature)).to.be.revertedWith("Insufficient deposit");
    });
  });

  describe("M1 按付款人记账：不能动用别人的存款", function () {
    it("付款人自己没有存款，即使合约里有别人存的钱、有 owner 转进来的钱，签了名也付不出去", async function () {
      const ctx = await setup({ fundPayer: false });
      const { adapter, owner, relayer, payer, other, domain } = ctx;
      await adapter.connect(other).deposit({ value: 10n * AMOUNT }); // 别人的存款
      await owner.sendTransaction({ to: await adapter.getAddress(), value: 10n * AMOUNT }); // 没记到任何人名下的余额
      const { sessionId, value } = await openSession(ctx);
      const signature = await payer.signTypedData(domain, TYPES, value);
      await expect(adapter.connect(relayer).executePayment(sessionId, signature)).to.be.revertedWith("Insufficient deposit");
      expect(await adapter.deposits(other.address)).to.equal(10n * AMOUNT);
      expect(await ethers.provider.getBalance(await adapter.getAddress())).to.equal(20n * AMOUNT);
    });

    it("执行只扣付款人自己的存款，别人的存款不动", async function () {
      const ctx = await setup();
      const { adapter, relayer, payer, other, domain } = ctx;
      await adapter.connect(other).deposit({ value: 3n * AMOUNT });
      const { sessionId, value } = await openSession(ctx);
      const signature = await payer.signTypedData(domain, TYPES, value);
      await adapter.connect(relayer).executePayment(sessionId, signature);
      expect(await adapter.deposits(payer.address)).to.equal(9n * AMOUNT);
      expect(await adapter.deposits(other.address)).to.equal(3n * AMOUNT);
    });

    it("存款：零金额不行；付款人能取回自己的、不能多取，也取不了别人的", async function () {
      const { adapter, payer, other } = await setup();
      await expect(adapter.connect(payer).deposit({ value: 0 })).to.be.revertedWith("Amount must be greater than 0");
      await expect(adapter.connect(other).withdrawDeposit(1n)).to.be.revertedWith("Insufficient deposit");
      await expect(adapter.connect(payer).withdrawDeposit(10n * AMOUNT + 1n)).to.be.revertedWith("Insufficient deposit");
      await expect(adapter.connect(payer).withdrawDeposit(4n * AMOUNT))
        .to.emit(adapter, "DepositWithdrawn").withArgs(payer.address, 4n * AMOUNT);
      expect(await adapter.deposits(payer.address)).to.equal(6n * AMOUNT);
    });
  });

  describe("createSession 校验", function () {
    it("收款人不能是零地址，金额不能是 0，过期时间必须在未来", async function () {
      const { adapter, payer, recipient } = await setup();
      const future = (await time.latest()) + 3600;
      const pid = paymentIdOf("cs");
      await expect(adapter.connect(payer).createSession(pid, ethers.ZeroAddress, 1n, "0x", future)).to.be.revertedWith("Invalid recipient");
      await expect(adapter.connect(payer).createSession(pid, recipient.address, 0n, "0x", future)).to.be.revertedWith("Amount must be greater than 0");
      await expect(adapter.connect(payer).createSession(pid, recipient.address, 1n, "0x", (await time.latest()) - 1)).to.be.revertedWith("Invalid expiry");
    });

    it("构造函数拒绝零地址的 router", async function () {
      const factory = await ethers.getContractFactory("X402Adapter");
      await expect(factory.deploy(ethers.ZeroAddress)).to.be.revertedWith("Invalid router");
    });
  });
});
