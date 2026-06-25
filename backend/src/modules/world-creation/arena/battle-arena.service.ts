import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import {
  WorldApiCapability,
  type WorldCreationError,
} from '../../../../shared/types/world-creation';
import type { EconomyBridgeResponse } from '../../../../shared/types/world-creation-api';

import {
  BattleEngineService,
  type BattleParticipant,
  type BattleResult,
} from '../../world-engine/services/battle-engine.service';
import { AgentBindingService } from '../../world-engine/services/agent-binding.service';

import { BattleBridge } from '../world-api/battle-bridge';
import type { CapabilityAuditSink } from '../world-api/capability-registry';
import { EconomyBridgeService } from '../services/economy-bridge.service';
import {
  ARENA_LEADERBOARD_STORE,
  type ArenaLeaderboardStore,
  type LeaderboardRankEntry,
} from './arena-leaderboard.store';

/**
 * 暴击顿帧时长（ms）—— 强打击感（design §11.0 命中/暴击表现）。
 */
const CRIT_HIT_STOP_MS = 220;
/** 普通命中顿帧时长（ms）。 */
const NORMAL_HIT_STOP_MS = 80;

// ============================================================
// Frame-by-frame playback (客户端逐帧演出 — design §11.1)
// ============================================================

/**
 * 一帧可演出的战斗帧。服务端一次性把确定性事件流转换为有序的演出帧，
 * 客户端据此逐帧播放：攻击动画、飘字、血条扣减、暴击顿帧 + 屏震 + 大数字。
 */
export interface BattlePlaybackFrame {
  /** 有序播放索引（0-based）。 */
  seq: number;
  /** 所属回合号。 */
  roundNumber: number;
  /** 本帧出手方。 */
  attackerSide: 'challenger' | 'defender';
  /** 出手者 id。 */
  attackerId: string;
  /** 使用的技能名（驱动技能动画）。 */
  skillUsed: string;
  /** 造成的伤害（飘字数值）。 */
  damageDealt: number;
  /** 是否暴击（驱动顿帧 + 屏震 + 暴击大数字）。 */
  isCritical: boolean;
  /** 本帧后双方剩余血量（血条数值）。 */
  hpRemaining: { challenger: number; defender: number };
  /** 归一化血量分数 [0..1]（血条渲染）。 */
  hpFraction: { challenger: number; defender: number };
  /** 建议顿帧时长（ms）—— 暴击更长。 */
  hitStopMs: number;
  /** 是否触发屏震（暴击）。 */
  screenShake: boolean;
  /** 飘字文本（暴击带感叹号强调）。 */
  floatingText: string;
}

/** 整场对局的逐帧演出数据。 */
export interface BattlePlayback {
  /** 有序演出帧。 */
  frames: BattlePlaybackFrame[];
  /** 帧总数。 */
  totalFrames: number;
  /** 引擎回合总数（与 frames.length 一致）。 */
  totalRounds: number;
}

// ============================================================
// XP 发奖（经 v5 Agent 绑定 XP 模型 — R16.4）
// ============================================================

/** 一名出战者的 XP 发奖结果（来自 v5 Agent 绑定 XP 模型）。 */
export interface ArenaXpResult {
  /** 被发奖的 World_Asset 角色 id。 */
  assetId: string;
  /** 该角色在本局所处阵营。 */
  side: 'challenger' | 'defender';
  /** 本局授予的 XP（由 Battle_Engine 服务端计算）。 */
  xpAwarded: number;
  /** 发奖后累计 XP（单调递增）。 */
  totalXp: number;
  /** 累计解锁的成长技能槽数。 */
  unlockedSkillSlots: number;
  /** 本次发奖是否解锁了新技能槽。 */
  newSlotUnlocked: boolean;
}

// ============================================================
// 可选 AXP 下注（经 Economy_Bridge 服务端结算 — R16.5）
// ============================================================

