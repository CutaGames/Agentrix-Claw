/**
 * 常驻目标 + 自主边界 v1（L8 第 2 批 C1，coord 10-19）。
 *
 * 主人给一只 Agent 一个长期目标，云端 worker 隔一段时间推进一步。能自己做什么，由三样东西共同决定，取最紧的：
 * - 信任阶梯（`trust-ladder.ts`）：这只 Agent 现在的级别；后台最多到 `prepare`（读 + 备稿），`commit` 类工具
 *   （付款、下单、发消息、发布、执行命令）任何级别下都不在后台跑，要主人在对话里亲自做。
 * - 自主边界（本文件的 `StandingGoalBoundaryV1`，主人写在目标上）：级别上限、工具白名单、每步预占的平台额度、
 *   能不能出网、步间隔、总步数。边界就是后台任务的「通行证」；没有新建 Pass 受众种类，因为 2037 的 CHECK 只认四种。
 * - 预算（`spend-budget.ts` 的 `platform_credit` 路径）：每步先按 `stepCostCents` 预占，**对后台任务强制执行**（E99 ④，12.2 第 3 条）。
 *   预占不到、或者要主人批准，这一步不跑，目标停在「等主人」。其余路径照旧走影子模式。跑完按托管运行时报的实际用量扣
 *   （向上取整到美分，最多扣到预占的数；读不到用量按预占的数扣），扣不成功这一步不算、目标停下来问主人（L8-8，评审 L3）。
 * - Pass（L8-8 L7，可选）：目标可以绑一张本人、同一只 Agent 的有效 Pass；绑了的每步前都要它还有效，撤销、过期、找不到就进已暂停。
 *
 * 越界一律停下来问主人（`status: 'needs_owner'`，带 `needs`），不是静默跳过，也不是悄悄降级。
 * 每一步一条回执：先落 `standing_goal_steps`，再写 A3 账本（`context-data-class.ts` 的 `chat_turn`）。
 * 锁定（A4）开着时，出网类工具不进白名单；锁定状态读不出按锁定算。急停：任何一台设备的最近一条安全事件是 `engaged`，
 * 或者主人在云端拉了急停，都不跑；云端急停要最近登录才能解除。
 *
 * 开关：`STANDING_GOALS_V1_ENABLED`，只认精确的 `'1'`，默认关。关着时所有路由 404，worker 一行都不读。
 * 三端：网页 `NEXT_PUBLIC_STANDING_GOALS_ENABLED`、手机 `EXPO_PUBLIC_STANDING_GOALS`、桌面 `VITE_STANDING_GOALS_ENABLED`，
 * 都只认精确的 `1`；只看进度和停止 / 继续，建目标和改边界在 API 里做（放宽要主人亲自登录）。
 */
import {
  TRUST_LADDER_LEVELS_V0,
  trustLadderDecisionV0,
  type TrustLadderLevelV0,
  type TrustLadderToolClassV0,
} from './trust-ladder';

export const STANDING_GOALS_FLAG_V1 = 'STANDING_GOALS_V1_ENABLED';

export const STANDING_GOAL_ROUTES_V1 = {
  list: 'GET /api/standing-goals',
  create: 'POST /api/standing-goals',
  read: 'GET /api/standing-goals/:goalRef',
  pause: 'POST /api/standing-goals/:goalRef/pause',
  resume: 'POST /api/standing-goals/:goalRef/resume',
  end: 'POST /api/standing-goals/:goalRef/end',
  emergencyStop: 'POST /api/standing-goals/emergency-stop',
} as const;

export const STANDING_GOAL_LIMITS_V1 = {
  titleMax: 120,
  instructionMax: 2000,
  toolsMax: 20,
  summaryMax: 400,
  /** 每人每天（UTC）后台步数上限，默认 20（12.2 第 1 条）；环境变量 `STANDING_GOALS_DAILY_STEPS` 可调 1–200。 */
  defaultDailySteps: 20,
  stepCostCentsMin: 1,
  stepCostCentsMax: 500,
  intervalMinutesMin: 15,
  intervalMinutesMax: 1440,
  maxStepsMin: 1,
  maxStepsMax: 200,
  /** 一个主人同时生效（active / needs_owner / paused）的目标数。 */
  livePerOwnerMax: 5,
} as const;

