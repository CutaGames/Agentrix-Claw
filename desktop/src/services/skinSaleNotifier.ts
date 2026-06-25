/**
 * skinSaleNotifier — Sprint DA #4
 *
 * Listens for skin sale events via the presence socket and:
 *   1. Shows a desktop notification (Tauri notification API)
 *   2. Dispatches 'agentrix:skin-sold' event for SkinGmvCard refresh
 *   3. Shows AXP toast if cashback was earned
 *   4. Triggers pet celebration emotion (excited)
 *
 * Per desktop-prd-v4 §2: "Skin GMV 收入卡片 + Remix 分成时间线"
 * Per wearable-prd-v4 §8.4: Watch/Glass also get notified via broadcast.
 */
import { showAxpToast } from "./axpToast";

export interface SkinSaleEvent {
  type: "skin_sold" | "skin_remix_earned";
  skin_id: string;
  skin_name: string;
  amount_cents: number;
  buyer_name: string;
  axp_cashback?: number;
  remix_ancestor?: boolean;
  sold_at: string;
}

let _listening = false;

/**
 * Start listening for skin sale events on the presence socket.
 * Call once after login.
 */
export function startSkinSaleNotifier(): void {
  if (_listening) return;
  _listening = true;

  window.addEventListener("agentrix:skin-market-event", handleSkinMarketEvent as unknown as EventListener);
}

/**
 * Stop listening.
 */
export function stopSkinSaleNotifier(): void {
  _listening = false;
  window.removeEventListener("agentrix:skin-market-event", handleSkinMarketEvent as unknown as EventListener);
}

async function handleSkinMarketEvent(e: CustomEvent<SkinSaleEvent>): Promise<void> {
  const event = e.detail;
  if (!event) return;

  // 1. Dispatch for SkinGmvCard refresh
  window.dispatchEvent(new CustomEvent("agentrix:skin-sold", { detail: event }));

  // 2. Show AXP toast if cashback
  if (event.axp_cashback && event.axp_cashback > 0) {
    showAxpToast({
      amount: event.axp_cashback,
      reason: event.type === "skin_remix_earned"
        ? { en: "Remix earning", zh: "Remix 分成" }
        : { en: "Skin sale cashback", zh: "皮肤销售返现" },
      direction: "earn",
      emoji: "💎",
    });
  }

  // 3. Trigger pet celebration
  window.dispatchEvent(
    new CustomEvent("agentrix:pet-state", {
      detail: { emotion: "excited", source: "skin_sale" },
    }),
  );

  // 4. Desktop notification via Tauri
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    );
    let permitted = await isPermissionGranted();
    if (!permitted) {
      const result = await requestPermission();
      permitted = result === "granted";
    }
    if (permitted) {
      const amount = (event.amount_cents / 100).toFixed(2);
      const title = event.type === "skin_remix_earned"
        ? `💎 Remix 分成 +$${amount}`
        : `🎉 皮肤售出 +$${amount}`;
      const body = event.type === "skin_remix_earned"
        ? `你的「${event.skin_name}」被二创，获得分成 $${amount}`
        : `「${event.skin_name}」被 @${event.buyer_name} 购买`;
      sendNotification({ title, body });
    }
  } catch {
    // Tauri notification not available (dev mode)
  }
}
