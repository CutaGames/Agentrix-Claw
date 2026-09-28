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
 * - 交付前必须本人看过（REQ-backend-022.re-desktop）：主人在看过的界面上确认时，客户端对交付物算出
 *   `reviewedDeliveryDigest`（`orderDeliveryDigestV1`），服务端按实际要交付的内容重算，不一致就拒绝；看过之后
 *   交付物又被改了（例如分身补了一句），摘要就对不上。
 * - 主人侧的动作（交付、退款、付款前取消）只接受登录凭据（sign-in token），Agent token、MCP / OAuth 客户端
 *   token 都不行（`ownerSignInOnly`）。交付不需要 step-up：钱要等买方验收后才放。
 * - 状态以后端为准，每次变化都有一条 `OrderEventV1`；支付或退款结果不确定时进入 `unknown` 等对账，
 *   不猜、不重放。
 * - 金额用 `Money`（`trust-loop-primitives.ts`：`amountMinor` 十进制字符串 + `currency` + `decimals`）。
 * - 视图按调用方分开（REQ-backend-022.re-web）：卖方拿 `OrderSellerViewV1`（没有买方账号 id），买方拿
 *   `OrderBuyerViewV1`（没有主人账号和授权引用）。`OrderV1` 只在后端内部用。
 * - 付款：`pay` 返回 `PayOrderResponseV1`（Stripe 托管页地址，或给前端组件的 client secret）。订单只能由支付通道
 *   的回调变成 `paid`，客户端回跳不算；回跳地址里不带任何订单凭据。
 * - `unknown`：`pay` / `refund` / `settle` 在通道结果不确定时由 system 置为 `unknown`（`ORDER_UNKNOWN_SOURCES`）；
 *   `reconcile` 按对账结果进入 `ORDER_RECONCILE_TARGETS` 之一。`unknown` 时各端不给任何按钮，显示"结果确认中，
 *   不要重复付款"。
 * - 测试模式：`environment` 在每个视图里都必有；`test` 时各端都标"测试模式，不会真的扣款"。
 * - 访客找回订单（E52 ⑤）：下单时验证邮箱；找回时发邮箱一次性链接，30 分钟有效、只能用一次，只列出这个邮箱的
 *   订单，不需要注册账号。凭据放在 URL 的 `#` 后面（不进 Referer 和访问日志），页面读出后换成只能读这个邮箱订单的
 *   HttpOnly cookie（`ORDER_VISITOR_SESSION_TTL_SECONDS`）。
 * - 期限（E52 ①）：默认值见 `ORDER_DEFAULT_WINDOWS_SECONDS`，服务端可配置，订单里记下当时生效的值。
 * - 费用（E52 ②）：费率和卡手续费由谁承担等 owner 定（OA-50）；合同不写死费率，费用明细由服务端算出并随订单
 *   返回（`OrderAmountsV1`）。测试模式用现行 1% + 4% 作占位。
 * - 通道（E52 ③）：v0 为 Stripe 平台收款，放款时转给新加坡的 Connect 卖家；卖家不在新加坡时下单直接拒绝
 *   （`seller_region_unsupported`）。以 OA-13 的法务结论为准。
 * - 退款与争议（E52 ④）：v0 只做全额退款；争议只能在验收期内发起，平台 `ORDER_DISPUTE_DECISION_SECONDS` 内裁决，
 *   逾期未裁决由 system 按退款给买方处理（`dispute_timeout`），并通知主人。
 */
import { canonicalizeJson, sha256Hex, utf8Encode, type Money } from './trust-loop-primitives';

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
  'dispute_timeout', // system，争议逾期未裁决，退款给买方
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

/** 卖方视图：买方只有显示名或匿名。 */
export interface OrderSellerViewV1 extends Omit<OrderV1, 'parties'> {
  buyer: { displayName: string | null; kind: 'user' | 'visitor' };
  sellerAgentId: string;
}

/** 买方视图：看不到主人账号、授权引用和平台内部的费用拆分之外的东西。 */
export interface OrderBuyerViewV1 extends Omit<OrderV1, 'parties' | 'mandateRef' | 'amounts'> {
  seller: { agentId: string; displayName: string };
  total: OrderAmountsV1['total'];
}