/** 后台最高到这一级；`commit` 类工具无论级别都不进后台。 */
export const STANDING_GOAL_LEVEL_CEILING_V1: TrustLadderLevelV0 = 'prepare';

export const STANDING_GOAL_STATUSES_V1 = ['active', 'needs_owner', 'paused', 'done', 'ended'] as const;
export type StandingGoalStatusV1 = (typeof STANDING_GOAL_STATUSES_V1)[number];

/** `needs_owner` 时停在哪：信任级别不够、预算不够、预算要批准、Agent 不可用、模型自己提了问题。 */
export const STANDING_GOAL_NEEDS_V1 = ['trust_level', 'budget', 'budget_approval', 'agent_unavailable', 'owner_question'] as const;
export type StandingGoalNeedV1 = (typeof STANDING_GOAL_NEEDS_V1)[number];

export const STANDING_GOAL_PAUSED_REASONS_V1 = ['owner', 'emergency_stop'] as const;
export type StandingGoalPausedReasonV1 = (typeof STANDING_GOAL_PAUSED_REASONS_V1)[number];

/**
 * 绑了 Pass 的目标因为这张 Pass 停下（L8-8 L7，coord 10-27 选 a：失败即停，只管显式绑定的那张）：撤销了、过期了（或次数用完）、找不到了
 * （不是这个主人的、不是这只 Agent 的、删掉了）。这时 `status` 是 `paused`、`pausedReason` 是 `owner`（2045 的 CHECK 只认
 * owner / emergency_stop，不改它），具体原因放迁移 2155 的 `paused_detail`。没绑 Pass 的目标永远是 null。
 */
export const STANDING_GOAL_PAUSED_DETAILS_V1 = ['pass_revoked', 'pass_expired', 'pass_missing'] as const;
export type StandingGoalPausedDetailV1 = (typeof STANDING_GOAL_PAUSED_DETAILS_V1)[number];

export function isStandingGoalPausedDetailV1(value: unknown): value is StandingGoalPausedDetailV1 {
  return typeof value === 'string' && (STANDING_GOAL_PAUSED_DETAILS_V1 as readonly string[]).includes(value);
}

/** 和 `agent-pass.ts` 的 Pass id 同一个形状：`pass_` + 32 位小写十六进制。 */
export const STANDING_GOAL_PASS_ID_PATTERN_V1 = /^pass_[0-9a-f]{32}$/;

/** 目标暂时没往前走（不是停下来问主人）：急停拉着、今天的步数用完。 */
export const STANDING_GOAL_HOLD_REASONS_V1 = ['emergency_stopped', 'daily_limit'] as const;
export type StandingGoalHoldReasonV1 = (typeof STANDING_GOAL_HOLD_REASONS_V1)[number];

export const STANDING_GOAL_STEP_STATUSES_V1 = ['running', 'succeeded', 'needs_owner', 'failed'] as const;
export type StandingGoalStepStatusV1 = (typeof STANDING_GOAL_STEP_STATUSES_V1)[number];

export const STANDING_GOAL_STEP_REASONS_V1 = [
  'ok',
  'goal_done',
  'boundary_exceeded',
  'budget_denied',
  'budget_approval_required',
  'budget_unavailable',
  'owner_question',
  'agent_unavailable',
  'execution_failed',
] as const;
export type StandingGoalStepReasonV1 = (typeof STANDING_GOAL_STEP_REASONS_V1)[number];

