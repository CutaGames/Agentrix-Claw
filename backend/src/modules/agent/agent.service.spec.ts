import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentService } from './agent.service';
import { Product } from '../../entities/product.entity';
import { Order } from '../../entities/order.entity';
import { Payment } from '../../entities/payment.entity';
import { AgentSession } from '../../entities/agent-session.entity';
import { AgentMessage } from '../../entities/agent-message.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { ProductService } from '../product/product.service';
import { OrderService } from '../order/order.service';
import { PaymentService } from '../payment/payment.service';
import { SearchService } from '../search/search.service';
import { RecommendationService } from '../recommendation/recommendation.service';
import { LogisticsService } from '../logistics/logistics.service';
import { RefundService } from '../payment/refund.service';
import { AgentP0IntegrationService } from './agent-p0-integration.service';

describe('AgentService', () => {
  let service: AgentService;
  let module: TestingModule;
  let searchService: SearchService;

  const mockRepositories = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        AgentService,
        {
          provide: getRepositoryToken(Product),
          useValue: mockRepositories,
        },
        {
          provide: getRepositoryToken(Order),
          useValue: mockRepositories,
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: mockRepositories,
        },
        {
          provide: getRepositoryToken(AgentSession),
          useValue: mockRepositories,
        },
        {
          provide: getRepositoryToken(AgentMessage),
          useValue: mockRepositories,
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockRepositories,
        },
        {
          provide: ProductService,
          useValue: {
            getProduct: jest.fn(),
          },
        },
        {
          provide: OrderService,
          useValue: {
            createOrder: jest.fn(),
            getOrders: jest.fn(),
            getOrder: jest.fn(),
          },
        },
        {
          provide: PaymentService,
          useValue: {
            processPayment: jest.fn(),
          },
        },
        {
          provide: SearchService,
          useValue: {
            semanticSearch: jest.fn(),
          },
        },
        {
          provide: RecommendationService,
          useValue: {
            getContextualRecommendations: jest.fn(),
          },
        },
        {
          provide: LogisticsService,
          useValue: {
            getLogisticsTracking: jest.fn(),
            updateLogisticsStatus: jest.fn(),
          },
        },
        {
          provide: RefundService,
          useValue: {
            processRefund: jest.fn(),
            getRefundStatus: jest.fn(),
          },
        },
        {
          provide: AgentP0IntegrationService,
          useValue: {
            identifyP0Intent: jest.fn().mockReturnValue(null), // 默认返回 null，表示不是 P0 请求
            handleP0Request: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AgentService>(AgentService);
    searchService = module.get<SearchService>(SearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processMessage', () => {
    it('should process a message and create session', async () => {
      const userId = 'user-123';
      const message = '帮我找一把游戏剑，预算20美元';

      const mockSession = {
        id: 'session-123',
        userId,
        status: 'active',
        context: {},
        createdAt: new Date(),
      };

      // Mock repository 方法
      mockRepositories.findOne.mockResolvedValue(null);
      mockRepositories.create.mockReturnValue(mockSession);
      mockRepositories.save.mockResolvedValue(mockSession);
      mockRepositories.count.mockResolvedValue(0);
      
      // Mock service 方法
      jest.spyOn(service, 'getOrCreateSession').mockResolvedValue(mockSession as any);
      jest.spyOn(service, 'getSessionHistory').mockResolvedValue([]);
      jest.spyOn(service, 'saveMessage').mockResolvedValue(undefined);
      jest.spyOn(service, 'updateSessionContext').mockResolvedValue(undefined);
      jest.spyOn(service, 'logAudit').mockResolvedValue(undefined);
      
      // Mock SearchService 返回搜索结果
      jest.spyOn(searchService, 'semanticSearch').mockResolvedValue({
        products: [],
        query: message,
      } as any);

      const result = await service.processMessage(message, {}, userId);

      expect(result).toBeDefined();
      expect(result.intent).toBeDefined();
      expect(result.entities).toBeDefined();
    });
  });
});

