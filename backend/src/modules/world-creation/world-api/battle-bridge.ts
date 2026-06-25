/**
 * BattleBridge — `battle.start` 桥接到 v5 确定性 Battle_Engine (R5.4, R16.3, task 4.3).
 *
 * 当 Tier_B 体验调用 `battle.start` 能力时，World_API 必须用**已落地的 v5 确定性
 * Battle_Engine** 演算战斗 (R5.4)，绝不在本平台重写战斗逻辑 (design §概述 "复用,不是
 * 重造"; §11.1 "把确定性战斗演成实时战斗")。本桥只做三件事:
 *
 *   1. **能力闸门 (deny-by-default)**: 复用 {@link dispatchCapability} —— 体验必须在
 *      白名单且其 `grantedCaps` 已声明 `battle.start`，否则 `CAP_DENIED` + 审计。
 *   2. **入参校验**: seed 必须是整数 (确定性前提)、双方必须至少有一个技能 (v5 引擎按
 *      技能数取模选招，空技能会导致非确定性 NaN)，否则 `SCHEMA_INVALID`。
 *   3. **转发演算**: 调用注入的 v5 `BattleEngineService.simulateBattle(a, b, seed)`，
 *      服务端**一次性算出完整事件流** (每回合行动者 / 技能 / 伤害 / 暴击 / 剩余血量)，
 *      原样返回给客户端逐帧演出。相同 seed + 输入 ⇒ 相同事件流，可重放 (R16.3)。
 *
 * 引擎以接口 {@link BattleEngineLike} 注入 (v5 `BattleEngineService` 结构上即满足)，
 * 因此本桥可被单元测试用真实 v5 引擎或 spy 直接驱动 (task 4.4: battle.start 复用 v5
 * Battle_Engine)。沙箱 ↔ host 的 postMessage 传输见 task 5.x，不在此实现。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §11.1 Battle Arena
 */

import {
  WorldApiCapability,
  WorldCreationError,
} from '../../../../shared/types/world-creation';
import {
  dispatchCapability,
  isDispatchAllowed,
  type CapabilityAuditSink,
} from './capability-registry';
import type {
  BattleParticipant,
  BattleResult,
} from '../../world-engine/services/battle-engine.service';

/**
 * The minimal v5 Battle_Engine surface the bridge depends on. The shipped
 * `BattleEngineService` structurally satisfies this interface, so the bridge
 * reuses the real deterministic engine (Mulberry32, 20-round cap) without
 * re-implementing any combat logic, while remaining trivially mockable in tests.
 */
export interface BattleEngineLike {
  /** Deterministically simulate a full battle and return its event stream. */
  simulateBattle(
    challenger: BattleParticipant,
    defender: BattleParticipant,
    seed: number,
  ): BattleResult;
}

/** Arguments for a `battle.start` invocation. */
export interface BattleStartArgs {
  /** The challenger side fighter (e.g., the player's selected World_Asset). */
  fighterA: BattleParticipant;
  /** The defender side fighter (e.g., the arena boss). */
  fighterB: BattleParticipant;
  /** Deterministic battle seed (must be an integer for reproducibility). */
  seed: number;
}

/** Successful `battle.start` result carrying the full deterministic event stream. */
export interface BattleStartOk {
  ok: true;
  /** The complete battle result (rounds, winner, XP) for client-side playback. */
  result: BattleResult;
}

/** Result of {@link BattleBridge.start}: success or a structured error. */
export type BattleStartResult = BattleStartOk | WorldCreationError;

/** Whether a participant has at least one usable skill. */
function hasSkill(participant: BattleParticipant | undefined): boolean {
  return !!participant && Array.isArray(participant.skills) && participant.skills.length > 0;
}

/**
 * Host-side bridge that forwards `battle.start` to the v5 deterministic
 * Battle_Engine. Construct with the injected engine (the shipped
 * `BattleEngineService`) and call {@link start} for each match.
 */
export class BattleBridge {
  constructor(private readonly engine: BattleEngineLike) {}

  /**
   * Authorize and forward a `battle.start` invocation to the v5 Battle_Engine.
   *
   * @param args challenger/defender fighters + deterministic seed
   * @param grantedCaps capabilities declared/authorized for the experience
   * @param sessionId optional sandbox session id (audit attribution)
   * @returns `{ ok: true, result }` with the full event stream, otherwise a structured error
   */
  start(
    args: BattleStartArgs,
    grantedCaps: ReadonlyArray<WorldApiCapability | string>,
    sessionId?: string,
    audit?: CapabilityAuditSink,
  ): BattleStartResult {
    // (1) Capability gate — deny-by-default via the shared registry (audited).
    const dispatch = dispatchCapability({
      cap: WorldApiCapability.BattleStart,
      grantedCaps,
      sessionId,
      audit,
    });
    if (!isDispatchAllowed(dispatch)) {
      return dispatch;
    }

    // (2) Input validation — determinism preconditions.
    if (!Number.isInteger(args.seed)) {
      return {
        error: 'SCHEMA_INVALID',
        detail: `battle.start seed must be an integer for determinism, got "${args.seed}"`,
      };
    }
    if (!hasSkill(args.fighterA) || !hasSkill(args.fighterB)) {
      return {
        error: 'SCHEMA_INVALID',
        detail: 'battle.start requires both fighters to declare at least one skill',
      };
    }

    // (3) Forward to the v5 deterministic engine — single authoritative event stream.
    const result = this.engine.simulateBattle(args.fighterA, args.fighterB, args.seed);
    return { ok: true, result };
  }
}
