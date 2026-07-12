// 赛事预测市场 API 服务（后端模块 leverage-sports-market / lsm，前端展示「赛事预测」）
import { apiFetch } from './api';

/**
 * 下注计价资产：
 *  - AXP：站内积分（整数点数，免费玩，不可提现）
 *  - USDC：链上真实稳定币（测试网），金额以最小单位 0.01 USDC 计（即「分」），
 *    展示时除以 100 → X.XX USDC。
 */
export type LsmAsset = 'AXP' | 'USDC';

/**
 * USDC 结算链配置（测试网）。
 * 充值：向对应链的 CollateralVault 转入 USDC，再把 txHash 提交后端入账。
 * 提现：经后端中继到指定地址。
 */
export interface LsmChainConfig {
  chainId: number;
  name: string;
  /** USDC 代币合约地址（6 位精度）。 */
  usdc: string;
  /** 抵押金库（CollateralVault）合约地址 —— USDC 充值的收款地址。 */
  vault: string;
  /** 区块浏览器交易详情前缀。 */
  explorerTx: string;
}

export const LSM_CHAINS: LsmChainConfig[] = [
  {
    chainId: 1439,
    name: 'Injective EVM Testnet',
    usdc: '0x9fcF02d8f706BAbc690a860F89b93b9801c8F28D',
    vault: '0x760ee31334EA03c2e47900eb3c419C232b4375C0',
    explorerTx: 'https://testnet.blockscout.injective.network/tx/',
  },
  {
    chainId: 97,
    name: 'BSC Testnet',
    usdc: '0x7103995D9f0B87c16964ed34Fe29AdDff8cCd5a0',
    vault: '0x75b7CaE3ec28b2F5aA0dD275E83Ac96Cd60cfa93',
    explorerTx: 'https://testnet.bscscan.com/tx/',
  },
];

export function getLsmChain(chainId: number): LsmChainConfig | undefined {
  return LSM_CHAINS.find((c) => c.chainId === chainId);
}

/** 交易在区块浏览器的可点链接（凭证）。未知链返回 null。 */
export function explorerTxUrl(chainId: number, txHash?: string | null): string | null {
  if (!txHash) return null;
  const c = getLsmChain(chainId);
  return c ? `${c.explorerTx}${txHash}` : null;
}

/** 钱包余额（AXP 整数点数；USDC 最小单位 0.01 USDC）。 */
export interface LsmWalletBalance {
  axp: number;
  usdc: number;
  chainId?: number;
  unitScale?: number;
}

/**
 * 按资产格式化金额：
 *  - AXP：整数点数，原样显示。
 *  - USDC：入参为最小单位（0.01 USDC），除以 100 → X.XX USDC。
 */
export function formatAsset(amount: number, asset: LsmAsset): string {
  const n = Number(amount) || 0;
  if (asset === 'USDC') {
    return `${(n / 100).toFixed(2)} USDC`;
  }
  return `${Math.round(n)} AXP`;
}

export interface LsmOddsOutcome {
  outcomeIdx: number;
  fairOdds: number;
}

export interface LsmMarketView {
  id: string;
  externalMarketId: string;
  sport: string;
  league: string | null;
  homeTeam: string;
  awayTeam: string;
  outcomeCount: number;
  status: 'pre' | 'live' | 'suspended' | 'final' | 'voided';
  kickoffAt: number | null;
  lastOddsAt: number | null;
  tradable: boolean;
  stale: boolean;
  winningOutcomeIdx: number | null;
  homeScore?: number | null;
  awayScore?: number | null;
  odds: LsmOddsOutcome[];
}

export interface LsmPreview {
  marketId: string;
  outcomeIdx: number;
  stake: number;
  leverage: number;
  fairOdds: number;
  tradableOdds: number;
  notional: number;
  maxProfit: number;
  maxLoss: number;
  winPayout: number;
  tradable: boolean;
  slippageBps: number;
  /** 开仓平台交易费（整数，最小单位；LSM_OPEN_FEE_BPS 默认 0）。 */
  openFee?: number;
  /** 强平赔率阈值（小数制）：当前赔率涨到该值即触发盘中强平；leverage<2/关闭时为 null。 */
  liquidationOdds?: number | null;
  /** 维护保证金（整数，最小单位）：兑现值跌破即强平。 */
  maintenanceMargin?: number;
}

