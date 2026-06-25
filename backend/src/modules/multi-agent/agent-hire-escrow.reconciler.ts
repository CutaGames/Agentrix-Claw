import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AgentHireEscrowService } from './agent-hire-escrow.service';

/**
 * Multi-Agent v2 W7 — Hire escrow reconciler.
 *
 * Why: AgentTaskWorker calls escrow.releaseOnSuccess / refundOnFailure
 * inline when it transitions a task to terminal status. But if the
 * worker process crashes BETWEEN the task setStatus and the escrow
 * write, the escrow stays in `reserved` while the linked task is
 * already terminal. This cron sweeps those orphans every 5 min and
 * reconciles them to released/refunded based on the task outcome.
 *
 * Disabled if MULTI_AGENT_HIRE_RECONCILER_DISABLED=1 OR the
 * marketplace-hire feature flag itself is off.
 */
@Injectable()
export class AgentHireEscrowReconciler {
  private readonly logger = new Logger(AgentHireEscrowReconciler.name);

  constructor(private readonly escrow: AgentHireEscrowService) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'multi-agent-hire-escrow-reconcile' })
  async tick(): Promise<void> {
    if (process.env.MULTI_AGENT_HIRE_RECONCILER_DISABLED === '1') return;
    if (process.env.MULTI_AGENT_MARKETPLACE_HIRE_ENABLED !== '1') return; // no-op if flag off
    try {
      const result = await this.escrow.reconcileStaleEscrows();
      if (result.reconciled > 0) {
        this.logger.log(`reconciled ${result.reconciled} stale escrow row(s)`);
      }
    } catch (e: any) {
      this.logger.warn(`reconcile tick error: ${e?.message || e}`);
    }
  }
}
