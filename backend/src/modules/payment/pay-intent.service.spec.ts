import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayIntentService } from './pay-intent.service';
import { PayIntent, PayIntentStatus, PayIntentType } from '../../entities/pay-intent.entity';
import { PaymentService } from './payment.service';
import { QuickPayGrantService } from './quick-pay-grant.service';

describe('PayIntentService', () => {
  let service: PayIntentService;
  let payIntentRepository: Repository<PayIntent>;
  let paymentService: PaymentService;
  let quickPayGrantService: QuickPayGrantService;

  const mockPayIntentRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockPaymentService = {
    processPayment: jest.fn(),
  };

  const mockQuickPayGrantService = {
    getGrant: jest.fn(),
    validateGrant: jest.fn(),
    recordUsage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayIntentService,
        {
          provide: getRepositoryToken(PayIntent),
          useValue: mockPayIntentRepository,
        },
        {
          provide: PaymentService,
          useValue: mockPaymentService,
        },
        {
          provide: QuickPayGrantService,
          useValue: mockQuickPayGrantService,
        },
      ],
    }).compile();

    service = module.get<PayIntentService>(PayIntentService);
    payIntentRepository = module.get<Repository<PayIntent>>(getRepositoryToken(PayIntent));
    paymentService = module.get<PaymentService>(PaymentService);
    quickPayGrantService = module.get<QuickPayGrantService>(QuickPayGrantService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPayIntent', () => {
    it('should create a pay intent', async () => {
      const userId = 'user-123';
      const dto = {
        type: PayIntentType.ORDER_PAYMENT,
        amount: 100,
        currency: 'CNY',
        description: 'Test payment',
      };

      const mockPayIntent = {
        id: 'pay-intent-123',
        userId,
        ...dto,
        status: PayIntentStatus.CREATED,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPayIntentRepository.create.mockReturnValue(mockPayIntent);
      mockPayIntentRepository.save.mockResolvedValue(mockPayIntent);

      const result = await service.createPayIntent(userId, dto);

      expect(result).toBeDefined();
      expect(result.status).toBe(PayIntentStatus.CREATED);
      expect(mockPayIntentRepository.create).toHaveBeenCalled();
      expect(mockPayIntentRepository.save).toHaveBeenCalled();
    });
  });
});