/**
 * 一场对局的可选 AXP 下注配置。金额绝不在此计算 —— 只携带 `amountRef`，
 * 由 {@link EconomyBridgeService} 在服务端按权威 ECS_World 定价重算（design §6, R16.5）。
 */
export interface ArenaWagerConfig {
  /** 是否启用下注。false / 省略 ⇒ 不结算下注。 */
  active: boolean;
  /** 经认证的下注发起用户 id（付款方）—— 绝不取自沙箱。 */
  payerUserId: string;
  /** 付款方 visitor 账户 id（用于 stake charge）。 */
  payerAccountId: string;
  /** stake 的 amountRef（指向权威定价实体；服务端重算金额）。 */
  stakeAmountRef: string;
  /** Trust 门控签名确认（R7.4）。 */
  signedConfirmation?: string;
  /** 赢家彩池 payout 的 amountRef（服务端重算金额）。 */
  payoutAmountRef: string;
  /** 阵营 → 收款账户 id 映射，用于把 payout 定向到赢家账户。 */
  accountBySide?: { challenger?: string; defender?: string };
}

/** AXP 下注的服务端结算结果（R16.5）。 */
export interface ArenaWagerSettlement {
  /** stake 扣款结果（服务端权威）。 */
  charge: EconomyBridgeResponse;
  /** 赢家彩池打款结果（charge 成功且赢家账户可解析时存在）。 */
  payout?: EconomyBridgeResponse;
  /** stake 与 payout 均提交成功时为 true。 */
  settled: boolean;
}

// ============================================================
// runMatch 输入/输出
// ============================================================

/** {@link BattleArenaService.runMatch} 的输入。 */
export interface RunMatchInput {
  /** 所属 Plot id（排行榜与经济结算的归属）。 */
  plotId: string;
  /** 挑战方出战者（玩家选中的 World_Asset 角色）。 */
  challenger: BattleParticipant;
  /** 防守方出战者（竞技场 Boss 或对手角色）。 */
  defender: BattleParticipant;
  /** 确定性对局 seed（必须为整数，R16.3）。 */
  seed: number;
  /** 体验声明/授权的能力集合（必须含 `battle.start`，否则 CAP_DENIED）。 */
  grantedCaps: ReadonlyArray<WorldApiCapability | string>;
  /** 挑战方对应的 World_Asset 角色 id（用于 XP 发奖；省略则不发奖）。 */
  challengerAssetId?: string;
  /** 防守方对应的 World_Asset 角色 id（Boss 通常无；省略则不发奖）。 */
  defenderAssetId?: string;
  /** 沙箱会话 id（审计归属）。 */
  sessionId?: string;
  /** 能力审计 sink（可选）。 */
  audit?: CapabilityAuditSink;
  /** 可选 AXP 下注配置（R16.5）。 */
  wager?: ArenaWagerConfig;
}

/** 成功的对局编排结果。 */
export interface RunMatchOk {
  ok: true;
  /** v5 确定性引擎的原始事件流（可重放，R16.3）。 */
  battle: BattleResult;
  /** 由事件流派生的逐帧演出数据。 */
  playback: BattlePlayback;
  /** 赢家阵营 + 出战者 id。 */
  winner: { side: 'challenger' | 'defender'; fighterId: string };
  /** append 进 `state.kv:ranks` 的名次条目（R16.4）。 */
  rankUpdate: LeaderboardRankEntry[];
  /** 经 v5 Agent 绑定 XP 模型发放的 XP 结果（R16.4）。 */
  xpResults: ArenaXpResult[];
  /** 启用下注时的服务端结算结果（R16.5）。 */
  wager?: ArenaWagerSettlement;
}

/** runMatch 结果：成功或结构化错误。 */
export type RunMatchResult = RunMatchOk | WorldCreationError;

function isRunMatchError(r: RunMatchResult): r is WorldCreationError {
  return (r as WorldCreationError).error !== undefined;
}

