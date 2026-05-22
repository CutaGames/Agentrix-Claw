/**
 * Mobile intent bridge — single dispatch surface for system-assistant calls.
 *
 * Sources of intents (all funnel into `dispatchIntent` / `handleDeepLink`):
 *   • iOS App Intents (Swift) → AgentrixIntentBridge native module → JS bridge
 *   • Android App Actions / 小米快捷 / 鸿蒙意图 / 小布 / Jovi → `agentrix://intent/<name>?...`
 *     deep links → `handleDeepLink` (set up via `attachLinkingListener` in App.tsx)
 *   • Apple Watch Shortcut → iPhone WCSession → intentBridge native module
 *   • BLE wearables (band/glass) → `dispatchGesture` → `dispatchIntent`
 *
 * V3 core (P0 shipped 2026-05-04):
 *   ask-aira / draft / approve / wallet-status / invoke-agent / pet-mood
 *
 * V4 additions (mobile-prd-v4 §8 — completed 2026-05-18):
 *   create-pet / switch-skin / market-search
 *   (pet-mood is reused — V3 already covers it)
 *
 * Each intent has:
 *   1. A registered handler (defaults are wired in `defaultIntentHandlers.ts`).
 *   2. Optional native deep-link backing (Android) or App Intent (iOS / Watch).
 *
 * If a handler is missing the dispatcher returns `{ ok: false }` instead of
 * throwing, so a malformed deep link can never crash the JS thread.
 */

import { Linking } from 'react-native';

// ── Intent surface types ──────────────────────────────────────────────────

export type IntentName =
  // V3
  | 'ask-aira'
  | 'draft'
  | 'approve'
  | 'wallet-status'
  | 'invoke-agent'
  | 'pet-mood'
  // V4 (mobile-prd-v4 §8)
  | 'create-pet'
  | 'switch-skin'
  | 'market-search';

export interface IntentPayload {
  // V3
  question?: string;
  topic?: string;
  style?: string;
  approvalId?: string;
  agent?: string;
  input?: string;
  // V4
  /** create-pet: free-text prompt ("a blue unicorn"). */
  prompt?: string;
  /** switch-skin: skin id or display-name fragment to match. */
  skinId?: string;
  skinName?: string;
  /** market-search: free-text query ("Christmas skins"). */
  query?: string;
  /** market-search: optional category (skin / skill / task). */
  category?: 'skin' | 'skill' | 'task';
  /** Generic catch-all for vendor-specific extra params. */
  [key: string]: unknown;
}

export interface IntentResult {
  ok: boolean;
  message: string;
  /** Optional structured data — e.g. pet emotion + intensity for `pet-mood`. */
  data?: unknown;
  /** If the intent navigated, the screen route name we landed on. */
  navigatedTo?: string;
}

export type IntentHandler = (payload: IntentPayload) => Promise<IntentResult>;

const handlers: Partial<Record<IntentName, IntentHandler>> = {};

const ALL_INTENTS: ReadonlySet<IntentName> = new Set<IntentName>([
  'ask-aira',
  'draft',
  'approve',
  'wallet-status',
  'invoke-agent',
  'pet-mood',
  'create-pet',
  'switch-skin',
  'market-search',
]);

export function isKnownIntent(name: string): name is IntentName {
  return ALL_INTENTS.has(name as IntentName);
}

export function listKnownIntents(): IntentName[] {
  return Array.from(ALL_INTENTS);
}

export function registerIntentHandler(name: IntentName, handler: IntentHandler): () => void {
  handlers[name] = handler;
  return () => {
    if (handlers[name] === handler) delete handlers[name];
  };
}

export async function dispatchIntent(
  name: IntentName,
  payload: IntentPayload = {},
): Promise<IntentResult> {
  if (!isKnownIntent(name)) {
    return { ok: false, message: `Unknown intent: ${name}` };
  }
  const h = handlers[name];
  if (!h) {
    return { ok: false, message: `No handler registered for intent: ${name}` };
  }
  try {
    return await h(payload);
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Intent failed' };
  }
}

/**
 * Parse `agentrix://intent/<name>?...` deep link and dispatch.
 *
 * Tolerant of two URL shapes the OS may emit:
 *   1. `agentrix://intent/pet-mood`           → host=intent, path=/pet-mood
 *   2. `agentrix:///intent/pet-mood`          → host='',     path=/intent/pet-mood
 *
 * Returns null when the URL is not an intent deep link (the navigation
 * `linking` config will then take over).
 */
export async function handleDeepLink(url: string): Promise<IntentResult | null> {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'agentrix:') return null;
    const path = (parsed.host + parsed.pathname).replace(/\/+/g, '/').replace(/^\//, '');
    if (!path.startsWith('intent/')) return null;
    const segs = path.replace(/^intent\//, '').split('/').filter(Boolean);
    const name = segs[0] as IntentName;
    if (!name) return null;
    if (!isKnownIntent(name)) {
      return { ok: false, message: `Unknown intent in deep link: ${name}` };
    }
    const payload: IntentPayload = {};
    parsed.searchParams.forEach((value, key) => {
      // First-write-wins; vendors sometimes append the same key twice.
      if (!(key in payload)) (payload as Record<string, unknown>)[key] = value;
    });
    return dispatchIntent(name, payload);
  } catch {
    return null;
  }
}

let detachLinking: (() => void) | null = null;

export function attachLinkingListener(): () => void {
  if (detachLinking) return detachLinking; // idempotent
  const sub = Linking.addEventListener('url', (event) => {
    void handleDeepLink(event.url);
  });
  Linking.getInitialURL().then((url) => {
    if (url) void handleDeepLink(url);
  });
  detachLinking = () => {
    sub.remove();
    detachLinking = null;
  };
  return detachLinking;
}
