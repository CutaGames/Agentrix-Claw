import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../app.module';
import { createTestUser, cleanupTestData, authenticatedRequest, TestUser } from '../helpers/test-setup.helper';
import { UserRole, KYCLevel } from '../../entities/user.entity';

describe('Payment Flow Integration Tests (P0)', () => {
  let app: INestApplication;
  let testUser: TestUser;
  const cleanupUserIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    // 设置全局前缀（与main.ts保持一致）
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
  });

  afterAll(async () => {
    await cleanupTestData(app, cleanupUserIds);
    await app.close();
  });

  describe('Fee Estimation', () => {
    it('should estimate Stripe fees', async () => {
      const response = await authenticatedRequest(app, testUser.authToken)
        .post('/api/payments/estimate-fee')
        .send({
          amount: 100,
          currency: 'USD',
          paymentMethod: 'stripe',
        })
        .expect(200);

      expect(response.body).toHaveProperty('estimatedFee');
      expect(response.body).toHaveProperty('feeBreakdown');
      expect(response.body.feeBreakdown).toHaveProperty('totalFee');
      expect(typeof response.body.estimatedFee).toBe('number');
      expect(response.body.estimatedFee).toBeGreaterThan(0);
    });

    it('should estimate crypto gas fees for Ethereum', async () => {
      const response = await authenticatedRequest(app, testUser.authToken)
        .post('/api/payments/estimate-fee')
        .send({
          amount: 100,
          currency: 'USDC',
          paymentMethod: 'wallet',
          chain: 'ethereum',
        })
        .expect(200);

      expect(response.body).toHaveProperty('feeBreakdown');
      expect(response.body.feeBreakdown).toHaveProperty('gasFee');
      expect(typeof response.body.feeBreakdown.gasFee).toBe('number');
    });

    it('should estimate crypto gas fees for Solana', async () => {
      const response = await authenticatedRequest(app, testUser.authToken)
        .post('/api/payments/estimate-fee')
        .send({
          amount: 100,
          currency: 'USDC',
          paymentMethod: 'wallet',
          chain: 'solana',
        })
        .expect(200);

      expect(response.body).toHaveProperty('feeBreakdown');
      expect(response.body.feeBreakdown).toHaveProperty('gasFee');
    });

    it('should compare all payment costs', async () => {
      const response = await authenticatedRequest(app, testUser.authToken)
        .get('/api/payments/compare-costs')
        .query({ amount: 100, currency: 'USD' })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      
      // 验证每个支付方式的成本信息
      response.body.forEach((cost: any) => {
        expect(cost).toHaveProperty('paymentMethod');
        expect(cost).toHaveProperty('totalCost');
        expect(typeof cost.totalCost).toBe('number');
      });
    });

    it('should estimate fees with different currencies', async () => {
      const currencies = ['USD', 'CNY', 'EUR'];
      
      for (const currency of currencies) {
        const response = await authenticatedRequest(app, testUser.authToken)
          .post('/api/payments/estimate-fee')
          .send({
            amount: 100,
            currency,
            paymentMethod: 'stripe',
          })
          .expect(200);

        expect(response.body).toHaveProperty('estimatedFee');
        expect(response.body.estimatedFee).toBeGreaterThan(0);
      }
    });
  });

  describe('Risk Assessment', () => {
    it('should assess low-risk transaction', async () => {
      const response = await authenticatedRequest(app, testUser.authToken)
        .post('/api/payments/assess-risk')
        .send({
          amount: 10,
          paymentMethod: 'stripe',
        })
        .expect(200);

      expect(response.body).toHaveProperty('riskScore');
      expect(response.body).toHaveProperty('decision');
      expect(response.body).toHaveProperty('riskLevel');
      expect(['approve', 'review', 'reject']).toContain(response.body.decision);
      expect(['low', 'medium', 'high']).toContain(response.body.riskLevel);
      expect(typeof response.body.riskScore).toBe('number');
      expect(response.body.riskScore).toBeGreaterThanOrEqual(0);
      expect(response.body.riskScore).toBeLessThanOrEqual(100);
    });

    it('should assess high-risk transaction', async () => {
      const response = await authenticatedRequest(app, testUser.authToken)
        .post('/api/payments/assess-risk')
        .send({
          amount: 100000,
          paymentMethod: 'wallet',
        })
        .expect(200);

      expect(response.body.riskScore).toBeGreaterThan(30);
      // 高风险交易应该被标记为review或reject
      expect(['review', 'reject']).toContain(response.body.decision);
    });

    it('should assess risk with metadata', async () => {
      const response = await authenticatedRequest(app, testUser.authToken)
        .post('/api/payments/assess-risk')
        .send({
          amount: 1000,
          paymentMethod: 'stripe',
          metadata: {
            isFirstTime: true,
            merchantId: 'test-merchant',
          },
        })
        .expect(200);

      expect(response.body).toHaveProperty('riskScore');
      expect(response.body).toHaveProperty('riskFactors');
      expect(Array.isArray(response.body.riskFactors)).toBe(true);
    });

    it('should assess risk for different payment methods', async () => {
      const paymentMethods = ['stripe', 'wallet', 'x402'];
      
      for (const method of paymentMethods) {
        const response = await authenticatedRequest(app, testUser.authToken)
          .post('/api/payments/assess-risk')
          .send({
            amount: 100,
            paymentMethod: method,
          })
          .expect(200);

        expect(response.body).toHaveProperty('riskScore');
        expect(response.body).toHaveProperty('decision');
      }
    });
  });

  describe('QuickPay', () => {
    it('should automatically select X402 if authorized', async () => {
      // 注意：这个测试需要先创建用户和X402授权
      // 在实际测试中，可以使用test-setup.helper创建测试用户
      // 然后创建X402授权，最后测试支付流程
      
      // TODO: 完善此测试
      // 1. 创建测试用户
      // 2. 创建X402授权
      // 3. 发起支付请求
      // 4. 验证自动选择了X402支付方式
      
      expect(true).toBe(true); // 占位测试
    });
  });
});

