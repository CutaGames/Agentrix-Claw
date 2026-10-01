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
 *   放款之前随时可以全额退款。具体用哪种通道（Stripe 平台收款 + 之后转账给卖家的 Connect 账户，或别的）
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
 * - 通道（E52 ③，v0.12 按 I-051 改）：v0 为 Stripe 平台收款，放款时转给卖家的 Connect 账户。卖家的 Connect
 *   账户必须和平台 Stripe 账户在同一个国家（Stripe 的跨境转账只在美、加、英、EEA、瑞士之间），否则真钱下单直接
 *   拒绝（`seller_region_unsupported`）。这个国家由服务端配置（`ORDER_PAYOUT_COUNTRY`），缺省取平台账户自己的
 *   国家；现在的平台账户在香港。用哪个主体以 OA-13 的结论为准。
 * - 退款与争议（E52 ④）：v0 只做全额退款；争议只能在验收期内发起，平台 `ORDER_DISPUTE_DECISION_SECONDS` 内裁决，
 *   逾期未裁决由 system 按退款给买方处理（`dispute_timeout`），并通知主人。
 */
import { canonicalizeJson, sha256Hex, utf8Encode, type Money } from './trust-loop-primitives';
import type { VisibilityActionReceiptV1, VisibilityChangeV1, VisibilityPreviewV1 } from './visibility-actions';

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
  'refund_complete', // system，通道确认退款成功（v0.7）
] as const;
export type OrderActionV1 = (typeof ORDER_ACTIONS)[number];