export const STANDING_GOAL_ERROR_CODES_V1 = {
  notFound: 'STANDING_GOAL_NOT_FOUND',
  signInRequired: 'STANDING_GOAL_SIGN_IN_REQUIRED',
  invalid: 'STANDING_GOAL_INVALID',
  limitReached: 'STANDING_GOAL_LIMIT_REACHED',
  /** 409：急停拉着，先解除（要最近登录）。 */
  stopped: 'STANDING_GOAL_EMERGENCY_STOPPED',
  /** 409：继续一个绑了 Pass 的目标，但这张 Pass 已撤销、过期或找不到；目标不动，带 `detail`、`message`、`messageZh`。 */
  passInvalid: 'STANDING_GOAL_PASS_INVALID',
} as const;

/**
 * 「后台目标」一块的三句说明（L8-8 UI-3、L7），三端同一套。第一句是评审 M5 的取舍（`readsOutsideContent`）；第二句在扣实际用量
 * 以后才成立（读不到用量时按预占的数扣，所以不会少扣）；第三句是 coord 选的显式绑定（只停用这张 Pass 的目标）。
 */
export const STANDING_GOAL_NOTES_V1 = {
  zh: [
    '带外部内容工具（比如联网搜索）的目标，看不到自己上一轮的进度摘要，免得网页里的指令被带进下一轮。',
    '每天的预算是上限，按实际用量扣。',
    '在通行证页撤销，只会停掉用这张通行证的目标。',
  ],
  en: [
    'A goal with tools that bring in outside content (web search, for example) does not see its own progress note from the step before, so instructions on a web page cannot carry over into the next step.',
    'The daily budget is a cap. Each step is charged what it actually used.',
    'Revoking a pass on the passes page only stops the goals that use that pass.',
  ],
} as const;

/** 继续被拒时说清楚为什么、怎么办：Pass 撤销或过期以后不会再变回有效，只能结束这个目标，用有效的 Pass 新建。 */
export function standingGoalPassInvalidTextV1(detail: StandingGoalPausedDetailV1, locale: 'zh' | 'en'): string {
  const zh = { pass_revoked: '已经撤销了', pass_expired: '已经过期了', pass_missing: '找不到了' } as const;
  const en = { pass_revoked: 'has been revoked', pass_expired: 'has expired', pass_missing: 'can no longer be found' } as const;
  return locale === 'zh'
    ? `这个目标用的通行证${zh[detail]}，所以不能继续。可以结束这个目标，再用一张有效的通行证新建。`
    : `The pass this goal uses ${en[detail]}, so it cannot continue. End this goal and create it again with a valid pass.`;
}

/** 急停还拉着时新建目标回 409 `stopped`：说清楚原因和怎么解除。 */
export function standingGoalStoppedTextV1(locale: 'zh' | 'en'): string {
  return locale === 'zh'
    ? '你的紧急停止还没解除，所以暂时不能新建后台目标。请先在「后台目标」里恢复（需要最近登录）或结束被急停暂停的目标，设备上的急停也要先解除，然后再新建。'
    : 'Your emergency stop is still on, so a new standing goal cannot start yet. Resume (needs a recent sign-in) or end the goals the emergency stop paused, and release the stop on your devices, then create the goal again.';
}

/** 主人写的自主边界。 */
export interface StandingGoalBoundaryV1 {
  /** 级别上限，只能是 look / suggest / prepare；真正生效的是它和 Agent 当前信任级别里更紧的那个。 */
  maxLevel: Exclude<TrustLadderLevelV0, 'commit'>;
  /** 后台步骤只能用这些工具；空数组 = 只回答、不调工具。 */
  tools: string[];
  /** 每步最多花的平台额度（美分）：先按它预占，跑完按实际用量扣，不会多于它。 */
  stepCostCents: number;
  /** false：出网类工具不进白名单。 */
  allowOutbound: boolean;
  intervalMinutes: number;
  maxSteps: number;
}

export interface StandingGoalInputV1 {
  agentAccountId: string;
  title: string;
  instruction: string;
  boundary: StandingGoalBoundaryV1;
  /**
   * 可选（L8-8 L7）：这个目标依赖的 Pass。必须是本人的、同一只 Agent 的、现在有效的，否则 400 `field: 'passId'`。
   * 绑了以后每一步前都读一次，撤销、过期、找不到就不跑、进已暂停。不绑就照旧，只靠目标自带的边界。
   */
  passId?: string;
}

