import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GuestCheckoutService } from '../guest-checkout.service';

describe('GuestCheckoutService', () => {
  let service: GuestCheckoutService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuestCheckoutService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'API_BASE_URL': 'https://api.agentrix.top',
                'FRONTEND_URL': 'https://agentrix.top',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<GuestCheckoutService>(GuestCheckoutService);
  });

  describe('getOrCreateGuestSession', () => {
    it('should create a new guest session', () => {
      const session = service.getOrCreateGuestSession();
      
      expect(session).toBeDefined();
      expect(session.id).toMatch(/^guest_/);
      expect(session.status).toBe('active');
    });

    it('should reuse existing session for same external session ID', () => {
      const externalId = 'chatgpt-session-123';
      
      const session1 = service.getOrCreateGuestSession(externalId, 'chatgpt');
      const session2 = service.getOrCreateGuestSession(externalId, 'chatgpt');
      
      expect(session1.id).toBe(session2.id);
    });

    it('should create new session for different external session IDs', () => {
      const session1 = service.getOrCreateGuestSession('external-1');
      const session2 = service.getOrCreateGuestSession('external-2');
      
      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe('updateGuestSession', () => {
    it('should update email in guest session', () => {
      const session = service.getOrCreateGuestSession();
      
      service.updateGuestSession(session.id, { email: 'test@example.com' });
      
      const updated = service.getGuestSession(session.id);
      expect(updated?.email).toBe('test@example.com');
    });

    it('should update shipping address in guest session', () => {
      const session = service.getOrCreateGuestSession();
      const address = {
        name: '张三',
        phone: '13800138000',
        address: '北京市朝阳区xxx',
        city: '北京',
        country: 'China',
      };
      
      service.updateGuestSession(session.id, { shippingAddress: address });
      
      const updated = service.getGuestSession(session.id);
      expect(updated?.shippingAddress).toEqual(address);
    });
  });

  describe('createGuestPayment', () => {
    it('should require email for guest payment', async () => {
      const session = service.getOrCreateGuestSession();
      
      const result = await service.createGuestPayment(session.id, {
        productId: 'product-123',
        productName: '测试商品',
        quantity: 1,
        amount: 99,
        currency: 'CNY',
      });
      
      expect(result.success).toBe(false);
      expect(result.requiresEmail).toBe(true);
    });

    it('should create payment with email', async () => {
      const session = service.getOrCreateGuestSession();
      service.updateGuestSession(session.id, { email: 'test@example.com' });
      
      const result = await service.createGuestPayment(session.id, {
        productId: 'product-123',
        productName: '测试商品',
        quantity: 1,
        amount: 99,
        currency: 'CNY',
        email: 'test@example.com',
      });
      
      expect(result.success).toBe(true);
      expect(result.checkoutUrl).toBeDefined();
      expect(result.message).toContain('测试商品');
    });
  });

  describe('checkGuestPaymentStatus', () => {
    it('should return not_found for invalid session', async () => {
      const result = await service.checkGuestPaymentStatus('invalid-session');
      
      expect(result.status).toBe('not_found');
    });

    it('should return pending for valid session with pending payment', async () => {
      const session = service.getOrCreateGuestSession();
      service.updateGuestSession(session.id, {
        email: 'test@example.com',
        pendingPayment: {
          productId: 'product-123',
          productName: '测试商品',
          quantity: 1,
          amount: 99,
          currency: 'CNY',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      
      const result = await service.checkGuestPaymentStatus(session.id);
      
      expect(result.status).toBe('pending');
    });
  });
});
