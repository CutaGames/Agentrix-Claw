/**
 * Stripe 配置
 */

export const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder'

// 支付货币配置
export const CURRENCY_CONFIG = {
  CNY: {
    symbol: '¥',
    decimals: 2,
    name: '人民币'
  },
  USD: {
    symbol: '$',
    decimals: 2,
    name: '美元'
  }
}

// 支付金额限制
export const PAYMENT_LIMITS = {
  min: 0.01, // 最小支付金额
  max: 1000000, // 最大支付金额
}

