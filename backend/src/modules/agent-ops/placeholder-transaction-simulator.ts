import { Injectable, Logger } from '@nestjs/common';

import {
  TransactionSimulationRequest,
  TransactionSimulationResult,
  TransactionSimulator,
} from './security-guard.types';

/**
 * PlaceholderTransactionSimulator — 交易模拟适配器占位实现(crypto-native-agent-ops 任务 17)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C5:交易模拟/解读(集成模拟 RPC,如 Tenderly/anvil fork,**适配器待选**)。
 *   - 需求 10.2:用户即将签署交易时提供交易模拟/解读供决策。
 *   - Property 8「降级显式」:模拟适配器未配置 → `available:false`,**绝不伪造**资产变动。
 *
 * 真实适配器(Tenderly simulate API / 本地 anvil fork eth_call+trace)接入后替换本占位。
 * 占位实现明确告知「模拟未配置」,只读、不上链、不签名、不转账。
 */
@Injectable()
export class PlaceholderTransactionSimulator implements TransactionSimulator {
  private readonly logger = new Logger(PlaceholderTransactionSimulator.name);

  readonly name = 'placeholder';

  async simulate(
    req: TransactionSimulationRequest,
  ): Promise<TransactionSimulationResult> {
    this.logger.debug(
      `交易模拟(占位):chain=${req.chain} to=${req.to} —— 适配器待选(Tenderly/anvil fork)`,
    );
    return {
      available: false,
      provider: this.name,
      // 不伪造 assetChanges(Property 8:降级显式,不编造)。
      summary:
        '交易模拟适配器尚未配置,无法提供资产变动/目标合约风险解读。请在签名前自行核对交易详情。',
      note: 'SIMULATION_ADAPTER_NOT_CONFIGURED: Tenderly/anvil-fork 适配器待选(design §C5)',
    };
  }
}
