/**
 * Agentrix V3.0 功能测试用例
 * 用于验证所有V3.0功能的完整性和正确性
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';

describe('Agentrix V3.0 功能测试', () => {
  let app: INestApplication;
  let authToken: string;
  let userId: string;
  let merchantId: string;
  let productId: string;
  let orderId: string;
  let paymentId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // 创建测试用户
    const userResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'test@agentrix.test',
        password: 'test123456',
        agentrixId: 'AX-TEST-001',
      });

    userId = userResponse.body.id;
    authToken = userResponse.body.accessToken;

    // 创建测试商户
    const merchantResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'merchant@agentrix.test',
        password: 'test123456',
        agentrixId: 'AX-MERCHANT-001',
        roles: ['merchant'],
      });

    merchantId = merchantResponse.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Agent功能测试', () => {
    describe('1.1 商品搜索/比价', () => {
      it('应该能够搜索商品', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/agent/message')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            message: '帮我找一把游戏剑，预算20美元',
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('response');
        expect(response.body.metadata).toHaveProperty('type', 'product');
      });

      it('应该能够进行比价', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/agent/message')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            message: '比较游戏剑的价格',
          });

        expect(response.status).toBe(200);
        expect(response.body.metadata).toHaveProperty('comparison');
      });
    });

    describe('1.2 服务推荐', () => {
      it('应该能够推荐服务', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/agent/message')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            message: '帮我做一套logo设计',
          });

        expect(response.status).toBe(200);
        expect(response.body.metadata).toHaveProperty('type', 'service');
      });
    });

    describe('1.3 自动下单', () => {
      it('应该能够自动创建订单', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/agent/message')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            message: '帮我把火焰之刃加入购物车并支付',
          });

        expect(response.status).toBe(200);
        expect(response.body.metadata).toHaveProperty('type', 'order');
        if (response.body.metadata?.orderId) {
          orderId = response.body.metadata.orderId;
        }
      });
    });

    describe('1.4 代码生成', () => {
      it('应该能够生成支付API代码', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/agent/generate-code')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            prompt: '生成支付API代码',
            language: 'typescript',
          });

        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
        expect(response.body[0]).toHaveProperty('code');
      });
    });

    describe('1.5 订单查询', () => {
      it('应该能够查询订单状态', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/agent/message')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            message: '查询我的订单',
          });

        expect(response.status).toBe(200);
        expect(response.body.metadata).toHaveProperty('type', 'order');
      });
    });

    describe('1.6 退款处理', () => {
      it('应该能够处理退款', async () => {
        if (!orderId) {
          // 如果没有订单，先创建一个
          const orderResponse = await request(app.getHttpServer())
            .post('/api/orders')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              productId: productId || 'test-product-id',
              quantity: 1,
            });
          orderId = orderResponse.body.id;
        }

        const response = await request(app.getHttpServer())
          .post('/api/agent/refund')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            orderId,
            reason: '测试退款',
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('refund');
      });
    });
  });

  describe('2. Marketplace功能测试', () => {
    describe('2.1 商品上架', () => {
      it('应该能够上架商品', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/products')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: '测试商品',
            description: '这是一个测试商品',
            price: 99.99,
            stock: 100,
            category: '测试分类',
            commissionRate: 10,
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
        productId = response.body.id;
      });
    });

    describe('2.2 商品搜索', () => {
      it('应该能够搜索商品', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/products?search=测试')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
      });
    });
  });

  describe('3. 支付系统测试', () => {
    describe('3.1 PayIntent创建', () => {
      it('应该能够创建PayIntent', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/payments/payintent')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            amount: 99.99,
            currency: 'CNY',
            description: '测试支付',
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
        expect(response.body.metadata).toHaveProperty('payUrl');
      });
    });

    describe('3.2 QuickPay授权', () => {
      it('应该能够创建QuickPay授权', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/payments/quickpay/grants')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            paymentMethod: 'stripe',
            dailyLimit: 1000,
            singleLimit: 100,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
      });
    });

    describe('3.3 X402支付', () => {
      it('应该能够创建X402支付会话', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/payments/x402/session')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            amount: 50,
            currency: 'USDT',
            recipient: '0x1234567890abcdef',
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('sessionId');
      });
    });

    describe('3.4 托管支付', () => {
      it('应该能够创建托管交易', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/payments/escrow/create')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            amount: 100,
            currency: 'CNY',
            merchantId: merchantId,
            description: '测试托管交易',
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('escrowId');
      });
    });

    describe('3.5 退款', () => {
      it('应该能够创建退款', async () => {
        if (!paymentId) {
          // 如果没有支付记录，先创建一个
          const paymentResponse = await request(app.getHttpServer())
            .post('/api/payments')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              amount: 99.99,
              currency: 'CNY',
              paymentMethod: 'stripe',
              description: '测试支付',
            });
          paymentId = paymentResponse.body.id;
        }

        const response = await request(app.getHttpServer())
          .post('/api/refunds')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            paymentId,
            reason: '测试退款',
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('refundId');
      });
    });
  });

  describe('4. 汇率换算测试', () => {
    it('应该能够获取汇率报价', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/payments/exchange/quotes?fromAmount=100&fromCurrency=CNY&toCurrency=USDT')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe('5. 多链钱包测试', () => {
    it('应该能够连接EVM钱包', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/wallets/connect')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          chain: 'ethereum',
          chainId: 1,
          walletType: 'metamask',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
    });

    it('应该能够连接Solana钱包', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/wallets/connect')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          walletAddress: 'So11111111111111111111111111111111111111112',
          chain: 'solana',
          chainId: 101,
          walletType: 'phantom',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
    });
  });
});

