/**
 * 订单与托管（合同 v0 草案，CONTRACTS.md "订单与托管"；R5、DT-G3、产品文档 K3 / D5 / W4；PLAN 第 4 节 T7）。
 *
 * v0 只覆盖分身接单的第一步：付费问答（`paid_question`）和咨询定金（`consultation_deposit`）。
 * 买方是访客或用户，卖方是主人（经他的分身 Agent 接单）。以后加交付类服务时在 `ORDER_KINDS` 里加成员。
 *
 * 规则：
 * - 价格只来自服务端：下单请求只带 `offerRef`（主人确认过的服务目录条目）和买方填写的内容，金额、币种、
 *   平台费都由服务端按目录算出并写进订单。客户端传来的金额一律忽略。
 * - 代收款要有代表授权：分身接单前按 `representation-mandate.ts` 检查 `paid_answer` / `deposit` 和
 *   `collectionCeiling`；不覆盖就不能下单。
 * - 托管：钱先由平台收下并"托管"（`escrow.state = 'held'`），买方验收（或验收期满自动验收）后才放款给卖方；
 *   放款之前随时可以全额退款。具体用哪种通道（Stripe 平台收款 + 之后转账给新加坡 Connect 卖家，或别的）
 *   由实现决定，合同只定状态。真钱开关默认关（E48），先跑 Stripe 测试模式。
 * - 交付前必须本人看过：卖方提交交付时要 `ownerReviewed: true`，而且这一步只能由主人本人（不是分身、
 *   不是 Agent token）完成。
 * - 状态以后端为准，每次变化都有一条 `OrderEventV1`；支付或退款结果不确定时进入 `unknown` 等对账，
 *   不猜、不重放。
 * - 金额用 `Money`（`trust-loop-primitives.ts`：`amountMinor` 十进制字符串 + `currency` + `decimals`）。
 */
import type { Money } from './trust-loop-primitives';

export const ORDER_ESCROW_SCHEMA_VERSION = 'agentrix.order.v0' as const;

export const ORDER_KINDS = ['paid_question', 'consultation_deposit'] as const;
export type OrderKindV1 = (typeof ORDER_KINDS)[number];

export const ORDER_STATUSES = [
  'awaiting_payment', // 已下单，等买方付款（有付款期限）
  'paid', // 钱已托管，等卖方处理
  'delivered', // 卖方已交付（本人看过），等买方验收
  'accepted', // 买方验收，或验收期满自动验收；等放款
  'settled', // 已放款给卖方
  'cancelled', // 付款前取消，或付款期限到了
  'refund_pending',
  'refunded',
  'disputed', // 买方在验收期内发起争议，平台处理中
  'unknown', // 支付 / 退款 / 放款结果不确定，等对账
] as const;
export type OrderStatusV1 = (typeof ORDER_STATUSES)[number];

export const ESCROW_STATES = ['not_funded', 'funding_pending', 'held', 'release_pending', 'released', 'refund_pending', 'refunded', 'unknown'] as const;
export type EscrowStateV1 = (typeof ESCROW_STATES)[number];

export const ORDER_ACTORS = ['buyer', 'seller_owner', 'platform', 'system'] as const;
export type OrderActorV1 = (typeof ORDER_ACTORS)[number];

export const ORDER_ACTIONS = [
  'pay', // buyer
  'cancel', // buyer / seller_owner，付款前
  'deliver', // seller_owner，要 ownerReviewed
  'accept', // buyer
  'auto_accept', // system，验收期满
  'refund', // seller_owner（放款前随时全额退款），platform（争议裁决）
  'open_dispute', // buyer，验收期内
  'resolve_dispute', // platform
  'settle', // system，放款
  'expire', // system，付款期限到
  'reconcile', // system，从 unknown 回到确定状态
] as const;
export type OrderActionV1 = (typeof ORDER_ACTIONS)[number];

export interface OrderPartiesV1 {
  /** 买方：登录用户 id，或者访客会话引用（不透明）。卖方永远看不到买方的账号 id，只看到显示名或匿名。 */
  buyerRef: { kind: 'user'; userId: string } | { kind: 'visitor'; visitorRef: string };
  /** 卖方分身 Agent。买方看到的是分身名片，不是主人账号。 */
  sellerAgentId: string;
}

export interface OrderAmountsV1 {
  /** 买方要付的总额（服务端按目录定价）。 */
  total: Money;
  /** 平台费（从卖方所得里扣）。 */
  platformFee: Money;
  /** 支付通道手续费由谁承担，费率未定前如实写明。 */
  processingFeeBearer: 'seller' | 'platform' | 'undecided';
}

export interface OrderV1 {
  schemaVersion: typeof ORDER_ESCROW_SCHEMA_VERSION;
  orderId: string;
  kind: OrderKindV1;
  offerRef: string;
  parties: OrderPartiesV1;
  amounts: OrderAmountsV1;
  status: OrderStatusV1;
  escrow: { state: EscrowStateV1; heldAt?: string; releasedAt?: string; refundedAt?: string };
  /** 代收款时用的代表授权（Grant 引用），便于回执追溯。 */
  mandateRef: { grantRef: string; grantVersion: number };
  paymentDeadline?: string;
  /** 交付后多久自动验收（秒）。 */
  acceptanceWindowSeconds: number;
  deliveredAt?: string;
  acceptedAt?: string;
  /** 真钱还是测试模式。测试模式的订单永远不会放款到真实账户。 */
  environment: 'test' | 'live';
  createdAt: string;
  updatedAt: string;
  /** 乐观并发：每次变化 +1。写操作带 `expectedVersion`，不一致返回 409。 */
  version: number;
}