export interface OrderPartiesV1 {
  /** 买方：登录用户 id，或者访客会话引用（不透明）。卖方永远看不到买方的账号 id，只看到显示名或匿名。 */
  buyerRef: { kind: 'user'; userId: string } | { kind: 'visitor'; visitorRef: string };
  /**
   * 卖方分身 Agent 的外部编号（`agent_accounts.agentUniqueId`，和公开名片、`/share/agent/:agentRef` 用的是同一个），
   * 不是内部 uuid。买方看到的是分身名片，不是主人账号。本文件里所有 `sellerAgentId` 和 `?agentId=` 都是它。
   */
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

/** 交付内容（`reviewedDeliveryDigest` 覆盖的就是这一份）。交付之前为 null。 */
export interface OrderDeliveryV1 {
  answerText: string | null;
  deliveryRefs: string[];
}

/**
 * v0.7：交付草稿（只在卖方视图里，买方永远看不到）。`digest` 就是 `orderDeliveryDigestV1` 对这份草稿的结果；
 * 主人看完草稿，只带这个摘要发 `deliver`，服务端交付的就是这份草稿。
 */
export interface OrderDeliveryDraftV1 extends OrderDeliveryV1 {
  digest: string;
}

/** 卖方视图：买方只有显示名或匿名。 */
export interface OrderSellerViewV1 extends Omit<OrderV1, 'parties'> {
  buyer: { displayName: string | null; kind: 'user' | 'visitor' };
  /** 外部编号 `agentUniqueId`（见 `OrderPartiesV1.sellerAgentId`）。 */
  sellerAgentId: string;
  /** 买方写的问题或备注（卖方要看到才能回答）。 */
  buyerNote: string;
  delivery: OrderDeliveryV1 | null;
  /** v0.7：`paid` 状态下写过草稿时才有，其余时候为 null。v0.7 起服务端总是带这个字段；旧客户端可以忽略。 */
  deliveryDraft?: OrderDeliveryDraftV1 | null;
}

/** 买方视图：看不到主人账号、授权引用和平台内部的费用拆分之外的东西。 */
export interface OrderBuyerViewV1 extends Omit<OrderV1, 'parties' | 'mandateRef' | 'amounts'> {
  /** `agentId` 是外部编号 `agentUniqueId`。 */
  seller: { agentId: string; displayName: string };
  total: OrderAmountsV1['total'];
  buyerNote: string;
  /** 交付之后买方要看到内容才能验收。 */
  delivery: OrderDeliveryV1 | null;
}

/** 服务目录条目（买方下单用；价格只从这里来，页面不算）。只列主人确认过、在接单的条目。 */
export interface OrderOfferV1 {
  offerRef: string;
  kind: OrderKindV1;
  sellerAgentId: string;
  sellerDisplayName: string;
  title: string;
  description: string | null;
  price: Money;
  acceptanceWindowSeconds: number;
  environment: 'test' | 'live';
}

/**
 * 路由（REQ-web-016；v0.5 起前缀改为 `/api/order-escrow`：`/api/orders` 已被旧的电商订单模块占用，
 * 旧模块的 `GET /api/orders/:id` 会吞掉 `/api/orders/offers`）。`offers` 两条匿名可读，可以从 Web 服务端
 * 不带 cookie 调；其余按调用方返回对应视图，不是这笔单的买方 / 卖方一律 404 `order_not_found`（不区分）。
 * 访客四条都按邮箱和 IP 限频，超了 429；`visitorLinks` 不管邮箱有没有订单都返回同样的 202（防枚举）。
 */
export const ORDER_API_PREFIX = '/api/order-escrow' as const;
export const ORDER_ROUTES = {
  offers: 'GET /api/order-escrow/offers?agentId=:sellerAgentId', // → { items: OrderOfferV1[] }
  offer: 'GET /api/order-escrow/offers/:offerRef', // → OrderOfferV1；不存在和不接单都是 404 offer_not_found
  create: 'POST /api/order-escrow/orders', // CreateOrderRequestV1 → OrderBuyerViewV1
  get: 'GET /api/order-escrow/orders/:orderId?as=buyer|seller', // → OrderBuyerViewV1 | OrderSellerViewV1
  listAsBuyer: 'GET /api/order-escrow/orders?as=buyer', // 登录用户或访客会话 → { items: OrderBuyerViewV1[] }
  listAsSeller: 'GET /api/order-escrow/orders?as=seller&agentId=:sellerAgentId', // 主人本人（登录凭据）→ { items: OrderSellerViewV1[] }
  action: 'POST /api/order-escrow/orders/:orderId/actions', // OrderActionRequestV1 → OrderBuyerViewV1 | OrderSellerViewV1；pay → PayOrderResponseV1
  visitorEmailCode: 'POST /api/order-escrow/visitor/email/code', // { email } → 202，发 6 位验证码
  visitorEmailVerify: 'POST /api/order-escrow/visitor/email/verify', // { email, code } → 设"已验证这个邮箱"的 HttpOnly cookie
  visitorLinks: 'POST /api/order-escrow/visitor/links', // { email } → 202，发找回链接（Web 页面 /orders/recover#token=…）
  visitorSession: 'POST /api/order-escrow/visitor/session', // { token } → 设只读这个邮箱订单的 HttpOnly cookie
} as const;

/** 找回链接里的一次性凭据格式（放在 `#token=` 后面）。 */
export const ORDER_VISITOR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;

/** 其余错误码（`code`）。下单被拒的见 `ORDER_CREATE_REFUSAL_CODES`，动作被拒的见 `OrderTransitionCheckV1`。 */
export const ORDER_ERROR_CODES = {
  notFound: 'order_not_found', // 404
  offerNotFound: 'offer_not_found', // 404
  versionConflict: 'order_version_conflict', // 409，expectedVersion 不一致
  expired: 'order_expired', // 付款期限过后再付
  emailCodeInvalid: 'email_code_invalid', // 400，码错或过期
  linkExpired: 'link_expired', // 410，找回链接用过或过期
  signInRequired: 'sign_in_required', // 403，主人侧用了 Agent token 或客户端 token
  rateLimited: 'rate_limited', // 429
  paymentMethodUnsupported: 'payment_method_unsupported', // 客户端要求的付款方式这一版不提供
  invalid: 'order_invalid', // 400，请求体不合格式，带 errors（v0.5）
  idempotencyConflict: 'order_idempotency_conflict', // 409，同一 idempotencyKey 用在了不同的请求上（v0.5）
  actionUnavailable: 'order_action_unavailable', // 503，这个动作的后端还没上线（T7 分片交付期间，v0.5）
  unavailable: 'orders_unavailable', // 503，订单总开关没开（v0.5）
  environmentChanged: 'order_environment_changed', // 409，下单时是测试模式、现在不是（或反过来），这笔单不能再付（v0.6）
  paymentUnavailable: 'order_payment_unavailable', // 503，支付通道没配好或暂时不可用，可以稍后重试（v0.6）
  deliveryDraftMissing: 'order_delivery_draft_missing', // 409，`deliver` 没带内容，也没有草稿（v0.7）
  releaseInProgress: 'order_release_in_progress', // 409，放款已经开始，不能再退款（v0.7）
  disputeWindowClosed: 'order_dispute_window_closed', // 409，验收期过了，不能再发起争议（v0.8）
  adminStepUpRequired: 'ADMIN_STEP_UP_REQUIRED', // 403，平台写操作缺 `x-admin-step-up`（v0.8）
  reconcileEvidenceMismatch: 'order_reconcile_evidence_mismatch', // 409，对账证据和订单记下的通道对象对不上（v0.10）
} as const;

/**
 * v0.7（T7-3）：交付草稿。只认主人本人的登录凭据，只在 `paid` 状态下能写，写一次 `version` +1。
 * 请求体 `PutOrderDeliveryDraftRequestV1` → `OrderSellerViewV1`（带 `deliveryDraft`）。
 */
export const ORDER_DELIVERY_ROUTES = {
  draft: 'PUT /api/order-escrow/orders/:orderId/delivery-draft',
} as const;
/**
 * v0.11（D5 第 2 片，REQ-desktop-032）：配对电脑上的开发者运行时替主人备草稿，WebView 不用开着。
 * - 只认运行时凭据（E32）；用户 JWT 即使开了 Gate B 过渡开关也不认（401 `DEVELOPER_RUNTIME_CREDENTIAL_REQUIRED`）。
 *   每次请求照 E32 重查凭据、账号、设备和钥匙、绑定；过期或吊销 401。
 * - 只有列单、读单（卖方视图）和写草稿，**没有 actions**：交付、退款、取消只在用户路由上，只认主人的登录凭据。
 *   运行时凭据放到用户路由上会被当成匿名（读单、actions 404；草稿 PUT 401）。
 * - 订单的 `sellerAgentId` 必须是凭据绑定的 `agentId`，主人也要一致，否则 404，和查无此单一样。
 * - 草稿规则和主人一样：只在 `paid`（否则 409 `action_not_allowed_in_status`），`expectedVersion`，
 *   写一次 `version` +1，附件引用只能是空数组（`ORDER_DELIVERY_REFS_MAX_V07`）。
 * - 写草稿要带 `X-Agentrix-Body-Digest: sha-256=<hex>` 和 `X-Agentrix-Canonicalization: jcs/1`，
 *   和其他运行时 mutation 一样；缺了或对不上 400。不要求设备钥匙签名：交付前仍要本人看过（`reviewedDeliveryDigest`）。
 * - 谁写的草稿不进视图（不加列）：桌面自己知道哪份是本机备的。服务端日志记 `deviceRef` / `runtimeId`，不记正文。
 */
export const ORDER_RUNTIME_ROUTES = {
  list: 'GET /api/order-escrow/runtime/orders', // → { items: OrderSellerViewV1[] }，这只 Agent 的单，最多 50 条，新的在前
  get: 'GET /api/order-escrow/runtime/orders/:orderId', // → OrderSellerViewV1
  draft: 'PUT /api/order-escrow/runtime/orders/:orderId/delivery-draft', // PutOrderDeliveryDraftRequestV1 → OrderSellerViewV1
} as const;

/** 回答正文上限（字符）。v0.7 的附件引用只接受空数组，附件存储随桌面 D5 再加。 */
export const ORDER_DELIVERY_ANSWER_MAX_CHARS = 8000;
export const ORDER_DELIVERY_REFS_MAX_V07 = 0;

export interface PutOrderDeliveryDraftRequestV1 {
  expectedVersion: number;
  answerText: string;
  deliveryRefs: string[];
}

/**
 * v0.6（T7-2）：支付通道回调，服务器对服务器，客户端不调。签名密钥是 `ORDER_STRIPE_WEBHOOK_SECRET`，验签不过 400。
 * 订单只能由这里变成 `paid`（Checkout 完成且金额、币种、测试 / 真钱模式都和订单一致）；对不上就进 `unknown` 等对账。
 * 同一个通道事件只处理一次。
 */
export const ORDER_RAIL_ROUTES = {
  stripeWebhook: 'POST /api/order-escrow/stripe/webhook',
} as const;

/**
 * `pay` 的响应。`url` 只能是 Stripe 的托管页（`STRIPE_HOSTED_ORIGINS`）。v0 对 Web 一律返回 `redirect`
 * （Stripe Checkout），`client_secret` 留给以后的原生端。
 */
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
  'self_purchase', // v0.5：主人不能买自己分身的服务
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

/** `POST /api/order-escrow/orders`：只有目录引用和买方内容，不带金额。 */
export interface CreateOrderRequestV1 {
  offerRef: string;
  kind: OrderKindV1;
  /** 付费问答的问题，或定金的备注。服务端限长、做内容检查。 */
  buyerNote: string;
  idempotencyKey: string;
}

/** `POST /api/order-escrow/orders/:orderId/actions`。 */
export interface OrderActionRequestV1 {
  action: Exclude<OrderActionV1, 'auto_accept' | 'settle' | 'expire' | 'reconcile' | 'dispute_timeout' | 'refund_complete'>;
  expectedVersion: number;
  idempotencyKey: string;
  /** `deliver` 必填：主人看过的交付物的摘要（`orderDeliveryDigestV1`）。 */
  reviewedDeliveryDigest?: string;
  /**
   * `deliver` 的交付物引用（附件的存储引用；v0.7 只接受空数组）。`answerText` 和 `deliveryRefs` 都不带时，
   * 交付的是服务端保存的草稿（`deliveryDraft`），摘要要和草稿的 `digest` 一致（v0.7）。
   */
  deliveryRefs?: string[];
  /** `deliver`：付费问答的回答，或定金的安排说明。带了就是这次要交付的内容（同时存为草稿）。 */
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
  // 目标状态由对账决定，只能是 ORDER_RECONCILE_TARGETS 之一；这里的 `to` 只是占位。v0.10 起平台也能对账（带证据）。
  reconcile: { from: ['unknown'], to: 'unknown', actors: ['system', 'platform'] },
  refund_complete: { from: ['refund_pending'], to: 'refunded', actors: ['system'] },
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

// ---------------------------------------------------------------------------
// v0.5（T7-1，REQ-backend-034）：主人管理服务目录；编号格式；请求校验
//
// - 主人路由只接受登录凭据（和订单主人侧动作一样），不是这个 Agent 的主人一律 404 `offer_not_found`。
// - 上架是放宽类（REQ-backend-034.re-web）：先 `publishPreview` 拿 `visibility.previewDigest`，上架时带上它，并且最近
//   登录过；错误码和可见性合同一样（428 / 403 `STEP_UP_REQUIRED` / 409）。摘要绑定条目当前的版本和内容，预览之后
//   条目被改过就对不上。下架是收紧类，直接生效。两者都返回 `{ offer, receipt }`。
// - 已上架的条目不能改（409 `order_offer_published`）：先下架、修改、再上架（再走一次确认）。
// - 目录条目的价格改了只影响之后的订单：订单下单时把价格、验收期写进自己。
// - 验收期不由主人填：按 `kind` 取服务端当时的配置（缺省 `ORDER_DEFAULT_WINDOWS_SECONDS`）。
// - v0 币种只有 USD、SGD（2 位小数），单价 1.00–10,000.00。
// - 真钱开关关着时，目录和新订单的 `environment` 都是 `test`。

export const ORDER_OFFER_REF_PATTERN = /^ofr_[0-9a-f]{32}$/;
export const ORDER_ID_PATTERN = /^ord_[0-9a-f]{32}$/;
export const ORDER_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
export const ORDER_BUYER_NOTE_MAX_CHARS = 2000;
export const ORDER_OFFER_TITLE_MAX_CHARS = 80;
export const ORDER_OFFER_DESCRIPTION_MAX_CHARS = 500;
export const ORDER_OFFER_CURRENCIES = ['USD', 'SGD'] as const;
export const ORDER_OFFER_PRICE_LIMITS_MINOR = { min: 100, max: 1_000_000, decimals: 2 } as const;
export const ORDER_OFFER_STATUSES = ['draft', 'published', 'withdrawn'] as const;
export type OrderOfferStatusV1 = (typeof ORDER_OFFER_STATUSES)[number];

export const ORDER_OFFER_OWNER_ROUTES = {
  listMine: 'GET /api/order-escrow/offers/mine?agentId=:sellerAgentId', // → { items: OrderOfferOwnerViewV1[] }
  create: 'POST /api/order-escrow/offers', // CreateOrderOfferRequestV1 → OrderOfferOwnerViewV1（草稿）
  update: 'PATCH /api/order-escrow/offers/:offerRef', // UpdateOrderOfferRequestV1 → OrderOfferOwnerViewV1
  publishPreview: 'POST /api/order-escrow/offers/:offerRef/publish/preview', // → { visibility: VisibilityPreviewV1 }
  publish: 'POST /api/order-escrow/offers/:offerRef/publish', // { expectedVersion, previewDigest } → OrderOfferStatusResultV1
  withdraw: 'POST /api/order-escrow/offers/:offerRef/withdraw', // { expectedVersion } → OrderOfferStatusResultV1
} as const;

export const ORDER_OFFER_ERROR_CODES = {
  invalid: 'order_offer_invalid', // 400，带 errors
  versionConflict: 'order_offer_version_conflict', // 409
  published: 'order_offer_published', // 409，已上架的条目要先下架再改
  unavailable: 'orders_unavailable', // 503，订单总开关没开
} as const;

/** 主人看到的目录条目：多了状态和版本。 */
export interface OrderOfferOwnerViewV1 extends OrderOfferV1 {
  status: OrderOfferStatusV1;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderOfferStatusResultV1 {
  offer: OrderOfferOwnerViewV1;
  receipt: VisibilityActionReceiptV1;
}

export interface OrderOfferPublishPreviewV1 {
  visibility: VisibilityPreviewV1;
}

/** 上架的可见性改动：摘要覆盖条目的版本和买方会看到的内容。preview 和提交两边用同一个函数。 */
export function orderOfferPublishChangeV1(offer: {
  offerRef: string;
  version: number;
  kind: OrderKindV1;
  title: string;
  description: string | null;
  price: Money;
}): VisibilityChangeV1 {
  return {
    objectKind: 'order_offer',
    objectRef: offer.offerRef,
    operations: ['offer_publish'],
    change: {
      version: offer.version,
      kind: offer.kind,
      title: offer.title,
      description: offer.description,
      price: { amountMinor: offer.price.amountMinor, currency: offer.price.currency, decimals: offer.price.decimals },
    },
  };
}

export function orderOfferWithdrawChangeV1(offerRef: string): VisibilityChangeV1 {
  return { objectKind: 'order_offer', objectRef: offerRef, operations: ['offer_withdraw'], change: {} };
}

export interface CreateOrderOfferRequestV1 {
  sellerAgentId: string;
  kind: OrderKindV1;
  title: string;
  description: string | null;
  price: Money;
}

export interface UpdateOrderOfferRequestV1 {
  expectedVersion: number;
  title?: string;
  description?: string | null;
  price?: Money;
}

type OrderValidationV1 = { valid: boolean; errors: string[] };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && [...value].length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}
function checkOfferPrice(value: unknown, errors: string[]): void {
  const m = value as Money | undefined;
  if (
    !isPlainRecord(m) ||
    Object.keys(m).some((key) => key !== 'amountMinor' && key !== 'currency' && key !== 'decimals') ||
    typeof m.amountMinor !== 'string' ||
    !/^[1-9][0-9]{0,9}$/.test(m.amountMinor) ||
    !(ORDER_OFFER_CURRENCIES as readonly string[]).includes(m.currency as string) ||
    m.decimals !== ORDER_OFFER_PRICE_LIMITS_MINOR.decimals ||
    Number(m.amountMinor) < ORDER_OFFER_PRICE_LIMITS_MINOR.min ||
    Number(m.amountMinor) > ORDER_OFFER_PRICE_LIMITS_MINOR.max
  ) {
    errors.push('price: USD or SGD, 2 decimals, 1.00 to 10000.00');
  }
}

export function validateCreateOrderOfferRequestV1(value: unknown): OrderValidationV1 {
  if (!isPlainRecord(value)) return { valid: false, errors: ['body: expected object'] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    if (!['sellerAgentId', 'kind', 'title', 'description', 'price'].includes(key)) errors.push(`${key}: unexpected field`);
  }
  if (typeof value.sellerAgentId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value.sellerAgentId)) errors.push('sellerAgentId: invalid');
  if (!(ORDER_KINDS as readonly string[]).includes(value.kind as string)) errors.push('kind: invalid');
  if (!isText(value.title, ORDER_OFFER_TITLE_MAX_CHARS)) errors.push(`title: 1-${ORDER_OFFER_TITLE_MAX_CHARS} characters`);
  if (value.description !== null && !isText(value.description, ORDER_OFFER_DESCRIPTION_MAX_CHARS)) {
    errors.push(`description: null or 1-${ORDER_OFFER_DESCRIPTION_MAX_CHARS} characters`);
  }
  checkOfferPrice(value.price, errors);
  return { valid: errors.length === 0, errors };
}

export function validateUpdateOrderOfferRequestV1(value: unknown): OrderValidationV1 {
  if (!isPlainRecord(value)) return { valid: false, errors: ['body: expected object'] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    if (!['expectedVersion', 'title', 'description', 'price'].includes(key)) errors.push(`${key}: unexpected field`);
  }
  if (!Number.isInteger(value.expectedVersion) || (value.expectedVersion as number) < 1) errors.push('expectedVersion: positive integer');
  if (value.title !== undefined && !isText(value.title, ORDER_OFFER_TITLE_MAX_CHARS)) errors.push(`title: 1-${ORDER_OFFER_TITLE_MAX_CHARS} characters`);
  if (value.description !== undefined && value.description !== null && !isText(value.description, ORDER_OFFER_DESCRIPTION_MAX_CHARS)) {
    errors.push(`description: null or 1-${ORDER_OFFER_DESCRIPTION_MAX_CHARS} characters`);
  }
  if (value.price !== undefined) checkOfferPrice(value.price, errors);
  if (value.title === undefined && value.description === undefined && value.price === undefined) errors.push('body: nothing to change');
  return { valid: errors.length === 0, errors };
}

export function validateCreateOrderRequestV1(value: unknown): OrderValidationV1 {
  if (!isPlainRecord(value)) return { valid: false, errors: ['body: expected object'] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    if (!['offerRef', 'kind', 'buyerNote', 'idempotencyKey'].includes(key)) errors.push(`${key}: unexpected field`);
  }
  if (typeof value.offerRef !== 'string' || !ORDER_OFFER_REF_PATTERN.test(value.offerRef)) errors.push('offerRef: invalid');
  if (!(ORDER_KINDS as readonly string[]).includes(value.kind as string)) errors.push('kind: invalid');
  if (!isText(value.buyerNote, ORDER_BUYER_NOTE_MAX_CHARS)) errors.push(`buyerNote: 1-${ORDER_BUYER_NOTE_MAX_CHARS} characters`);
  if (typeof value.idempotencyKey !== 'string' || !ORDER_IDEMPOTENCY_KEY_PATTERN.test(value.idempotencyKey)) errors.push('idempotencyKey: invalid');
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// v0.7（T7-3）：交付、验收、放款、退款
//
// - 交付：主人写草稿（`ORDER_DELIVERY_ROUTES.draft`）或在 `deliver` 里直接带内容；摘要一律由服务端对实际交付的内容
//   重算。交付之后内容不能再改。
// - 验收：买方 `accept`，或交付后 `acceptanceWindowSeconds` 到期由 system `auto_accept`。验收后马上放款（`settle`）。
// - 放款：测试模式只把托管标成 `released`，不动任何钱（测试单永远不放款到真实账户）。真钱模式把 总额 − 平台费
//   转给卖方的 Connect 账户（和平台账户同一个国家）；通道结果不确定时进 `unknown`。放款开始后（`escrow.state = release_pending`）
//   不能再退款（`order_release_in_progress`）。
// - 退款：只做全额。主人发起后进 `refund_pending`，通道确认后由 system `refund_complete` 进 `refunded`；
//   通道明确失败或长时间不确定时进 `unknown` 等对账。

// ---------------------------------------------------------------------------
// v0.8（T7-3b）：争议、平台裁决、订单推送
//
// - 买方只能在验收期内（交付时间 + `acceptanceWindowSeconds`）发起争议，过了返回 409 `order_dispute_window_closed`。
//   `reasonCode` 可选，只能是 `ORDER_DISPUTE_REASONS` 之一；v0 不保存原因。
// - 争议期间不会自动验收。平台在 `disputeDecisionSeconds`（下单时写进订单，缺省 `ORDER_DISPUTE_DECISION_SECONDS`）
//   内裁决：判给卖方 = `resolve_dispute` → `accepted` → 放款；判给买方 = 平台 `refund` → 全额退款。
//   逾期未裁决由 system `dispute_timeout` 按退款处理。
// - 平台路由只认管理员登录，而且在 `ADMIN_STEP_UP_REQUIRED=true` 时要 `x-admin-step-up`（和其他管理员写操作一样）。
//   平台视图和卖方视图一样看不到买方账号。
// - 推送 `order_update`（`push-notification.ts`）：卖方主人在 `paid`、`disputed`、`settled`、`refunded`、`unknown`
//   时收到；登录的买方在 `delivered`、`refunded` 时收到。文案通用，只带订单 id（`ORDER_UPDATE_RECIPIENTS_V1`）。

export const ORDER_DISPUTE_REASONS = ['not_as_described', 'not_answered', 'other'] as const;
export type OrderDisputeReasonV1 = (typeof ORDER_DISPUTE_REASONS)[number];

export const ORDER_PLATFORM_ROUTES = {
  disputes: 'GET /api/order-escrow/platform/disputes', // 管理员 → { items: OrderPlatformViewV1[] }，最早到期的在前
  decideDispute: 'POST /api/order-escrow/platform/orders/:orderId/dispute-decision', // 管理员 + step-up；DecideOrderDisputeRequestV1 → OrderPlatformViewV1
  unknown: 'GET /api/order-escrow/platform/unknown', // v0.10，管理员 → { items: OrderPlatformViewV1[] }（带 unknownSource），最早的在前
  reconcile: 'POST /api/order-escrow/platform/orders/:orderId/reconcile', // v0.10，管理员 + step-up；ReconcileOrderRequestV1 → OrderPlatformViewV1
} as const;

export interface DecideOrderDisputeRequestV1 {
  decision: 'release_to_seller' | 'refund_buyer';
  expectedVersion: number;
  idempotencyKey: string;
}

/** 平台看到的订单：卖方视图（没有买方账号），加上争议时间和裁决期限。 */
export interface OrderPlatformViewV1 extends OrderSellerViewV1 {
  disputedAt: string | null;
  disputeDeadline: string | null;
  /** v0.10：`unknown` 是哪一步不确定造成的（付款、放款、退款）；其余状态为 null。 */
  unknownSource?: 'pay' | 'settle' | 'refund' | null;
}

// ---------------------------------------------------------------------------
// v0.10（T7-3c）：`unknown` 对账；卖方收款账户（合同草案，还没有实现）
//
// - 自动对账（system，定时任务）：只在能从通道查到确定结果时做。放款不确定 → 查到这笔单的转账、金额是卖方所得
//   → `settled`；退款不确定 → 查到成功的全额退款 → `refunded`。付款不确定（金额对不上、单已取消后才到账）一律
//   留给平台。查不到就保持 `unknown`，不猜。
// - 平台对账（管理员 + step-up）：平台在通道里看过事实以后选目标状态，必须带证据（通道对象的 id，
//   `ORDER_RECONCILE_EVIDENCE_V1`）。`accepted` 之后马上放款；`paid` 回到等卖方交付。平台对账不动钱：
//   要把钱退掉，先在通道里退款，再用 `re_…` 对账成 `refunded`。
// - 收款账户：卖方的 Stripe Connect 账户，要和平台账户同一个国家（v0.12）。入驻页只能是 Stripe 的托管页（`STRIPE_CONNECT_ORIGINS`）。
//   开始入驻是放宽类操作，要最近登录（和可见性 step-up 相同的 428 / 403 规则）。**这两条路由还没有实现**
//   （等 OA-13 和新迁移），客户端在 CONTRACTS 标成已实现之前不要调用；在那之前真钱订单在下单时就被拒绝
//   （`seller_region_unsupported`）。

export const ORDER_PLATFORM_RECONCILE_TARGETS = ['paid', 'accepted', 'settled', 'refunded', 'cancelled'] as const;
export type OrderPlatformReconcileTargetV1 = (typeof ORDER_PLATFORM_RECONCILE_TARGETS)[number];

/** 每个目标需要的证据：通道对象 id 的前缀；`cancelled` 也可以写 `no_payment`（钱从来没到）。 */
export const ORDER_RECONCILE_EVIDENCE_V1: Readonly<Record<OrderPlatformReconcileTargetV1, readonly string[]>> = {
  paid: ['pi_', 'ch_'],
  accepted: ['pi_', 'ch_'],
  settled: ['tr_'],
  refunded: ['re_'],
  cancelled: ['cs_', 'no_payment'],
};

export interface ReconcileOrderRequestV1 {
  target: OrderPlatformReconcileTargetV1;
  evidenceRef: string;
  expectedVersion: number;
  idempotencyKey: string;
}

export function orderReconcileEvidenceOkV1(target: OrderPlatformReconcileTargetV1, evidenceRef: unknown): boolean {
  if (typeof evidenceRef !== 'string') return false;
  const allowed = ORDER_RECONCILE_EVIDENCE_V1[target];
  if (evidenceRef === 'no_payment') return allowed.includes('no_payment');
  // Stripe ids are `<prefix>_` + letters, digits and (for Checkout sessions) underscores.
  return /^(pi|ch|tr|re|cs)_[A-Za-z0-9_]{1,200}$/.test(evidenceRef) && allowed.some((prefix) => prefix !== 'no_payment' && evidenceRef.startsWith(prefix));
}

export function validateReconcileOrderRequestV1(value: unknown): OrderValidationV1 {
  if (!isPlainRecord(value)) return { valid: false, errors: ['body: expected object'] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    if (!['target', 'evidenceRef', 'expectedVersion', 'idempotencyKey'].includes(key)) errors.push(`${key}: unexpected field`);
  }
  const target = value.target as OrderPlatformReconcileTargetV1;
  if (!(ORDER_PLATFORM_RECONCILE_TARGETS as readonly unknown[]).includes(target)) {
    errors.push(`target: one of ${ORDER_PLATFORM_RECONCILE_TARGETS.join(', ')}`);
  } else if (!orderReconcileEvidenceOkV1(target, value.evidenceRef)) {
    errors.push(`evidenceRef: ${ORDER_RECONCILE_EVIDENCE_V1[target].join(' or ')} for ${target}`);
  }
  if (!Number.isInteger(value.expectedVersion) || (value.expectedVersion as number) < 1) errors.push('expectedVersion: positive integer');
  if (typeof value.idempotencyKey !== 'string' || !ORDER_IDEMPOTENCY_KEY_PATTERN.test(value.idempotencyKey)) errors.push('idempotencyKey: invalid');
  return { valid: errors.length === 0, errors };
}

/** 草案：卖方收款账户（没有实现）。 */
export const ORDER_PAYOUT_ROUTES_DRAFT = {
  account: 'GET /api/order-escrow/payouts/account', // 主人本人（登录凭据）→ OrderSellerPayoutAccountV1
  onboardingLink: 'POST /api/order-escrow/payouts/account/onboarding-link', // 主人本人 + 最近登录 → { url }（Stripe 托管页）
} as const;
export const ORDER_PAYOUT_ACCOUNT_STATES = ['none', 'onboarding', 'enabled', 'restricted'] as const;
export type OrderPayoutAccountStateV1 = (typeof ORDER_PAYOUT_ACCOUNT_STATES)[number];
export interface OrderSellerPayoutAccountV1 {
  state: OrderPayoutAccountStateV1;
  /**
   * v0.12（I-051）：连接账户所在国家，Stripe 给的 ISO 3166-1 两位大写代码；还没有账户时为 null。
   * 原来是 `region: 'SG' | 'other' | null`（只认新加坡）。
   */
  country: string | null;
  /** 这个国家和平台 Stripe 账户相同，能收款。 */
  countrySupported: boolean;
  payoutsEnabled: boolean;
  /** Stripe 还要主人补资料。 */
  requirementsDue: boolean;
  updatedAt: string | null;
}
export const STRIPE_CONNECT_ORIGINS = ['https://connect.stripe.com'] as const;
export function isAllowedOnboardingRedirectV1(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (STRIPE_CONNECT_ORIGINS as readonly string[]).includes(parsed.origin) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

/** 哪个状态通知谁（`order_update`）。买方只在是登录用户时收到。 */
export const ORDER_UPDATE_RECIPIENTS_V1: Readonly<Partial<Record<OrderStatusV1, ReadonlyArray<'seller_owner' | 'buyer'>>>> = {
  paid: ['seller_owner'],
  delivered: ['buyer'],
  disputed: ['seller_owner'],
  settled: ['seller_owner'],
  refunded: ['seller_owner', 'buyer'],
  unknown: ['seller_owner'],
};

export function validateDecideOrderDisputeRequestV1(value: unknown): OrderValidationV1 {
  if (!isPlainRecord(value)) return { valid: false, errors: ['body: expected object'] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    if (!['decision', 'expectedVersion', 'idempotencyKey'].includes(key)) errors.push(`${key}: unexpected field`);
  }
  if (value.decision !== 'release_to_seller' && value.decision !== 'refund_buyer') errors.push('decision: release_to_seller or refund_buyer');
  if (!Number.isInteger(value.expectedVersion) || (value.expectedVersion as number) < 1) errors.push('expectedVersion: positive integer');
  if (typeof value.idempotencyKey !== 'string' || !ORDER_IDEMPOTENCY_KEY_PATTERN.test(value.idempotencyKey)) errors.push('idempotencyKey: invalid');
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// v0.9（T7-4）：访客（没有账号的买方）
//
// - 邮箱先规范化（`normalizeOrderVisitorEmailV1`：去空白、转小写），服务端只存它的 HMAC，不存明文，所以订单状态
//   变化不会发邮件给访客；访客要回来看订单，就用找回链接。
// - `visitorEmailCode`：发 6 位验证码，10 分钟有效，最多试 5 次；每个邮箱每小时最多 5 个，每个 IP 每小时最多 20 个，
//   超了 429。邮件发不出去（没配邮件服务）是 503 `order_email_unavailable`。
// - `visitorEmailVerify`：码对了设 `verified` 会话 cookie，可以下单、看这个邮箱的订单、对这些订单做买方动作。
//   码错或过期 400 `email_code_invalid`。
// - `visitorLinks`：不管邮箱有没有订单都返回 202；只有有订单时才真的发信。链接 `…/orders/recover#token=…`，
//   30 分钟有效，只能用一次。每个邮箱每小时最多 3 封。
// - `visitorSession`：用链接里的 token 换 `recovered` 会话 cookie，只能看这个邮箱已有的订单、对它们做买方动作
//   （付款、验收、发起争议），不能下新单。token 用过或过期 410 `link_expired`。
// - cookie：名字 `ORDER_VISITOR_COOKIE_NAME`，HttpOnly、Secure、SameSite=Strict、Path=/api/order-escrow，
//   `ORDER_VISITOR_SESSION_TTL_SECONDS` 后失效。登录用户的凭据优先于访客 cookie。`visitorSessionEnd` 清掉它。

export const ORDER_VISITOR_COOKIE_NAME = 'agx_order_visitor' as const;
export const ORDER_VISITOR_SCOPES = ['verified', 'recovered'] as const;
export type OrderVisitorScopeV1 = (typeof ORDER_VISITOR_SCOPES)[number];
export const ORDER_VISITOR_CODE_TTL_SECONDS = 10 * 60;
export const ORDER_VISITOR_CODE_MAX_ATTEMPTS = 5;
export const ORDER_VISITOR_LIMITS_PER_HOUR = {
  codesPerEmail: 5,
  codesPerIp: 20,
  linksPerEmail: 3,
  linksPerIp: 20,
  verifyPerIp: 30,
  sessionsPerIp: 30,
} as const;
export const ORDER_VISITOR_ROUTES_V09 = {
  visitorSessionEnd: 'DELETE /api/order-escrow/visitor/session', // → 204，清掉访客 cookie
} as const;
export const ORDER_VISITOR_ERROR_CODES = {
  emailInvalid: 'order_email_invalid', // 400
  emailUnavailable: 'order_email_unavailable', // 503，邮件服务没配或暂时不可用
} as const;

export interface OrderVisitorEmailRequestV1 {
  email: string;
}
export interface OrderVisitorVerifyRequestV1 {
  email: string;
  code: string;
}
export interface OrderVisitorSessionRequestV1 {
  token: string;
}
/** `visitorEmailVerify` / `visitorSession` 的响应；cookie 在 Set-Cookie 里，响应体不带任何凭据。 */
export interface OrderVisitorSessionV1 {
  scope: OrderVisitorScopeV1;
  expiresAt: string;
}

/** 规范化后的邮箱；格式不对返回 null。 */
export function normalizeOrderVisitorEmailV1(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  return /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/.test(email) ? email : null;
}

export function isOrderVisitorCodeV1(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{6}$/.test(value.trim());
}

/** 交付内容的校验（`deliver` 带内容时、写草稿时都用）。 */
export function validateOrderDeliveryContentV1(value: { answerText?: unknown; deliveryRefs?: unknown }): OrderValidationV1 {
  const errors: string[] = [];
  if (!isText(value.answerText, ORDER_DELIVERY_ANSWER_MAX_CHARS)) errors.push(`answerText: 1-${ORDER_DELIVERY_ANSWER_MAX_CHARS} characters`);
  if (!Array.isArray(value.deliveryRefs) || value.deliveryRefs.length > ORDER_DELIVERY_REFS_MAX_V07) {
    errors.push('deliveryRefs: must be an empty array in v0.7 (attachments come later)');
  }
  return { valid: errors.length === 0, errors };
}

export function validatePutOrderDeliveryDraftRequestV1(value: unknown): OrderValidationV1 {
  if (!isPlainRecord(value)) return { valid: false, errors: ['body: expected object'] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    if (!['expectedVersion', 'answerText', 'deliveryRefs'].includes(key)) errors.push(`${key}: unexpected field`);
  }
  if (!Number.isInteger(value.expectedVersion) || (value.expectedVersion as number) < 1) errors.push('expectedVersion: positive integer');
  errors.push(...validateOrderDeliveryContentV1(value).errors);
  return { valid: errors.length === 0, errors };
}

/** 卖方放款所得：总额 − 平台费（通道手续费承担方等 OA-50）。 */
export function orderSellerProceedsV1(total: Money, platformFee: Money): Money {
  if (total.currency !== platformFee.currency || total.decimals !== platformFee.decimals) throw new Error('currency mismatch');
  const proceeds = BigInt(total.amountMinor) - BigInt(platformFee.amountMinor);
  if (proceeds < BigInt(0)) throw new Error('fee above total');
  return { amountMinor: proceeds.toString(), currency: total.currency, decimals: total.decimals };
}

/** 平台费：总额乘费率（万分比）向下取整；费率由服务端配置（OA-50 之前测试占位 100 = 1%）。 */
export function orderPlatformFeeV1(total: Money, feeBps: number): Money {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) throw new Error('fee bps out of range');
  return { amountMinor: ((BigInt(total.amountMinor) * BigInt(feeBps)) / BigInt(10000)).toString(), currency: total.currency, decimals: total.decimals };
}
