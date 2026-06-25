import { Test, TestingModule } from '@nestjs/testing';
import { AgentrixRelayerService } from './relayer.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Payment } from '../../entities/payment.entity';
import { ConfigService } from '@nestjs/config';

describe('AgentrixRelayerService', () => {
  let service: AgentrixRelayerService;

  const mockPaymentRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        RELAYER_PRIVATE_KEY: '0x0000000000000000000000000000000000000000000000000000000000000001',
        RPC_URL: 'http://localhost:8545',
        ERC8004_CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000000',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        AgentrixRelayerService,
        {
          provide: getRepositoryToken(Payment),
          useValue: mockPaymentRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = testingModule.get<AgentrixRelayerService>(AgentrixRelayerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should get queue status', () => {
    const status = service.getQueueStatus();
    expect(status).toHaveProperty('queueLength');
    expect(status).toHaveProperty('isProcessing');
  });
});

