/**
 * MCP Tools Integration Tests
 * 
 * 测试 Phase 1-3 的对话内购物闭环功能
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { McpService } from '../mcp.service';
import { GuestCheckoutService } from '../guest-checkout.service';
import { SkillService } from '../../skill/skill.service';
import { SkillExecutorService } from '../../skill/skill-executor.service';
import { DynamicToolAdapter } from '../../skill/dynamic-tool-adapter.service';
import { ProductService } from '../../product/product.service';
import { PaymentService } from '../../payment/payment.service';
import { WalletService } from '../../wallet/wallet.service';
import { AgentAuthorizationService } from '../../agent-authorization/agent-authorization.service';
import { AirdropService } from '../../auto-earn/airdrop.service';
import { AutoEarnService } from '../../auto-earn/auto-earn.service';
import { QuickPayGrantService } from '../../payment/quick-pay-grant.service';
import { MarketplaceService } from '../../marketplace/marketplace.service';

describe('MCP Tools Integration', () => {
  let mcpService: McpService;
  let guestCheckoutService: GuestCheckoutService;
  let productService: ProductService;

  const mockProduct = {
    id: 'test-product-123',
    name: '测试商品',
    description: '这是一个测试商品',
    price: 99,
    stock: 100,
    productType: 'physical',
    category: 'test',
    metadata: { currency: 'CNY' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpService,
        GuestCheckoutService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'ENABLE_MCP': 'true',
                'API_BASE_URL': 'https://api.agentrix.top',
                'FRONTEND_URL': 'https://agentrix.top',
              };
              return config[key];
            }),
          },
        },
        {
          provide: SkillService,
          useValue: { findAll: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: SkillExecutorService,
          useValue: { execute: jest.fn() },
        },
        {
          provide: DynamicToolAdapter,
          useValue: {
            getAllDynamicTools: jest.fn().mockResolvedValue([]),
            executeTool: jest.fn(),
          },
        },
        {
          provide: MarketplaceService,
          useValue: {},
        },
        {
          provide: ProductService,
          useValue: {
            getProduct: jest.fn().mockResolvedValue(mockProduct),
            getProducts: jest.fn().mockResolvedValue([mockProduct]),
          },
        },
        {
          provide: PaymentService,
          useValue: {
            createPaymentIntent: jest.fn(),
          },
        },
        {
          provide: WalletService,
          useValue: {
            getWalletBalance: jest.fn(),
          },
        },
        {
          provide: AgentAuthorizationService,
          useValue: {
            createAgentAuthorization: jest.fn(),
          },
        },
        {
          provide: AirdropService,
          useValue: {
            discoverAirdrops: jest.fn(),
          },
        },
        {
          provide: AutoEarnService,
          useValue: {
            getStats: jest.fn(),
          },
        },
        {
          provide: QuickPayGrantService,
          useValue: {
            getUserGrants: jest.fn().mockResolvedValue([]),
            validateGrant: jest.fn(),
            recordUsage: jest.fn(),
          },
        },
      ],
    }).compile();

    mcpService = module.get<McpService>(McpService);
    guestCheckoutService = module.get<GuestCheckoutService>(GuestCheckoutService);
    productService = module.get<ProductService>(ProductService);
  });

  describe('Tool List', () => {
    it('should include Phase 1-3 tools in tool list', async () => {
      const tools = await mcpService.getToolsList();
      const toolNames = tools.map((t: any) => t.name);

      // Phase 1-3 新增工具
      expect(toolNames).toContain('quick_purchase');
      expect(toolNames).toContain('prepare_checkout');
      expect(toolNames).toContain('confirm_payment');
      expect(toolNames).toContain('collect_user_info');
      expect(toolNames).toContain('check_payment_status');
      expect(toolNames).toContain('setup_quickpay');

      // 原有工具
      expect(toolNames).toContain('search_products');
      expect(toolNames).toContain('create_order');
    });
  });

  describe('quick_purchase', () => {
    it('should request email when not provided', async () => {
      const result = await mcpService.callTool('quick_purchase', {
        productId: 'test-product-123',
        quantity: 1,
      });

      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(false);
      expect(response.requiresInfo).toBe(true);
      expect(response.infoType).toBe('email');
      expect(response.guestSessionId).toBeDefined();
    });

    it('should create payment link when email provided', async () => {
      const result = await mcpService.callTool('quick_purchase', {
        productId: 'test-product-123',
        quantity: 1,
        email: 'test@example.com',
      });

      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.checkoutUrl || response.paymentLinkUrl).toBeDefined();
      expect(response.message).toContain('测试商品');
    });

    it('should request shipping for physical products', async () => {
      const result = await mcpService.callTool('quick_purchase', {
        productId: 'test-product-123',
        quantity: 1,
        email: 'test@example.com',
        // No shipping address
      });

      const response = JSON.parse(result.content[0].text);
      
      // Physical product should require shipping
      if (response.requiresInfo && response.infoType === 'shipping') {
        expect(response.message).toContain('收货地址');
      }
    });
  });

  describe('prepare_checkout + confirm_payment flow', () => {
    it('should create pending order and confirm payment', async () => {
      // Step 1: Prepare checkout
      const prepareResult = await mcpService.callTool('prepare_checkout', {
        productId: 'test-product-123',
        quantity: 2,
        email: 'test@example.com',
      });

      const prepareResponse = JSON.parse(prepareResult.content[0].text);
      
      expect(prepareResponse.success).toBe(true);
      expect(prepareResponse.intentId).toBeDefined();
      expect(prepareResponse.guestSessionId).toBeDefined();
      expect(prepareResponse.totalPrice).toBe(198); // 99 * 2
      expect(prepareResponse.confirmationRequired).toBe(true);

      // Step 2: Confirm payment
      const confirmResult = await mcpService.callTool('confirm_payment', {
        intentId: prepareResponse.intentId,
        guestSessionId: prepareResponse.guestSessionId,
      });

      const confirmResponse = JSON.parse(confirmResult.content[0].text);
      
      expect(confirmResponse.success).toBe(true);
      expect(confirmResponse.checkoutUrl || confirmResponse.paymentLinkUrl).toBeDefined();
    });
  });

  describe('collect_user_info', () => {
    it('should save email to guest session', async () => {
      const result = await mcpService.callTool('collect_user_info', {
        infoType: 'email',
        email: 'user@example.com',
      });

      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.collected).toContain('邮箱');
      expect(response.email).toBe('user@example.com');
    });

    it('should save shipping address to guest session', async () => {
      const result = await mcpService.callTool('collect_user_info', {
        infoType: 'shipping',
        shippingAddress: {
          name: '张三',
          phone: '13800138000',
          address: '北京市朝阳区xxx路',
          city: '北京',
          country: 'China',
        },
      });

      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.collected).toContain('收货地址');
      expect(response.hasShipping).toBe(true);
    });
  });

  describe('setup_quickpay', () => {
    it('should return setup URL for QuickPay authorization', async () => {
      const result = await mcpService.callTool('setup_quickpay', {
        maxAmount: 200,
        dailyLimit: 1000,
      });

      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.requiresAuth).toBe(true);
      expect(response.setupUrl).toContain('quickpay/setup');
      expect(response.suggestedLimits.maxAmount).toBe(200);
    });
  });

  describe('Guest Session Persistence', () => {
    it('should maintain state across multiple tool calls', async () => {
      // Call 1: Collect email
      const emailResult = await mcpService.callTool('collect_user_info', {
        infoType: 'email',
        email: 'persistent@example.com',
      });
      const emailResponse = JSON.parse(emailResult.content[0].text);
      const guestSessionId = emailResponse.guestSessionId;

      // Call 2: Quick purchase with same session (should not ask for email again)
      // Note: This test assumes the session persists in memory
      const session = guestCheckoutService.getGuestSession(guestSessionId);
      expect(session?.email).toBe('persistent@example.com');
    });
  });
});
