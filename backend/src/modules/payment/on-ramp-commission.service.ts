import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * On-ramp 分佣计算服务
 * 处理用户法币转数字货币时的 Agentrix 平台分佣（可配置，默认0.1%，可设为0）
 * 
 * 重要说明：
 * - 分佣为0不与非托管原则冲突，因为：
 *   1. 资金始终在智能合约中，Agentrix从未"持有"资金
 *   2. 分账由智能合约自动执行，Agentrix无法干预
 *   3. Agentrix只是技术服务商，不涉及资金托管
 * - 分佣是"服务费"，不是"托管资金"
 * - 可以通过环境变量 AGENTRIX_ON_RAMP_RATE 设置为0以避免法规风险
 */
@Injectable()
export class OnRampCommissionService {
  private readonly logger = new Logger(OnRampCommissionService.name);
  
  // Agentrix On-ramp 分佣费率（可配置，默认0.1%，可设为0）
  private readonly AGENTRIX_ON_RAMP_RATE: number;

  constructor(private configService: ConfigService) {
    // 从环境变量读取费率，默认0.1%（0.001），可以设为0
    const customRate = this.configService.get<number>('AGENTRIX_ON_RAMP_RATE');
    this.AGENTRIX_ON_RAMP_RATE = customRate !== undefined ? customRate : 0.001; // 默认0.1%
    
    if (this.AGENTRIX_ON_RAMP_RATE === 0) {
      this.logger.log('⚠️  Agentrix On-ramp commission rate is set to 0% (no service fee)');
    } else {
      this.logger.log(`Agentrix On-ramp commission rate: ${this.AGENTRIX_ON_RAMP_RATE * 100}%`);
    }
  }

  /**
   * 计算 On-ramp 总费用（Provider 费用 + Agentrix 平台费用）
   * 
   * 注意：Transak 的费率机制
   * - 46 USD 以内：固定费用（具体金额需要从 Provider 报价获取）
   * - 超过 46 USD：按比例收费（具体比例需要从 Provider 报价获取）
   * - 官方没有公开详细的费用计算机制，需要通过 API 获取实时报价
   * 
   * @param fiatAmount 用户支付的法币金额
   * @param providerFee Provider 费用（从 Provider API 获取）
   * @returns On-ramp 费用计算结果
   */
  calculateOnRampCommission(
    fiatAmount: number,
    providerFee: number, // Provider 费用（从 Provider API 获取）
  ): {
    providerFee: number;      // Provider 费用
    agentrixFee: number;      // Agentrix 平台分佣（0.1%）
    totalFee: number;          // 总费用（Provider + Agentrix）
    totalPrice: number;       // 用户需要支付的总金额（商品价格 + 总费用）
  } {
    // 1. Provider 费用（从 Provider API 获取，已经考虑了固定费用和比例费用）
    // Transak 的费率机制：
    // - 46 USD 以内：固定费用（例如 $2.99）
    // - 超过 46 USD：按比例收费（例如 2.9%）
    // 这些信息已经包含在 providerFee 中
    
    // 2. 计算 Agentrix 平台分佣（基于用户支付的法币金额）
    // 注意：平台费用是基于商品价格计算的，不是基于 Provider 费用
    const agentrixFee = this.AGENTRIX_ON_RAMP_RATE > 0 
      ? fiatAmount * this.AGENTRIX_ON_RAMP_RATE 
      : 0;
    
    // 3. 计算总费用
    const totalFee = providerFee + agentrixFee;
    
    // 4. 计算用户需要支付的总金额
    // 用户支付 = 商品价格 + Provider 费用 + Agentrix 平台费用
    const totalPrice = fiatAmount + totalFee;
    
    this.logger.log(
      `On-ramp Commission Calculation: ` +
      `FiatAmount=${fiatAmount}, ` +
      `ProviderFee=${providerFee.toFixed(2)} (${((providerFee / fiatAmount) * 100).toFixed(2)}%), ` +
      `AgentrixFee=${agentrixFee.toFixed(2)} (${this.AGENTRIX_ON_RAMP_RATE > 0 ? (this.AGENTRIX_ON_RAMP_RATE * 100).toFixed(2) : '0'}%), ` +
      `TotalFee=${totalFee.toFixed(2)}, ` +
      `TotalPrice=${totalPrice.toFixed(2)}`
    );
    
    return {
      providerFee,
      agentrixFee,
      totalFee,
      totalPrice,
    };
  }

  /**
   * 获取 Agentrix On-ramp 分佣费率
   */
  getAgentrixRate(): number {
    return this.AGENTRIX_ON_RAMP_RATE;
  }
}