/** 把分数夹到 [0,1]。 */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * BattleArenaService — 确定性战斗演出 + 排行/XP/下注编排 (design §11.1, R16.3/16.4/16.5/16.7, task 12.2)。
 *
 * 服务端编排层：把竞技场一局对战的完整链路串起来 —— **绝不重写战斗/经济逻辑**，
 * 全部复用已落地的 v5 基础设施（design "复用,不是重造"）：
 *
 *   1. **确定性演算**：经 {@link BattleBridge} 调用 v5 确定性 `BattleEngineService`，
 *      服务端**一次性算出完整事件流**（每回合行动者/技能/伤害/暴击/剩余血量）。
 *   2. **逐帧演出数据**：把事件流转换为有序 {@link BattlePlaybackFrame}（动画/飘字/
 *      血条/暴击顿帧+屏震），供客户端逐帧播放（design §11.0/§11.1）。
 *   3. **排行榜更新**：对局结束把名次条目 append 进 `state.kv:ranks`
 *      （经注入的 {@link ArenaLeaderboardStore} 抽象），并在结果中返回结构化更新（R16.4）。
 *   4. **XP 发奖**：经 v5 `AgentBindingService.awardXp` 按引擎计算的 `xpAwarded` 发放（R16.4）。
 *   5. **可选 AXP 下注**：stake/payout 经 {@link EconomyBridgeService} 服务端结算，
 *      金额由服务端按权威定价重算，**绝不在沙箱/编排层计算**（R16.5, Property 2）。
 *
 * 依赖以接口注入（v5 services + 可注入 store），因此可被单元测试用真实 v5 引擎或
 * spy 直接驱动（相同 seed + 输入 ⇒ 相同事件流，可重放，R16.3/16.7）。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §11.1 Battle Arena
 */
@Injectable()
export class BattleArenaService {
  private readonly logger = new Logger(BattleArenaService.name);
  private readonly bridge: BattleBridge;

  constructor(
    private readonly engine: BattleEngineService,
    private readonly agentBinding: AgentBindingService,
    private readonly economyBridge: EconomyBridgeService,
    @Optional()
    @Inject(ARENA_LEADERBOARD_STORE)
    private readonly leaderboard?: ArenaLeaderboardStore,
  ) {
    // 复用 v5 确定性 Battle_Engine（经 BattleBridge 的能力闸门 + 入参校验 + 转发）。
    this.bridge = new BattleBridge(this.engine);
  }

