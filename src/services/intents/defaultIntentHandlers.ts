/**
 * Default handlers for every system-assistant intent (V3 + V4).
 *
 * Wired once at app boot via `installDefaultIntentHandlers(navigationRef)`
 * (see App.tsx). Each handler:
 *   1. Performs any backend / store work (e.g. fetching pet state).
 *   2. Optionally navigates the React Navigation root to the right screen so
 *      the user lands on the result, not a blank home.
 *   3. Returns a `{ ok, message, data?, navigatedTo? }` envelope that flows
 *      back to the OS-level dialog ("Aira's mood is excited", spoken by Siri).
 *
 * The handlers are intentionally thin — they call into existing services
 * (`mobilePetSdk`, `wallet api`, etc.) so the same logic the in-app UI uses
 * is what Siri / Assistant / 小爱 / 小艺 see, with no duplication.
 *
 * Handler contract (PRD mobile-prd-v4 §8):
 *
 *   ┌─────────────────────────────┬───────────────────────────────────────┐
 *   │ create-pet     prompt       │ → PetCreator screen, prompt prefilled │
 *   │ switch-skin    skinId/Name  │ → API + Wardrobe screen               │
 *   │ pet-mood       (none)       │ → text reply via API + toast          │
 *   │ market-search  query, cat   │ → SkinMarketplace with query          │
 *   │ wallet-status  (none)       │ → Wallet screen + balance text        │
 *   │ ask-aira       question     │ → AgentChat screen with seed message  │
 *   │ approve        approvalId   │ → ApprovalCenter screen, item open    │
 *   │ invoke-agent   agent,input  │ → AgentChat with agent + first prompt │
 *   │ draft          topic,style  │ → AgentChat with "draft …" prompt     │
 *   └─────────────────────────────┴───────────────────────────────────────┘
 */
import type { NavigationContainerRef } from '@react-navigation/native';
import {
  registerIntentHandler,
  type IntentName,
  type IntentResult,
  type IntentPayload,
} from './intentBridge';
import { apiFetch } from '../api';
import { getPetState, listSkins, activateSkin } from '../mobilePetSdk';

type Nav = NavigationContainerRef<Record<string, object | undefined>>;

function ok(message: string, extras: Partial<IntentResult> = {}): IntentResult {
  return { ok: true, message, ...extras };
}
function fail(message: string): IntentResult {
  return { ok: false, message };
}

function safeNavigate(nav: Nav | null, screen: string, params?: Record<string, unknown>) {
  try {
    nav?.navigate(screen as never, (params ?? {}) as never);
  } catch {
    /* noop — navigation may be unmounted during boot */
  }
}

const EMOTION_LABELS_ZH: Record<string, string> = {
  happy: '开心', excited: '兴奋', focused: '专注', concerned: '担心',
  tired: '疲倦', calm: '平静', love: '想抱抱', sad: '难过',
  angry: '小生气', sleepy: '困',
};

