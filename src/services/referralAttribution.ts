/**
 * Referral attribution (Pet Earning Flywheel 需求 4.5) — capture the inviter
 * `ref` from an incoming deep link and replay it at signup so the backend
 * (`/auth/register` / `/auth/email/verify-code` → ReferralFlywheelService.onSignup)
 * can attribute the new user to the inviter and pay both sides 200 AXP.
 *
 * Supported link shapes (any scheme: agentrix://, https://agentrix.top, exp://):
 *   …?ref=<inviterId | shortCode>       → capture the ref value
 *   …/r/<shortCode>[?…]                 → capture the shortCode
 *
 * The captured ref is persisted (survives the install→open→signup gap, e.g.
 * deferred deep link) and cleared once consumed at first successful signup.
 */
import * as SecureStore from 'expo-secure-store';

const KEY = 'pending_referral_ref';
const CHANNEL_KEY = 'pending_referral_channel';

/** Extract a ref token from a URL, or null if none present. */
export function parseRefFromUrl(url: string): string | null {
  if (!url) return null;
  try {
    // 1) explicit ?ref= (preferred — matches ReferralLinkService fullUrl ?ref=ownerId)
    const q = url.match(/[?&]ref=([^&#\s]+)/i);
    if (q && q[1]) return decodeURIComponent(q[1]);
    // 2) short link /r/<code>
    const r = url.match(/\/r\/([A-Za-z0-9_-]+)/);
    if (r && r[1]) return r[1];
  } catch {
    /* ignore malformed */
  }
  return null;
}

/** Inspect an incoming deep link; if it carries a ref, persist it (non-blocking). */
export async function captureRefFromUrl(url: string | null | undefined, channel = 'deeplink'): Promise<void> {
  if (!url) return;
  const ref = parseRefFromUrl(url);
  if (!ref) return;
  try {
    // First-touch attribution: don't overwrite an already-captured ref.
    const existing = await SecureStore.getItemAsync(KEY);
    if (existing) return;
    await SecureStore.setItemAsync(KEY, ref);
    await SecureStore.setItemAsync(CHANNEL_KEY, channel);
  } catch {
    /* SecureStore unavailable — attribution is best-effort, never block */
  }
}

/** Read the pending ref/channel without clearing (for passing to signup). */
export async function peekPendingRef(): Promise<{ ref?: string; channel?: string }> {
  try {
    const ref = (await SecureStore.getItemAsync(KEY)) || undefined;
    const channel = (await SecureStore.getItemAsync(CHANNEL_KEY)) || undefined;
    return { ref, channel };
  } catch {
    return {};
  }
}

/** Clear the pending ref after a successful signup attribution. */
export async function clearPendingRef(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
    await SecureStore.deleteItemAsync(CHANNEL_KEY);
  } catch {
    /* ignore */
  }
}
