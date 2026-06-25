/**
 * 支付相关常量
 */

// 路由类型
export const ROUTE_TYPES = {
  QUICKPAY: 'quickpay',
  WALLET: 'wallet',
  CRYPTO_RAIL: 'crypto-rail',
  LOCAL_RAIL: 'local-rail',
} as const;

// 支付状态
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
} as const;

// Session 状态
export const SESSION_STATUS = {
  ACTIVE: 'active',
  REVOKED: 'revoked',
  EXPIRED: 'expired',
} as const;

// 默认限额（USDC）
export const DEFAULT_LIMITS = {
  MIN_SINGLE_LIMIT: 0.01, // 最小单笔限额
  MAX_SINGLE_LIMIT: 10000, // 最大单笔限额
  MIN_DAILY_LIMIT: 1, // 最小每日限额
  MAX_DAILY_LIMIT: 100000, // 最大每日限额
  DEFAULT_SINGLE_LIMIT: 10, // 默认单笔限额
  DEFAULT_DAILY_LIMIT: 100, // 默认每日限额
} as const;

// 默认过期时间（天）
export const DEFAULT_EXPIRY_DAYS = {
  MIN: 1,
  MAX: 365,
  DEFAULT: 30,
} as const;

// 时间阈值（毫秒）
export const TIME_THRESHOLDS = {
  PREFLIGHT_CHECK_MAX: 200, // Pre-Flight Check 最大响应时间
  QUICKPAY_CONFIRM_MAX: 1000, // QuickPay 确认最大时间
  BATCH_INTERVAL: 30000, // 批量上链间隔
} as const;

// 重试配置
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1秒
} as const;

// 地址格式
export const ADDRESS_FORMAT = {
  LENGTH: 42, // 0x + 40 hex chars
  PREFIX: '0x',
} as const;

// USDC 精度
export const USDC_DECIMALS = 6;

// 路由显示名称
export const ROUTE_DISPLAY_NAMES: Record<string, string> = {
  [ROUTE_TYPES.QUICKPAY]: '⚡ QuickPay',
  [ROUTE_TYPES.WALLET]: '💼 Wallet',
  [ROUTE_TYPES.CRYPTO_RAIL]: '🌍 Crypto Rail',
  [ROUTE_TYPES.LOCAL_RAIL]: '🏠 Local Rail',
};

// 路由描述
export const ROUTE_DESCRIPTIONS: Record<string, string> = {
  [ROUTE_TYPES.QUICKPAY]: 'Instant payment using Session Key. No wallet confirmation needed.',
  [ROUTE_TYPES.WALLET]: 'Direct wallet payment. Requires wallet signature.',
  [ROUTE_TYPES.CRYPTO_RAIL]: 'Pay with card or Apple Pay. Converted to USDC automatically.',
  [ROUTE_TYPES.LOCAL_RAIL]: 'Local payment method (Alipay, PayNow, etc.)',
};