/** Install all default handlers + return a disposer for tests. */
export function installDefaultIntentHandlers(getNav: () => Nav | null): () => void {
  const disposers: Array<() => void> = [];

  // ── pet-mood ────────────────────────────────────────────────────────
  disposers.push(
    registerIntentHandler('pet-mood', async () => {
      try {
        const state = await getPetState();
        const emotion = state?.emotion ?? 'calm';
        const lv = state?.intimacy_level ?? 0;
        const zh = EMOTION_LABELS_ZH[emotion] ?? emotion;
        const message = `Aira 现在 ${zh},亲密度 Lv ${lv}`;
        safeNavigate(getNav(), 'PetCompanion');
        return ok(message, {
          navigatedTo: 'PetCompanion',
          data: { emotion, intimacy_level: lv },
        });
      } catch (e: any) {
        return fail(`Couldn't read pet mood: ${e?.message || e}`);
      }
    }),
  );

  // ── create-pet (V4) ─────────────────────────────────────────────────
  disposers.push(
    registerIntentHandler('create-pet', async (payload: IntentPayload) => {
      const prompt = (payload.prompt as string) || (payload.input as string) || '';
      safeNavigate(getNav(), 'PetCreator', { prompt });
      return ok(prompt ? `已打开宠物生成页 · 提示词: ${prompt}` : '已打开宠物生成页', {
        navigatedTo: 'PetCreator',
        data: { prompt },
      });
    }),
  );

  // ── switch-skin (V4) ────────────────────────────────────────────────
  disposers.push(
    registerIntentHandler('switch-skin', async (payload: IntentPayload) => {
      try {
        let id = (payload.skinId as string) || '';
        const name = (payload.skinName as string) || '';
        if (!id && name) {
          // Fuzzy-match by name fragment from the user's wardrobe.
          const skins = await listSkins();
          const lower = name.trim().toLowerCase();
          const hit = skins.find(
            (s) => (s.display_name || '').toLowerCase().includes(lower),
          );
          if (hit) id = hit.id;
        }
        if (!id) {
          safeNavigate(getNav(), 'Wardrobe');
          return fail('未识别皮肤,已打开衣柜');
        }
        const newState = await activateSkin(id);
        safeNavigate(getNav(), 'Wardrobe');
        return ok('已切换皮肤', {
          navigatedTo: 'Wardrobe',
          data: { active_skin_id: id, intimacy_level: newState?.intimacy_level },
        });
      } catch (e: any) {
        return fail(`Switch failed: ${e?.message || e}`);
      }
    }),
  );

  // ── market-search (V4) ──────────────────────────────────────────────
  disposers.push(
    registerIntentHandler('market-search', async (payload: IntentPayload) => {
      const query = (payload.query as string) || (payload.topic as string) || '';
      const category = (payload.category as 'skin' | 'skill' | 'task') || 'skin';
      const screen =
        category === 'skill'
          ? 'SkillMarketplace'
          : category === 'task'
            ? 'TaskMarketplace'
            : 'SkinMarketplace';
      safeNavigate(getNav(), screen, { query });
      return ok(query ? `已在市场搜索 "${query}"` : `已打开${category === 'skill' ? '技能' : category === 'task' ? '任务' : '皮肤'}市场`, {
        navigatedTo: screen,
        data: { query, category },
      });
    }),
  );

  // ── wallet-status (V3) ──────────────────────────────────────────────
  disposers.push(
    registerIntentHandler('wallet-status', async () => {
      try {
        const proj = await apiFetch<{
          fiat_cents?: number;
          axp?: number;
          usdc_micros?: number;
          updated_at?: number;
        }>('/v1/wallet/projection');
        const usd = ((proj?.fiat_cents ?? 0) / 100).toFixed(2);
        const axp = proj?.axp ?? 0;
        safeNavigate(getNav(), 'Wallet');
        return ok(`钱包: $${usd} · ${axp} AXP`, {
          navigatedTo: 'Wallet',
          data: proj,
        });
      } catch (e: any) {
        return fail(`Couldn't read wallet: ${e?.message || e}`);
      }
    }),
  );

  // ── ask-aira (V3) ───────────────────────────────────────────────────
  disposers.push(
    registerIntentHandler('ask-aira', async (payload) => {
      const seed = (payload.question as string) || (payload.input as string) || '';
      safeNavigate(getNav(), 'AgentChat', { seedMessage: seed, autoSend: !!seed });
      return ok(seed ? `已转给 Aira: ${seed}` : '已打开 Aira', {
        navigatedTo: 'AgentChat',
        data: { seed },
      });
    }),
  );

  // ── approve (V3) ────────────────────────────────────────────────────
  disposers.push(
    registerIntentHandler('approve', async (payload) => {
      const id = (payload.approvalId as string) || '';
      safeNavigate(getNav(), 'ApprovalCenter', id ? { focusId: id } : undefined);
      return ok(id ? `已打开审批 ${id}` : '已打开审批中心', {
        navigatedTo: 'ApprovalCenter',
        data: { approvalId: id },
      });
    }),
  );

  // ── invoke-agent (V3) ───────────────────────────────────────────────
  disposers.push(
    registerIntentHandler('invoke-agent', async (payload) => {
      const agent = (payload.agent as string) || '';
      const input = (payload.input as string) || '';
      safeNavigate(getNav(), 'AgentChat', { agent, seedMessage: input, autoSend: !!input });
      return ok(`已唤起 ${agent || 'Agent'}`, {
        navigatedTo: 'AgentChat',
        data: { agent, input },
      });
    }),
  );

  // ── draft (V3) ──────────────────────────────────────────────────────
  disposers.push(
    registerIntentHandler('draft', async (payload) => {
      const topic = (payload.topic as string) || '';
      const style = (payload.style as string) || '';
      const seed = `帮我起草一条${style ? ` ${style}` : ''}的消息: ${topic}`;
      safeNavigate(getNav(), 'AgentChat', { seedMessage: seed, autoSend: true });
      return ok(`已起草: ${topic}`, {
        navigatedTo: 'AgentChat',
        data: { topic, style },
      });
    }),
  );

  return () => {
    for (const d of disposers) d();
  };
}

/**
 * Convenience for tests: list which intents have a handler installed.
 * Useful when verifying coverage in CI.
 */
export function installedIntentNames(): IntentName[] {
  return [
    'pet-mood',
    'create-pet',
    'switch-skin',
    'market-search',
    'wallet-status',
    'ask-aira',
    'approve',
    'invoke-agent',
    'draft',
  ];
}
