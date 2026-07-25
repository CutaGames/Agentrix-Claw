/**
 * creationEnterFlow — Feed → Detail → Enter 链路的**纯逻辑决策**
 * (world-growth-mobile-experience · task 6.2/6.4)。
 *
 * spec: .kiro/specs/world-growth-mobile-experience/{requirements,design}.md
 *   - R4.1 Feed 点进 → Creation_Detail（封面/标题/创作者/offerings + 进入按钮）。
 *   - R4.2 Detail「进入」→ enterCreation → 打开 Creation_Experience。
 *   - R4.4 enterCreation 失败/超时 → 可读错误 + **重试**入口，绝不停留空白。
 *   - R4.5 无可进入体验内容 → 降级为可预览详情视图，**不黑屏**。
 *
 * 设计取向（与 `creationFeed.ts` 同口径）：把「导航跳去哪、带什么参数」「进入结果落到
 * experience 还是 error」「进入成功但无内容是否降级」「任一结果都有可渲染分支（永不黑屏）」
 * 这些**判定**从 React Native 屏幕组件里抽成**无 RN 依赖的纯函数**，让
 * `CreationDetailScreen` / `CreationExperienceScreen` 只做呈现与副作用（导航、埋点、
 * setState），而决策可在纯逻辑 jest harness 中被单测/属性测试覆盖。
 *
 * ⚠️ 本模块**不含**任何 React/RN import，保证可在 node 纯逻辑 harness 运行。
 * 真正的 `<Image>`/`navigation`/`ActivityIndicator` 渲染与跳转属于 RN-only，
 * 无法在该 harness 执行（见文件尾「Harness 限制」说明与对应测试）。
 */
import type { EnterCreationResponse } from '../../shared/types/creation-api';
import type { CreationDiscoveryItem, CreationType } from '../../shared/types/creation';

// ============================================================
// §A 导航意图（Feed → Detail → Enter 的跳转决策，R4.1/R4.2/R4.5）
// 把 navigation.navigate(screen, params) 的「目标屏 + 参数」抽成纯值，
// 便于断言跳转正确、参数透传无损（item / title / type），无需挂载 RN 导航。
// ============================================================

/** 世界创作链路内的导航意图（目标屏 + 参数）。屏幕据此调用 navigation.navigate。 */
export type WorldNavIntent =
  | {
      screen: 'CreationDetail';
      params: { creationId: string; title?: string; item?: CreationDiscoveryItem };
    }
  | {
      screen: 'CreationExperience';
      params: {
        creationId: string;
        type?: CreationType;
        title?: string;
        item?: CreationDiscoveryItem;
      };
    };

/**
 * Feed 卡片点击 → 打开 Creation_Detail（R4.1）。
 * 透传已持有的发现投影项（`item`），供详情富渲染（封面/创作者/offerings），避免二次请求。
 */
export function navFeedToDetail(item: CreationDiscoveryItem): WorldNavIntent {
  return {
    screen: 'CreationDetail',
    params: { creationId: item.id, title: item.title, item },
  };
}

/**
 * Detail「进入/进去逛逛」→ 打开 Creation_Experience（R4.2）。
 * `title` 取详情页展示标题；`type`/`item` 从透传的发现投影项派生（缺省优雅降级）。
 */
export function navDetailToExperience(
  creationId: string,
  displayTitle: string,
  item?: CreationDiscoveryItem,
): WorldNavIntent {
  return {
    screen: 'CreationExperience',
    params: { creationId, type: item?.type, title: displayTitle, item },
  };
}

/**
 * Experience 无法进入 / 无可进入内容 → 降级回可预览的 Creation_Detail（R4.4/R4.5）。
 * 进入失败页的「查看详情」与降级提示的「查看详情」共用同一意图，保证不黑屏且不丢参数。
 */
export function navExperienceToDetail(
  creationId: string,
  title?: string,
  item?: CreationDiscoveryItem,
): WorldNavIntent {
  return {
    screen: 'CreationDetail',
    params: { creationId, title, item },
  };
}

// ============================================================
// §B 进入结果决策（enterCreation 成功 / 失败 / 超时，R4.2/R4.4）
// 屏幕对 Promise.race([enterCreation, timeout]) 的 then/catch 结果做的分支判定，
// 抽成一个纯函数：给定「已结算的进入结果」→ 决定落到 experience 还是可重试的 error。
// ============================================================

/** 进入尝试的已结算输入（对应屏幕 then/catch 收到的四种情形）。 */
export type EnterSettleInput =
  /** 缺少 creationId（路由参数缺失）。 */
  | { kind: 'missing-id' }
  /** LOAD_TIMEOUT —— Promise.race 超时先兑现。 */
  | { kind: 'timeout' }
  /** enterCreation 兑现（可能带 `error`，也可能是有效 session）。 */
  | { kind: 'resolved'; response: Pick<EnterCreationResponse, 'error'> | null }
  /** enterCreation 抛错（网络/未知异常）。 */
  | { kind: 'threw'; message?: string };

/** 进入失败的机器可读原因码（屏幕据此映射可读 i18n 文案）。null = 成功。 */
export type EnterReasonCode = 'missing-id' | 'timeout' | 'entry-error' | 'threw';

