import { Injectable, Logger } from '@nestjs/common';

export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  description?: string;
  imageUrl?: string;
  endDate?: string;
  volume?: number;
  liquidity?: number;
  yesPrice?: number; // 0-1
  noPrice?: number;  // 0-1
  url: string;
  category?: string;
}

/**
 * Polymarket 行情拉取（只读）。
 * 用 gamma-api 公共接口，无需 API key；用于"热点事件"展示与跳转下注。
 */
@Injectable()
export class PolymarketFeedService {
  private readonly logger = new Logger(PolymarketFeedService.name);
  private cache: { ts: number; data: PolymarketEvent[] } | null = null;
  private readonly CACHE_TTL_MS = 60_000;

  async getTrendingEvents(limit = 12): Promise<PolymarketEvent[]> {
    if (this.cache && Date.now() - this.cache.ts < this.CACHE_TTL_MS) {
      return this.cache.data.slice(0, limit);
    }
    try {
      const data = await this.fetchEvents(limit);
      this.cache = { ts: Date.now(), data };
      return data;
    } catch (e: any) {
      this.logger.warn(`Polymarket feed failed: ${e?.message}`);
      return this.cache?.data?.slice(0, limit) ?? [];
    }
  }

  private async fetchEvents(limit: number): Promise<PolymarketEvent[]> {
    const url = `https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume24hr&ascending=false&limit=${limit}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr: any[] = await res.json();
      if (!Array.isArray(arr)) return [];
      return arr.map((ev) => this.normalize(ev)).filter(Boolean) as PolymarketEvent[];
    } finally {
      clearTimeout(timer);
    }
  }

  private normalize(ev: any): PolymarketEvent | null {
    if (!ev || !ev.id) return null;
    // 取第一个 market 作为 yes/no 报价代表
    const markets: any[] = ev.markets || [];
    let yesPrice: number | undefined;
    let noPrice: number | undefined;
    if (markets.length) {
      const m = markets[0];
      let prices: number[] = [];
      if (typeof m.outcomePrices === 'string') {
        try {
          prices = JSON.parse(m.outcomePrices).map((p: any) => parseFloat(p));
        } catch {
          /* ignore */
        }
      } else if (Array.isArray(m.outcomePrices)) {
        prices = m.outcomePrices.map((p: any) => parseFloat(p));
      }
      if (prices.length >= 2) {
        yesPrice = prices[0];
        noPrice = prices[1];
      }
    }
    return {
      id: String(ev.id),
      slug: String(ev.slug || ev.id),
      title: String(ev.title || ev.question || 'Untitled'),
      description: ev.description ?? undefined,
      imageUrl: ev.image || ev.icon || undefined,
      endDate: ev.endDate || ev.end_date_iso || undefined,
      volume: typeof ev.volume === 'number' ? ev.volume : parseFloat(ev.volume) || undefined,
      liquidity:
        typeof ev.liquidity === 'number' ? ev.liquidity : parseFloat(ev.liquidity) || undefined,
      yesPrice,
      noPrice,
      url: `https://polymarket.com/event/${ev.slug || ev.id}`,
      category: ev.category || undefined,
    };
  }
}
