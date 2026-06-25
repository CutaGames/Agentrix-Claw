import { Injectable, Logger, ForbiddenException } from '@nestjs/common';

/**
 * ComplianceGateService — 合规闸门(Task 3.3 / R12)。
 *
 * AXP 与数字货币 MVP 均支持(复用现有支付通道),按地区/能力开关。
 * 数字货币兑换/提现前 KYC;AML 命中冻结;未成年限制真钱;无 KYC/AML 不提现(硬边界);
 * 某地区/能力不支持数字货币 → 回退 AXP-only,不阻断非真钱功能(R12.7)。
 *
 * Phase 3:闸门策略以内存配置 + 注入式校验呈现(per-region/per-capability toggle,
 * 无需重部署 — Phase 4 可接 admin_configs 落库)。KYC/AML/未成年状态读取为注入点,
 * 复用平台现有 KYC/AML 服务(payment/aml-scan.service 等)在 wiring 时接入。
 */

export type AeonCurrency = 'AXP' | 'USDC' | 'USDT' | 'ETH' | string;
export type AeonMoneyCapability = 'exchange' | 'withdraw' | 'pay';

export interface ComplianceContext {
  userId: string;
  region?: string;
  isMinor?: boolean;
  kycPassed?: boolean;
  amlFlagged?: boolean;
}

export interface CapabilityToggle {
  /** 该能力在该地区是否开放数字货币。 */
  digitalCurrencyEnabled: boolean;
}

@Injectable()
export class ComplianceGateService {
  private readonly logger = new Logger(ComplianceGateService.name);

  /**
   * per-region / per-capability 开关(R12.5)。内存默认:AXP 全开;数字货币默认开放
   * (平台市场已支持),具体地区可在此覆盖关闭。运营改此表无需重部署。
   */
  private readonly toggles = new Map<string, CapabilityToggle>();

  /** 设置某地区某能力的数字货币开关(运营用)。 */
  setToggle(region: string, capability: AeonMoneyCapability, digitalCurrencyEnabled: boolean): void {
    this.toggles.set(`${region}:${capability}`, { digitalCurrencyEnabled });
  }

  private digitalEnabled(region: string | undefined, capability: AeonMoneyCapability): boolean {
    if (!region) return true; // 无地区信息时默认按平台已支持处理
    const t = this.toggles.get(`${region}:${capability}`);
    return t ? t.digitalCurrencyEnabled : true;
  }

  /**
   * 校验一次价值流转是否被允许。返回实际可用币种(可能从数字货币回退到 AXP)。
   * AXP 永远放行(站内积分);数字货币需过 KYC/AML/未成年/地区开关。
   */
  authorize(
    ctx: ComplianceContext,
    requested: { currency: AeonCurrency; capability: AeonMoneyCapability },
  ): { allowed: true; currency: AeonCurrency; fellBackToAxp: boolean } {
    // AXP:始终允许(非真钱)。
    if (requested.currency === 'AXP') {
      return { allowed: true, currency: 'AXP', fellBackToAxp: false };
    }

    // 数字货币路径 —— 逐项合规检查。
    // 1) 未成年:禁真钱(R12.4)→ 回退 AXP。
    if (ctx.isMinor) {
      this.logger.warn(`minor blocked from digital currency, fallback AXP: user=${ctx.userId}`);
      return { allowed: true, currency: 'AXP', fellBackToAxp: true };
    }
    // 2) 地区/能力开关关闭(R12.7)→ 回退 AXP,不阻断。
    if (!this.digitalEnabled(ctx.region, requested.capability)) {
      return { allowed: true, currency: 'AXP', fellBackToAxp: true };
    }
    // 3) 兑换/提现需 KYC(R12.2)。
    if (
      (requested.capability === 'exchange' || requested.capability === 'withdraw') &&
      !ctx.kycPassed
    ) {
      throw new ForbiddenException('该操作需先完成 KYC 实名认证');
    }
    // 4) AML 命中:冻结(R12.3)。提现/兑换在 AML 标记下硬禁(R12.6)。
    if (ctx.amlFlagged) {
      throw new ForbiddenException('账户存在风控审查中的交易,暂不可进行该操作');
    }
    return { allowed: true, currency: requested.currency, fellBackToAxp: false };
  }

  /**
   * 提现硬边界(R12.6):未过 KYC/AML 一律拒绝提现,不回退、不放行。
   */
  assertWithdrawable(ctx: ComplianceContext): void {
    if (!ctx.kycPassed) throw new ForbiddenException('提现需先完成 KYC 实名认证');
    if (ctx.amlFlagged) throw new ForbiddenException('账户风控审查中,暂不可提现');
  }
}