export interface StandingGoalStepViewV1 {
  stepRef: string;
  stepNo: number;
  status: StandingGoalStepStatusV1;
  reason: StandingGoalStepReasonV1;
  /** 截断的进度摘要，不放原文全文。 */
  summary: string | null;
  spentCents: number;
  /** 这一步因为锁定、边界或级别去掉过工具（出网类，或超出级别 / 不在后台白名单里的）。 */
  restricted: boolean;
  /** 已经写进 A3 账本。 */
  ledgerRecorded: boolean;
  startedAt: string;
  finishedAt: string | null;
}

export interface StandingGoalViewV1 {
  goalRef: string;
  agentAccountId: string;
  title: string;
  instruction: string;
  boundary: StandingGoalBoundaryV1;
  status: StandingGoalStatusV1;
  needs: StandingGoalNeedV1 | null;
  pausedReason: StandingGoalPausedReasonV1 | null;
  /** 加法（L8-8 L7）：目标绑的 Pass；没绑或旧服务端没给是 null。 */
  passId?: string | null;
  /** 加法（L8-8 L7）：只在 `paused` 且是因为绑的 Pass 停下时有值。 */
  pausedDetail?: StandingGoalPausedDetailV1 | null;
  holdReason: StandingGoalHoldReasonV1 | null;
  stepsDone: number;
  lastSummary: string | null;
  lastStepAt: string | null;
  nextStepAt: string | null;
  createdAt: string;
  updatedAt: string;
  recentSteps: StandingGoalStepViewV1[];
}

export interface StandingGoalListV1 {
  items: StandingGoalViewV1[];
}

// ── 判断（服务端和测试共用） ─────────────────────────────────────────────────────────

const LEVEL_RANK: Readonly<Record<TrustLadderLevelV0, number>> = { look: 0, suggest: 1, prepare: 2, commit: 3 };

/** 边界上限、Agent 当前级别、后台天花板，三者取最紧的。 */
export function effectiveStandingGoalLevelV1(boundaryMax: TrustLadderLevelV0, agentLevel: TrustLadderLevelV0): TrustLadderLevelV0 {
  let level: TrustLadderLevelV0 = STANDING_GOAL_LEVEL_CEILING_V1;
  for (const candidate of [boundaryMax, agentLevel]) {
    if (!(TRUST_LADDER_LEVELS_V0 as readonly string[]).includes(candidate)) return 'look';
    if (LEVEL_RANK[candidate] < LEVEL_RANK[level]) level = candidate;
  }
  return level;
}

/**
 * 后台任务能用的工具，显式白名单（agent 线评审 M2）：信任阶梯里的读类工具，加上确定没有花钱 / 远程执行副作用的备稿工具 `save_memory`。
 * 阶梯的 `draft` 类里还有 `skill_install`、`video_generate`、`desktop_write_file`、`desktop_git_*`、`agent_coordinate`、
 * `auto_repair_*`：这些会装第三方技能、花平台额度、动本机文件或拉远端，没人在场时不放进后台。不在这张表里的工具，
 * 创建时拒收，已存的边界里有也不会交给运行时。新增一项要同时过后端的 `standing-goal-background-tools` 单测（只许读类或 `save_memory`）。
 */
export const STANDING_GOAL_BACKGROUND_TOOLS_V1: readonly string[] = [
  'skill_search',
  'skill_recommend',
  'search_products',
  'resource_search',
  'get_balance',
  'agent_discover',
  'asset_overview',
  'airdrop_discover',
  'web_search',
  'web_fetch',
  'open_url',
  'task_search',
  'echo',
  'search_opportunities',
  'tool_policy_report',
  'code_index_workspace',
  'code_search_symbols',
  'code_semantic_search',
  'code_references',
  'code_call_graph',
  'auto_repair_analyze',
  'btc_predict_my_status',
  'desktop_read_file',
  'desktop_list_directory',
  'desktop_git_status',
  'desktop_git_diff',
  'desktop_git_log',
  'computer_use_screenshot',
  'computer_use_window_tree',
  'computer_use_browser_list_tabs',
  'agent_mail_inbox',
  'agent_mail_read',
  'save_memory',
];

