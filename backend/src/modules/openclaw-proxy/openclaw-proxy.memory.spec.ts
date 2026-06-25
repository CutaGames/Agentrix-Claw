/**
 * Cross-device single-memory-source verification (spec soul-companion-onboarding,
 * task 5.2 — Companion_QA 桌面面板 + 跨端记忆 / Requirements 9.1, 9.5, 9.6).
 *
 * 目的:证明 Companion_QA 的会话记忆由后端**按 instanceId 单点存取**,任一端
 * (desktop / mobile)写入的记忆对其它端的后续对话可见,且不存在「端本地分叉」
 * ——即记忆的键是 instanceId,而不是 device / platform / sessionId。
 *
 * 两条对话入口在本仓库最终都汇聚到 OpenClawProxyService 的「platform-hosted」
 * 记忆方法:
 *   - 写:getOrCreatePlatformHostedSession(metadata.instanceId=instance.id)
 *         + savePlatformHostedMessage(message → session)
 *   - 读:getPlatformConversationHistory(userId, instanceId)
 *         过滤 `session.metadata ->> 'instanceId' = :instanceId`(跨 session/跨端)
 *   - 新会话读取:getPlatformHostedHistoryPayload(userId, instanceId, sessionId?)
 *
 * 桌面 ChatPanelImpl 走 POST /openclaw/proxy/:instanceId/stream(streamChat),
 * 移动端走相同的 streamAgentChat(同 instanceId);二者都进入 streamChatToCallbacks
 * → streamPlatformHostedChat*,因此本测试对私有记忆方法的断言覆盖两端共用的存取路径。
 *
 * 本测试为 task 5.2 的「聚焦单元/集成」验证;更宽的属性级检查由 task P.6
 * (Correctness Property 11)负责,二者互补、不重复。
 *
 * 通过 `Object.create(prototype)` + 仅注入 session/message 两个仓储的内存假实现
 * 来执行**真实**的私有方法,既不需要启动整张 DI 图,也不依赖 Postgres。
 */
import * as fc from 'fast-check';
import { Logger } from '@nestjs/common';
import { OpenClawProxyService } from './openclaw-proxy.service';
import { MessageRole } from '../../entities/agent-message.entity';

// ── 内存假仓储:忠实复现服务实际使用到的 TypeORM 行为 ──────────────────

type AnyRow = Record<string, any>;

/**
 * 极简 QueryBuilder,精确识别服务里用到的查询片段:
 *   - session.userId = :userId
 *   - session.metadata ->> 'instanceId' = :instanceId   ← 单一记忆源的「键」
 *   - session.sessionId = :sessionId
 * 排序字段:message.createdAt / message.sequenceNumber。
 * 任何未识别的片段都会抛错,避免「静默错过滤」让测试失去意义。
 */
class FakeMessageQueryBuilder {
  private predicates: Array<(m: AnyRow) => boolean> = [];
  private orderKeys: Array<{ field: string; dir: 'ASC' | 'DESC' }> = [];
  private limit = Number.POSITIVE_INFINITY;

  constructor(private readonly rows: AnyRow[]) {}

  innerJoinAndSelect(): this {
    return this;
  }

  leftJoinAndSelect(): this {
    return this;
  }

  where(clause: string, params: Record<string, any> = {}): this {
    return this.applyClause(clause, params);
  }

  andWhere(clause: string, params: Record<string, any> = {}): this {
    return this.applyClause(clause, params);
  }

  orderBy(field: string, dir: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderKeys = [{ field, dir }];
    return this;
  }

  addOrderBy(field: string, dir: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderKeys.push({ field, dir });
    return this;
  }

  take(n: number): this {
    this.limit = n;
    return this;
  }