  /**
   * 运行一局竞技场对战并产出可逐帧演出的结果 + 排行/XP/下注结算。
   *
   * 顺序（保证经济不变量）：
   *   (0) 若启用下注 → 先经 Economy_Bridge 服务端 charge 收取 stake；失败即中止
   *       （余额不变，由 Economy_Bridge 保证），不开打。
   *   (1) 经 BattleBridge 调用 v5 确定性引擎取完整事件流（含能力闸门 + seed/技能校验）。
   *   (2) 事件流 → 逐帧演出数据。
   *   (3) 经 v5 Agent 绑定 XP 模型按引擎 xpAwarded 发奖。
   *   (4) 名次条目 append 进 state.kv:ranks（注入 store）+ 返回结构化更新。
   *   (5) 若启用下注 → 经 Economy_Bridge 服务端 payout 给赢家。
   *
   * @returns 成功结果或结构化错误（CAP_DENIED / SCHEMA_INVALID / ECONOMY_REJECTED）。
   */
  async runMatch(input: RunMatchInput): Promise<RunMatchResult> {
    // (0) 可选下注：先服务端收取 stake（金额由服务端权威重算，沙箱不可达）。
    let wagerSettlement: ArenaWagerSettlement | undefined;
    if (input.wager?.active) {
      const charge = await this.economyBridge.requestCharge(input.wager.payerUserId, {
        plotId: input.plotId,
        visitorAccountId: input.wager.payerAccountId,
        amountRef: input.wager.stakeAmountRef,
        signedConfirmation: input.wager.signedConfirmation,
      });
      if (!charge.ok) {
        // stake 收取失败 ⇒ 不开打，余额不变（Economy_Bridge 保证），返回经济错误。
        return (
          charge.error ?? {
            error: 'ECONOMY_REJECTED',
            detail: 'Wager stake charge failed',
          }
        );
      }
      wagerSettlement = { charge, settled: false };
    }

    // (1) 经 BattleBridge 取完整确定性事件流（能力闸门 + seed/技能校验在桥内）。
    const battleResult = this.bridge.start(
      { fighterA: input.challenger, fighterB: input.defender, seed: input.seed },
      input.grantedCaps,
      input.sessionId,
      input.audit,
    );
    if (!battleResult.ok) {
      // battle.start 被拒（CAP_DENIED / SCHEMA_INVALID）。若已收 stake，全额退还。
      if (wagerSettlement?.charge.ok) {
        await this.refundStake(input.plotId, input.wager!);
      }
      return battleResult;
    }
    const battle = battleResult.result;

    // (2) 事件流 → 逐帧演出数据。
    const playback = this.buildPlayback(battle, input.challenger, input.defender);

    const winnerSide = battle.winnerSide;
    const winnerFighterId =
      winnerSide === 'challenger' ? input.challenger.id : input.defender.id;

    // (3) XP 发奖（经 v5 Agent 绑定 XP 模型；缺 assetId 或发奖失败不影响对局结果）。
    const xpResults = await this.awardMatchXp(input, battle);

    // (4) 排行榜：append 名次条目进 state.kv:ranks（注入 store）+ 返回结构化更新。
    const rankUpdate = this.buildRankUpdate(input, battle);
    await this.appendRanks(input.plotId, rankUpdate);

    // (5) 可选下注 payout：把彩池打给赢家（金额服务端权威重算）。
    if (input.wager?.active && wagerSettlement) {
      wagerSettlement = await this.settleWagerPayout(
        input.plotId,
        input.wager,
        winnerSide,
        wagerSettlement,
      );
    }

    return {
      ok: true,
      battle,
      playback,
      winner: { side: winnerSide, fighterId: winnerFighterId },
      rankUpdate,
      xpResults,
      ...(wagerSettlement ? { wager: wagerSettlement } : {}),
    };
  }

  // ============================================================
  // (2) 逐帧演出
  // ============================================================

  /** 把确定性 {@link BattleResult} 事件流转换为有序逐帧演出数据。 */
  private buildPlayback(
    battle: BattleResult,
    challenger: BattleParticipant,
    defender: BattleParticipant,
  ): BattlePlayback {
    const maxChallengerHp = challenger.stats.hp || 1;
    const maxDefenderHp = defender.stats.hp || 1;

    const frames: BattlePlaybackFrame[] = battle.rounds.map((round, i) => {
      const attackerSide: 'challenger' | 'defender' =
        round.attackerId === challenger.id ? 'challenger' : 'defender';
      return {
        seq: i,
        roundNumber: round.roundNumber,
        attackerSide,
        attackerId: round.attackerId,
        skillUsed: round.skillUsed,
        damageDealt: round.damageDealt,
        isCritical: round.isCritical,
        hpRemaining: round.hpRemaining,
        hpFraction: {
          challenger: clamp01(round.hpRemaining.challenger / maxChallengerHp),
          defender: clamp01(round.hpRemaining.defender / maxDefenderHp),
        },
        hitStopMs: round.isCritical ? CRIT_HIT_STOP_MS : NORMAL_HIT_STOP_MS,
        screenShake: round.isCritical,
        floatingText: round.isCritical ? `${round.damageDealt}!` : `${round.damageDealt}`,
      };
    });

    return { frames, totalFrames: frames.length, totalRounds: battle.totalRounds };
  }

  // ============================================================
  // (3) XP 发奖
  // ============================================================