export function isStandingGoalBackgroundToolV1(tool: unknown): boolean {
  return typeof tool === 'string' && STANDING_GOAL_BACKGROUND_TOOLS_V1.includes(tool);
}

export interface StandingGoalToolPlanV1 {
  /** 这一步可以用的工具。 */
  allowed: string[];
  /** 级别不够、是 commit 类、或不在后台白名单里：要主人在对话里做，或者提高级别。 */
  beyondLevel: string[];
  /** 出网类，被边界或锁定拿掉。 */
  withheldEgress: string[];
}

/**
 * 这一步的工具白名单。`classify` 是信任阶梯对工具的分类，`isEgress` 是锁定的出网判断，都由服务端传进来。
 * `commit` 类永远在 `beyondLevel`；`locked` 为 true 时出网类一律不进白名单。
 */
export function standingGoalToolPlanV1(input: {
  tools: readonly string[];
  level: TrustLadderLevelV0;
  locked: boolean;
  allowOutbound: boolean;
  classify: (tool: string) => TrustLadderToolClassV0;
  isEgress: (tool: string) => boolean;
}): StandingGoalToolPlanV1 {
  const plan: StandingGoalToolPlanV1 = { allowed: [], beyondLevel: [], withheldEgress: [] };
  for (const tool of input.tools) {
    const toolClass = input.classify(tool);
    if (!isStandingGoalBackgroundToolV1(tool) || toolClass === 'commit' || trustLadderDecisionV0(input.level, toolClass) !== 'allow') {
      plan.beyondLevel.push(tool);
      continue;
    }
    if (input.isEgress(tool) && (input.locked || !input.allowOutbound)) {
      plan.withheldEgress.push(tool);
      continue;
    }
    plan.allowed.push(tool);
  }
  return plan;
}

/** 模型回复里的约定：`DONE:` 目标完成，`NEEDS_OWNER:` 需要主人；其他都是进度。 */
export type StandingGoalReplyV1 = { kind: 'done' | 'needs_owner' | 'progress'; summary: string };

export function parseStandingGoalReplyV1(reply: unknown): StandingGoalReplyV1 {
  const text = typeof reply === 'string' ? reply.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : '';
  const cut = (value: string): string => value.trim().slice(0, STANDING_GOAL_LIMITS_V1.summaryMax);
  if (text.startsWith('NEEDS_OWNER:')) return { kind: 'needs_owner', summary: cut(text.slice('NEEDS_OWNER:'.length)) };
  if (text.startsWith('DONE:')) return { kind: 'done', summary: cut(text.slice('DONE:'.length)) };
  return { kind: 'progress', summary: cut(text) };
}

// ── 解码 ───────────────────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOOL_NAME = /^[a-z][a-z0-9_]{1,63}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
export const STANDING_GOAL_REF_PATTERN_V1 = /^sgl_[0-9a-f]{32}$/;
export const STANDING_GOAL_STEP_REF_PATTERN_V1 = /^sgs_[0-9a-f]{32}$/;

export type StandingGoalDecodeResultV1<T> = { ok: true; value: T } | { ok: false; field: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isIso(value: unknown): value is string {
  return typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value));
}
function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}
function intIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}
function plainText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

const BOUNDARY_KEYS = ['maxLevel', 'tools', 'stepCostCents', 'allowOutbound', 'intervalMinutes', 'maxSteps'] as const;

