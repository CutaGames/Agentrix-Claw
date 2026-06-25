/**
 * 链 → 区块浏览器 / DEX 聚合器 域名映射(crypto-native-agent-ops 任务 12)。
 *
 * spec: design §C4。仅用于构造**可核来源链接**(只读)。映射缺失时返回 null,
 * 由插件据此标「未获取」,绝不臆造域名。
 */

/** 规范化链标识(大小写 / 常见别名)。 */
export function normalizeChain(chain?: string): string | null {
  if (!chain) return null;
  const c = chain.trim().toLowerCase();
  if (!c) return null;
  const alias: Record<string, string> = {
    eth: 'ethereum',
    ethereum: 'ethereum',
    mainnet: 'ethereum',
    bsc: 'bsc',
    bnb: 'bsc',
    'binance-smart-chain': 'bsc',
    base: 'base',
    arb: 'arbitrum',
    arbitrum: 'arbitrum',
    polygon: 'polygon',
    matic: 'polygon',
    optimism: 'optimism',
    op: 'optimism',
    avalanche: 'avalanche',
    avax: 'avalanche',
  };
  return alias[c] ?? null;
}

/** 区块浏览器域名(规范化链 → host)。 */
const EXPLORER_HOSTS: Record<string, string> = {
  ethereum: 'etherscan.io',
  bsc: 'bscscan.com',
  base: 'basescan.org',
  arbitrum: 'arbiscan.io',
  polygon: 'polygonscan.com',
  optimism: 'optimistic.etherscan.io',
  avalanche: 'snowtrace.io',
};

/** DEX 聚合器(dexscreener)链 slug。 */
const DEXSCREENER_SLUGS: Record<string, string> = {
  ethereum: 'ethereum',
  bsc: 'bsc',
  base: 'base',
  arbitrum: 'arbitrum',
  polygon: 'polygon',
  optimism: 'optimism',
  avalanche: 'avalanche',
};

/** 区块浏览器 host(无映射返回 null)。 */
export function explorerHost(chain?: string): string | null {
  const norm = normalizeChain(chain);
  return norm ? (EXPLORER_HOSTS[norm] ?? null) : null;
}

/** dexscreener 链 slug(无映射返回 null)。 */
export function dexscreenerSlug(chain?: string): string | null {
  const norm = normalizeChain(chain);
  return norm ? (DEXSCREENER_SLUGS[norm] ?? null) : null;
}

/** 基础 EVM 地址格式校验(0x + 40 hex)。 */
export function isEvmAddress(addr?: string): boolean {
  return !!addr && /^0x[0-9a-fA-F]{40}$/.test(addr.trim());
}
