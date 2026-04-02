import { AgentAccountStatus } from '../../entities/agent-account.entity';
import { PermissionSource } from './interfaces';
import { PermissionEngineService } from './permission-engine.service';

describe('PermissionEngineService integration', () => {
  let agentAccountRepo: { findOne: jest.Mock };
  let service: PermissionEngineService;

  beforeEach(() => {
    agentAccountRepo = {
      findOne: jest.fn(),
    };
    service = new PermissionEngineService(agentAccountRepo as any);
  });

  it('denies create_order when the agent account is suspended', async () => {
    agentAccountRepo.findOne.mockResolvedValueOnce({
      id: 'agent-account-1',
      status: AgentAccountStatus.SUSPENDED,
    });

    const decision = await service.evaluate(
      'create_order',
      { amount: 25 },
      {
        userId: 'user-1',
        agentAccountId: 'agent-account-1',
        toolRiskLevel: 2,
        amount: 25,
      },
    );

    expect(decision.behavior).toBe('deny');
    expect(decision.matchedRule?.pattern).toBe('*');
    expect(decision.matchedRule?.source).toBe(PermissionSource.PLATFORM);
  });

  it('denies create_order when commerce purchase permission is disabled', async () => {
    agentAccountRepo.findOne
      .mockResolvedValueOnce({
        id: 'agent-account-1',
        status: AgentAccountStatus.ACTIVE,
        spendingLimits: null,
        usedTodayAmount: 0,
        usedMonthAmount: 0,
      })
      .mockResolvedValueOnce({
        id: 'agent-account-1',
        permissions: {
          commercePurchaseEnabled: false,
        },
      });

    const decision = await service.evaluate(
      'create_order',
      { amount: 10 },
      {
        userId: 'user-1',
        agentAccountId: 'agent-account-1',
        toolRiskLevel: 2,
        amount: 10,
      },
    );

    expect(decision.behavior).toBe('deny');
    expect(decision.matchedRule?.pattern).toBe('create_order');
    expect(decision.matchedRule?.source).toBe(PermissionSource.AGENT_OWNER);
  });

  it('allows create_order when the user remembered the approval for this session', async () => {
    service.rememberDecision('user-1', 'create_order', 'allow', 'session');

    const decision = await service.evaluate(
      'create_order',
      { amount: 10 },
      {
        userId: 'user-1',
        toolRiskLevel: 2,
        amount: 10,
      },
    );

    expect(decision.behavior).toBe('allow');
    expect(decision.matchedRule?.source).toBe(PermissionSource.USER);
  });
});