export function decodeStandingGoalBoundaryV1(value: unknown): StandingGoalDecodeResultV1<StandingGoalBoundaryV1> {
  if (!isRecord(value)) return { ok: false, field: 'boundary' };
  for (const key of Object.keys(value)) if (!(BOUNDARY_KEYS as readonly string[]).includes(key)) return { ok: false, field: `boundary.${key}` };
  const L = STANDING_GOAL_LIMITS_V1;
  if (!oneOf(['look', 'suggest', 'prepare'] as const, value.maxLevel)) return { ok: false, field: 'boundary.maxLevel' };
  const tools = value.tools;
  if (!Array.isArray(tools) || tools.length > L.toolsMax || !tools.every((t) => typeof t === 'string' && TOOL_NAME.test(t)) || new Set(tools).size !== tools.length) {
    return { ok: false, field: 'boundary.tools' };
  }
  if (!intIn(value.stepCostCents, L.stepCostCentsMin, L.stepCostCentsMax)) return { ok: false, field: 'boundary.stepCostCents' };
  if (typeof value.allowOutbound !== 'boolean') return { ok: false, field: 'boundary.allowOutbound' };
  if (!intIn(value.intervalMinutes, L.intervalMinutesMin, L.intervalMinutesMax)) return { ok: false, field: 'boundary.intervalMinutes' };
  if (!intIn(value.maxSteps, L.maxStepsMin, L.maxStepsMax)) return { ok: false, field: 'boundary.maxSteps' };
  return {
    ok: true,
    value: {
      maxLevel: value.maxLevel,
      tools: [...(tools as string[])],
      stepCostCents: value.stepCostCents,
      allowOutbound: value.allowOutbound,
      intervalMinutes: value.intervalMinutes,
      maxSteps: value.maxSteps,
    },
  };
}

/** 建目标的请求体。未知字段整条拒收；属主不在里面，取自登录。 */
export function decodeStandingGoalInputV1(value: unknown): StandingGoalDecodeResultV1<StandingGoalInputV1> {
  if (!isRecord(value)) return { ok: false, field: '$' };
  for (const key of Object.keys(value)) if (!['agentAccountId', 'title', 'instruction', 'boundary', 'passId'].includes(key)) return { ok: false, field: key };
  if (typeof value.agentAccountId !== 'string' || !UUID.test(value.agentAccountId)) return { ok: false, field: 'agentAccountId' };
  if (!plainText(value.title, STANDING_GOAL_LIMITS_V1.titleMax)) return { ok: false, field: 'title' };
  if (!plainText(value.instruction, STANDING_GOAL_LIMITS_V1.instructionMax)) return { ok: false, field: 'instruction' };
  const boundary = decodeStandingGoalBoundaryV1(value.boundary);
  if (boundary.ok === false) return boundary;
  // L8-8 L7: optional; absent or null is a goal that does not depend on a Pass.
  const passId = value.passId;
  if (passId !== undefined && passId !== null && (typeof passId !== 'string' || !STANDING_GOAL_PASS_ID_PATTERN_V1.test(passId))) {
    return { ok: false, field: 'passId' };
  }
  return {
    ok: true,
    value: {
      agentAccountId: value.agentAccountId,
      title: value.title.trim(),
      instruction: value.instruction.trim(),
      boundary: boundary.value,
      ...(typeof passId === 'string' ? { passId } : {}),
    },
  };
}

function decodeStepV1(value: unknown): StandingGoalStepViewV1 | null {
  if (!isRecord(value)) return null;
  if (typeof value.stepRef !== 'string' || !STANDING_GOAL_STEP_REF_PATTERN_V1.test(value.stepRef)) return null;
  if (!intIn(value.stepNo, 1, STANDING_GOAL_LIMITS_V1.maxStepsMax)) return null;
  if (!oneOf(STANDING_GOAL_STEP_STATUSES_V1, value.status) || !oneOf(STANDING_GOAL_STEP_REASONS_V1, value.reason)) return null;
  const summary = value.summary;
  if (summary !== null && (typeof summary !== 'string' || summary.length > STANDING_GOAL_LIMITS_V1.summaryMax)) return null;
  if (!intIn(value.spentCents, 0, STANDING_GOAL_LIMITS_V1.stepCostCentsMax)) return null;
  if (typeof value.restricted !== 'boolean' || typeof value.ledgerRecorded !== 'boolean') return null;
  if (!isIso(value.startedAt) || (value.finishedAt !== null && !isIso(value.finishedAt))) return null;
  return {
    stepRef: value.stepRef,
    stepNo: value.stepNo,
    status: value.status,
    reason: value.reason,
    summary: summary as string | null,
    spentCents: value.spentCents,
    restricted: value.restricted,
    ledgerRecorded: value.ledgerRecorded,
    startedAt: value.startedAt,
    finishedAt: value.finishedAt as string | null,
  };
}

