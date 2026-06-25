import { Injectable, Logger } from '@nestjs/common';

import { ScamCheckRequest, ScamIntelProvider } from './security-guard.types';

/**
 * PlaceholderScamIntelProvider — 骗局情报源占位实现(crypto-native-agent-ops 任务 17)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C5:地址/合约/域名骗局检查(情报源待接)。
 *   - 需求 10.3:对目标地址/合约/域名做骗局与风险检查并给出明确提示。
 *   - Property 8「降级显式」:情报不可得 → `flagged:null`(未知),**绝不臆造结论**。
 *
 * 真实实现可接 Chainabuse / ScamSniffer / GoPlus Security 等只读情报 API。
 * 占位实现返回「未知」,SecurityGuard 据此与本地启发式规则合并判定。
 */
@Injectable()
export class PlaceholderScamIntelProvider implements ScamIntelProvider {
  private readonly logger = new Logger(PlaceholderScamIntelProvider.name);

  readonly name = 'placeholder';

  async lookup(_req: ScamCheckRequest): Promise<{
    flagged: boolean | null;
    signals: string[];
    sources: string[];
  }> {
    // 情报源未接入 → 返回「未知」(不编造)。SecurityGuard 仍会跑本地启发式规则。
    return { flagged: null, signals: [], sources: [] };
  }
}
