import { Injectable, Logger } from '@nestjs/common';

import {
  LlmDecisionProvider,
  OrchestratorDecision,
} from './task-orchestrator.types';
import type { AgentOpsTaskEntity } from './entities/agent-ops-task.entity';
import type { OrchestratorObservation } from './task-orchestrator.types';

/**
 * PlaceholderLlmDecisionProvider — TaskOrchestrator 的默认 LLM 决策提供方占位实现。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md(任务 11)。
 *
 * 任务 11 只交付编排循环骨架与可审计轨迹;真实的「LLM 决策」由后续任务
 * (12 数据源插件 / 13 尽调引擎)按各自垂直活儿注入具体 {@link LlmDecisionProvider}。
 *
 * 该占位实现不臆造动作:直接返回 `done:true`(无可执行计划),并记录告警,
 * 以便在未配置真实决策方时安全短路,而非静默猜测浏览器动作。
 */
@Injectable()
export class PlaceholderLlmDecisionProvider implements LlmDecisionProvider {
  private readonly logger = new Logger(PlaceholderLlmDecisionProvider.name);

  async decideNext(ctx: {
    task: AgentOpsTaskEntity;
    goal: string;
    observation: OrchestratorObservation;
  }): Promise<OrchestratorDecision> {
    this.logger.warn(
      `No concrete LlmDecisionProvider configured for task ${ctx.task.id} (${ctx.task.type}); returning done(no-op).`,
    );
    return {
      done: true,
      summary: 'NO_LLM_DECISION_PROVIDER_CONFIGURED',
      reason: 'PLACEHOLDER_PROVIDER',
    };
  }
}
