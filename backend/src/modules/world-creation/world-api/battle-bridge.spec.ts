/**
 * BattleBridge unit tests — task 4.4 (battle.start 复用 v5 Battle_Engine), R5.4/R16.3.
 *
 * `battle.start` must resolve combat with the shipped v5 deterministic
 * Battle_Engine — never a re-implementation. These tests drive the bridge with
 * both a spy engine (to assert forwarding) and the real v5
 * {@link BattleEngineService} (to assert determinism of the returned event
 * stream).
 *
 * Coverage:
 *   (5) battle.start not granted     → CAP_DENIED (deny-by-default, no engine call)
 *   (6) non-integer seed / empty skills → SCHEMA_INVALID (determinism precondition)
 *   (7) authorized + valid           → forwards to engine.simulateBattle and returns
 *                                       its event stream; same seed ⇒ same result
 *
 * @see backend/src/modules/world-creation/world-api/battle-bridge.ts
 */

import { BattleBridge, type BattleEngineLike, type BattleStartArgs } from './battle-bridge';
import { createAuditCollector } from './capability-registry';
import { WorldApiCapability } from '../../../../shared/types/world-creation';
import {
  BattleEngineService,
  type BattleParticipant,
  type BattleResult,
} from '../../world-engine/services/battle-engine.service';

// ============================================================
// Test fixtures
// ============================================================

const GRANTED_WITH_BATTLE = [WorldApiCapability.BattleStart];
const GRANTED_WITHOUT_BATTLE = [WorldApiCapability.SceneSpawn];

function makeFighter(id: string, overrides: Partial<BattleParticipant> = {}): BattleParticipant {
  return {
    id,
    level: 5,
    stats: { hp: 100, atk: 30, def: 20, spd: 40, int: 15 },
    skills: [
      { name: 'Strike', type: 'offensive', effectDescription: 'hit', damageBase: 12 },
      { name: 'Guard', type: 'defensive', effectDescription: 'block' },
    ],
    ...overrides,
  };
}

function makeArgs(overrides: Partial<BattleStartArgs> = {}): BattleStartArgs {
  return {
    fighterA: makeFighter('player'),
    fighterB: makeFighter('boss'),
    seed: 12345,
    ...overrides,
  };
}

/** A spy engine recording its invocation and returning a sentinel result. */
function makeSpyEngine(): { engine: BattleEngineLike; calls: Array<[BattleParticipant, BattleParticipant, number]>; sentinel: BattleResult } {
  const calls: Array<[BattleParticipant, BattleParticipant, number]> = [];
  const sentinel: BattleResult = {
    rounds: [],
    winnerSide: 'challenger',
    totalRounds: 0,
    xpAwarded: { challenger: 65, defender: 25 },
  };
  const engine: BattleEngineLike = {
    simulateBattle: (a, b, seed) => {
      calls.push([a, b, seed]);
      return sentinel;
    },
  };
  return { engine, calls, sentinel };
}

// ============================================================
// (5) Capability gate
// ============================================================

describe('BattleBridge — capability gate (R5.5 deny-by-default)', () => {
  it('denies battle.start with CAP_DENIED and never calls the engine when not granted', () => {
    const { engine, calls } = makeSpyEngine();
    const audit = createAuditCollector();
    const bridge = new BattleBridge(engine);

    const result = bridge.start(makeArgs(), GRANTED_WITHOUT_BATTLE, 'sess-1', audit.sink);

    expect('ok' in result).toBe(false);
    expect(result).toMatchObject({ error: 'CAP_DENIED' });
    expect(calls).toHaveLength(0);
    expect(audit.entries.some((e) => e.event === 'CAP_DENIED')).toBe(true);
  });
});

// ============================================================
// (6) Input validation — determinism preconditions
// ============================================================

describe('BattleBridge — input validation (R16.3 determinism preconditions)', () => {
  it('rejects a non-integer seed with SCHEMA_INVALID', () => {
    const { engine, calls } = makeSpyEngine();
    const bridge = new BattleBridge(engine);

    const result = bridge.start(makeArgs({ seed: 3.14 }), GRANTED_WITH_BATTLE, 'sess-1');

    expect(result).toMatchObject({ error: 'SCHEMA_INVALID' });
    expect(calls).toHaveLength(0);
  });

  it('rejects a fighter with no skills with SCHEMA_INVALID', () => {
    const { engine, calls } = makeSpyEngine();
    const bridge = new BattleBridge(engine);

    const result = bridge.start(
      makeArgs({ fighterB: makeFighter('boss', { skills: [] }) }),
      GRANTED_WITH_BATTLE,
      'sess-1',
    );

    expect(result).toMatchObject({ error: 'SCHEMA_INVALID' });
    expect(calls).toHaveLength(0);
  });
});

// ============================================================
// (7) Authorized + valid — forwards to v5 engine, returns event stream
// ============================================================

describe('BattleBridge — forwards to v5 Battle_Engine (R5.4)', () => {
  it('forwards challenger/defender/seed to engine.simulateBattle and returns its result', () => {
    const { engine, calls, sentinel } = makeSpyEngine();
    const bridge = new BattleBridge(engine);
    const args = makeArgs();

    const result = bridge.start(args, GRANTED_WITH_BATTLE, 'sess-1');

    expect('ok' in result && result.ok).toBe(true);
    if ('ok' in result && result.ok) {
      expect(result.result).toBe(sentinel);
    }
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(args.fighterA);
    expect(calls[0][1]).toBe(args.fighterB);
    expect(calls[0][2]).toBe(args.seed);
  });

  it('returns the real v5 engine event stream and is deterministic for the same seed', () => {
    const realEngine = new BattleEngineService();
    const bridge = new BattleBridge(realEngine);
    const args = makeArgs({ seed: 98765 });

    const r1 = bridge.start(args, GRANTED_WITH_BATTLE, 'sess-1');
    const r2 = bridge.start(args, GRANTED_WITH_BATTLE, 'sess-1');

    expect('ok' in r1 && r1.ok).toBe(true);
    expect('ok' in r2 && r2.ok).toBe(true);
    if ('ok' in r1 && r1.ok && 'ok' in r2 && r2.ok) {
      // Same seed + inputs ⇒ identical replayable event stream (R16.3).
      expect(r1.result).toEqual(r2.result);
      expect(r1.result.rounds.length).toBeGreaterThan(0);
      // The bridge returns exactly what the v5 engine computed (no rewrite).
      const direct = realEngine.simulateBattle(args.fighterA, args.fighterB, args.seed);
      expect(r1.result).toEqual(direct);
    }
  });
});
