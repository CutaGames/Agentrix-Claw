import {
  BattleArenaService,
  isRunMatchError,
  type RunMatchInput,
  type RunMatchOk,
} from './battle-arena.service';
import { InMemoryArenaLeaderboardStore } from './arena-leaderboard.store';
import {
  BattleEngineService,
  type BattleParticipant,
} from '../../world-engine/services/battle-engine.service';
import { WorldApiCapability } from '../../../../shared/types/world-creation';
import type { EconomyBridgeResponse } from '../../../../shared/types/world-creation-api';

/**
 * Unit tests for BattleArenaService (task 12.2, R16.3/16.4/16.5/16.7).
 *
 * Verifies the server-side orchestration:
 *  - deterministic full event stream → frame-by-frame playback (animations,
 *    floating text, health bars, crit hit-stop),
 *  - leaderboard `state.kv:ranks` update + structured rank update,
 *  - XP award via the v5 Agent binding XP model,
 *  - optional AXP wager settled server-side via Economy_Bridge (amounts never
 *    computed in the orchestrator — only amountRef is forwarded).
 */

function makeFighter(id: string, overrides: Partial<BattleParticipant> = {}): BattleParticipant {
  return {
    id,
    level: 1,
    stats: { hp: 100, atk: 30, def: 20, spd: 15, int: 10 },
    skills: [
      { name: 'Slash', type: 'offensive', effectDescription: 'a strike', damageBase: 20 },
    ],
    ...overrides,
  };
}

/** A fake Agent binding XP model capturing awardXp calls. */
function makeAgentBinding() {
  const calls: Array<{ assetId: string; amount: number }> = [];
  const totals = new Map<string, number>();
  return {
    calls,
    awardXp: jest.fn(async (assetId: string, amount: number) => {
      const total = (totals.get(assetId) ?? 0) + amount;
      totals.set(assetId, total);
      calls.push({ assetId, amount });
      return { xp: total, unlockedSkillSlots: total >= 100 ? 1 : 0, newSlotUnlocked: false };
    }),
  };
}

/** A fake Economy_Bridge capturing charge/payout requests. */
function makeEconomyBridge(opts: { chargeOk?: boolean } = {}) {
  const chargeOk = opts.chargeOk !== false;
  const chargeCalls: any[] = [];
  const payoutCalls: any[] = [];
  return {
    chargeCalls,
    payoutCalls,
    requestCharge: jest.fn(async (userId: string, req: any): Promise<EconomyBridgeResponse> => {
      chargeCalls.push({ userId, req });
      return chargeOk
        ? { ok: true, authoritativeAmount: 50, platformCut: 3 }
        : { ok: false, error: { error: 'ECONOMY_REJECTED', detail: 'insufficient balance' } };
    }),
    requestPayout: jest.fn(async (userId: string, req: any): Promise<EconomyBridgeResponse> => {
      payoutCalls.push({ userId, req });
      return { ok: true, authoritativeAmount: 95, platformCut: 0 };
    }),
  };
}

function buildService(overrides?: {
  agentBinding?: ReturnType<typeof makeAgentBinding>;
  economyBridge?: ReturnType<typeof makeEconomyBridge>;
  store?: InMemoryArenaLeaderboardStore;
}) {
  const engine = new BattleEngineService();
  const agentBinding = overrides?.agentBinding ?? makeAgentBinding();
  const economyBridge = overrides?.economyBridge ?? makeEconomyBridge();
  const store = overrides?.store ?? new InMemoryArenaLeaderboardStore();
  const service = new BattleArenaService(
    engine,
    agentBinding as any,
    economyBridge as any,
    store,
  );
  return { service, engine, agentBinding, economyBridge, store };
}

function baseInput(overrides: Partial<RunMatchInput> = {}): RunMatchInput {
  return {
    plotId: 'plot_1',
    challenger: makeFighter('player'),
    defender: makeFighter('boss', { stats: { hp: 90, atk: 28, def: 18, spd: 12, int: 8 } }),
    seed: 12345,
    grantedCaps: [WorldApiCapability.BattleStart],
    challengerAssetId: 'wa_player',
    ...overrides,
  };
}

