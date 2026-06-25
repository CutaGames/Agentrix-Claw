/**
 * 支付相关工具函数
 */

/**
 * 格式化金额显示
 */
export function formatAmount(amount: number, currency: string = 'USDC', decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency === 'USDC' ? 'USD' : currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * 格式化大数字（用于显示余额）
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K';
  }
  return num.toFixed(2);
}

/**
 * 计算剩余额度百分比
 */
export function calculateRemainingPercentage(used: number, limit: number): number {
  if (limit === 0) return 0;
  return Math.max(0, Math.min(100, ((limit - used) / limit) * 100));
}

/**
 * 格式化时间剩余
 */
export function formatTimeRemaining(expiry: Date): string {
  const now = new Date();
  const diff = expiry.getTime() - now.getTime();

  if (diff <= 0) {
    return 'Expired';
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} remaining`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} remaining`;
  }
  return `${minutes} minute${minutes > 1 ? 's' : ''} remaining`;
}

/**
 * 获取路由显示名称
 */
export function getRouteDisplayName(route: string): string {
  const routeNames: Record<string, string> = {
    quickpay: '⚡ QuickPay',
    wallet: '💼 Wallet',
    'crypto-rail': '🌍 Crypto Rail',
    'local-rail': '🏠 Local Rail',
  };
  return routeNames[route] || route;
}

/**
 * 获取路由描述
 */
export function getRouteDescription(route: string): string {
  const descriptions: Record<string, string> = {
    quickpay: 'Instant payment using Session Key. No wallet confirmation needed.',
    wallet: 'Direct wallet payment. Requires wallet signature.',
    'crypto-rail': 'Pay with card or Apple Pay. Converted to USDC automatically.',
    'local-rail': 'Local payment method (Alipay, PayNow, etc.)',
  };
  return descriptions[route] || '';
}

/**
 * 验证地址格式
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * 缩短地址显示
 */
export function shortenAddress(address: string, chars: number = 4): string {
  if (!isValidAddress(address)) {
    return address;
  }
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * 格式化交易哈希
 */
export function formatTxHash(txHash: string): string {
  if (!txHash) return 'Pending';
  return shortenAddress(txHash, 8);
}

/**
 * 获取支付状态颜色
 */
export function getPaymentStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'yellow',
    processing: 'blue',
    completed: 'green',
    failed: 'red',
    cancelled: 'gray',
    refunded: 'orange',
  };
  return colors[status] || 'gray';
}

/**
 * 获取支付状态图标
 */
export function getPaymentStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    pending: '⏳',
    processing: '🔄',
    completed: '✅',
    failed: '❌',
    cancelled: '🚫',
    refunded: '↩️',
  };
  return icons[status] || '❓';
}

