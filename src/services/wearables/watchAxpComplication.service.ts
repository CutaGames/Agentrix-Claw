/**
 * watchAxpComplication.service.ts — Sprint J #27
 *
 * Watch Complication AXP data sync.
 * Per wearable-prd-v4 §8.3:
 *   - Modular Large: + 今日 AXP 增量
 *   - Graphic Circular: + AXP 签到环（7 天连击可视化）
 *   - New: AXP Progress（独立家族）: 今日余额 + 距下一兑换目标差值
 *
 * This service pushes AXP data to the watch via DataItem (persistent)
 * so the complication can render even when the phone app is backgrounded.
 *
 * Data paths:
 *   /agentrix/complication/axp — AXP balance + today delta + streak
 *   /agentrix/complication/pet — Pet emotion + skin thumbnail + level
 *   /agentrix/complication/earn — Today's earnings (GMV + Auto-Earn)
 */
import { WatchDataLayerService } from './watchDataLayerBridge.service';
import { fetchAxpBalance, fetchCheckinStatus, type AxpBalanceView, type CheckinStatus } from '../axp.api';
import { fetchQuotaStatus, type QuotaStatus } from '../token-quota.service';

// ── Types ────────────────────────────────────────────────────

export interface AxpComplicationData {
  balance: number;
  usd_value_cents: number;
  today_earned: number;
  today_spent: number;
  streak: number;
  streak_max: number;
  can_checkin: boolean;
  next_redeem_target: number; // AXP needed for cheapest redeem item
  next_redeem_label: string;
  updated_at: number;
}

export interface PetComplicationData {
  pet_name: string;
  emotion: string;
  level: number;
  xp: number;
  xp_next: number;
  skin_thumbnail_url: string | null;
  clan: string;
  updated_at: number;
}

export interface EarnComplicationData {
  today_earn_usd_cents: number;
  today_gmv_usd_cents: number;
  auto_earn_active: boolean;
  auto_earn_tasks_running: number;
  updated_at: number;
}

// ── Constants ────────────────────────────────────────────────

const AXP_DATA_PATH = '/agentrix/complication/axp';
const PET_DATA_PATH = '/agentrix/complication/pet';
const EARN_DATA_PATH = '/agentrix/complication/earn';

// Cheapest redeem item (lottery pull = 100 AXP)
const DEFAULT_NEXT_REDEEM_TARGET = 100;
const DEFAULT_NEXT_REDEEM_LABEL = 'Lucky Draw';

// ── Sync functions ───────────────────────────────────────────

/**
 * Sync AXP complication data to watch.
 * Call this after any AXP balance change (earn/spend/checkin).
 */
export async function syncAxpComplication(): Promise<void> {
  if (!WatchDataLayerService.isAvailable()) return;

  try {
    const [balance, checkin] = await Promise.all([
      fetchAxpBalance(),
      fetchCheckinStatus(),
    ]);

    const data: AxpComplicationData = {
      balance: balance.balance,
      usd_value_cents: balance.usd_value_cents,
      today_earned: 0, // TODO: derive from today's ledger entries
      today_spent: 0,
      streak: checkin.streak,
      streak_max: 7, // 7-day streak visualization
      can_checkin: checkin.can_checkin_today,
      next_redeem_target: DEFAULT_NEXT_REDEEM_TARGET,
      next_redeem_label: DEFAULT_NEXT_REDEEM_LABEL,
      updated_at: Date.now(),
    };

    await WatchDataLayerService.putDataItem(AXP_DATA_PATH, data as any);
  } catch {
    // Silently fail — watch will show stale data
  }
}

/**
 * Sync pet complication data to watch.
 * Call this after pet state changes (emotion, skin switch, level up).
 */
export async function syncPetComplication(petData: {
  pet_name: string;
  emotion: string;
  level: number;
  xp: number;
  xp_next: number;
  skin_thumbnail_url: string | null;
  clan: string;
}): Promise<void> {
  if (!WatchDataLayerService.isAvailable()) return;

  try {
    const data: PetComplicationData = {
      ...petData,
      updated_at: Date.now(),
    };
    await WatchDataLayerService.putDataItem(PET_DATA_PATH, data as any);
  } catch {
    // Silently fail
  }
}

/**
 * Sync earnings complication data to watch.
 * Call this after Auto-Earn events or GMV notifications.
 */
export async function syncEarnComplication(earnData: {
  today_earn_usd_cents: number;
  today_gmv_usd_cents: number;
  auto_earn_active: boolean;
  auto_earn_tasks_running: number;
}): Promise<void> {
  if (!WatchDataLayerService.isAvailable()) return;

  try {
    const data: EarnComplicationData = {
      ...earnData,
      updated_at: Date.now(),
    };
    await WatchDataLayerService.putDataItem(EARN_DATA_PATH, data as any);
  } catch {
    // Silently fail
  }
}

/**
 * Full sync — push all complication data at once.
 * Call on app foreground or after significant state changes.
 */
export async function syncAllComplications(petData?: PetComplicationData): Promise<void> {
  await Promise.allSettled([
    syncAxpComplication(),
    petData ? syncPetComplication(petData) : Promise.resolve(),
  ]);
}

/**
 * Start periodic complication sync (every 5 minutes when app is active).
 */
let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startComplicationSync(): void {
  if (syncInterval || !WatchDataLayerService.isAvailable()) return;

  // Initial sync
  syncAxpComplication();

  // Periodic sync every 5 minutes
  syncInterval = setInterval(() => {
    syncAxpComplication();
  }, 5 * 60 * 1000);
}

export function stopComplicationSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
