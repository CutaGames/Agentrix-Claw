/**
 * dualAvatarController — 客户端双控位控制器(Task 2.1 / R2)。
 *
 * 维护一个角色的 Control_State(manual/agent/copilot 恰一个),把真人输入或
 * agent 决策路由到 /aeon 实时客户端,并在切换控制态时 ≤2s 广播(R2.2)。
 *
 * 设计(design §Dual_Avatar_Controller):
 *   - manual:真人输入(移动屏控 / 桌面浮球)→ send({t:'move'/'action'}),忽略 agent
 *   - agent:由后端编排(OpenClaw SSE),客户端只需把控制态告知服务器并渲染
 *   - copilot:agent 执行,真人可随时 takeOver() → 立即转 manual(R2.5)
 *   - 切换不丢位置/库存/在途任务:这些是后端权威态,本控制器只改"谁发指令"(R2.6)
 *
 * 身份徽章由服务器权威派生(identityFromControl),客户端不自行决定 isAgentDriven。
 */
import type { AeonRealtimeHandle } from './aeonRealtimeClient';
import {
  type AeonControlState,
  type AeonClientEvent,
  type AeonFacing,
} from '../../../shared/types/aeon-sync';

export interface DualAvatarOptions {
  /** 实时句柄(可降级:isDegraded 时 send 为 noop,控制态仍本地维护)。 */
  handle: AeonRealtimeHandle;
  /** 初始控制态。 */
  initial?: AeonControlState;
  /** 控制态变化回调(用于 UI 徽章/锁定刷新)。 */
  onControlStateChange?: (next: AeonControlState) => void;
}

export class DualAvatarController {
  private controlState: AeonControlState;
  private readonly handle: AeonRealtimeHandle;
  private readonly onChange?: (next: AeonControlState) => void;

  constructor(opts: DualAvatarOptions) {
    this.handle = opts.handle;
    this.controlState = opts.initial ?? 'manual';
    this.onChange = opts.onControlStateChange;
  }

  getControlState(): AeonControlState {
    return this.controlState;
  }

  /** 切换控制态(R2.2):本地即时生效 + 广播,服务器据此重新派生身份徽章。 */
  setControlState(next: AeonControlState): void {
    if (this.controlState === next) return;
    this.controlState = next;
    this.handle.send({ t: 'control', controlState: next });
    this.onChange?.(next);
  }

  /** copilot 下真人夺回控制权(R2.5):立即转 manual。 */
  takeOver(): void {
    if (this.controlState === 'copilot') {
      this.setControlState('manual');
    }
  }

  /** 真人移动输入(仅 manual / copilot 接管时有效;agent 态忽略真人输入,R2.3)。 */
  move(x: number, y: number, facing: AeonFacing): void {
    if (this.controlState === 'agent') return; // agent 态由后端驱动,忽略本地输入
    this.handle.send({ t: 'move', x, y, facing });
  }

  /** 真人动作输入(同 move 的态约束)。 */
  action(action: string, targetCharId?: string): void {
    if (this.controlState === 'agent') return;
    const ev: AeonClientEvent = { t: 'action', action, targetCharId };
    this.handle.send(ev);
  }

  /** 就近/房间聊天。 */
  chat(text: string, scope: 'proximity' | 'room' = 'room'): void {
    this.handle.send({ t: 'chat', text, scope });
  }
}