  private applyClause(clause: string, params: Record<string, any>): this {
    if (clause.includes('session.userId')) {
      const userId = params.userId;
      this.predicates.push((m) => m.session?.userId === userId);
    } else if (clause.includes('instanceId')) {
      // session.metadata ->> 'instanceId' = :instanceId
      const instanceId = params.instanceId;
      this.predicates.push((m) => m.session?.metadata?.instanceId === instanceId);
    } else if (clause.includes('session.sessionId')) {
      const sessionId = params.sessionId;
      this.predicates.push((m) => m.session?.sessionId === sessionId);
    } else {
      throw new Error(`FakeMessageQueryBuilder: unrecognized clause "${clause}"`);
    }
    return this;
  }

  private fieldValue(m: AnyRow, field: string): number {
    if (field === 'message.createdAt') {
      return m.createdAt instanceof Date ? m.createdAt.getTime() : Number(m.createdAt);
    }
    if (field === 'message.sequenceNumber') {
      return Number(m.sequenceNumber);
    }
    throw new Error(`FakeMessageQueryBuilder: unrecognized order field "${field}"`);
  }

  async getMany(): Promise<AnyRow[]> {
    let result = this.rows.filter((m) => this.predicates.every((p) => p(m)));
    if (this.orderKeys.length > 0) {
      result = [...result].sort((a, b) => {
        for (const o of this.orderKeys) {
          const av = this.fieldValue(a, o.field);
          const bv = this.fieldValue(b, o.field);
          if (av < bv) return o.dir === 'ASC' ? -1 : 1;
          if (av > bv) return o.dir === 'ASC' ? 1 : -1;
        }
        return 0;
      });
    }
    if (Number.isFinite(this.limit)) {
      return result.slice(0, this.limit);
    }
    return result;
  }
}

function makeFakeRepos() {
  const sessions: AnyRow[] = [];
  const messages: AnyRow[] = [];
  let sessionSeq = 0;
  let messageSeq = 0;
  let clock = 1_000_000; // 单调递增的 createdAt,保证排序稳定

  const sessionRepo = {
    findOne: jest.fn(async ({ where }: any) => {
      return (
        sessions.find(
          (s) => s.userId === where.userId && s.sessionId === where.sessionId,
        ) || null
      );
    }),
    create: jest.fn((data: AnyRow) => ({ ...data })),
    save: jest.fn(async (s: AnyRow) => {
      if (!s.id) s.id = `db-session-${++sessionSeq}`;
      const idx = sessions.findIndex((x) => x.id === s.id);
      if (idx >= 0) sessions[idx] = s;
      else sessions.push(s);
      return s;
    }),
    update: jest.fn(async (id: string, patch: AnyRow) => {
      const s = sessions.find((x) => x.id === id);
      if (s) Object.assign(s, patch);
      return { affected: s ? 1 : 0 };
    }),
  };

  const messageRepo = {
    count: jest.fn(async ({ where }: any) => {
      return messages.filter((m) => m.sessionId === where.sessionId).length;
    }),
    create: jest.fn((data: AnyRow) => ({ ...data })),
    save: jest.fn(async (m: AnyRow) => {
      if (!m.id) m.id = `db-message-${++messageSeq}`;
      if (!m.createdAt) m.createdAt = new Date(clock++);
      messages.push(m);
      return m;
    }),
    createQueryBuilder: jest.fn(() => new FakeMessageQueryBuilder(messages)),
  };

  return { sessionRepo, messageRepo, sessions, messages };
}

// ── 在 prototype 上直挂私有方法,绕过 28 个构造依赖 ──────────────────

/**
 * 私有记忆方法的访问契约。刻意**不**与 OpenClawProxyService 取交集
 * (那会因「同名属性在某一方为 private」而把交集类型坍缩成 never),
 * 而是单独声明并通过 `as unknown as` 桥接到 prototype 实例。
 */