  /**
   * 经 v5 Agent 绑定 XP 模型按引擎计算的 `xpAwarded` 发奖。Boss/无绑定角色（无 assetId）
   * 跳过；单角色发奖失败仅告警，不让整局失败（对局结果已确定）。
   */
  private async awardMatchXp(
    input: RunMatchInput,
    battle: BattleResult,
  ): Promise<ArenaXpResult[]> {
    const results: ArenaXpResult[] = [];
    const targets: Array<{ assetId?: string; side: 'challenger' | 'defender'; xp: number }> = [
      { assetId: input.challengerAssetId, side: 'challenger', xp: battle.xpAwarded.challenger },
      { assetId: input.defenderAssetId, side: 'defender', xp: battle.xpAwarded.defender },
    ];

    for (const t of targets) {
      if (!t.assetId || t.xp <= 0) continue;
      try {
        const awarded = await this.agentBinding.awardXp(t.assetId, t.xp);
        results.push({
          assetId: t.assetId,
          side: t.side,
          xpAwarded: t.xp,
          totalXp: awarded.xp,
          unlockedSkillSlots: awarded.unlockedSkillSlots,
          newSlotUnlocked: awarded.newSlotUnlocked,
        });
      } catch (err) {
        this.logger.warn(
          `awardXp failed for ${t.side} asset ${t.assetId} (${t.xp} XP): ${this.toDetail(err)}`,
        );
      }
    }
    return results;
  }

  // ============================================================
  // (4) 排行榜
  // ============================================================

  /** 构造本局双方的名次条目（结构化更新，append 进 state.kv:ranks）。 */
  private buildRankUpdate(input: RunMatchInput, battle: BattleResult): LeaderboardRankEntry[] {
    const ts = Date.now();
    const challengerWon = battle.winnerSide === 'challenger';
    return [
      {
        fighterId: input.challenger.id,
        result: challengerWon ? 'win' : 'loss',
        xpAwarded: battle.xpAwarded.challenger,
        opponentId: input.defender.id,
        seed: input.seed,
        ts,
      },
      {
        fighterId: input.defender.id,
        result: challengerWon ? 'loss' : 'win',
        xpAwarded: battle.xpAwarded.defender,
        opponentId: input.challenger.id,
        seed: input.seed,
        ts,
      },
    ];
  }

  /** 经注入的 store 把名次条目 append 进 state.kv:ranks（无 store 时仅返回结构化更新）。 */
  private async appendRanks(plotId: string, entries: LeaderboardRankEntry[]): Promise<void> {
    if (!this.leaderboard) return;
    try {
      await this.leaderboard.appendRanks(plotId, entries);
    } catch (err) {
      this.logger.warn(`appendRanks failed for plot ${plotId}: ${this.toDetail(err)}`);
    }
  }

  // ============================================================
  // (5) 下注结算
  // ============================================================

  /** 把彩池经 Economy_Bridge 服务端 payout 给赢家（金额服务端权威重算）。 */
  private async settleWagerPayout(
    plotId: string,
    wager: ArenaWagerConfig,
    winnerSide: 'challenger' | 'defender',
    settlement: ArenaWagerSettlement,
  ): Promise<ArenaWagerSettlement> {
    const winnerAccountId = wager.accountBySide?.[winnerSide];
    if (!winnerAccountId) {
      this.logger.warn(
        `Wager payout skipped: no account mapped for winner side "${winnerSide}"`,
      );
      return { ...settlement, settled: false };
    }
    const payout = await this.economyBridge.requestPayout(wager.payerUserId, {
      plotId,
      targetAccountId: winnerAccountId,
      amountRef: wager.payoutAmountRef,
    });
    return { ...settlement, payout, settled: settlement.charge.ok && payout.ok };
  }

  /** stake 已收但对局未开打时全额退还（经 payout 退回付款方）。 */
  private async refundStake(plotId: string, wager: ArenaWagerConfig): Promise<void> {
    try {
      await this.economyBridge.requestPayout(wager.payerUserId, {
        plotId,
        targetAccountId: wager.payerAccountId,
        amountRef: wager.stakeAmountRef,
      });
    } catch (err) {
      this.logger.warn(`Wager stake refund failed: ${this.toDetail(err)}`);
    }
  }

  private toDetail(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return 'unknown error';
  }
}

export { isRunMatchError };
