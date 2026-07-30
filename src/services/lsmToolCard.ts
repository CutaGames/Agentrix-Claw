/**
 * lsmToolCard — 把后端 lsm_* 工具的 tool_result 映射为对话内 LsmCard（B LLM 工具路径）。
 *
 * 与 A（客户端意图）共用同一套 `LsmCards` 渲染层。后端工具返回的 data 带 `cardType`
 * （lsm_market_list / lsm_preview / lsm_order_placed / lsm_positions / lsm_cashed_out /
 * lsm_spending_authorized，见 backend lsm.tools.ts）。本映射器鲁棒处理多种包装形态：
 *   - result 直接就是 data（含 cardType）
 *   - result.data 含 cardType
 *   - result 是 JSON 字符串
 * 并把工具卡的 market 形态（marketId/match/outcomes[decimalOdds]）转成 LsmCards 期望的
 * LsmMarketView 形态（id/homeTeam/awayTeam/odds[fairOdds]），使内联下单 composer 可直接复用。
 *
 * 纯函数、无副作用，便于 node 单测。
 */
import type { LsmCard } from '../components/lsm/LsmCards';
import type { LsmMarketView, LsmOrder, LsmPreview, LsmAsset } from './lsm.api';

function coerce(raw: any): any {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

/** 取出真正带 cardType 的对象（result 本身 / result.data）。 */
function pickCardData(raw: any): any {
  const r = coerce(raw);
  if (!r || typeof r !== 'object') return null;
  if (typeof r.cardType === 'string') return r;
  if (r.data && typeof r.data.cardType === 'string') return r.data;
  return r; // 无 cardType 时按 toolName 兜底判断
}

/** 工具卡 market 项 → LsmMarketView（内联 composer 需要）。 */
function toMarketView(m: any): LsmMarketView {
  const match = String(m.match || '');
  const parts = match.split(/\s+vs\s+/i);
  const home = m.homeTeam || parts[0] || 'Home';
  const away = m.awayTeam || parts[1] || 'Away';
  let homeScore: number | null = null;
  let awayScore: number | null = null;
  if (typeof m.score === 'string' && m.score.includes(':')) {
    const [h, a] = m.score.split(':').map((x: string) => Number(x));
    if (!Number.isNaN(h)) homeScore = h;
    if (!Number.isNaN(a)) awayScore = a;
  }
  const odds = Array.isArray(m.outcomes)
    ? m.outcomes.map((o: any) => ({
        outcomeIdx: Number(o.outcomeIdx),
        fairOdds: Number(o.decimalOdds ?? o.fairOdds ?? 0),
      }))
    : Array.isArray(m.odds)
    ? m.odds.map((o: any) => ({ outcomeIdx: Number(o.outcomeIdx), fairOdds: Number(o.fairOdds ?? 0) }))
    : [];
  return {
    id: m.marketId || m.id,
    externalMarketId: m.externalMarketId || '',
    sport: m.sport || 'soccer',
    league: m.league ?? null,
    homeTeam: home,
    awayTeam: away,
    outcomeCount: odds.length || 2,
    status: (m.status || 'live') as LsmMarketView['status'],
    kickoffAt: m.kickoffAt ?? null,
    lastOddsAt: null,
    tradable: m.tradable !== false,
    stale: false,
    winningOutcomeIdx: null,
    homeScore,
    awayScore,
    odds,
  };
}

/**
 * 映射 tool_result → LsmCard。无法识别时返回 null（调用方跳过，不影响文本回复）。
 */
export function lsmToolResultToCard(toolName: string, rawResult: any): LsmCard | null {
  const d = pickCardData(rawResult);
  if (!d || typeof d !== 'object') return null;
  const cardType: string = d.cardType || '';
  const asset: LsmAsset = (d.asset as LsmAsset) || 'USDC';

  switch (cardType || toolName) {
    case 'lsm_market_list':
    case 'lsm_search_markets': {
      const markets = Array.isArray(d.markets) ? d.markets.map(toMarketView).filter((m: LsmMarketView) => m.id) : [];
      return markets.length ? { kind: 'markets', markets } : null;
    }
    case 'lsm_preview':
    case 'lsm_preview_order': {
      const preview: LsmPreview = {
        marketId: d.marketId,
        outcomeIdx: Number(d.outcomeIdx ?? 0),
        stake: Number(d.stake ?? 0),
        leverage: Number(d.leverage ?? 1),
        fairOdds: Number(d.fairOdds ?? 0),
        tradableOdds: Number(d.tradableOdds ?? 0),
        notional: Number(d.notional ?? 0),
        maxProfit: Number(d.maxProfit ?? 0),
        maxLoss: Number(d.maxLoss ?? 0),
        winPayout: Number(d.winPayout ?? 0),
        tradable: d.tradable !== false,
        slippageBps: Number(d.slippageBps ?? 0),
      };
      return { kind: 'preview', preview, asset };
    }
    case 'lsm_order_placed': {
      return {
        kind: 'order_placed',
        order: {
          id: d.id,
          status: d.status || 'open',
          asset,
          stake: d.stake != null ? Number(d.stake) : undefined,
          leverage: d.leverage != null ? Number(d.leverage) : undefined,
          entryOdds: d.entryOdds != null ? Number(d.entryOdds) : undefined,
          winPayout: d.winPayout != null ? Number(d.winPayout) : undefined,
        },
      };
    }
    case 'lsm_positions':
    case 'lsm_my_positions': {
      const positions: LsmOrder[] = Array.isArray(d.positions)
        ? d.positions.map((p: any) => ({
            id: p.id,
            marketId: p.marketId,
            outcomeIdx: Number(p.outcomeIdx ?? 0),
            asset: (p.asset as LsmAsset) || 'USDC',
            stake: Number(p.stake ?? 0),
            leverage: Number(p.leverage ?? 1),
            entryOdds: Number(p.entryOdds ?? 0),
            notional: Number(p.notional ?? 0),
            status: (p.status || 'open') as LsmOrder['status'],
            payout: Number(p.payout ?? 0),
            closePnl: Number(p.closePnl ?? 0),
            cashoutValue: p.cashoutValue != null ? Number(p.cashoutValue) : null,
            createdAt: Number(p.createdAt ?? 0),
            settledAt: p.settledAt != null ? Number(p.settledAt) : null,
          }))
        : [];
      return { kind: 'positions', positions };
    }
    case 'lsm_cashed_out':
    case 'lsm_cashout': {
      return {
        kind: 'cashed_out',
        order: {
          id: d.id,
          status: d.status || 'cashed_out',
          asset,
          payout: d.payout != null ? Number(d.payout) : undefined,
          closePnl: d.closePnl != null ? Number(d.closePnl) : undefined,
        },
      };
    }
    case 'lsm_spending_authorized':
    case 'lsm_authorize_spending': {
      return {
        kind: 'spending_authorized',
        mandate: {
          dailyLimitUsdc: d.dailyLimitUsdc != null ? Number(d.dailyLimitUsdc) : undefined,
          validUntil: d.validUntil,
        },
      };
    }
    default:
      return null;
  }
}