/** `pay` 的响应。`url` 只能是 Stripe 的托管页（`STRIPE_HOSTED_ORIGINS`）。 */
export type PayOrderResponseV1 =
  | { kind: 'redirect'; url: string; returnPath: string }
  | { kind: 'client_secret'; clientSecret: string; returnPath: string };

export const STRIPE_HOSTED_ORIGINS = ['https://checkout.stripe.com'] as const;

export function isAllowedPaymentRedirectV1(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (STRIPE_HOSTED_ORIGINS as readonly string[]).includes(parsed.origin) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

/** 这些动作的通道结果不确定时，由 system 把订单置为 `unknown`。 */
export const ORDER_UNKNOWN_SOURCES: readonly OrderActionV1[] = ['pay', 'refund', 'settle'];
/** `reconcile` 可以进入的状态（按对账结果）。 */
export const ORDER_RECONCILE_TARGETS: readonly OrderStatusV1[] = ['awaiting_payment', 'paid', 'accepted', 'settled', 'refunded', 'cancelled'];

/** E52 ①：默认期限（服务端可配置）。 */
export const ORDER_DEFAULT_WINDOWS_SECONDS = {
  payment: 30 * 60,
  acceptance: { paid_question: 72 * 60 * 60, consultation_deposit: 7 * 24 * 60 * 60 },
} as const;
/** E52 ④：平台裁决争议的时限。 */
export const ORDER_DISPUTE_DECISION_SECONDS = 7 * 24 * 60 * 60;
/** E52 ⑤：访客找回订单的一次性链接有效期（只能用一次）。 */
export const ORDER_VISITOR_LINK_TTL_SECONDS = 30 * 60;
/** 链接换来的只读 cookie 的有效期（建议值，服务端可配置）。 */
export const ORDER_VISITOR_SESSION_TTL_SECONDS = 24 * 60 * 60;

/** 下单被拒的原因（服务端返回 `code`）。 */
export const ORDER_CREATE_REFUSAL_CODES = [
  'offer_not_found',
  'offer_not_published',
  'mandate_not_granted', // 访客看到的是"需要本人处理"，细因只给主人
  'seller_region_unsupported', // E52 ③
  'buyer_email_unverified', // 访客下单要先验证邮箱
  'real_money_disabled', // 真钱开关关着时只能下测试模式的单
] as const;
export type OrderCreateRefusalCodeV1 = (typeof ORDER_CREATE_REFUSAL_CODES)[number];

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
  action: Exclude<OrderActionV1, 'auto_accept' | 'settle' | 'expire' | 'reconcile' | 'dispute_timeout'>;
  expectedVersion: number;
  idempotencyKey: string;
  /** `deliver` 必填：主人看过的交付物的摘要（`orderDeliveryDigestV1`）。 */
  reviewedDeliveryDigest?: string;
  /** `deliver` 的交付物引用（附件的存储引用）。 */
  deliveryRefs?: string[];
  /** `deliver`：付费问答的回答正文。 */
  answerText?: string;

  /** `open_dispute` / `refund` 的原因代码。 */
  reasonCode?: string;
}

// 状态机

interface TransitionRuleV1 {
  from: readonly OrderStatusV1[];
  to: OrderStatusV1;
  actors: readonly OrderActorV1[];
  /** 主人发起时只接受登录凭据。 */
  ownerSignInOnly?: true;
}

