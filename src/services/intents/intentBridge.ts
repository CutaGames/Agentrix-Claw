/**
 * P0-W3-2 / W3-3 / W3-4 — Mobile intent bridge (PRD mobile-prd-v3 §4.5)
 *
 * Single dispatch surface for native intents:
 *   - iOS App Intents (Swift) call → AgentrixIntentBridge (native module) → this dispatcher
 *   - Android App Actions deep-link → handleDeepLink → this dispatcher
 *   - Watch Shortcut → Phone Aira → this dispatcher
 *
 * Six core intents:
 *   ask-aira / draft / approve / wallet-status / invoke-agent / pet-mood
 */

import { Linking } from 'react-native';

export type IntentName =
  | 'ask-aira'
  | 'draft'
  | 'approve'
  | 'wallet-status'
  | 'invoke-agent'
  | 'pet-mood';

export interface IntentPayload {
  question?: string;
  topic?: string;
  style?: string;
  approvalId?: string;
  agent?: string;
  input?: string;
}

export interface IntentResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

type IntentHandler = (payload: IntentPayload) => Promise<IntentResult>;

const handlers: Partial<Record<IntentName, IntentHandler>> = {};

export function registerIntentHandler(name: IntentName, handler: IntentHandler): () => void {
  handlers[name] = handler;
  return () => {
    if (handlers[name] === handler) delete handlers[name];
  };
}

export async function dispatchIntent(name: IntentName, payload: IntentPayload = {}): Promise<IntentResult> {
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
 * Parse an `agentrix://intent/<name>?...` deep link and dispatch.
 * Used by Android App Actions and iOS Universal Links fallback.
 */
export async function handleDeepLink(url: string): Promise<IntentResult | null> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'agentrix:') return null;
    if (!parsed.pathname.startsWith('//intent/') && !parsed.host?.startsWith('intent')) {
      // Non-intent deep link
      return null;
    }
    // agentrix://intent/<name>?...
    const path = parsed.pathname.replace(/^\/+/, '').replace(/^intent\//, '');
    const segs = path.split('/').filter(Boolean);
    const name = (segs[0] || parsed.host?.replace(/^intent$/, '') || '') as IntentName;
    if (!name) return null;

    const payload: IntentPayload = {};
    parsed.searchParams.forEach((v, k) => {
      (payload as any)[k] = v;
    });

    return dispatchIntent(name, payload);
  } catch {
    return null;
  }
}

export function attachLinkingListener(): () => void {
  const sub = Linking.addEventListener('url', (event) => {
    void handleDeepLink(event.url);
  });
  Linking.getInitialURL().then((url) => {
    if (url) void handleDeepLink(url);
  });
  return () => sub.remove();
}