export interface OrderEventV1 {
  schemaVersion: typeof ORDER_ESCROW_SCHEMA_VERSION;
  eventId: string;
  orderId: string;
  action: OrderActionV1;
  actor: OrderActorV1;
  fromStatus: OrderStatusV1;
  toStatus: OrderStatusV1;
  escrowState: EscrowStateV1;
  /** 退款金额等；没有金额的动作不带。 */
  amount?: Money;
  /** 支付通道的回执引用（不透明，不放通道的原始对象）。 */
  railReceiptRef?: string;
  idempotencyKey: string;
  at: string;
}

// 请求形状

/** `POST /api/orders`：只有目录引用和买方内容，不带金额。 */
export interface CreateOrderRequestV1 {
  offerRef: string;
  kind: OrderKindV1;
  /** 付费问答的问题，或定金的备注。服务端限长、做内容检查。 */
  buyerNote: string;
  idempotencyKey: string;
}

/** `POST /api/orders/:orderId/actions`。 */
export interface OrderActionRequestV1 {
  action: Exclude<OrderActionV1, 'auto_accept' | 'settle' | 'expire' | 'reconcile'>;
  expectedVersion: number;
  idempotencyKey: string;
  /** `deliver` 必填且为 true。 */
  ownerReviewed?: boolean;
  /** `deliver` 的交付物引用（附件、回答文本的存储引用）。 */
  deliveryRefs?: string[];
  /** `refund`：不带 = 全额。 */
  refundAmount?: Money;
  /** `open_dispute` / `refund` 的原因代码。 */
  reasonCode?: string;
}

// 状态机

interface TransitionRuleV1 {
  from: readonly OrderStatusV1[];
  to: OrderStatusV1;
  actors: readonly OrderActorV1[];
}

/** 每个动作允许从哪些状态、由谁发起、进入什么状态。`refund` 进入 `refund_pending`，通道确认后由 system 推进到 `refunded`。 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderActionV1, TransitionRuleV1>> = {
  pay: { from: ['awaiting_payment'], to: 'paid', actors: ['buyer'] },
  cancel: { from: ['awaiting_payment'], to: 'cancelled', actors: ['buyer', 'seller_owner'] },
  expire: { from: ['awaiting_payment'], to: 'cancelled', actors: ['system'] },
  deliver: { from: ['paid'], to: 'delivered', actors: ['seller_owner'] },
  accept: { from: ['delivered'], to: 'accepted', actors: ['buyer'] },
  auto_accept: { from: ['delivered'], to: 'accepted', actors: ['system'] },
  settle: { from: ['accepted'], to: 'settled', actors: ['system'] },
  refund: { from: ['paid', 'delivered', 'accepted', 'disputed'], to: 'refund_pending', actors: ['seller_owner', 'platform'] },
  open_dispute: { from: ['delivered'], to: 'disputed', actors: ['buyer'] },
  resolve_dispute: { from: ['disputed'], to: 'accepted', actors: ['platform'] },
  reconcile: { from: ['unknown'], to: 'unknown', actors: ['system'] },
};

export type OrderTransitionCheckV1 =
  | { ok: true; to: OrderStatusV1 }
  | { ok: false; reasonCode: 'action_not_allowed_in_status' | 'actor_not_allowed' | 'owner_review_required' };

/**
 * 判断一次动作。`resolve_dispute` 固定进入 `accepted`（判给卖方）；判给买方时平台用 `refund`。
 * `reconcile` 的目标状态由对账结果决定，这里只校验来源和发起方。
 */
export function checkOrderTransitionV1(input: {
  status: OrderStatusV1;
  action: OrderActionV1;
  actor: OrderActorV1;
  ownerReviewed?: boolean;
}): OrderTransitionCheckV1 {
  const rule = ORDER_TRANSITIONS[input.action];
  if (!rule.from.includes(input.status)) return { ok: false, reasonCode: 'action_not_allowed_in_status' };
  if (!rule.actors.includes(input.actor)) return { ok: false, reasonCode: 'actor_not_allowed' };
  if (input.action === 'deliver' && input.ownerReviewed !== true) return { ok: false, reasonCode: 'owner_review_required' };
  return { ok: true, to: rule.to };
}

/** 各端显示用：买方 / 卖方在当前状态能点哪些按钮。 */
export function availableOrderActionsV1(status: OrderStatusV1, actor: 'buyer' | 'seller_owner'): OrderActionV1[] {
  return (Object.keys(ORDER_TRANSITIONS) as OrderActionV1[]).filter((action) => {
    const rule = ORDER_TRANSITIONS[action];
    return rule.from.includes(status) && rule.actors.includes(actor);
  });
}

/** 终态：不会再变化（`unknown` 不是终态）。 */
export const ORDER_TERMINAL_STATUSES: readonly OrderStatusV1[] = ['settled', 'cancelled', 'refunded'];

/**
 * v0 待定项（发合同草案时一起请 coord / owner 定，定了再改成常量）：
 * 1. 默认付款期限和验收期（建议付款 30 分钟、付费问答验收 72 小时、定金验收 7 天）；
 * 2. 平台费率和通道手续费由谁承担（Stripe 评估：卡费约 3%，现行 1% + 4% 的服务费率要重算）；
 * 3. 支付通道：Stripe 平台收款 + Connect 新加坡卖家转账；新加坡以外的卖家暂不支持；
 * 4. 部分退款是否开放；争议的处理时限；
 * 5. 买方是访客时如何找回订单（邮箱验证或一次性链接）。
 */
export const ORDER_ESCROW_OPEN_QUESTIONS_V0 = 5 as const;