/** 三端用：读一个目标。任何一项不对返回 null。 */
export function decodeStandingGoalViewV1(value: unknown): StandingGoalViewV1 | null {
  if (!isRecord(value)) return null;
  if (typeof value.goalRef !== 'string' || !STANDING_GOAL_REF_PATTERN_V1.test(value.goalRef)) return null;
  if (typeof value.agentAccountId !== 'string' || !UUID.test(value.agentAccountId)) return null;
  if (!plainText(value.title, STANDING_GOAL_LIMITS_V1.titleMax) || !plainText(value.instruction, STANDING_GOAL_LIMITS_V1.instructionMax)) return null;
  const boundary = decodeStandingGoalBoundaryV1(value.boundary);
  if (boundary.ok === false) return null;
  if (!oneOf(STANDING_GOAL_STATUSES_V1, value.status)) return null;
  const needs = value.needs;
  if (value.status === 'needs_owner' ? !oneOf(STANDING_GOAL_NEEDS_V1, needs) : needs !== null) return null;
  const paused = value.pausedReason;
  if (value.status === 'paused' ? !oneOf(STANDING_GOAL_PAUSED_REASONS_V1, paused) : paused !== null) return null;
  // L8-8 L7, additive: an older server sends neither field (read as null).
  const passId = value.passId ?? null;
  if (passId !== null && (typeof passId !== 'string' || !STANDING_GOAL_PASS_ID_PATTERN_V1.test(passId))) return null;
  const detail = value.pausedDetail ?? null;
  if (detail !== null && (value.status !== 'paused' || !isStandingGoalPausedDetailV1(detail))) return null;
  const hold = value.holdReason;
  if (hold !== null && !oneOf(STANDING_GOAL_HOLD_REASONS_V1, hold)) return null;
  if (!intIn(value.stepsDone, 0, STANDING_GOAL_LIMITS_V1.maxStepsMax)) return null;
  const last = value.lastSummary;
  if (last !== null && (typeof last !== 'string' || last.length > STANDING_GOAL_LIMITS_V1.summaryMax)) return null;
  for (const key of ['lastStepAt', 'nextStepAt'] as const) if (value[key] !== null && !isIso(value[key])) return null;
  if (!isIso(value.createdAt) || !isIso(value.updatedAt)) return null;
  if (!Array.isArray(value.recentSteps) || value.recentSteps.length > 20) return null;
  const recentSteps: StandingGoalStepViewV1[] = [];
  for (const raw of value.recentSteps) {
    const step = decodeStepV1(raw);
    if (!step) return null;
    recentSteps.push(step);
  }
  return {
    goalRef: value.goalRef,
    agentAccountId: value.agentAccountId,
    title: value.title.trim(),
    instruction: value.instruction.trim(),
    boundary: boundary.value,
    status: value.status,
    needs: needs as StandingGoalNeedV1 | null,
    pausedReason: paused as StandingGoalPausedReasonV1 | null,
    passId: passId as string | null,
    pausedDetail: detail as StandingGoalPausedDetailV1 | null,
    holdReason: hold as StandingGoalHoldReasonV1 | null,
    stepsDone: value.stepsDone,
    lastSummary: last as string | null,
    lastStepAt: value.lastStepAt as string | null,
    nextStepAt: value.nextStepAt as string | null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    recentSteps,
  };
}