/** 进入结果决策：落到哪个分支、是否可重试、失败原因码与服务端细节。 */
export interface EnterDecision {
  /** 渲染分支：成功打开体验 or 可读错误页。 */
  branch: 'experience' | 'error';
  /** error 分支是否提供「重试」入口。恒为 true —— 失败绝不是死路（R4.4）。 */
  retryable: boolean;
  /** 失败原因码（成功为 null）。 */
  reasonCode: EnterReasonCode | null;
  /** 服务端返回的可读失败细节（entry-error 时携带）。 */
  detail?: string;
}

/**
 * 判定进入结果落到哪个分支（R4.2 成功 / R4.4 失败/超时可重试）。
 *
 * 规则（与 CreationExperienceScreen 既有 then/catch 完全等价）：
 *  - `missing-id` → error（reasonCode='missing-id'）。
 *  - `timeout`    → error（reasonCode='timeout'，LOAD_TIMEOUT）。
 *  - `resolved` 且 `response.error` 存在 → error（reasonCode='entry-error'，detail=error.detail）。
 *  - `resolved` 且无 error（含 response 为 null 但…见下）→ experience。
 *  - `threw`      → error（reasonCode='threw'，携带 message）。
 *
 * 注：屏幕里 `Promise.race` 成功分支的 res 一定是 EnterCreationResponse（非 null）；
 * 这里对 `response == null` 也稳健处理为 experience 前的保护——但实际 resolved 分支
 * 只在拿到响应对象时进入。**error 分支恒 `retryable=true`**，确保永不停留空白。
 */
export function decideEnterState(input: EnterSettleInput): EnterDecision {
  switch (input.kind) {
    case 'missing-id':
      return { branch: 'error', retryable: true, reasonCode: 'missing-id' };
    case 'timeout':
      return { branch: 'error', retryable: true, reasonCode: 'timeout' };
    case 'threw':
      return { branch: 'error', retryable: true, reasonCode: 'threw', detail: input.message };
    case 'resolved': {
      const err = input.response?.error;
      if (err) {
        return { branch: 'error', retryable: true, reasonCode: 'entry-error', detail: err.detail };
      }
      return { branch: 'experience', retryable: false, reasonCode: null };
    }
    default: {
      // 穷尽保护：未知输入也落到可重试的 error（绝不无分支 → 绝不黑屏）。
      return { branch: 'error', retryable: true, reasonCode: 'threw' };
    }
  }
}

/** 递增重试计数（onRetry）——纯函数，便于断言重试语义。 */
export function nextRetryTick(tick: number): number {
  return tick + 1;
}

// ============================================================
// §C 降级决策（进入成功但无可交互内容 → 可预览详情视图，R4.5）
// ============================================================

/**
 * 会话是否含「可进入 / 可交互」内容 —— ECS 实体、offerings 或含定价的商品实体。
 * 与 CreationExperienceScreen 的 `hasEnterableContent` 判定等价。
 */
export function hasEnterableContent(
  session: Pick<EnterCreationResponse, 'ecsWorld' | 'offerings'> | null | undefined,
): boolean {
  if (!session) return false;
  const entities = session.ecsWorld?.entities ?? [];
  const offerings = session.offerings ?? [];
  const goods = entities.filter((e) => e.components?.price);
  return entities.length > 0 || offerings.length > 0 || goods.length > 0;
}

/**
 * 进入成功但**无可交互体验内容**时是否应降级为可预览详情视图（R4.5）。
 * = 会话已就绪（experience 分支）但 `hasEnterableContent === false`。
 */
export function shouldDegradeToDetail(
  session: Pick<EnterCreationResponse, 'ecsWorld' | 'offerings'> | null | undefined,
): boolean {
  return !!session && !hasEnterableContent(session);
}

// ============================================================
// §D 永不黑屏不变量（R4.4/R4.5 底线）
// 无论进入结果如何，体验宿主的渲染分支恒 ∈ {loading, error, experience}，
// 且 error 分支恒提供可操作出口（重试 + 查看详情 + 返回）—— 不存在无分支的空白态。
// ============================================================

/** 体验宿主的三种渲染分支（互斥且穷尽）。 */
export type ExperienceRenderBranch = 'loading' | 'error' | 'experience';

/**
 * 给定「是否仍在进入中」与「已结算决策」→ 体验宿主应渲染哪个分支。
 * - 仍在进入中（loading 且尚无决策）→ 'loading'（转圈 + 「正在进入…」）。
 * - 已结算：decision.branch 即为 'experience' | 'error'。
 * 三分支对任意输入都有定义（穷尽）→ 屏幕永远有可渲染分支 → **永不黑屏**。
 */
export function experienceRenderBranch(opts: {
  loading: boolean;
  decision: EnterDecision | null;
}): ExperienceRenderBranch {
  if (opts.loading && !opts.decision) return 'loading';
  if (!opts.decision) return 'loading';
  return opts.decision.branch;
}

/** 进入失败/超时页恒提供的可操作出口（顺序即屏幕呈现顺序）。恒非空 → 不是死路。 */
export const ENTER_ERROR_ACTIONS = ['retry', 'view-detail', 'back'] as const;
export type EnterErrorAction = (typeof ENTER_ERROR_ACTIONS)[number];

/**
 * 取进入失败页应提供的可操作出口。恒返回非空数组（含 'retry'），
 * 保证 R4.4「可读错误 + 重试入口，不停留空白」的结构性底线。
 */
export function enterErrorActions(): readonly EnterErrorAction[] {
  return ENTER_ERROR_ACTIONS;
}
