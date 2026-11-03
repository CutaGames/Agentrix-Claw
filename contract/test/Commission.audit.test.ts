import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * L8 D5 回归测试：Commission（V1）。
 * 每个 describe 的名字带审计编号（SECURITY_AUDIT_REPORT.md 第三、八节）。
 */
describe("Commission audit regressions (L8 D5)", function () {
  const ZERO = ethers.ZeroHash;
  const SUPPLY = ethers.parseUnits("1000000", 18);

  async function setup(tokenName: "MockERC20" | "MockNoReturnERC20" | "MockFalseReturnERC20" | "MockFeeOnTransferERC20" = "MockERC20") {
    const [owner, relayer, merchant, referrer, treasury, rebate, user, provider, stranger] =
      await ethers.getSigners();
    let token: any;
    if (tokenName === "MockERC20") {
      token = await (await ethers.getContractFactory("MockERC20")).deploy("Mock USDC", "USDC", SUPPLY);
    } else if (tokenName === "MockNoReturnERC20") {
      token = await (await ethers.getContractFactory("MockNoReturnERC20")).deploy("Tether", "USDT", 18, SUPPLY);
    } else if (tokenName === "MockFalseReturnERC20") {
      token = await (await ethers.getContractFactory("MockFalseReturnERC20")).deploy(SUPPLY);
    } else {
      token = await (await ethers.getContractFactory("MockFeeOnTransferERC20")).deploy(SUPPLY);
    }
    const commission: any = await (await ethers.getContractFactory("Commission")).deploy();
    await commission.configureSettlementToken(await token.getAddress(), treasury.address, rebate.address);
    await commission.setRelayer(relayer.address, true);
    return { owner, relayer, merchant, referrer, treasury, rebate, user, provider, stranger, token, commission };
  }

  function splitConfig(merchant: string, parts: { merchantAmount?: bigint; referrer?: string; referralFee?: bigint; platformFee?: bigint } = {}) {
    return {
      merchantMPCWallet: merchant,
      merchantAmount: parts.merchantAmount ?? 0n,
      referrer: parts.referrer ?? ethers.ZeroAddress,
      referralFee: parts.referralFee ?? 0n,
      executor: ethers.ZeroAddress,
      executionFee: 0n,
      platformFee: parts.platformFee ?? 0n,
      offRampFee: 0n,
      executorHasWallet: false,
      settlementTime: 0,
      isDisputed: false,
      sessionId: ZERO,
      proofHash: ZERO,
      auditor: ethers.ZeroAddress,
      requiresProof: false,
      proofVerified: false,
    };
  }

  const orderId = ethers.keccak256(ethers.toUtf8Bytes("audit-order-1"));

  // ── C-03 ─────────────────────────────────────────────────────

  describe("C-03 SafeERC20 / 非标准稳定币", function () {
    it("USDT 式代币（transfer/transferFrom 不返回值）可以正常分账", async function () {
      const { commission, token, user, merchant, treasury } = await setup("MockNoReturnERC20");
      const amount = ethers.parseUnits("1000", 18);
      await token.transfer(user.address, amount);
      await token.connect(user).approve(await commission.getAddress(), amount);
      await commission.setSplitConfig(orderId, splitConfig(merchant.address, { merchantAmount: ethers.parseUnits("900", 18), platformFee: ethers.parseUnits("100", 18) }));

      await commission.connect(user).walletSplit(orderId, amount);

      expect(await token.balanceOf(merchant.address)).to.equal(ethers.parseUnits("900", 18));
      expect(await token.balanceOf(treasury.address)).to.equal(ethers.parseUnits("100", 18));
      expect(await token.balanceOf(await commission.getAddress())).to.equal(0n);
    });

    it("转账失败但不 revert（返回 false）的代币：付款人没授权时整笔回滚，池子里的钱不动", async function () {
      const { commission, token, user, merchant } = await setup("MockFalseReturnERC20");
      const pool = 5_000_000n;
      await token.transfer(await commission.getAddress(), pool); // 池子里已有别人的钱
      await commission.setSplitConfig(orderId, splitConfig(merchant.address, { merchantAmount: 1000n }));

      // user 没有 approve。直接调用 transferFrom 不检查返回值的话，这里会静悄悄通过，再从池子里付 1000
      await expect(commission.connect(user).walletSplit(orderId, 1000n)).to.be.revertedWith(
        "SafeERC20: ERC20 operation did not succeed"
      );
      expect(await token.balanceOf(await commission.getAddress())).to.equal(pool);
      expect(await token.balanceOf(merchant.address)).to.equal(0n);
    });

    it("relayer 代付款人扣款时，付款人没授权同样整笔回滚", async function () {
      const { commission, token, relayer, user, merchant } = await setup("MockFalseReturnERC20");
      await token.transfer(await commission.getAddress(), 5_000_000n);
      await commission.setSplitConfig(orderId, splitConfig(merchant.address, { merchantAmount: 1000n }));
      await expect(
        commission.connect(relayer).quickPaySplitFrom(orderId, 1000n, user.address)
      ).to.be.revertedWith("SafeERC20: ERC20 operation did not succeed");
    });
  });

  // ── H-02 ─────────────────────────────────────────────────────

  describe("H-02 分账精度和总额", function () {
    it("余数作为最后一笔进 Treasury，合约里不留零头", async function () {
      const { commission, token, user, merchant, referrer, treasury } = await setup();
      await commission.setSplitConfig(
        orderId,
        splitConfig(merchant.address, { merchantAmount: 333n, referrer: referrer.address, referralFee: 333n })
      );
      await token.transfer(user.address, 1000n);
      await token.connect(user).approve(await commission.getAddress(), 1000n);

      await commission.connect(user).walletSplit(orderId, 1000n);

      expect(await token.balanceOf(merchant.address)).to.equal(333n);
      expect(await token.balanceOf(referrer.address)).to.equal(333n);
      expect(await token.balanceOf(treasury.address)).to.equal(334n);
      expect(await token.balanceOf(await commission.getAddress())).to.equal(0n);
    });

    it("配置的各份之和大于本次金额：拒绝，池子里别人的钱不会被分走", async function () {
      const { commission, token, user, merchant } = await setup();
      const pool = 1_000_000n;
      await token.transfer(await commission.getAddress(), pool);
      await commission.setSplitConfig(orderId, splitConfig(merchant.address, { merchantAmount: 1000n }));
      await token.transfer(user.address, 1n);
      await token.connect(user).approve(await commission.getAddress(), 1n);

      await expect(commission.connect(user).walletSplit(orderId, 1n)).to.be.revertedWith("Split exceeds amount");
      expect(await token.balanceOf(await commission.getAddress())).to.equal(pool);
      expect(await token.balanceOf(merchant.address)).to.equal(0n);
    });

    it("预充值路径同一订单只能分账一次", async function () {
      const { commission, token, merchant } = await setup();
      await token.transfer(await commission.getAddress(), 2000n); // 池子里有第二份的钱
      await commission.setSplitConfig(orderId, splitConfig(merchant.address, { merchantAmount: 1000n }));

      await commission.distributeCommission(orderId);
      expect(await token.balanceOf(merchant.address)).to.equal(1000n);

      await expect(commission.distributeCommission(orderId)).to.be.revertedWith("Order already split");
      expect(await token.balanceOf(merchant.address)).to.equal(1000n);
    });

    it("配置里一分钱都没有：拒绝，不会把整个池子分出去", async function () {
      const { commission, token, merchant, treasury } = await setup();
      await token.transfer(await commission.getAddress(), 5000n);
      await commission.setSplitConfig(orderId, splitConfig(merchant.address));

      await expect(commission.distributeCommission(orderId)).to.be.revertedWith("Empty split");
      expect(await token.balanceOf(treasury.address)).to.equal(0n);
      expect(await token.balanceOf(await commission.getAddress())).to.equal(5000n);
    });

    it("同一订单 quickPay 之后不能再用预充值路径分一次", async function () {
      const { commission, token, user, merchant } = await setup();
      await token.transfer(await commission.getAddress(), 5000n);
      await commission.setSplitConfig(orderId, splitConfig(merchant.address, { merchantAmount: 1000n }));
      await token.transfer(user.address, 1000n);
      await token.connect(user).approve(await commission.getAddress(), 1000n);
      await commission.connect(user).walletSplit(orderId, 1000n);

      await expect(commission.distributeCommission(orderId)).to.be.revertedWith("Order already split");
    });
  });

  // ── H-04 ─────────────────────────────────────────────────────

  describe("H-04 Provider / Relayer 权限边界", function () {
    it("Provider 声称转入的金额比实际到账多（扣费型代币）：回滚", async function () {
      const { commission, token, provider, merchant } = await setup("MockFeeOnTransferERC20");
      await commission.setAuthorizedProvider(provider.address, true);
      await commission.setSplitConfig(orderId, splitConfig(merchant.address, { merchantAmount: 500n }));
      await token.transfer(provider.address, 2000n); // 扣 10% 后 provider 实收 1800，足够付 1000
      await token.connect(provider).approve(await commission.getAddress(), 1000n);

      await expect(
        commission.connect(provider).providerFiatToCryptoSplit(orderId, 1000n)
      ).to.be.revertedWith("Transfer amount mismatch");
      expect(await token.balanceOf(merchant.address)).to.equal(0n);
    });

    it("没登记的 Provider 不能调用", async function () {
      const { commission, stranger, merchant } = await setup();
      await commission.setSplitConfig(orderId, splitConfig(merchant.address, { merchantAmount: 1n }));
      await expect(
        commission.connect(stranger).providerFiatToCryptoSplit(orderId, 1n)
      ).to.be.revertedWith("Unauthorized provider");
    });

    it("登记和撤销 Provider / Relayer 都有事件，并落到 AccessControl 角色上", async function () {
      const { commission, provider, stranger } = await setup();
      const PROVIDER = await commission.PROVIDER_ROLE();
      const RELAYER = await commission.RELAYER_ROLE();

      const grantProvider = await commission.setAuthorizedProvider(provider.address, true);
      await expect(grantProvider).to.emit(commission, "ProviderAuthorized").withArgs(provider.address, true);
      await expect(grantProvider).to.emit(commission, "RoleGranted");
      expect(await commission.hasRole(PROVIDER, provider.address)).to.equal(true);
      expect(await commission.authorizedProviders(provider.address)).to.equal(true);

      const grantRelayer = await commission.setRelayer(stranger.address, true);
      await expect(grantRelayer).to.emit(commission, "RelayerUpdated").withArgs(stranger.address, true);
      expect(await commission.hasRole(RELAYER, stranger.address)).to.equal(true);
      expect(await commission.relayers(stranger.address)).to.equal(true);

      const revokeRelayer = await commission.setRelayer(stranger.address, false);
      await expect(revokeRelayer).to.emit(commission, "RelayerUpdated").withArgs(stranger.address, false);
      await expect(revokeRelayer).to.emit(commission, "RoleRevoked");
      expect(await commission.relayers(stranger.address)).to.equal(false);
    });

    it("非 owner 不能登记 Provider / Relayer，也不能直接 grantRole", async function () {
      const { commission, stranger, provider } = await setup();
      const PROVIDER = await commission.PROVIDER_ROLE();
      await expect(commission.connect(stranger).setAuthorizedProvider(provider.address, true)).to.be.reverted;
      await expect(commission.connect(stranger).setRelayer(provider.address, true)).to.be.reverted;
      await expect(commission.connect(stranger).grantRole(PROVIDER, stranger.address)).to.be.reverted;
    });

    it("不能登记零地址", async function () {
      const { commission } = await setup();
      await expect(commission.setRelayer(ethers.ZeroAddress, true)).to.be.revertedWith("Invalid relayer");
      await expect(commission.setAuthorizedProvider(ethers.ZeroAddress, true)).to.be.revertedWith("Invalid provider");
    });

    it("被撤销的 relayer 立刻失去 setSplitConfig 的权限", async function () {
      const { commission, relayer, merchant } = await setup();
      await commission.connect(relayer).setSplitConfig(orderId, splitConfig(merchant.address, { merchantAmount: 1n }));
      await commission.setRelayer(relayer.address, false);
      await expect(
        commission.connect(relayer).setSplitConfig(orderId, splitConfig(merchant.address, { merchantAmount: 2n }))
      ).to.be.revertedWith("Unauthorized");
    });

    it("转移 owner 时管理员角色一起转走：旧 owner 不能再授权，新 owner 可以", async function () {
      const { commission, owner, stranger } = await setup();
      const ADMIN = await commission.DEFAULT_ADMIN_ROLE();
      expect(await commission.hasRole(ADMIN, owner.address)).to.equal(true);

      await commission.transferOwnership(stranger.address);

      expect(await commission.hasRole(ADMIN, owner.address)).to.equal(false);
      expect(await commission.hasRole(ADMIN, stranger.address)).to.equal(true);
      await expect(commission.setRelayer(owner.address, true)).to.be.reverted;
      await expect(commission.connect(stranger).setRelayer(owner.address, true)).to.emit(commission, "RelayerUpdated");
    });
  });

  // ── M-03 ─────────────────────────────────────────────────────

  describe("M-03 暂停覆盖所有转出资金的入口", function () {
    it("暂停后 quickPay / walletSplit / provider / distribute / executeSettlement 全部拒绝", async function () {
      const { commission, relayer, user, provider, merchant } = await setup();
      await commission.setAuthorizedProvider(provider.address, true);
      await commission.setSplitConfig(orderId, splitConfig(merchant.address, { merchantAmount: 1n }));
      await commission.pause();

      await expect(commission.connect(user).quickPaySplit(orderId, 1n)).to.be.revertedWith("Pausable: paused");
      await expect(commission.connect(relayer).quickPaySplitFrom(orderId, 1n, user.address)).to.be.revertedWith("Pausable: paused");
      await expect(commission.connect(user).walletSplit(orderId, 1n)).to.be.revertedWith("Pausable: paused");
      await expect(commission.connect(provider).providerFiatToCryptoSplit(orderId, 1n)).to.be.revertedWith("Pausable: paused");
      await expect(commission.distributeCommission(orderId)).to.be.revertedWith("Pausable: paused");
      await expect(commission.executeSettlement(ZERO)).to.be.revertedWith("Pausable: paused");
    });
  });

  // ── C-03 / H-02 相关：结算单不能重复付款 ─────────────────────

  describe("结算单重复付款", function () {
    it("同一笔待结算余额开出两张结算单：第二张执行失败，不会付两次", async function () {
      const { commission, token, merchant } = await setup();
      const tokenAddr = await token.getAddress();
      await commission.recordCommission(merchant.address, 1, 0, 200n, tokenAddr, 200n, 0, ZERO);
      await token.transfer(await commission.getAddress(), 400n); // 池子里够付两次

      const settlementIdOf = async (txPromise: Promise<any>): Promise<string> => {
        const receipt = await (await txPromise).wait();
        for (const log of receipt.logs) {
          try {
            const parsed = commission.interface.parseLog(log);
            if (parsed && parsed.name === "SettlementCreated") return parsed.args[0];
          } catch {
            // 不是本合约的日志
          }
        }
        throw new Error("SettlementCreated not found");
      };

      const first = await settlementIdOf(commission.createSettlement(merchant.address, 1, tokenAddr));
      await ethers.provider.send("evm_increaseTime", [5]);
      await ethers.provider.send("evm_mine", []);
      const second = await settlementIdOf(commission.createSettlement(merchant.address, 1, tokenAddr));
      expect(second).to.not.equal(first);

      await commission.executeSettlement(first);
      expect(await token.balanceOf(merchant.address)).to.equal(200n);
      await expect(commission.executeSettlement(second)).to.be.revertedWithPanic(0x11);
      expect(await token.balanceOf(merchant.address)).to.equal(200n);
    });
  });
});