export interface LsmOrder {
  id: string;
  marketId: string;
  outcomeIdx: number;
  /** 计价资产（默认 AXP）。 */
  asset: LsmAsset;
  stake: number;
  leverage: number;
  entryOdds: number;
  notional: number;
  maxProfit: number;
  status: 'open' | 'won' | 'lost' | 'refunded' | 'cashed_out' | 'liquidated';
  payout: number;
  closePnl: number;
  /** OPEN 单当前可兑现值（mark-to-market，整数 AXP）；不可兑现时为 null */
  cashoutValue: number | null;
  /** 强平赔率阈值（小数制）：leverage≥2 时非空。 */
  liquidationOdds?: number | null;
  /** 开仓费（最小单位）。 */
  openFee?: number;
  /** 强平罚金（最小单位，仅 LIQUIDATED 非零）。 */
  liquidationFee?: number;
  createdAt: number;
  settledAt: number | null;
}

export interface LsmVaultView {
  id: string;
  kind: 'protocol' | 'user';
  name: string | null;
  leaderUserId: string | null;
  status: 'active' | 'closing' | 'closed';
  bankroll: number;
  reserved: number;
  equity: number;
  totalShares: number;
  nav: number;
  utilizationBps: number;
  minLeaderShareBps: number;
  profitShareBps: number;
  depositLockSecs: number;
}

export interface LsmVaultPosition {
  vaultId: string;
  shares: number;
  costBasis: number;
  isLeader: boolean;
  lockedUntil: number | null;
}

export interface LsmSubscription {
  id: string;
  vaultId: string;
  scopeType: 'league' | 'market';
  scopeValue: string;
  capacity: number;
  feeBidBps: number;
  enabled: boolean;
}

export interface LsmDisclosure {
  zh: { title: string; points: string[] };
  en: { title: string; points: string[] };
  minKyc: { bet: string; lp: string; leader: string };
}

export interface LsmLeaderboardRow {
  rank: number;
  userId: string;
  value: number;
  bets: number;
}

// ── 责任博彩（Responsible Gambling） ──
export type LsmLimitType =
  | 'deposit_daily'
  | 'deposit_weekly'
  | 'loss_daily'
  | 'loss_weekly'
  | 'bet_count_daily'
  | 'bet_amount_daily';

export interface LsmRgLimitView {
  used: number;
  limit: number | null;
  resetAt: number;
}

export interface LsmRgStatus {
  enabled: boolean;
  asset: LsmAsset;
  /** number(ms) | 'permanent' | null（未排除） */
  selfExcludedUntil: number | 'permanent' | null;
  /** number(ms) | null（无活跃冷静期） */
  coolOffUntil: number | null;
  limits: Record<string, LsmRgLimitView>;
}

/**
 * 把责任博彩/KYC 后端错误码（或抛出的 Error）映射为中文文案；无关时返回 null。
 */
export function rgErrorText(codeOrErr: any): string | null {
  const code: string =
    typeof codeOrErr === 'string' ? codeOrErr : codeOrErr?.message || '';
  if (code.includes('RG_SELF_EXCLUDED')) return '你已开启自我排除，期间无法下注或入金；到期或经支持解除后恢复。';
  if (code.includes('RG_COOL_OFF')) return '你正处于冷静期，到期后会自动恢复。';
  if (code.includes('RG_BET_LIMIT')) return '已达到你设置的投注限额，请稍后再试或调整限额。';
  if (code.includes('RG_LOSS_LIMIT')) return '已达到你设置的损失限额，为保护你已暂停下注。';
  if (code.includes('KYC_REQUIRED')) return '该操作需要先完成 KYC 验证。';
  return null;
}

