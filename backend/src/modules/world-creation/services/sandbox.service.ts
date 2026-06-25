import { Injectable, NotImplementedException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  EcsWorld,
  SandboxIsolationLevel,
  WorldApiCapability,
  WorldCreationError,
} from '../../../../shared/types/world-creation';
import {
  mapEcsWorldToRenderDescription,
  type RenderDescription,
} from '../sandbox/l0-render';
import {
  dispatchCapMessage,
  type CapabilityExecutor,
  type SandboxDispatchContext,
} from '../sandbox/l1-bridge';
import {
  makeCapMessage,
  type CapabilityAuditEntry,
} from '../sandbox/sandbox-protocol';
import type { CapabilityAuditSink } from '../world-api/capability-registry';
import {
  DEFAULT_WATCHDOG_BUDGETS,
  evaluateSample,
  initialWatchdogState,
  makeTerminationEvent,
  type DeviceTier,
  type ResourceSample,
  type ResourceWatchdogBudget,
  type SandboxTerminationEvent,
  type SandboxTerminationReason,
  type WatchdogState,
} from '../sandbox/resource-watchdog';

/**
 * SandboxService — Capability_Sandbox 分层隔离 + World_API 分派 (design §4/§5, R5/R6).
 *
 * L0 声明式渲染 / L1 iframe 冻结 postMessage 桥 / L2 WASM 运行时；deny-by-default
 * 能力白名单分派，未授权返回 CAP_DENIED 并写审计。Resource_Watchdog 强制
 * CPU / 内存 / 帧预算，超限终止实例并将用户返回地图。
 *
 * Task 5.1 实现 L0 / L1：
 *   - {@link renderTierA} 把 Tier_A ECS_World 纯映射为 R3F 声明式渲染描述 (L0, R6.1)。
 *   - {@link instantiate} 为 L1 体验登记会话 (sessionId ↔ grantedCaps)。
 *   - {@link dispatchCapability} 复用 sandbox/l1-bridge 的 host 分派 (deny-by-default,
 *     未授权 CAP_DENIED + 审计)，不重复 deny 逻辑。
 *
 * L2 WASM 运行时见 task 5.2。
 *
 * Task 5.3 实现 Resource_Watchdog：
 *   - {@link recordResourceSample} 把每实例 CPU / 内存 / 帧预算样本喂给纯
 *     {@link evaluateSample}（L1 iframe 心跳 + long-task；L2 WASM fuel/epoch +
 *     内存计量），超限即自动 {@link terminate}。
 *   - {@link terminate} 完成会话清理 + 发出结构化终止事件（卸载实例、通知用户
 *     "体验因超出资源被停止"、将用户返回地图视图，R6.6/R6.7）。
 *   - {@link onTermination} 让地图层订阅终止事件以保持可响应并切回地图。
 */
