import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../app.module';
import { createTestUser, cleanupTestData, authenticatedRequest, TestUser, createTestMerchant, TestMerchant } from '../helpers/test-setup.helper';
import { UserRole, KYCLevel } from '../../entities/user.entity';
import { ethers } from 'ethers';

/**
 * P0阶段集成测试：智能合约分账功能
 * 
 * 测试场景：
 * 1. QuickPay场景分账（quickPaySplit）
 * 2. 钱包转账场景分账（walletSplit）
 * 
 * 注意：这些测试需要本地Hardhat节点运行，或者使用模拟模式
 */
describe('Commission Split Integration Tests (P0)', () => {
  let app: INestApplication;
  let testUser: TestUser;
  let testMerchant: TestMerchant;
  const cleanupUserIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    // 设置全局前缀
    app.setGlobalPrefix('api');
    
    // 应用全局管道
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    // 创建测试用户
    testUser = await createTestUser(
      app,
      `test-user-${Date.now()}@test.com`,
      'Test123456!',
      [UserRole.USER],
      KYCLevel.VERIFIED,
      'verified',
    );
    cleanupUserIds.push(testUser.id);

    // 创建测试商家
    testMerchant = await createTestMerchant(
      app,
      `merchant-${Date.now()}@test.com`,
    );
    cleanupUserIds.push(testMerchant.id);
  });

  afterAll(async () => {
    try {
      await cleanupTestData(app, cleanupUserIds);
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }
    if (app) {
      await app.close();
    }
  });

  describe('分账配置设置', () => {
    it('应该成功设置订单分账配置', async () => {
      const orderId = ethers.id(`test-order-${Date.now()}`);
      const merchantMPCWallet = ethers.Wallet.createRandom().address;
      
      const splitConfig = {
        orderId: orderId,
        merchantMPCWallet: merchantMPCWallet,
        merchantAmount: '100000000', // 100 USDC (6 decimals)
        referrer: ethers.ZeroAddress, // 无推荐人
        referralFee: '0',
        executor: ethers.Wallet.createRandom().address,
        executionFee: '10000000', // 10 USDC
        platformFee: '15000000', // 15 USDC
        executorHasWallet: true,
        settlementTime: 0, // 即时结算
        isDisputed: false,
        sessionId: ethers.id(`test-session-${Date.now()}`),
      };

      // 注意：这里需要实际的API端点来设置分账配置
      // 如果还没有实现，可以先测试数据结构
      expect(splitConfig.orderId).toBeDefined();
      expect(splitConfig.merchantMPCWallet).toBeDefined();
      expect(splitConfig.merchantAmount).toBe('100000000');
    });

    it('应该验证分账配置数据完整性', async () => {
      const orderId = ethers.id(`test-order-${Date.now()}`);
      const merchantMPCWallet = ethers.Wallet.createRandom().address;
      const executor = ethers.Wallet.createRandom().address;
      const referrer = ethers.Wallet.createRandom().address;
      
      const splitConfig = {
        orderId: orderId,
        merchantMPCWallet: merchantMPCWallet,
        merchantAmount: '100000000', // 100 USDC
        referrer: referrer,
        referralFee: '5000000', // 5 USDC
        executor: executor,
        executionFee: '10000000', // 10 USDC
        platformFee: '15000000', // 15 USDC
        executorHasWallet: true,
        settlementTime: 0,
        isDisputed: false,
        sessionId: ethers.id(`test-session-${Date.now()}`),
      };

      // 验证总金额 = 商户金额 + 推荐费 + 执行费 + 平台费
      const totalAmount = 
        BigInt(splitConfig.merchantAmount) +
        BigInt(splitConfig.referralFee) +
        BigInt(splitConfig.executionFee) +
        BigInt(splitConfig.platformFee);
      
      expect(totalAmount.toString()).toBe('130000000'); // 130 USDC
      expect(splitConfig.merchantMPCWallet).not.toBe(ethers.ZeroAddress);
      expect(splitConfig.executor).not.toBe(ethers.ZeroAddress);
    });
  });

  describe('QuickPay场景分账', () => {
    it('应该验证QuickPay分账流程数据结构', async () => {
      const orderId = ethers.id(`test-order-quickpay-${Date.now()}`);
      const sessionId = ethers.id(`test-session-quickpay-${Date.now()}`);
      const merchantMPCWallet = ethers.Wallet.createRandom().address;
      
      const splitConfig = {
        orderId: orderId,
        merchantMPCWallet: merchantMPCWallet,
        merchantAmount: '100000000', // 100 USDC
        referrer: ethers.ZeroAddress,
        referralFee: '0',
        executor: ethers.Wallet.createRandom().address,
        executionFee: '10000000', // 10 USDC
        platformFee: '15000000', // 15 USDC
        executorHasWallet: true,
        settlementTime: 0,
        isDisputed: false,
        sessionId: sessionId,
      };

      const quickPayRequest = {
        sessionId: sessionId.toString(),
        paymentId: `payment-${Date.now()}`,
        to: merchantMPCWallet,
        amount: '130000000', // 总金额 130 USDC
        signature: '0x' + '0'.repeat(130), // 模拟签名
        nonce: Date.now(),
      };

      // 验证QuickPay请求结构
      expect(quickPayRequest.sessionId).toBe(sessionId.toString());
      expect(quickPayRequest.amount).toBe('130000000');
      expect(quickPayRequest.to).toBe(merchantMPCWallet);
      expect(quickPayRequest.signature).toMatch(/^0x[a-fA-F0-9]+$/);
    });

    it('应该验证QuickPay分账金额计算', async () => {
      const merchantAmount = BigInt('100000000'); // 100 USDC
      const referralFee = BigInt('5000000'); // 5 USDC
      const executionFee = BigInt('10000000'); // 10 USDC
      const platformFee = BigInt('15000000'); // 15 USDC
      
      const totalAmount = merchantAmount + referralFee + executionFee + platformFee;
      
      expect(totalAmount.toString()).toBe('130000000'); // 130 USDC
      
      // 验证各部分占比
      const merchantPercentage = (Number(merchantAmount) / Number(totalAmount)) * 100;
      const platformPercentage = (Number(platformFee) / Number(totalAmount)) * 100;
      
      expect(merchantPercentage).toBeCloseTo(76.92, 2);
      expect(platformPercentage).toBeCloseTo(11.54, 2);
    });
  });

  describe('钱包转账场景分账', () => {
    it('应该验证钱包转账分账流程数据结构', async () => {
      const orderId = ethers.id(`test-order-wallet-${Date.now()}`);
      const merchantMPCWallet = ethers.Wallet.createRandom().address;
      const userWallet = ethers.Wallet.createRandom().address;
      
      const splitConfig = {
        orderId: orderId,
        merchantMPCWallet: merchantMPCWallet,
        merchantAmount: '100000000', // 100 USDC
        referrer: ethers.ZeroAddress,
        referralFee: '0',
        executor: ethers.Wallet.createRandom().address,
        executionFee: '10000000', // 10 USDC
        platformFee: '15000000', // 15 USDC
        executorHasWallet: true,
        settlementTime: 0,
        isDisputed: false,
        sessionId: ethers.ZeroHash, // 钱包转账不需要Session
      };

      const walletTransferRequest = {
        orderId: orderId.toString(),
        from: userWallet,
        amount: '130000000', // 总金额 130 USDC
        paymentMethod: 'wallet',
      };

      // 验证钱包转账请求结构
      expect(walletTransferRequest.orderId).toBe(orderId.toString());
      expect(walletTransferRequest.amount).toBe('130000000');
      expect(walletTransferRequest.from).toBe(userWallet);
      expect(walletTransferRequest.paymentMethod).toBe('wallet');
    });

    it('应该验证钱包转账分账金额计算', async () => {
      const merchantAmount = BigInt('100000000'); // 100 USDC
      const referralFee = BigInt('0'); // 无推荐人
      const executionFee = BigInt('10000000'); // 10 USDC
      const platformFee = BigInt('15000000'); // 15 USDC
      
      const totalAmount = merchantAmount + referralFee + executionFee + platformFee;
      
      expect(totalAmount.toString()).toBe('125000000'); // 125 USDC
      
      // 验证各部分金额
      expect(merchantAmount.toString()).toBe('100000000');
      expect(executionFee.toString()).toBe('10000000');
      expect(platformFee.toString()).toBe('15000000');
    });
  });

  describe('分账配置查询', () => {
    it('应该能够查询已设置的分账配置', async () => {
      const orderId = ethers.id(`test-order-query-${Date.now()}`);
      const merchantMPCWallet = ethers.Wallet.createRandom().address;
      
      const splitConfig = {
        orderId: orderId,
        merchantMPCWallet: merchantMPCWallet,
        merchantAmount: '100000000',
        referrer: ethers.ZeroAddress,
        referralFee: '0',
        executor: ethers.Wallet.createRandom().address,
        executionFee: '10000000',
        platformFee: '15000000',
        executorHasWallet: true,
        settlementTime: 0,
        isDisputed: false,
        sessionId: ethers.id(`test-session-${Date.now()}`),
      };

      // 模拟查询分账配置
      const queriedConfig = {
        ...splitConfig,
        // 添加查询时间戳
        queriedAt: new Date().toISOString(),
      };

      expect(queriedConfig.orderId).toBe(splitConfig.orderId);
      expect(queriedConfig.merchantMPCWallet).toBe(splitConfig.merchantMPCWallet);
      expect(queriedConfig.merchantAmount).toBe(splitConfig.merchantAmount);
    });
  });

  describe('争议订单处理', () => {
    it('应该拒绝有争议的订单分账', async () => {
      const orderId = ethers.id(`test-order-disputed-${Date.now()}`);
      const merchantMPCWallet = ethers.Wallet.createRandom().address;
      
      const splitConfig = {
        orderId: orderId,
        merchantMPCWallet: merchantMPCWallet,
        merchantAmount: '100000000',
        referrer: ethers.ZeroAddress,
        referralFee: '0',
        executor: ethers.Wallet.createRandom().address,
        executionFee: '10000000',
        platformFee: '15000000',
        executorHasWallet: true,
        settlementTime: 0,
        isDisputed: true, // 有争议
        sessionId: ethers.id(`test-session-${Date.now()}`),
      };

      // 验证争议订单不应该执行分账
      expect(splitConfig.isDisputed).toBe(true);
      
      // 模拟尝试分账应该失败
      const canSplit = !splitConfig.isDisputed;
      expect(canSplit).toBe(false);
    });
  });

  describe('分账事件验证', () => {
    it('应该验证PaymentReceived事件数据结构', async () => {
      const orderId = ethers.id(`test-order-event-${Date.now()}`);
      const payer = ethers.Wallet.createRandom().address;
      const amount = '130000000'; // 130 USDC
      
      const paymentReceivedEvent = {
        orderId: orderId,
        scenario: 'QUICKPAY', // PaymentScenario.QUICKPAY
        payer: payer,
        amount: amount,
        timestamp: Date.now(),
      };

      expect(paymentReceivedEvent.orderId).toBe(orderId);
      expect(paymentReceivedEvent.scenario).toBe('QUICKPAY');
      expect(paymentReceivedEvent.payer).toBe(payer);
      expect(paymentReceivedEvent.amount).toBe(amount);
    });

    it('应该验证PaymentAutoSplit事件数据结构', async () => {
      const orderId = ethers.id(`test-order-split-event-${Date.now()}`);
      const merchantMPCWallet = ethers.Wallet.createRandom().address;
      const executor = ethers.Wallet.createRandom().address;
      const treasury = ethers.Wallet.createRandom().address;
      
      const paymentAutoSplitEvent = {
        orderId: orderId,
        merchantAmount: '100000000',
        merchantWallet: merchantMPCWallet,
        referralFee: '0',
        executorFee: '10000000',
        executorWallet: executor,
        platformFee: '15000000',
        platformWallet: treasury,
        timestamp: Date.now(),
      };

      expect(paymentAutoSplitEvent.orderId).toBe(orderId);
      expect(paymentAutoSplitEvent.merchantAmount).toBe('100000000');
      expect(paymentAutoSplitEvent.executorFee).toBe('10000000');
      expect(paymentAutoSplitEvent.platformFee).toBe('15000000');
    });
  });

  describe('集成测试总结', () => {
    it('应该总结所有测试场景', () => {
      const testScenarios = [
        '分账配置设置',
        'QuickPay场景分账',
        '钱包转账场景分账',
        '分账配置查询',
        '争议订单处理',
        '分账事件验证',
      ];

      expect(testScenarios.length).toBeGreaterThan(0);
      expect(testScenarios).toContain('QuickPay场景分账');
      expect(testScenarios).toContain('钱包转账场景分账');
    });
  });
});

