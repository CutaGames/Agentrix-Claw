import { Injectable, Logger } from '@nestjs/common';
import type {
  CreationTaskTarget,
  SubstrateTier,
} from '../../../../shared/types/world-creation';

/**
 * Creation_Task 派发通道抽象 (design §8 Creation_Task_Queue, R8.2/R8.3)。
 *
 * 设计 §8 规定投递机制：
 *  - `desktop` → 用户绑定桌面端长连接（复用现有 Agent 任务通道 / desktop-sync command）。
 *  - `agent`   → Agent_Builder 离线自治执行（复用 OpenClaw/`/claude/chat` 工具调用，
 *               工具集换成 World_API 编辑能力）。
 *
 * 仓库现状：桌面长连接由 `DesktopSyncService.createCommand` + WebSocket gateway 投递，
 * Agent 通道由 `/claude/chat` / OpenClaw 工具循环驱动。直接在本服务里硬连这两条通道会把
 * Creation_Task_Queue 与 desktop-sync / agent-intelligence 紧耦合，也不利于 20.3 的状态机
 * 单测。为与本模块既有「可注入 store + 默认占位实现」先例 (见 `presence/map-presence.store.ts`、
 * `arena/arena-leaderboard.store.ts`) 保持一致 **且可独立单测**，派发被收敛到这个
 * **可注入接口** {@link CreationTaskDispatcher} 后面，默认实现为占位
 * ({@link PlaceholderCreationTaskDispatcher})。真实投递落地时只需提供一个委派
 * DesktopSyncService / Agent 通道的实现并替换 provider，{@link CreationTaskService} 无感。
 */

/** 注入令牌：CreationTaskDispatcher 的 DI 句柄。 */
export const CREATION_TASK_DISPATCHER = Symbol('CREATION_TASK_DISPATCHER');

/** 派发上下文 — 投递到目标通道执行所需的最小任务快照。 */
export interface CreationTaskDispatchContext {
  /** 任务 id (creation_tasks.id)。 */
  taskId: string;
  /** 发起者 user id (绑定桌面端 / Agent 的归属用户)。 */
  userId: string;
  /** 任务作用的 Plot (可为空：未绑定 Plot 的草稿生成)。 */
  plotId: string | null;
  /** 任务针对的 Substrate_Tier。 */
  substrateTier: SubstrateTier | null;
  /** 派发目标 (`desktop` / `agent`；`self` 不经派发通道)。 */
  target: Exclude<CreationTaskTarget, 'self'>;
  /** 任务输入 (prompt / 编辑意图 / 参数)。 */
  input: Record<string, unknown>;
}

/** 派发结果 — 通道是否受理投递。 */
export interface CreationTaskDispatchResult {
  /** 通道是否成功受理（受理后任务进入 running，否则进入 failed）。 */
  accepted: boolean;
  /** 失败 / 诊断说明 (accepted=false 时填充 failReason)。 */
  detail?: string;
}

/**
 * 派发通道接口 — 把一个已入队的 Creation_Task 投递到目标执行端。
 * 默认占位实现见 {@link PlaceholderCreationTaskDispatcher}；真实实现委派
 * DesktopSyncService 长连接 / Agent 通道。
 */
export interface CreationTaskDispatcher {
  /**
   * 投递到用户绑定的桌面端长连接执行 (R8.2)。
   * 真实实现：`DesktopSyncService.createCommand` + WebSocket gateway 推送，跟踪状态。
   */
  dispatchToDesktop(ctx: CreationTaskDispatchContext): Promise<CreationTaskDispatchResult>;

  /**
   * 投递到 Agent_Builder，允许其在用户离线时自治执行 (R8.3)。
   * 真实实现：复用 OpenClaw/`/claude/chat` 工具调用循环，工具集换成 World_API 编辑能力。
   */
  dispatchToAgent(ctx: CreationTaskDispatchContext): Promise<CreationTaskDispatchResult>;
}

/**
 * 默认占位派发器 (单实例 MVP / 可单测)。
 *
 * 不做真实投递：把每次派发记录在内存里 (供测试断言投递目标 / 上下文)，并默认受理
 * (accepted=true)，使任务状态机推进到 running。真实投递落地时替换为委派
 * DesktopSyncService / Agent 通道的实现。
 */
@Injectable()
export class PlaceholderCreationTaskDispatcher implements CreationTaskDispatcher {
  private readonly logger = new Logger(PlaceholderCreationTaskDispatcher.name);
  private readonly dispatched: CreationTaskDispatchContext[] = [];

  async dispatchToDesktop(
    ctx: CreationTaskDispatchContext,
  ): Promise<CreationTaskDispatchResult> {
    this.dispatched.push(ctx);
    this.logger.debug(
      `[placeholder] dispatch task ${ctx.taskId} → desktop (user ${ctx.userId})`,
    );
    return { accepted: true, detail: 'placeholder desktop dispatch' };
  }

  async dispatchToAgent(
    ctx: CreationTaskDispatchContext,
  ): Promise<CreationTaskDispatchResult> {
    this.dispatched.push(ctx);
    this.logger.debug(
      `[placeholder] dispatch task ${ctx.taskId} → agent (user ${ctx.userId})`,
    );
    return { accepted: true, detail: 'placeholder agent dispatch' };
  }

  /** 测试 / 诊断：返回已记录的派发上下文 (只读副本)。 */
  getDispatched(): CreationTaskDispatchContext[] {
    return [...this.dispatched];
  }

  /** 测试 / 诊断：清空派发记录。 */
  reset(): void {
    this.dispatched.length = 0;
  }
}