@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);

  /** Live sessions: sessionId → isolation level + granted caps + watchdog accounting. */
  private readonly sessions = new Map<
    string,
    {
      plotId: string;
      isolationLevel: SandboxIsolationLevel;
      grantedCaps: ReadonlyArray<WorldApiCapability | string>;
      budget: ResourceWatchdogBudget;
      watchdogState: WatchdogState;
    }
  >();

  /** Listeners notified when a session is terminated (Map layer "return to map"). */
  private readonly terminationListeners = new Set<
    (event: SandboxTerminationEvent) => void
  >();

  /** Audit sink forwarding CAP_DENIED entries to the Nest logger (R5.5). */
  private readonly auditSink: CapabilityAuditSink = (entry: CapabilityAuditEntry) => {
    this.logger.warn(
      `CAP_DENIED cap="${entry.cap}" reason=${entry.reason} session=${entry.sessionId ?? '-'}: ${entry.detail}`,
    );
  };

  /**
   * R6.1 L0 声明式渲染：把 Tier_A ECS_World 纯映射为 R3F 可消费的声明式渲染描述。
   * 无代码执行、无 postMessage 桥 —— 结构上即安全 (safe by construction)。
   */
  renderTierA(world: EcsWorld): RenderDescription {
    return mapEcsWorldToRenderDescription(world);
  }

  /**
   * R6.1-6.4 按 Tier 在 L0/L1/L2 实例化 Plot 体验。
   *
   * L1 登记一个 session，捕获该体验声明授权的能力子集 (`grantedCaps`)，供后续
   * {@link dispatchCapability} 做 deny-by-default 分派。L2 WASM 见 task 5.2。
   */
  async instantiate(
    plotId: string,
    isolationLevel: SandboxIsolationLevel,
    grantedCaps: ReadonlyArray<WorldApiCapability | string> = [],
    deviceTier: DeviceTier = 'full',
  ): Promise<{ sessionId: string }> {
    if (isolationLevel === 'L2') {
      throw new NotImplementedException('SandboxService.instantiate(L2 WASM) — TODO (task 5.2)');
    }
    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      plotId,
      isolationLevel,
      grantedCaps,
      budget: DEFAULT_WATCHDOG_BUDGETS[deviceTier],
      watchdogState: initialWatchdogState(),
    });
    return { sessionId };
  }

  /**
   * R5.5 deny-by-default 能力分派；未授权返回 CAP_DENIED 并写审计。
   *
   * 复用 sandbox/l1-bridge → capability-registry 的白名单 + grantedCaps 双门控
   * （不在此重复 deny 逻辑）。已授权调用经注入的 `executor` 执行副作用 (task 4.3/7.x)。
   */
  async dispatchCapability(
    sessionId: string,
    capability: WorldApiCapability | string,
    args: Record<string, unknown> = {},
    executor?: CapabilityExecutor,
  ): Promise<{ ok: boolean; value?: unknown; error?: WorldCreationError }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        ok: false,
        error: { error: 'CAP_DENIED', detail: `unknown sandbox session "${sessionId}"` },
      };
    }

    const ctx: SandboxDispatchContext = {
      sessionId,
      grantedCaps: session.grantedCaps,
      audit: this.auditSink,
      executor,
    };

    const result = await dispatchCapMessage(
      makeCapMessage({ id: sessionId, name: capability, args }),
      ctx,
    );

    if (result.ok) {
      return { ok: true, value: result.value };
    }
    return { ok: false, error: result.error };
  }

  /**
   * R6.5 Resource_Watchdog：记录一次资源样本并按预算判定是否超限。
   *
   * 把样本喂给纯 {@link evaluateSample}（L1：frameMs long-task + heartbeatAgeMs；
   * L2：fuelConsumed/epochDeadlineExceeded + memoryBytes），更新会话的 watchdog
   * 状态。判定终止时立即 {@link terminate}（卸载实例 + 通知 + 返回地图）并返回事件。
   *
   * @returns 终止事件（已超限）或 null（仍在预算内 / 会话未知）
   */
  async recordResourceSample(
    sessionId: string,
    sample: ResourceSample,
  ): Promise<SandboxTerminationEvent | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const { decision, state } = evaluateSample(
      session.budget,
      sample,
      session.watchdogState,
    );
    session.watchdogState = state;

    if (!decision.terminate) {
      return null;
    }

    return this.terminate(sessionId, decision.reason ?? 'manual', decision.detail);
  }

  /**
   * R6.6/R6.7 终止一个沙箱会话：清理会话状态、卸载实例（L1 iframe / L2 WASM
   * epoch abort 由宿主监听终止事件执行），并发出结构化终止事件——通知用户
   * "体验因超出资源被停止" 并携带 `returnToMap` 信号；地图层据此保持可响应并
   * 将用户切回地图视图。
   *
   * @param sessionId 目标会话
   * @param reason 终止原因（watchdog 超限原因或 `manual`）
   * @param detail 触发信号的可读细节
   * @returns 结构化终止事件；会话未知时返回 null
   */
  async terminate(
    sessionId: string,
    reason: SandboxTerminationReason = 'manual',
    detail = '',
  ): Promise<SandboxTerminationEvent | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // 会话清理（卸载实例的副作用由订阅者按 isolationLevel 执行）。
    this.sessions.delete(sessionId);

    const event = makeTerminationEvent({
      sessionId,
      plotId: session.plotId,
      reason,
      detail,
    });

    this.logger.warn(
      `sandbox.terminated session=${sessionId} plot=${session.plotId} reason=${reason} (${detail})`,
    );

    // 发出 "返回地图" 信号给所有订阅者（地图层保持可响应，R6.7）。
    for (const listener of this.terminationListeners) {
      try {
        listener(event);
      } catch (err) {
        this.logger.error(
          `termination listener threw for session=${sessionId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return event;
  }

  /**
   * 订阅沙箱终止事件（地图层用于卸载实例并将用户返回地图视图，R6.7）。
   * @returns 取消订阅函数
   */
  onTermination(listener: (event: SandboxTerminationEvent) => void): () => void {
    this.terminationListeners.add(listener);
    return () => {
      this.terminationListeners.delete(listener);
    };
  }
}
