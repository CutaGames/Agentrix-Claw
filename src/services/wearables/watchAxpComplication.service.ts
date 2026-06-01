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

  // Sprint WA #3: Listen for skin sale events and push to watch
  window.addEventListener('agentrix:skin-sold', handleSkinSoldForWatch as EventListener);
}

export function stopComplicationSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  window.removeEventListener('agentrix:skin-sold', handleSkinSoldForWatch as EventListener);
}

/**
 * Sprint WA #3: Push skin sale notification to watch.
 * Per wearable-prd-v4 §2.5: "+$2.10 — 你的'蓝色独角兽'皮肤被买走了"
 */
async function handleSkinSoldForWatch(e: Event): Promise<void> {
  if (!WatchDataLayerService.isAvailable()) return;

  const detail = (e as CustomEvent).detail as {
    skin_name?: string;
    amount_cents?: number;
    type?: string;
  } | undefined;

  if (!detail) return;

  const amount = detail.amount_cents ? (detail.amount_cents / 100).toFixed(2) : '0.00';
  const skinName = detail.skin_name || 'Skin';
  const isRemix = detail.type === 'skin_remix_earned';

  const message = isRemix
    ? `💎 Remix +$${amount} — "${skinName}"`
    : `🎉 +$${amount} — "${skinName}" sold`;

  // Send as a high-priority message to watch
  await WatchDataLayerService.broadcastMessage('/agentrix/agent/text', {
    text: message,
    isFinal: true,
    type: 'skin_gmv_notification',
  });

  // Also refresh the earn complication data
  await syncEarnComplication({
    today_earn_usd_cents: detail.amount_cents || 0,
    today_gmv_usd_cents: detail.amount_cents || 0,
    auto_earn_active: true,
    auto_earn_tasks_running: 0,
  });
}

// ── Sprint WA #3: Watch Skin GMV + AXP Notification ──────────

/**
 * Push a skin sale notification to the watch.
 * Per wearable-prd-v4 §2.5: "+$2.10 — 你的'蓝色独角兽'皮肤被买走了"
 */
export async function notifyWatchSkinSold(event: {
  skin_name: string;
  amount_cents: number;
  buyer_name: string;
}): Promise<void> {
  if (!WatchDataLayerService.isAvailable()) return;

  try {
    await WatchDataLayerService.broadcastMessage('/agentrix/agent/text' as any, {
      text: `+$${(event.amount_cents / 100).toFixed(2)} — "${event.skin_name}" sold to @${event.buyer_name}`,
      isFinal: true,
      type: 'skin_gmv',
    });
    // Refresh AXP complication data
    await syncAxpComplication();
  } catch {
    // Silently fail
  }
}

/**
 * Push an AXP earn notification to the watch (vitals reward).
 * Per wearable-prd-v4 §8.2: Vitals → AXP reward notification.
 */
export async function notifyWatchAxpEarned(event: {
  amount: number;
  reason: string;
}): Promise<void> {
  if (!WatchDataLayerService.isAvailable()) return;

  try {
    await WatchDataLayerService.broadcastMessage('/agentrix/agent/text' as any, {
      text: `+${event.amount} AXP · ${event.reason}`,
      isFinal: true,
      type: 'axp_earn',
    });
  } catch {
    // Silently fail
  }
}
