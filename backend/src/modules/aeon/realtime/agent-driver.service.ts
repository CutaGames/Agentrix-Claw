import { Injectable, Logger } from '@nestjs/common';
import { RoomPresenceService } from './room-presence.service';
import { AeonRealtimeGateway } from './aeon-realtime.gateway';
import { AsyncInboxService } from '../inbox/async-inbox.service';
import { type AeonFacing } from '../../../../../shared/types/aeon-sync';

/**
 * AgentDriverService — agent / copilot 控制态执行编排(Task 2.2 / 2.3 / R2.4/2.5/2.8)。
 *
 * 当一个角色处于 agent / copilot 态时,其动作不来自真人输入,而来自绑定 agent 的决策。
 * 本服务:
 *   - 把一次"agent 决策"(移动/动作)应用到房间在场态并经网关广播(R2.4)
 *   - agent 不可用时:暂停自主、置 idle、经 Async_Inbox 通知 owner(R2.8)
 *
 * 注意:真实的 agent 决策来源是 OpenClaw(SSE,/openclaw/proxy/:id/stream)。Phase 2
 * 提供编排骨架与注入点(applyDecision / markUnavailable),决策的具体 LLM 调用由
 * Phase 3 的 clock-in / 任务执行接入(避免与 4000 行 OpenClawProxyService 强耦合)。
 */

export interface AgentDecision {
  charId: string;
  roomId: string;
  kind: 'move' | 'action';
  x?: number;
  y?: number;
  facing?: AeonFacing;
  sprite?: string;
  action?: string;
}

@Injectable()
export class AgentDriverService {
  private readonly logger = new Logger(AgentDriverService.name);

  constructor(
    private readonly presence: RoomPresenceService,
    private readonly gateway: AeonRealtimeGateway,
    private readonly inbox: AsyncInboxService,
  ) {}

  /**
   * 应用一次 agent 决策到角色并广播(R2.4)。仅当角色当前为 agent/copilot 态时生效;
   * manual 态忽略(真人在控,R2.3 对偶)。
   */
  applyDecision(decision: AgentDecision): boolean {
    const snap = this.presence.snapshot(decision.roomId).find((c) => c.charId === decision.charId);
    if (!snap) return false;
    if (snap.controlState === 'manual') return false; // 真人在控,agent 不抢

    if (decision.kind === 'move' && decision.x != null && decision.y != null) {
      const updated = this.presence.applyMove(
        decision.charId,
        decision.x,
        decision.y,
        decision.facing ?? snap.facing,
        decision.sprite,
      );
      if (updated) {
        this.gateway.emitToRoom(decision.roomId, { t: 'char_upsert', char: updated, serverTs: Date.now() });
        return true;
      }
    } else if (decision.kind === 'action' && decision.action) {
      this.gateway.emitToRoom(decision.roomId, {
        t: 'action',
        fromCharId: decision.charId,
        action: decision.action,
        serverTs: Date.now(),
      });
      return true;
    }
    return false;
  }

  /**
   * agent 不可用兜底(R2.8):暂停自主、把角色置 idle、通知 owner。
   * 不移除角色(避免它从房间消失),只是停止自主动作 + idle 指示。
   */
  markUnavailable(charId: string, ownerUserId: string, reason = 'agent 暂时不可用'): void {
    const roomId = this.presence.roomOf(charId);
    if (roomId) {
      const updated = this.presence.applyMove(
        charId,
        // 位置不变:用当前快照值
        this.presence.snapshot(roomId).find((c) => c.charId === charId)?.x ?? 0,
        this.presence.snapshot(roomId).find((c) => c.charId === charId)?.y ?? 0,
        'right',
        'idle',
      );
      if (updated) {
        this.gateway.emitToRoom(roomId, { t: 'char_upsert', char: updated, serverTs: Date.now() });
      }
    }
    this.inbox.push(
      ownerUserId,
      'agent_unavailable',
      'Agent 暂停',
      `${reason}。你的角色已切到待机,可手动接管或稍后重试。`,
      charId,
    );
    this.logger.warn(`agent unavailable: char=${charId} owner=${ownerUserId} (${reason})`);
  }
}
