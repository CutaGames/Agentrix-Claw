/**
 * vitalsAxpReward.service.ts — Sprint WA #2
 *
 * Per wearable-prd-v4 §8.2: Vitals → AXP 映射（V4.1 新增经济维度）
 *
 * Awards AXP when health goals are met:
 *   - 10k steps/day → 20 AXP (1/day)
 *   - Daily exercise goal (Activity Ring) → 30 AXP (1/day)
 *   - Sleep ≥ 7h → 10 AXP (1/day, next morning)
 *   - HRV 7-day streak → 100 AXP (1/week)
 *   - 24h continuous wear → 5 AXP (1/day)
 *
 * Data source: Vitals Bus → `/api/v1/axp/earn` (kind='vitals')
 * All AXP earned via Mobile proxy — wearable itself doesn't hold account.
 */
import { earnAxp } from '../axp.api';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Types ────────────────────────────────────────────────────

interface VitalsGoal {
  id: string;
  label_en: string;
  label_zh: string;
  axp_reward: number;
  cooldown_key: string;
  cooldown_hours: number;
}

interface VitalsEvent {
  metric: string;
  value: number;
  source_surface?: string;
}

// ── Goal definitions (per PRD §8.2) ─────────────────────────

const VITALS_GOALS: VitalsGoal[] = [
  {
    id: 'steps_10k',
    label_en: 'Daily 10k steps',
    label_zh: '每日万步',
    axp_reward: 20,
    cooldown_key: 'vitals_axp_steps_10k',
    cooldown_hours: 24,
  },
  {
    id: 'exercise_goal',
    label_en: 'Exercise goal completed',
    label_zh: '运动目标达成',
    axp_reward: 30,
    cooldown_key: 'vitals_axp_exercise',
    cooldown_hours: 24,
  },
  {
    id: 'sleep_7h',
    label_en: 'Sleep ≥ 7 hours',
    label_zh: '睡眠 ≥ 7 小时',
    axp_reward: 10,
    cooldown_key: 'vitals_axp_sleep',
    cooldown_hours: 24,
  },
  {
    id: 'hrv_streak_7d',
    label_en: 'HRV 7-day streak',
    label_zh: 'HRV 连续 7 天达标',
    axp_reward: 100,
    cooldown_key: 'vitals_axp_hrv_streak',
    cooldown_hours: 168, // 7 days
  },
  {
    id: 'wear_24h',
    label_en: '24h continuous wear',
    label_zh: '连续佩戴 24 小时',
    axp_reward: 5,
    cooldown_key: 'vitals_axp_wear_24h',
    cooldown_hours: 24,
  },
];

// ── Cooldown management ──────────────────────────────────────

async function isCooldownActive(key: string, hours: number): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return false;
    const lastAwarded = parseInt(raw, 10);
    return Date.now() - lastAwarded < hours * 3600 * 1000;
  } catch {
    return false;
  }
}

async function setCooldown(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, String(Date.now()));
  } catch {
    // Best effort
  }
}

// ── Goal evaluation ──────────────────────────────────────────

/**
 * Evaluate a vitals event against AXP goals.
 * Returns the goals that were achieved and AXP awarded.
 */
export async function evaluateVitalsForAxp(event: VitalsEvent): Promise<Array<{
  goal_id: string;
  axp_awarded: number;
  label_en: string;
  label_zh: string;
}>> {
  const results: Array<{ goal_id: string; axp_awarded: number; label_en: string; label_zh: string }> = [];

  for (const goal of VITALS_GOALS) {
    const triggered = checkGoalTrigger(goal.id, event);
    if (!triggered) continue;

    const onCooldown = await isCooldownActive(goal.cooldown_key, goal.cooldown_hours);
    if (onCooldown) continue;

    // Award AXP
    try {
      await earnAxp({
        source: `vitals_${goal.id}`,
        amount: goal.axp_reward,
        ref_id: goal.id,
        note: goal.label_en,
        metadata: { metric: event.metric, value: event.value, surface: event.source_surface },
      });

      await setCooldown(goal.cooldown_key);

      results.push({
        goal_id: goal.id,
        axp_awarded: goal.axp_reward,
        label_en: goal.label_en,
        label_zh: goal.label_zh,
      });
    } catch {
      // AXP earn failed — skip this goal, don't set cooldown
    }
  }

  return results;
}

/**
 * Check if a specific goal is triggered by the given event.
 */
function checkGoalTrigger(goalId: string, event: VitalsEvent): boolean {
  switch (goalId) {
    case 'steps_10k':
      return event.metric === 'steps' && event.value >= 10000;
    case 'exercise_goal':
      return event.metric === 'exercise_minutes' && event.value >= 30;
    case 'sleep_7h':
      return event.metric === 'sleep_hours' && event.value >= 7;
    case 'hrv_streak_7d':
      return event.metric === 'hrv_streak_days' && event.value >= 7;
    case 'wear_24h':
      return event.metric === 'wear_hours' && event.value >= 24;
    default:
      return false;
  }
}

/**
 * Get all vitals goals with their current cooldown status.
 */
export async function getVitalsGoalStatus(): Promise<Array<VitalsGoal & { on_cooldown: boolean; next_available_at: number | null }>> {
  const results = [];
  for (const goal of VITALS_GOALS) {
    const raw = await AsyncStorage.getItem(goal.cooldown_key).catch(() => null);
    const lastAwarded = raw ? parseInt(raw, 10) : 0;
    const cooldownEnd = lastAwarded + goal.cooldown_hours * 3600 * 1000;
    const onCooldown = Date.now() < cooldownEnd;

    results.push({
      ...goal,
      on_cooldown: onCooldown,
      next_available_at: onCooldown ? cooldownEnd : null,
    });
  }
  return results;
}