interface MemoryService {
  getOrCreatePlatformHostedSession(
    userId: string,
    instance: any,
    clientSessionId?: string,
  ): Promise<any>;
  savePlatformHostedMessage(
    session: any,
    userId: string,
    role: MessageRole,
    content: string,
    metadata?: Record<string, any>,
  ): Promise<void>;
  getPlatformConversationHistory(
    userId: string,
    instanceId: string,
    limit?: number,
  ): Promise<any[]>;
  getPlatformHostedHistoryPayload(
    userId: string,
    instanceId: string,
    clientSessionId?: string,
  ): Promise<any[]>;
}

function makeService() {
  const { sessionRepo, messageRepo } = makeFakeRepos();
  const service = Object.create(
    OpenClawProxyService.prototype,
  ) as unknown as MemoryService;
  (service as any).sessionRepo = sessionRepo;
  (service as any).messageRepo = messageRepo;
  (service as any).logger = new Logger('OpenClawProxyService.test');
  return { service, sessionRepo, messageRepo };
}

const USER = 'user-companion-1';
const OTHER_USER = 'user-companion-2';

const instanceA = {
  id: 'instance-A',
  name: 'Companion A',
  agentAccountId: 'agent-A',
  metadata: {},
};
const instanceB = {
  id: 'instance-B',
  name: 'Companion B',
  agentAccountId: 'agent-B',
  metadata: {},
};

/** 模拟一端的一次问答轮(用户提问 + 助手回答),指定 instance / sessionId / platform。 */
async function writeTurn(
  service: MemoryService,
  opts: {
    instance: any;
    clientSessionId?: string;
    platform: 'desktop' | 'mobile' | 'web';
    userText: string;
    assistantText: string;
    userId?: string;
  },
) {
  const userId = opts.userId ?? USER;
  const session = await service.getOrCreatePlatformHostedSession(
    userId,
    opts.instance,
    opts.clientSessionId,
  );
  await service.savePlatformHostedMessage(session, userId, MessageRole.USER, opts.userText, {
    source: 'platform-hosted-chat',
    instanceId: opts.instance.id,
    platform: opts.platform,
  });
  await service.savePlatformHostedMessage(
    session,
    userId,
    MessageRole.ASSISTANT,
    opts.assistantText,
    { source: 'platform-hosted-chat', instanceId: opts.instance.id, platform: opts.platform },
  );
  return session;
}

