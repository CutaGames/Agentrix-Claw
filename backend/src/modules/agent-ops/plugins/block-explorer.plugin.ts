import { Inject, Injectable } from '@nestjs/common';

import { BaseDataSourcePlugin } from './base-data-source.plugin';
import { explorerHost, isEvmAddress } from './chain-explorers';
import {
  DueDiligenceTarget,
  READ_ONLY_FETCHER,
  ReadOnlyFetcher,
} from '../data-source-plugin.types';

/**
 * BlockExplorerPlugin — 区块浏览器只读数据源(Etherscan 系)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C4「采集插件」首批之一(区块浏览器)。
 *   - 需求 8 验收清单 A.3(链上活动:持币地址数、合约验证状态)/ A.4(合约权限风险信号)。
 *
 * 处理 token / contract / wallet(需 EVM 地址 + 已知链)。采集合约验证状态、持币地址数等
 * **可核字段**;只读;失败/缺数据 → 标「未获取」(基类兜底,不编造)。
 */
@Injectable()
export class BlockExplorerPlugin extends BaseDataSourcePlugin {
  readonly name = 'block_explorer';

  constructor(@Inject(READ_ONLY_FETCHER) fetcher: ReadOnlyFetcher) {
    super(fetcher);
  }

  supports(target: DueDiligenceTarget): boolean {
    return (
      ['token', 'contract', 'wallet'].includes(target.type) &&
      isEvmAddress(target.address) &&
      explorerHost(target.chain) != null
    );
  }

  sourceUrl(target: DueDiligenceTarget): string {
    const host = explorerHost(target.chain);
    if (!host || !isEvmAddress(target.address)) return '';
    const path = target.type === 'token' ? 'token' : 'address';
    return `https://${host}/${path}/${target.address!.trim()}`;
  }

  protected buildExtractExpression(): string {
    // 只读 DOM 提取(示意):读取合约验证状态 / 持币地址数等。
    // 真实选择器由桌面端在页面上下文求值;此处仅声明只读读取意图。
    return `(() => {
      const txt = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim() : null; };
      return {
        contractVerified: !!document.querySelector('#ContentPlaceHolder1_contractCodeDiv .text-success, [title="Contract Source Code Verified"]'),
        holdersText: txt('#ContentPlaceHolder1_tr_tokenHolders, [data-testid="holders-count"]'),
      };
    })()`;
  }

  protected normalize(
    raw: any,
    _target: DueDiligenceTarget,
  ): Record<string, any> | null {
    if (raw == null || typeof raw !== 'object') return null;

    const out: Record<string, any> = {};

    // 合约验证状态:只在源明确返回布尔时搬运。
    if (typeof raw.contractVerified === 'boolean') {
      out.contractVerified = raw.contractVerified;
    }

    // 持币地址数:仅在能从源文本解析出数字时搬运,否则不写(不编造)。
    const holders = this.parseCount(raw.holdersText ?? raw.holders);
    if (holders != null) {
      out.holderCount = holders;
    }

    return Object.keys(out).length ? out : null;
  }

  /** 从源文本解析整数(去千分位);无法解析返回 null(绝不编造)。 */
  private parseCount(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v !== 'string') return null;
    const m = v.replace(/,/g, '').match(/\d+/);
    return m ? Number(m[0]) : null;
  }
}
