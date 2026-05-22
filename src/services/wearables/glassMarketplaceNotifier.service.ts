/**
 * glassMarketplaceNotifier.service.ts — Sprint WC #7
 *
 * Per wearable-prd-v4 §8.4: Glass HUD Marketplace 微通知
 * Only 3 types, max 5 per day to prevent distraction:
 *   1. Skin sold: "+$2.10 — '蓝色独角兽' sold"
 *   2. Skill invoked: "+$0.05 — Smart Checkout 被 5 只宠调用"
 *   3. AXP expiry warning: "500 AXP 将于 6 天后过期"
 *
 * Glass doesn't show any interactive Marketplace elements.
 */
import { GlassHUDController } from './glassHUDController.service';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Types ────────────────────────────────────────────────────

interface GlassNotification {
  type: 'skin_sold' | 'skill_invoked' | 'axp_expiry';
  text: string;
  icon?: string;
}

// ── Constants ────────────────────────────────────────────────

const MAX_DAILY_NOTIFICATIONS = 5;
const DAILY_COUNT_KEY = 'glass_marketplace_notif_count';
const DAILY_RESET_KEY = 'glass_marketplace_notif_date';

// ── Daily limit management ───────────────────────────────────

async function getDailyCount(): Promise<number> {
  try {
    const dateStr = await AsyncStorage.getItem(DAILY_RESET_KEY);
    const today = new Date().toISOString().slice(0, 10);
    if (dateStr !== today) {
      // New day — reset counter
      await AsyncStorage.setItem(DAILY_RESET_KEY, today);
      await AsyncStorage.setItem(DAILY_COUNT_KEY, '0');
      return 0;
    }
    const count = await AsyncStorage.getItem(DAILY_COUNT_KEY);
    return parseInt(count || '0', 10);
  } catch {
    return 0;
  }
}

async function incrementDailyCount(): Promise<void> {
  try {
    const current = await getDailyCount();
    await AsyncStorage.setItem(DAILY_COUNT_KEY, String(current + 1));
  } catch {
    // Best effort
  }
}

// ── Public API ───────────────────────────────────────────────

let _hudController: GlassHUDController | null = null;

/**
 * Set the Glass HUD controller instance for notifications.
 * Call once when Glass device is connected.
 */
export function setGlassHudController(controller: GlassHUDController | null): void {
  _hudController = controller;
}

/**
 * Send a marketplace notification to Glass HUD.
 * Respects the 5/day limit per PRD §8.4.
 */
export async function notifyGlassMarketplace(notification: GlassNotification): Promise<boolean> {
  if (!_hudController) return false;

  const count = await getDailyCount();
  if (count >= MAX_DAILY_NOTIFICATIONS) {
    return false; // Daily limit reached
  }

  const icon = notification.icon || getDefaultIcon(notification.type);
  await _hudController.showNotification(notification.text, icon);
  await incrementDailyCount();
  return true;
}

/**
 * Notify Glass: skin sold.
 */
export async function notifyGlassSkinSold(skinName: string, amountCents: number): Promise<boolean> {
  return notifyGlassMarketplace({
    type: 'skin_sold',
    text: `+$${(amountCents / 100).toFixed(2)} — "${skinName}" sold`,
    icon: '🎨',
  });
}

/**
 * Notify Glass: skill invoked.
 */
export async function notifyGlassSkillInvoked(skillName: string, amountCents: number, invokeCount: number): Promise<boolean> {
  return notifyGlassMarketplace({
    type: 'skill_invoked',
    text: `+$${(amountCents / 100).toFixed(2)} — ${skillName} x${invokeCount}`,
    icon: '⚡',
  });
}

/**
 * Notify Glass: AXP expiry warning.
 */
export async function notifyGlassAxpExpiry(amount: number, daysLeft: number): Promise<boolean> {
  return notifyGlassMarketplace({
    type: 'axp_expiry',
    text: `${amount} AXP expires in ${daysLeft}d`,
    icon: '⏳',
  });
}

/**
 * Get remaining notification quota for today.
 */
export async function getRemainingGlassNotifQuota(): Promise<number> {
  const count = await getDailyCount();
  return Math.max(0, MAX_DAILY_NOTIFICATIONS - count);
}

// ── Internal ─────────────────────────────────────────────────

function getDefaultIcon(type: GlassNotification['type']): string {
  switch (type) {
    case 'skin_sold': return '🎨';
    case 'skill_invoked': return '⚡';
    case 'axp_expiry': return '⏳';
    default: return '💎';
  }
}