describe('OpenClawProxyService — Companion_QA 跨端单一记忆源 (R9.5/R9.6)', () => {
  it('桌面与移动端在同一 instanceId 下写入的记忆汇聚为单一来源 (R9.5)', async () => {
    const { service } = makeService();

    // 桌面端写入(/openclaw/proxy/:instanceId/stream → 同一 instanceId)
    await writeTurn(service, {
      instance: instanceA,
      clientSessionId: 'session-desktop',
      platform: 'desktop',
      userText: '记住:我喜欢猫',
      assistantText: '好的,我记住了你喜欢猫。',
    });

    // 移动端写入(streamAgentChat,同 instanceId,不同 device/session)
    await writeTurn(service, {
      instance: instanceA,
      clientSessionId: 'session-mobile',
      platform: 'mobile',
      userText: '我喜欢什么?',
      assistantText: '你喜欢猫。',
    });

    const history = await service.getPlatformConversationHistory(USER, instanceA.id, 80);
    const contents = history.map((m) => m.content);

    // 两端、两个 session 的全部消息都在同一 instanceId 的记忆里
    expect(history).toHaveLength(4);
    expect(contents).toEqual(
      expect.arrayContaining([
        '记住:我喜欢猫',
        '好的,我记住了你喜欢猫。',
        '我喜欢什么?',
        '你喜欢猫。',
      ]),
    );

    // 记忆里同时包含来自 desktop 与 mobile 的写入 → 不存在端本地分叉
    const platforms = new Set(history.map((m) => m.metadata?.platform));
    expect(platforms.has('desktop')).toBe(true);
    expect(platforms.has('mobile')).toBe(true);

    // 按时间升序返回(最早的桌面记忆在前)
    expect(contents[0]).toBe('记住:我喜欢猫');
  });

  it('某一端新增的记忆,对其它端的「全新对话」后续可见 (R9.6)', async () => {
    const { service } = makeService();

    // 桌面端在一次对话里产生新记忆
    await writeTurn(service, {
      instance: instanceA,
      clientSessionId: 'session-desktop',
      platform: 'desktop',
      userText: '记住:我的项目截止日是周五',
      assistantText: '已记住,周五截止。',
    });

    // 移动端开启一个**全新会话**(无 clientSessionId)→ 读取按 instanceId 的跨端历史
    const payload = await service.getPlatformHostedHistoryPayload(USER, instanceA.id, undefined);
    const contents = payload.map((m) => m.content);

    expect(contents).toEqual(
      expect.arrayContaining(['记住:我的项目截止日是周五', '已记住,周五截止。']),
    );
  });

  it('记忆按 instanceId 分区:不同 instance 的记忆互不串台(键是 instanceId,非 device)', async () => {
    const { service } = makeService();

    await writeTurn(service, {
      instance: instanceA,
      clientSessionId: 'session-A',
      platform: 'desktop',
      userText: 'A 实例的秘密',
      assistantText: '记下 A 的秘密。',
    });
    await writeTurn(service, {
      instance: instanceB,
      clientSessionId: 'session-B',
      platform: 'mobile',
      userText: 'B 实例的秘密',
      assistantText: '记下 B 的秘密。',
    });

    const historyA = await service.getPlatformConversationHistory(USER, instanceA.id, 80);
    const historyB = await service.getPlatformConversationHistory(USER, instanceB.id, 80);

    const contentsA = historyA.map((m) => m.content);
    const contentsB = historyB.map((m) => m.content);

    expect(contentsA).toEqual(
      expect.arrayContaining(['A 实例的秘密', '记下 A 的秘密。']),
    );
    expect(contentsA).not.toContain('B 实例的秘密');

    expect(contentsB).toEqual(
      expect.arrayContaining(['B 实例的秘密', '记下 B 的秘密。']),
    );
    expect(contentsB).not.toContain('A 实例的秘密');
  });

  it('记忆按 user 隔离:同一 instanceId 也不会泄漏到其他用户', async () => {
    const { service } = makeService();

    await writeTurn(service, {
      instance: instanceA,
      clientSessionId: 'session-owner',
      platform: 'desktop',
      userText: '只有我能看到',
      assistantText: '收到。',
    });

    const otherHistory = await service.getPlatformConversationHistory(
      OTHER_USER,
      instanceA.id,
      80,
    );
    expect(otherHistory).toHaveLength(0);
  });

  it('同一 clientSessionId 复用同一后端会话,且会话以 instanceId 为键持久化', async () => {
    const { service } = makeService();

    const first = await service.getOrCreatePlatformHostedSession(
      USER,
      instanceA,
      'stable-session',
    );
    const second = await service.getOrCreatePlatformHostedSession(
      USER,
      instanceA,
      'stable-session',
    );

    expect(second.id).toBe(first.id);
    expect(first.metadata.instanceId).toBe(instanceA.id);
    expect(first.sessionId).toBe('stable-session');
  });

  it('指定 clientSessionId 读取时,仍只返回归属该 instanceId 的消息', async () => {
    const { service } = makeService();

    await writeTurn(service, {
      instance: instanceA,
      clientSessionId: 'shared-session-id',
      platform: 'desktop',
      userText: 'desktop 在 A 写入',
      assistantText: 'A 收到。',
    });

    const payload = await service.getPlatformHostedHistoryPayload(
      USER,
      instanceA.id,
      'shared-session-id',
    );
    const contents = payload.map((m) => m.content);

    expect(contents).toEqual(
      expect.arrayContaining(['desktop 在 A 写入', 'A 收到。']),
    );
    // 该 session 下没有任何属于别的 instance 的消息
    expect(payload.every((m) => m.metadata?.instanceId === instanceA.id)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// P.6(Part B)— Correctness Property 11「跨端单一记忆源」属性级补充验证。
//
// task:   P.6 验证 TTS 节流 + 跨端单一记忆源
// design: Correctness Property 11(跨端单一记忆源)
//
// **Validates: Requirements 9.5, 9.6**
//
// Property 11 的主体覆盖由本文件上方的 task 5.2 用例(desktop+mobile 收敛、R9.6
// desktop→mobile 新会话可见、instance/user 分区、session 复用)以**举例**方式给出。
// 下面是 P.6 的**互补**补充,二者不重复:
//   (1) 属性级泛化(fast-check,numRuns=20):任取「任意长度、任意设备(desktop/
//       mobile/web 三条入口路径)、任意 session」的写入序列,只要落在同一 instanceId,
//       按 instanceId 的单点读取必**恰好**返回全部写入(无丢失、无端本地分叉),且
//       全新会话(无 clientSessionId)读取同样可见全部跨端记忆(R9.5 / R9.6)。
//   (2) 反向可见性(R9.6 对称):5.2 验证了 desktop→mobile 方向;这里补 mobile→desktop
//       方向——移动端写入的记忆对桌面端的「全新会话」同样可见。
// ──────────────────────────────────────────────────────────────────────────────

describe('P.6 互补 — Property 11 跨端单一记忆源(R9.5/R9.6)', () => {
  it('属性:任意设备/会话的写入序列在同一 instanceId 下恰好单点可见(fast-check, numRuns=20)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            device: fc.constantFrom<'desktop' | 'mobile' | 'web'>('desktop', 'mobile', 'web'),
            session: fc.constantFrom('s1', 's2', 's3'),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        async (turns) => {
          const { service } = makeService();
          const expected: string[] = [];
          const devicesUsed = new Set<string>();

          for (let i = 0; i < turns.length; i++) {
            const userText = `U#${i}`;
            const assistantText = `A#${i}`;
            await writeTurn(service, {
              instance: instanceA,
              clientSessionId: turns[i].session,
              platform: turns[i].device,
              userText,
              assistantText,
            });
            expected.push(userText, assistantText);
            devicesUsed.add(turns[i].device);
          }

          // 按 instanceId 单点读取:恰好返回全部写入(无丢失、无重复、无端本地分叉)。
          const history = await service.getPlatformConversationHistory(USER, instanceA.id, 999);
          expect(history.map((m) => m.content).sort()).toEqual([...expected].sort());

          // 记忆保留来源设备标记,但全部归于同一 instanceId(键是 instanceId,非 device)。
          const platforms = new Set(history.map((m) => m.metadata?.platform));
          expect(platforms).toEqual(devicesUsed);

          // 全新会话(无 clientSessionId)读取同样可见全部跨端记忆(R9.6)。
          const fresh = await service.getPlatformHostedHistoryPayload(
            USER,
            instanceA.id,
            undefined,
          );
          expect(fresh.map((m) => m.content).sort()).toEqual([...expected].sort());
        },
      ),
      { numRuns: 20 },
    );
  });

  it('反向可见性:移动端写入的记忆对桌面端的全新会话可见(R9.6 对称补充)', async () => {
    const { service } = makeService();

    // 移动端在一次对话里产生新记忆。
    await writeTurn(service, {
      instance: instanceA,
      clientSessionId: 'session-mobile',
      platform: 'mobile',
      userText: '记住:我用 Linux',
      assistantText: '已记住,你用 Linux。',
    });

    // 桌面端开启一个全新会话(无 clientSessionId)→ 按 instanceId 读取跨端历史。
    const payload = await service.getPlatformHostedHistoryPayload(USER, instanceA.id, undefined);
    const contents = payload.map((m) => m.content);

    expect(contents).toEqual(
      expect.arrayContaining(['记住:我用 Linux', '已记住,你用 Linux。']),
    );
  });
});