/** 列表：解不开的单条丢掉，其余照服务端的顺序；整体不对返回 null。 */
export function decodeStandingGoalListV1(value: unknown): StandingGoalListV1 | null {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > 100) return null;
  const items: StandingGoalViewV1[] = [];
  for (const raw of value.items) {
    const view = decodeStandingGoalViewV1(raw);
    if (view) items.push(view);
  }
  return { items };
}

/** 卡片按钮：进行中和等主人的能暂停；暂停和等主人的能继续；没结束的都能结束。 */
export function standingGoalActionsV1(view: Pick<StandingGoalViewV1, 'status'>): { pause: boolean; resume: boolean; end: boolean } {
  return {
    pause: view.status === 'active' || view.status === 'needs_owner',
    resume: view.status === 'paused' || view.status === 'needs_owner',
    end: view.status !== 'ended' && view.status !== 'done',
  };
}

const NEEDS_TEXT = {
  zh: {
    trust_level: '需要你提高这只 Agent 的信任级别，或者去掉超出级别的工具',
    budget: '平台额度预算不够，这一步没有执行',
    budget_approval: '这一步的花费需要你批准，调高「免批准额度」后可以继续',
    agent_unavailable: '这只 Agent 现在不可用',
    owner_question: 'Agent 有一件事要问你',
  },
  en: {
    trust_level: 'Raise this Agent’s trust level, or remove the tools above it',
    budget: 'The platform credit budget is too low, so this step did not run',
    budget_approval: 'This step’s cost needs your approval; raise the free-approval amount to continue',
    agent_unavailable: 'This Agent is not available right now',
    owner_question: 'The Agent has a question for you',
  },
} as const;

/** 绑的 Pass 让目标停下时，三端显示的那半句（L8-8 L7）。 */
const PAUSED_DETAIL_TEXT = {
  zh: {
    pass_revoked: '这个目标用的通行证被撤销了，已暂停',
    pass_expired: '这个目标用的通行证过期了，已暂停',
    pass_missing: '这个目标用的通行证找不到了，已暂停',
  },
  en: {
    pass_revoked: 'The pass this goal uses was revoked, so it is paused',
    pass_expired: 'The pass this goal uses has expired, so it is paused',
    pass_missing: 'The pass this goal uses can no longer be found, so it is paused',
  },
} as const;

/** 三端同一句话：目标现在是什么状态、走了几步。 */
export function describeStandingGoalV1(
  view: Pick<StandingGoalViewV1, 'status' | 'needs' | 'pausedReason' | 'pausedDetail' | 'holdReason' | 'stepsDone' | 'boundary'>,
  locale: 'zh' | 'en',
): string {
  const zh = locale === 'zh';
  const progress = zh ? `已推进 ${view.stepsDone} / ${view.boundary.maxSteps} 步` : `${view.stepsDone} of ${view.boundary.maxSteps} steps`;
  let head: string;
  switch (view.status) {
    case 'active':
      head = view.holdReason === 'emergency_stopped'
        ? zh ? '急停拉着，暂不推进' : 'Emergency stop is on, holding'
        : view.holdReason === 'daily_limit'
          ? zh ? '今天的步数用完了，明天继续' : 'Daily step limit reached, continuing tomorrow'
          : zh ? '进行中' : 'In progress';
      break;
    case 'needs_owner':
      head = view.needs ? NEEDS_TEXT[locale][view.needs] : zh ? '等你' : 'Waiting for you';
      break;
    case 'paused':
      head = isStandingGoalPausedDetailV1(view.pausedDetail)
        ? PAUSED_DETAIL_TEXT[locale][view.pausedDetail]
        : view.pausedReason === 'emergency_stop' ? (zh ? '急停已暂停' : 'Paused by emergency stop') : zh ? '已暂停' : 'Paused';
      break;
    case 'done':
      head = zh ? '已完成' : 'Done';
      break;
    default:
      head = zh ? '已结束' : 'Ended';
  }
  return `${head} · ${progress}`;
}
