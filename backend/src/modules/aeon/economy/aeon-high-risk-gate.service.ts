import { Injectable, Logger, ForbiddenException, Optional } from '@nestjs/common';
import { SignRequestService } from '../../sign-request/sign-request.service';

/**
 * AeonHighRiskGateService — agent/copilot 高风险动作的 Trust3 闸门(Task B7 / R11.3/11.4)。
 *
 * 复用平台现有 sign-request(Trust3)队列:agent/copilot 态要花钱/签约/做高风险承诺时,
 * 先 createSignRequest → 推送移动端生物识别签名表单 → 轮询直到 completed/cancelled/expired。
 * 超时或拒绝 → 抛 Forbidden,调用方据此**不改变状态**(R11.4)。普通赚取/manual 态免审批(R11.6)。
 *
 * 设计为可选注入:sign-request 模块不可用时降级为"放行 + 记日志"(开发/测试环境),
 * 生产务必接入。manual 态本就是真人在控,不走本闸门。
 */
export interface HighRiskContext {
  userId: string;
  controlState: 'manual' | 'agent' | 'copilot';
  /** 动作金额(AXP 或币种最小单位),用于阈值判定。 */
  amount: number;
  currency: string;
  /** 人类可读的动作说明(进签名表单)。 */
  description: string;
  /** 幂等键(同一动作重复请求复用已签结果)。 */
  idempotencyKey?: string;
}

@Injectable()
export class AeonHighRiskGateService {
  private readonly logger = new Logger(AeonHighRiskGateService.name);

  /** 高风险阈值:超过此额度的 agent/copilot 花费才需 Trust3(普通小额免审批,R11.6)。 */
  private static readonly HIGH_RISK_THRESHOLD_AXP = 500;
  /** 轮询签名结果的总等待 + 间隔。 */
  private static readonly POLL_TIMEOUT_MS = 65_000;
  private static readonly POLL_INTERVAL_MS = 1_500;

  constructor(@Optional() private readonly signRequests?: SignRequestService) {}

  /** 是否需要走高风险闸门:agent/copilot 态 + 金额超阈值 + 真钱/大额。 */
  needsGate(ctx: HighRiskContext): boolean {
    if (ctx.controlState === 'manual') return false; // 真人在控,自己负责
    if (ctx.currency !== 'AXP') return true; // 数字货币一律走闸门
    return ctx.amount >= AeonHighRiskGateService.HIGH_RISK_THRESHOLD_AXP;
  }

  /**
   * 高风险动作前置闸门。需要时创建 Trust3 sign-request 并阻塞等待用户签名。
   * 通过 → resolve(签名);拒绝/超时 → 抛 ForbiddenException(调用方不得改状态)。
   * 不需要 → 直接放行。
   */
  async authorize(ctx: HighRiskContext): Promise<{ gated: boolean; signature?: string }> {
    if (!this.needsGate(ctx)) {
      return { gated: false };
    }
    if (!this.signRequests) {
      // 降级:无 sign-request 服务(测试/开发)。记日志放行,不静默吞掉。
      this.logger.warn(
        `[DEGRADED] high-risk gate bypassed (no SignRequestService): user=${ctx.userId} amount=${ctx.amount}${ctx.currency} "${ctx.description}"`,
      );
      return { gated: false };
    }

    const req = await this.signRequests.create({
      userId: ctx.userId,
      reason: 'agentic-commerce-overlimit',
      metadata: {
        source: 'aeon',
        controlState: ctx.controlState,
        amount: ctx.amount,
        currency: ctx.currency,
        description: ctx.description,
      },
      idempotencyKey: ctx.idempotencyKey ?? null,
    });

    // 已是 completed(幂等命中)→ 直接通过。
    if (req.status === 'completed' && req.signature) {
      return { gated: true, signature: req.signature };
    }

    // 轮询等待用户在移动端生物识别签名。
    const deadline = Date.now() + AeonHighRiskGateService.POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await this.sleep(AeonHighRiskGateService.POLL_INTERVAL_MS);
      const cur = await this.signRequests.findById(req.id, ctx.userId).catch(() => null);
      if (!cur) continue;
      if (cur.status === 'completed' && cur.signature) {
        return { gated: true, signature: cur.signature };
      }
      if (cur.status === 'cancelled') {
        throw new ForbiddenException('高风险动作被用户取消,操作已阻断');
      }
      if (cur.status === 'expired') {
        throw new ForbiddenException('高风险动作签名超时,操作已阻断');
      }
    }
    // 超时未签 → 主动取消并阻断。
    await this.signRequests.cancel(req.id, ctx.userId, 'aeon high-risk gate timeout').catch(() => {});
    throw new ForbiddenException('高风险动作签名超时,操作已阻断');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