/** 简单 uuid（幂等键，防重复提交） */
function idemKey(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const lsmApi = {
  // ── 盘口（只读） ──
  async listLive(league?: string, limit = 50): Promise<LsmMarketView[]> {
    const qs = new URLSearchParams();
    if (league) qs.set('league', league);
    qs.set('limit', String(limit));
    const r = await apiFetch<{ items: LsmMarketView[] }>(`/lsm/markets/live?${qs}`);
    return r.items;
  },
  async listRecent(limit = 20): Promise<LsmMarketView[]> {
    const r = await apiFetch<{ items: LsmMarketView[] }>(`/lsm/markets/recent?limit=${limit}`);
    return r.items;
  },
  async getMarket(id: string): Promise<LsmMarketView> {
    return apiFetch<LsmMarketView>(`/lsm/markets/${id}`);
  },

  // ── 下单 ──
  async preview(input: {
    marketId: string;
    outcomeIdx: number;
    stake: number;
    leverage: number;
    asset?: LsmAsset;
  }): Promise<LsmPreview> {
    return apiFetch<LsmPreview>(`/lsm/orders/preview`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async place(input: {
    marketId: string;
    outcomeIdx: number;
    stake: number;
    leverage: number;
    quotedOdds: number;
    asset?: LsmAsset;
  }): Promise<{ id: string; status: string; winPayout: number }> {
    return apiFetch(`/lsm/orders`, {
      method: 'POST',
      body: JSON.stringify({ ...input, idemKey: idemKey() }),
    });
  },
  async myOrders(limit = 50): Promise<LsmOrder[]> {
    const r = await apiFetch<{ items: LsmOrder[] }>(`/lsm/me/orders?limit=${limit}`);
    return r.items;
  },
  async oddsHistory(
    marketId: string,
    range: 'all' | '30m' | '10m' | '5m' = 'all',
  ): Promise<{
    marketId: string;
    range: string;
    series: Array<{ outcomeIdx: number; points: Array<{ ts: number; odds: number }> }>;
  }> {
    return apiFetch(`/lsm/markets/${marketId}/odds-history?range=${range}`);
  },
  async cashOut(
    orderId: string,
  ): Promise<{
    id: string;
    status: string;
    payout: number;
    closePnl: number;
    cashoutValue: number;
    settledAt: number | null;
  }> {
    return apiFetch(`/lsm/orders/${orderId}/cashout`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  // ── 钱包（双币：AXP + 链上 USDC 测试网） ──
  /** 双币余额（AXP 整数点数；USDC 最小单位 0.01 USDC）。失败时回退 0。 */
  async walletBalance(): Promise<LsmWalletBalance> {
    try {
      const r = await apiFetch<LsmWalletBalance>(`/lsm/wallet/balance`);
      return { axp: r?.axp ?? 0, usdc: r?.usdc ?? 0, chainId: r?.chainId, unitScale: r?.unitScale };
    } catch {
      return { axp: 0, usdc: 0 };
    }
  },
  /** 提交 USDC 充值（用户已向 CollateralVault 转账后，提交 txHash 入账）。 */
  async walletDeposit(input: { chainId: number; txHash: string }): Promise<{ credited?: number; status?: string }> {
    return apiFetch(`/lsm/wallet/deposit`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  /** 经后端中继提现 USDC 到指定地址（amount 为最小单位 0.01 USDC）。 */
  async walletWithdraw(input: {
    amount: number;
    toAddress: string;
    chainId?: number;
  }): Promise<{ txHash?: string; status?: string }> {
    return apiFetch(`/lsm/wallet/withdraw`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  // ── 金库（LP） ──
  async listVaults(kind?: 'protocol' | 'user'): Promise<LsmVaultView[]> {
    const qs = kind ? `?kind=${kind}` : '';
    const r = await apiFetch<{ items: LsmVaultView[] }>(`/lsm/vaults${qs}`);
    return r.items;
  },
  async getVault(id: string): Promise<LsmVaultView> {
    return apiFetch<LsmVaultView>(`/lsm/vaults/${id}`);
  },
  async deposit(vaultId: string, amount: number): Promise<{ sharesMinted: number; nav: number }> {
    return apiFetch(`/lsm/vaults/deposit`, {
      method: 'POST',
      body: JSON.stringify({ vaultId, amount }),
    });
  },
  async redeem(vaultId: string, shares: number): Promise<{ payout: number; sharesBurned: number; nav: number }> {
    return apiFetch(`/lsm/vaults/redeem`, {
      method: 'POST',
      body: JSON.stringify({ vaultId, shares }),
    });
  },
  async myPositions(): Promise<LsmVaultPosition[]> {
    const r = await apiFetch<{ items: LsmVaultPosition[] }>(`/lsm/vaults/me/positions`);
    return r.items;
  },
  async createUserVault(input: {
    name: string;
    initialDeposit: number;
    minLeaderShareBps?: number;
    profitShareBps?: number;
    depositLockSecs?: number;
  }): Promise<LsmVaultView> {
    return apiFetch<LsmVaultView>(`/lsm/vaults/user`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async closeVault(vaultId: string): Promise<LsmVaultView> {
    return apiFetch<LsmVaultView>(`/lsm/vaults/${vaultId}/close`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  async listSubscriptions(vaultId: string): Promise<LsmSubscription[]> {
    const r = await apiFetch<{ items: LsmSubscription[] }>(`/lsm/vaults/${vaultId}/subscriptions`);
    return r.items;
  },
  async upsertSubscription(input: {
    vaultId: string;
    scopeType: 'league' | 'market';
    scopeValue: string;
    capacity: number;
    feeBidBps: number;
    enabled?: boolean;
  }): Promise<LsmSubscription> {
    return apiFetch<LsmSubscription>(`/lsm/vaults/subscriptions`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async disclosure(): Promise<LsmDisclosure> {
    return apiFetch<LsmDisclosure>(`/lsm/vaults/disclosure`);
  },

  // ── 责任博彩（需登录） ──
  /** 我的责任博彩状态（限额已用量/上限 + 自我排除/冷静态）。 */
  async rgStatus(asset?: LsmAsset): Promise<LsmRgStatus> {
    const qs = asset ? `?asset=${asset}` : '';
    return apiFetch<LsmRgStatus>(`/lsm/rg${qs}`);
  },
  /** 设置自限额度（即时收紧、延迟放宽）；返回最新状态。 */
  async rgSetLimit(input: {
    asset?: LsmAsset;
    limitType: LsmLimitType;
    value: number;
  }): Promise<LsmRgStatus> {
    return apiFetch<LsmRgStatus>(`/lsm/rg/limit`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  /** 自我排除（固定期或永久；永久仅人工/合规解除）。 */
  async rgSelfExclude(input: { durationSecs?: number; permanent?: boolean }): Promise<{ ok: boolean }> {
    return apiFetch(`/lsm/rg/self-exclude`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  /** 冷静期（到期自动恢复）。 */
  async rgCoolOff(durationSecs: number): Promise<{ ok: boolean }> {
    return apiFetch(`/lsm/rg/cool-off`, {
      method: 'POST',
      body: JSON.stringify({ durationSecs }),
    });
  },
  /** 链上偿付快照（公开）：合约储备 vs 内部负债 + isSolvent。失败静默降级。 */
  async onchainSolvency(chainId?: number): Promise<{
    chainId: number;
    solvent: boolean | null;
    reserveUsdc: number | null;
    liabilitiesUsdc: number | null;
    available: boolean;
  } | null> {
    try {
      const qs = chainId ? `?chainId=${chainId}` : '';
      return await apiFetch(`/lsm/onchain/solvency${qs}`);
    } catch {
      return null;
    }
  },
  async leaderboard(
    board: 'pnl' | 'volume' = 'pnl',
    period: 'all' | 'week' = 'all',
    limit = 20,
  ): Promise<{ board: string; period: string; items: LsmLeaderboardRow[] }> {
    const qs = new URLSearchParams({ board, period, limit: String(limit) });
    return apiFetch(`/lsm/leaderboard?${qs}`);
  },
};
