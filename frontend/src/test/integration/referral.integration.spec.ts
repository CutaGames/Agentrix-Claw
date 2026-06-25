import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../app.module';
import { createTestUser, createTestMerchant, cleanupTestData, authenticatedRequest, TestUser, TestMerchant } from '../helpers/test-setup.helper';
import { UserRole } from '../../entities/user.entity';

describe('Referral Integration Tests (P0)', () => {
  let app: INestApplication;
  let testAgent: TestUser;
  let testMerchant: TestMerchant;
  const cleanupUserIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    // 设置全局前缀（与main.ts保持一致）
    app.setGlobalPrefix('api');
    
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    // 创建测试Agent（用户角色）
    testAgent = await createTestUser(
      app,
      `test-agent-${Date.now()}@test.com`,
      'Test123456!',
      [UserRole.USER], // Agent也是USER角色
    );
    cleanupUserIds.push(testAgent.id);

    // 创建测试商家
    testMerchant = await createTestMerchant(app, `test-merchant-${Date.now()}@test.com`);
    cleanupUserIds.push(testMerchant.id);
  });

  afterAll(async () => {
    await cleanupTestData(app, cleanupUserIds);
    await app.close();
  });

  describe('Referral Management', () => {
    it('should create referral', async () => {
      const response = await authenticatedRequest(app, testAgent.authToken)
        .post('/api/referral')
        .send({
          merchantId: testMerchant.id,
          merchantName: 'Test Merchant',
          merchantEmail: testMerchant.email,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('agentId');
      expect(response.body).toHaveProperty('merchantId');
      expect(response.body.merchantId).toBe(testMerchant.id);
    });

    it('should get my referrals', async () => {
      const response = await authenticatedRequest(app, testAgent.authToken)
        .get('/api/referral/my-referrals')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('agentId');
        expect(response.body[0]).toHaveProperty('merchantId');
      }
    });

    it('should get referral stats', async () => {
      const response = await authenticatedRequest(app, testAgent.authToken)
        .get('/api/referral/stats')
        .expect(200);

      expect(response.body).toHaveProperty('totalReferrals');
      expect(response.body).toHaveProperty('activeReferrals');
      expect(response.body).toHaveProperty('totalCommissionEarned');
      expect(typeof response.body.totalReferrals).toBe('number');
      expect(typeof response.body.activeReferrals).toBe('number');
    });
  });

  describe('Referral Commissions', () => {
    it('should get pending commissions', async () => {
      const response = await authenticatedRequest(app, testAgent.authToken)
        .get('/api/referral/commissions/pending')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should get settled commissions', async () => {
      const response = await authenticatedRequest(app, testAgent.authToken)
        .get('/api/referral/commissions/settled')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});

