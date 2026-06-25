import { AgentGatewayService } from './agent-gateway.service';
import { CreationStateMachine } from '../creation-state-machine';
import type { CreationEntity } from '../entities/creation.entity';
import type { CapabilityManifest, Offering } from '../../../shared/types/creation';
import type { InvokeCreationRequest } from '../../../shared/types/creation-api';

/**
 * Unit tests for AgentGatewayService (world-creation-feed task 9.5).
 *
 * 校验设计 §Correctness Properties:
 *   - Property 2(Agent 代付不超额):超预设额度 → QUOTA_EXCEEDED,不结算、不退款误调。
 *   - Property 3(价格服务端权威):成交金额从持久化 offering 计算,**忽略客户端 args 价格**。
 *   - 鉴权:工具不在清单 / 创作不可发现 → CAP_DENIED。
 *   - 非消费类(query)→ ok 且不动用额度。
 *
 * 纯逻辑:状态机用真实纯实现;仓储/额度/审计用内存替身。
 */

interface FakeBudget {
  charge: jest.Mock;
  refund: jest.Mock;
}

function makeCreation(over: Partial<CreationEntity> = {}): CreationEntity {
  const offerings: Offering[] = [
    {
      id: 'off_coffee',
      kind: 'product',
      name: '美式咖啡',
      price: { axp: 18 },
      verbs: ['order', 'query'],
      availability: { stock: 2 },
    },
  ];
  return {
    id: 'creation_1',
    ownerAccountId: 'owner_1',
    originalCreatorAccountId: 'owner_1',
    type: 'shop',
    status: 'listed',
    title: '咖啡馆',
    summary: null,
    substrateTier: 'B',
    ecsVersionId: null,
    boundAgentId: null,
    geo: null,
    geoGridCell: null,
    poi: null,
    preview: null,
    offerings,
    manifestVersion: 1,
    shareCode: 'ABC123',
    metrics: { views: 0, likes: 0, sales: 0, comments: 0 },
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as CreationEntity;
}

function makeManifest(): CapabilityManifest {
  return {
    creationId: 'creation_1',
    version: 1,
    tools: [
      { name: 'order', verb: 'order', offeringId: 'off_coffee', inputSchema: {}, consumes: true },
      { name: 'query', verb: 'query', inputSchema: {} },
    ],
  };
}

function makeService(opts: {
  creation: CreationEntity | null;
  manifest?: CapabilityManifest | null;
  budget: FakeBudget;
}) {
  const saved: CreationEntity[] = [];
  const repo = {
    findById: jest.fn().mockResolvedValue(opts.creation),
    save: jest.fn().mockImplementation((c: CreationEntity) => { saved.push(c); return Promise.resolve(c); }),
  };
  const manifestRepo = {
    findOne: jest.fn().mockResolvedValue(
      opts.manifest === undefined
        ? { creationId: 'creation_1', version: 1, tools: makeManifest().tools, customTools: null, isActive: true }
        : opts.manifest,
    ),
  };
  const invocations: any[] = [];
  const invocationRepo = {
    create: jest.fn().mockImplementation((x: any) => x),
    save: jest.fn().mockImplementation((x: any) => { const row = { ...x, id: `inv_${invocations.length}` }; invocations.push(row); return Promise.resolve(row); }),
  };
  const svc = new AgentGatewayService(
    repo as any,
    new CreationStateMachine(),
    opts.budget as any,
    manifestRepo as any,
    invocationRepo as any,
  );
  return { svc, repo, invocations, saved };
}

function okBudget(): FakeBudget {
  return {
    charge: jest.fn().mockResolvedValue({ ok: true, remaining: 100 }),
    refund: jest.fn().mockResolvedValue(undefined),
  };
}

const baseReq = (over: Partial<InvokeCreationRequest> = {}): InvokeCreationRequest => ({
  verb: 'order',
  toolName: 'order',
  offeringId: 'off_coffee',
  args: { qty: 1 },
  onBehalfOfAccountId: 'user_1',
  ...over,
});

describe('AgentGatewayService (task 9.5)', () => {
  it('Property 3: 成交金额由服务端从 offering 计算,忽略客户端 args 价格', async () => {
    const budget = okBudget();
    const { svc } = makeService({ creation: makeCreation(), budget });
    // 客户端塞了一个伪造低价 price=1,qty=2;权威单价应为 offering.axp=18 → 36。
    const res = await svc.invoke('agent_1', 'creation_1', baseReq({ args: { qty: 2, price: 1 } }));
    expect(res.outcome).toBe('ok');
    expect(res.authoritativeAmount).toBe(36);
    expect(budget.charge).toHaveBeenCalledWith('user_1', 36);
  });

  it('Property 3: qty 受库存夹取(stock=2,请求 5 → 按 2 计)', async () => {
    const budget = okBudget();
    const { svc } = makeService({ creation: makeCreation(), budget });
    const res = await svc.invoke('agent_1', 'creation_1', baseReq({ args: { qty: 5 } }));
    expect(res.outcome).toBe('ok');
    expect(res.authoritativeAmount).toBe(36); // 18 * min(5,2)
  });

  it('Property 2: 超预设额度 → QUOTA_EXCEEDED,不结算', async () => {
    const budget: FakeBudget = {
      charge: jest.fn().mockResolvedValue({ ok: false, reason: 'QUOTA_EXCEEDED', remaining: 10, preset: 20 }),
      refund: jest.fn(),
    };
    const { svc, saved } = makeService({ creation: makeCreation(), budget });
    const res = await svc.invoke('agent_1', 'creation_1', baseReq());
    expect(res.outcome).toBe('rejected');
    expect(res.error?.error).toBe('QUOTA_EXCEEDED');
    // 未结算:metrics.sales 未回流(无 save 带 sales 增量),退款不应被调用。
    expect(budget.refund).not.toHaveBeenCalled();
    expect(saved.some((c) => (c.metrics?.sales ?? 0) > 0)).toBe(false);
  });

  it('鉴权:工具不在清单 → CAP_DENIED', async () => {
    const budget = okBudget();
    const { svc } = makeService({ creation: makeCreation(), budget });
    const res = await svc.invoke('agent_1', 'creation_1', baseReq({ toolName: 'hack', verb: 'order' }));
    expect(res.outcome).toBe('rejected');
    expect(res.error?.error).toBe('CAP_DENIED');
    expect(budget.charge).not.toHaveBeenCalled();
  });

  it('鉴权:创作不可发现(draft)→ CAP_DENIED', async () => {
    const budget = okBudget();
    const { svc } = makeService({ creation: makeCreation({ status: 'draft' }), budget });
    const res = await svc.invoke('agent_1', 'creation_1', baseReq());
    expect(res.outcome).toBe('rejected');
    expect(res.error?.error).toBe('CAP_DENIED');
  });

  it('非消费类 query → ok 且不动用额度', async () => {
    const budget = okBudget();
    const { svc } = makeService({ creation: makeCreation(), budget });
    const res = await svc.invoke('agent_1', 'creation_1', baseReq({ verb: 'query', toolName: 'query', offeringId: undefined }));
    expect(res.outcome).toBe('ok');
    expect(budget.charge).not.toHaveBeenCalled();
    expect(res.result).toBeDefined();
  });

  it('成交回流 metrics.sales + 写审计', async () => {
    const budget = okBudget();
    const { svc, saved, invocations } = makeService({ creation: makeCreation(), budget });
    const res = await svc.invoke('agent_1', 'creation_1', baseReq());
    expect(res.outcome).toBe('ok');
    expect(saved.some((c) => (c.metrics?.sales ?? 0) === 1)).toBe(true);
    expect(invocations.length).toBe(1);
    expect(invocations[0].outcome).toBe('ok');
  });
});
