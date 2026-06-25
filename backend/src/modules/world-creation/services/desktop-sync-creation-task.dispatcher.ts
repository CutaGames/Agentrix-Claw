import { Injectable, Logger } from '@nestjs/common';
import { DesktopSyncService } from '../../desktop-sync/desktop-sync.service';
import { DesktopCommandKind } from '../../desktop-sync/dto/desktop-sync.dto';
import type {
  CreationTaskDispatcher,
  CreationTaskDispatchContext,
  CreationTaskDispatchResult,
} from './creation-task.dispatcher';

/**
 * DesktopSyncCreationTaskDispatcher — 真实派发实现 (design §8, R8.2/R8.3)。
 *
 * 替换占位实现 {@link PlaceholderCreationTaskDispatcher},把已入队的 Creation_Task
 * 投递到真实通道:
 *  - `desktop` → 经 {@link DesktopSyncService.createCommand} 下发一条
 *    `world-creation-task` 命令到用户绑定的桌面端长连接(复用既有 desktop-sync
 *    command + WebSocket 事件总线)。桌面端在 `desktopAgentSync` 的命令分派里
 *    收到该 kind → 触发 `agentrix:open-world-creator`,自动打开 Tier_C 创作器。
 *  - `agent`  → Agent_Builder 离线自治执行 (R8.3)。Agent 工具循环的接线属更大改造,
 *    此处先记录并受理(best-effort),保证状态机推进;真实 Agent 通道为后续项。
 *
 * 受理语义:createCommand 成功落库即视为"通道已受理"(accepted=true),任务进入
 * running;桌面端认领/完成后经 desktop-sync 状态回报。投递抛错则 accepted=false,
 * 任务进入 failed 并保留输入以便重试 (R8.6)。
 */
@Injectable()
export class DesktopSyncCreationTaskDispatcher implements CreationTaskDispatcher {
  private readonly logger = new Logger(DesktopSyncCreationTaskDispatcher.name);

  constructor(private readonly desktopSync: DesktopSyncService) {}

  async dispatchToDesktop(
    ctx: CreationTaskDispatchContext,
  ): Promise<CreationTaskDispatchResult> {
    try {
      await this.desktopSync.createCommand(ctx.userId, {
        title: 'World creation task',
        kind: DesktopCommandKind.WORLD_CREATION_TASK,
        payload: {
          taskId: ctx.taskId,
          plotId: ctx.plotId,
          substrateTier: ctx.substrateTier,
          input: ctx.input,
        },
      });
      this.logger.debug(
        `dispatched Creation_Task ${ctx.taskId} → desktop command (user ${ctx.userId})`,
      );
      return { accepted: true, detail: 'desktop-sync command created' };
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'desktop-sync dispatch error';
      this.logger.warn(`dispatch task ${ctx.taskId} → desktop failed: ${detail}`);
      return { accepted: false, detail };
    }
  }

  async dispatchToAgent(
    ctx: CreationTaskDispatchContext,
  ): Promise<CreationTaskDispatchResult> {
    // R8.3 Agent_Builder 离线自治执行复用 OpenClaw/`/claude/chat` 工具循环(工具集换成
    // World_API 编辑能力)。该通道接线属更大改造,此处先受理以推进状态机,真实执行为后续项。
    this.logger.debug(
      `accepted Creation_Task ${ctx.taskId} → agent (user ${ctx.userId}); agent tool-loop wiring is a follow-up`,
    );
    return { accepted: true, detail: 'agent dispatch accepted (tool-loop wiring pending)' };
  }
}
