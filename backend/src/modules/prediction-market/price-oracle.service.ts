import { Injectable, Logger } from '@nestjs/common';

/**
 * 价格预言机：从公开数据源拉 spot 价格。
 * 默认 Binance Public API（无需 key）。失败时回退 Coingecko。
 */
@Injectable()
export class PriceOracleService {
  private readonly logger = new Logger(PriceOracleService.name);

  private static readonly BINANCE_SYMBOL: Record<string, string> = {
    BTC: 'BTCUSDT',
    ETH: 'ETHUSDT',
    SOL: 'SOLUSDT',
  };

  private static readonly COINGECKO_ID: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
  };

  private cache: Map<string, { price: number; ts: number }> = new Map();

  async getSpotPrice(asset: string): Promise<number> {
    const upper = asset.toUpperCase();
    // 5 秒缓存，避免 cron 抖动重复请求
    const cached = this.cache.get(upper);
    if (cached && Date.now() - cached.ts < 5_000) return cached.price;

    let price: number | null = null;
    try {
      price = await this.fetchBinance(upper);
    } catch (e: any) {
      this.logger.warn(`Binance price fetch failed for ${upper}: ${e?.message}`);
    }
    if (price == null) {
      try {
        price = await this.fetchCoingecko(upper);
      } catch (e: any) {
        this.logger.warn(`Coingecko price fetch failed for ${upper}: ${e?.message}`);
      }
    }
    if (price == null || !Number.isFinite(price) || price <= 0) {
      throw new Error(`Failed to fetch price for ${upper}`);
    }
    this.cache.set(upper, { price, ts: Date.now() });
    return price;
  }

  private async fetchBinance(asset: string): Promise<number | null> {
    const symbol = PriceOracleService.BINANCE_SYMBOL[asset];
    if (!symbol) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
        { signal: ctrl.signal },
      );
      if (!res.ok) return null;
      const json: any = await res.json();
      const p = parseFloat(json?.price);
      return Number.isFinite(p) ? p : null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchCoingecko(asset: string): Promise<number | null> {
    const id = PriceOracleService.COINGECKO_ID[asset];
    if (!id) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
        { signal: ctrl.signal },
      );
      if (!res.ok) return null;
      const json: any = await res.json();
      const p = parseFloat(json?.[id]?.usd);
      return Number.isFinite(p) ? p : null;
    } finally {
      clearTimeout(timer);
    }
  }
}