/** 每个动作允许从哪些状态、由谁发起、进入什么状态。`refund` 进入 `refund_pending`，通道确认后由 system 推进到 `refunded`。 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderActionV1, TransitionRuleV1>> = {
  pay: { from: ['awaiting_payment'], to: 'paid', actors: ['buyer'] },
  cancel: { from: ['awaiting_payment'], to: 'cancelled', actors: ['buyer', 'seller_owner'], ownerSignInOnly: true },
  expire: { from: ['awaiting_payment'], to: 'cancelled', actors: ['system'] },
  deliver: { from: ['paid'], to: 'delivered', actors: ['seller_owner'], ownerSignInOnly: true },
  accept: { from: ['delivered'], to: 'accepted', actors: ['buyer'] },
  auto_accept: { from: ['delivered'], to: 'accepted', actors: ['system'] },
  settle: { from: ['accepted'], to: 'settled', actors: ['system'] },
  refund: { from: ['paid', 'delivered', 'accepted', 'disputed'], to: 'refund_pending', actors: ['seller_owner', 'platform'], ownerSignInOnly: true },
  open_dispute: { from: ['delivered'], to: 'disputed', actors: ['buyer'] },
  resolve_dispute: { from: ['disputed'], to: 'accepted', actors: ['platform'] },
  dispute_timeout: { from: ['disputed'], to: 'refund_pending', actors: ['system'] },
  // 目标状态由对账决定，只能是 ORDER_RECONCILE_TARGETS 之一；这里的 `to` 只是占位。
  reconcile: { from: ['unknown'], to: 'unknown', actors: ['system'] },
};

export type OrderTransitionCheckV1 =
  | { ok: true; to: OrderStatusV1 }
  | {
      ok: false;
      reasonCode: 'action_not_allowed_in_status' | 'actor_not_allowed' | 'sign_in_required' | 'owner_review_required' | 'delivery_digest_mismatch';
    };

/** 交付物摘要：`sha256:` + sha256(域串 + "\n" + 规范 JSON)。引用按字典序排序，回答正文原样。 */
export const ORDER_DELIVERY_DIGEST_DOMAIN_V1 = 'AGENTRIX_ORDER_DELIVERY_V1' as const;
export function orderDeliveryDigestV1(input: { orderId: string; deliveryRefs: readonly string[]; answerText: string | null }): string {
  const canonical = canonicalizeJson({
    v: ORDER_ESCROW_SCHEMA_VERSION,
    orderId: input.orderId,
    deliveryRefs: [...input.deliveryRefs].sort(),
    answerText: input.answerText,
  });
  return `sha256:${sha256Hex(utf8Encode(`${ORDER_DELIVERY_DIGEST_DOMAIN_V1}\n${canonical}`))}`;
}

/**
 * 判断一次动作。`resolve_dispute` 固定进入 `accepted`（判给卖方）；判给买方时平台用 `refund`。
 * `reconcile` 的目标状态由对账结果决定，这里只校验来源和发起方。
 */
export function checkOrderTransitionV1(input: {
  status: OrderStatusV1;
  action: OrderActionV1;
  actor: OrderActorV1;
  /** 这次请求用的凭据类型；主人侧动作只接受 `sign_in`。 */
  credential?: 'sign_in' | 'agent' | 'client';
  /** `deliver`：客户端提交的摘要和服务端按实际交付内容重算的摘要。 */
  reviewedDeliveryDigest?: string;
  expectedDeliveryDigest?: string;
}): OrderTransitionCheckV1 {
  const rule = ORDER_TRANSITIONS[input.action];
  if (!rule.from.includes(input.status)) return { ok: false, reasonCode: 'action_not_allowed_in_status' };
  if (!rule.actors.includes(input.actor)) return { ok: false, reasonCode: 'actor_not_allowed' };
  if (rule.ownerSignInOnly && input.actor === 'seller_owner' && input.credential !== 'sign_in') {
    return { ok: false, reasonCode: 'sign_in_required' };
  }
  if (input.action === 'deliver') {
    if (!input.reviewedDeliveryDigest) return { ok: false, reasonCode: 'owner_review_required' };
    if (!input.expectedDeliveryDigest || input.reviewedDeliveryDigest !== input.expectedDeliveryDigest) {
      return { ok: false, reasonCode: 'delivery_digest_mismatch' };
    }
  }
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

/** 仍待定：费率与卡手续费承担方（OA-50）；推送 `order_update` 落点"事项"，推送合同定稿时加。 */
export const ORDER_ESCROW_OPEN_QUESTIONS = ['platform_fee_rate_OA-50'] as const;