describe('BattleArenaService.runMatch', () => {
  it('produces frame-by-frame playback aligned with the deterministic event stream', async () => {
    const { service } = buildService();
    const result = await service.runMatch(baseInput());
    expect(isRunMatchError(result)).toBe(false);
    const ok = result as RunMatchOk;

    // One playback frame per engine round, in order.
    expect(ok.playback.totalFrames).toBe(ok.battle.rounds.length);
    expect(ok.playback.frames.map((f) => f.seq)).toEqual(
      ok.battle.rounds.map((_, i) => i),
    );
    for (let i = 0; i < ok.playback.frames.length; i++) {
      const frame = ok.playback.frames[i];
      const round = ok.battle.rounds[i];
      expect(frame.damageDealt).toBe(round.damageDealt);
      expect(frame.roundNumber).toBe(round.roundNumber);
      // Health bar fractions are normalized to [0,1].
      expect(frame.hpFraction.challenger).toBeGreaterThanOrEqual(0);
      expect(frame.hpFraction.challenger).toBeLessThanOrEqual(1);
      // Crit frames carry stronger juice (screen shake + longer hit-stop).
      if (frame.isCritical) {
        expect(frame.screenShake).toBe(true);
        expect(frame.hitStopMs).toBeGreaterThan(80);
        expect(frame.floatingText.endsWith('!')).toBe(true);
      } else {
        expect(frame.screenShake).toBe(false);
      }
    }
  });

  it('awards XP via the Agent binding XP model only for fighters bound to an asset', async () => {
    const agentBinding = makeAgentBinding();
    const { service } = buildService({ agentBinding });
    // Only the challenger is asset-bound; the boss has no assetId.
    const result = (await service.runMatch(baseInput())) as RunMatchOk;

    expect(agentBinding.calls).toHaveLength(1);
    expect(agentBinding.calls[0].assetId).toBe('wa_player');
    expect(agentBinding.calls[0].amount).toBe(result.battle.xpAwarded.challenger);

    expect(result.xpResults).toHaveLength(1);
    expect(result.xpResults[0]).toMatchObject({ assetId: 'wa_player', side: 'challenger' });
  });

  it('awards XP to both sides when both are asset-bound', async () => {
    const agentBinding = makeAgentBinding();
    const { service } = buildService({ agentBinding });
    const result = (await service.runMatch(
      baseInput({ defenderAssetId: 'wa_boss' }),
    )) as RunMatchOk;
    expect(agentBinding.calls.map((c) => c.assetId).sort()).toEqual(['wa_boss', 'wa_player']);
    expect(result.xpResults).toHaveLength(2);
  });

  it('appends rank entries to state.kv:ranks and returns the structured update', async () => {
    const store = new InMemoryArenaLeaderboardStore();
    const { service } = buildService({ store });
    const result = (await service.runMatch(baseInput())) as RunMatchOk;

    // Two structured rank entries: one per fighter, with consistent win/loss.
    expect(result.rankUpdate).toHaveLength(2);
    const winner = result.rankUpdate.find((e) => e.result === 'win');
    const loser = result.rankUpdate.find((e) => e.result === 'loss');
    expect(winner).toBeDefined();
    expect(loser).toBeDefined();
    expect(winner!.fighterId).toBe(result.winner.fighterId);

    // Persisted to the injected state.kv:ranks store.
    const stored = store.getRanks('plot_1');
    expect(stored).toHaveLength(2);
    expect(stored.map((e) => e.fighterId).sort()).toEqual(['boss', 'player']);
  });

  it('rejects with CAP_DENIED when battle.start is not granted (deny-by-default)', async () => {
    const { service } = buildService();
    const result = await service.runMatch(baseInput({ grantedCaps: [] }));
    expect(isRunMatchError(result)).toBe(true);
    if (isRunMatchError(result)) {
      expect(result.error).toBe('CAP_DENIED');
    }
  });

  it('rejects with SCHEMA_INVALID when the seed is not an integer', async () => {
    const { service } = buildService();
    const result = await service.runMatch(baseInput({ seed: 1.5 }));
    expect(isRunMatchError(result)).toBe(true);
    if (isRunMatchError(result)) {
      expect(result.error).toBe('SCHEMA_INVALID');
    }
  });

  it('is deterministic: identical seed + fighters yield an identical event stream', async () => {
    const { service: s1 } = buildService();
    const { service: s2 } = buildService();
    const r1 = (await s1.runMatch(baseInput())) as RunMatchOk;
    const r2 = (await s2.runMatch(baseInput())) as RunMatchOk;
    expect(JSON.stringify(r1.battle)).toEqual(JSON.stringify(r2.battle));
  });
});

describe('BattleArenaService.runMatch — optional AXP wager (R16.5)', () => {
  it('charges the stake then pays out the winner server-side, forwarding only amountRef', async () => {
    const economyBridge = makeEconomyBridge();
    const { service } = buildService({ economyBridge });
    const result = (await service.runMatch(
      baseInput({
        wager: {
          active: true,
          payerUserId: 'user_1',
          payerAccountId: 'acct_player',
          stakeAmountRef: 'wager.stake',
          payoutAmountRef: 'wager.pot',
          signedConfirmation: 'sig_abc',
          accountBySide: { challenger: 'acct_player', defender: 'acct_boss' },
        },
      }),
    )) as RunMatchOk;

    // Stake charge happened first (1 charge), then a winner payout (1 payout).
    expect(economyBridge.chargeCalls).toHaveLength(1);
    expect(economyBridge.payoutCalls).toHaveLength(1);

    // Orchestrator forwards only amountRef — never a computed amount.
    expect(economyBridge.chargeCalls[0].req.amountRef).toBe('wager.stake');
    expect(economyBridge.chargeCalls[0].req).not.toHaveProperty('amount');
    expect(economyBridge.payoutCalls[0].req.amountRef).toBe('wager.pot');
    expect(economyBridge.payoutCalls[0].req).not.toHaveProperty('amount');

    // Payout targeted the winner's account.
    const winnerAccount =
      result.winner.side === 'challenger' ? 'acct_player' : 'acct_boss';
    expect(economyBridge.payoutCalls[0].req.targetAccountId).toBe(winnerAccount);

    expect(result.wager?.settled).toBe(true);
  });

  it('aborts the match and returns the economy error when the stake charge fails', async () => {
    const economyBridge = makeEconomyBridge({ chargeOk: false });
    const { service } = buildService({ economyBridge });
    const result = await service.runMatch(
      baseInput({
        wager: {
          active: true,
          payerUserId: 'user_1',
          payerAccountId: 'acct_player',
          stakeAmountRef: 'wager.stake',
          payoutAmountRef: 'wager.pot',
          accountBySide: { challenger: 'acct_player' },
        },
      }),
    );

    expect(isRunMatchError(result)).toBe(true);
    if (isRunMatchError(result)) {
      expect(result.error).toBe('ECONOMY_REJECTED');
    }
    // No payout when the match was aborted before it ran.
    expect(economyBridge.payoutCalls).toHaveLength(0);
  });
});
