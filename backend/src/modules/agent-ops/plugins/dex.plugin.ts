import { Inject, Injectable } from '@nestjs/common';

import { BaseDataSourcePlugin } from './base-data-source.plugin';
import { dexscreenerSlug, isEvmAddress } from './chain-explorers';
import {
  DueDiligenceTarget,
  READ_ONLY_FETCHER,
  ReadOnlyFetcher,
} from '../data-source-plugin.types';

/**
 * DexPlugin — DEX 行情只读数据源(dexscreener 系)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C4「采集插件」首批之一(DEX)。
 *   - 需求 8 验收清单 A.3(流动性)/ A.5(DEX 关键链接)。
 *
 * 处理 token / contract(需 EVM 地址 + 已知链)。采集流动性 / 价格 / 24h 量等**可核字段**;
 * 只读;失败/缺数据 → 标「未获取」(基类兜底,不编造)。
 */
@Injectable()
export class DexPlugin extends BaseDataSourcePlugin {
  readonly name = 'dex';

  constructor(@Inject(READ_ONLY_FETCHER) fetcher: ReadOnlyFetcher) {
    super(fetcher);
  }

  supports(target: DueDiligenceTarget): boolean {
    return (
      ['token', 'contract'].includes(target.type) &&
      isEvmAddress(target.address) &&
      dexscreenerSlug(target.chain) != null
    );
  }

  sourceUrl(target: DueDiligenceTarget): string {
    const slug = dexscreenerSlug(target.chain);
    if (!slug || !isEvmAddress(target.address)) return '';
    return `https://dexscreener.com/${slug}/${target.address!.trim()}`;
  }

  protected buildExtractExpression(): string {
    // 只读 DOM 提取(示意):读取流动性 / 价格 / 24h 成交量。
    return `(() => {
      const txt = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim() : null; };
      return {
        priceUsdText: txt('[data-testid="price-usd"], .price-usd'),
        liquidityUsdText: txt('[data-testid="liquidity-usd"], .liquidity-usd'),
        volume24hText: txt('[data-testid="volume-24h"], .volume-24h'),
      };
    })()`;
  }

  protected normalize(
    raw: any,
    _target: DueDiligenceTarget,
  ): Record<string, any> | null {
    if (raw == null || typeof raw !== 'object') return null;

    const out: Record<string, any> = {};
    const price = this.parseUsd(raw.priceUsdText ?? raw.priceUsd);
    if (price != null) out.priceUsd = price;
    const liq = this.parseUsd(raw.liquidityUsdText ?? raw.liquidityUsd);
    if (liq != null) out.liquidityUsd = liq;
    const vol = this.parseUsd(raw.volume24hText ?? raw.volume24h);
    if (vol != null) out.volume24hUsd = vol;

    return Object.keys(out).length ? out : null;
  }

  /** 解析美元数值(支持 $ / 千分位 / K/M/B 后缀);无法解析返回 null(绝不编造)。 */
  private parseUsd(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v !== 'string') return null;
    const s = v.replace(/[$,\s]/g, '');
    const m = s.match(/^(\d+(?:\.\d+)?)([kmb])?$/i);
    if (!m) return null;
    const base = Number(m[1]);
    if (!Number.isFinite(base)) return null;
    const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? '').toLowerCase()] ?? 1;
    return base * mult;
  }
}
