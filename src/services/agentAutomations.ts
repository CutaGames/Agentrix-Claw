/**
 * E1 / E2 on the phone: the automations list and run history (contract `shared/types/agent-automation.ts` v0;
 * L4 3). Off unless the build sets `EXPO_PUBLIC_AGENT_AUTOMATIONS=1`; the routes answer 404 while the server flag
 * `AGENT_AUTOMATION_V0_ENABLED` is off.
 *
 * - List: `GET /automations?agentAccountId=<uuid>`, bodies not wrapped (same as the web); each item decoded with
 *   `decodeAutomationViewV0`. One that does not decode, or belongs to another Agent, is counted, never shown.
 * - Runs: `GET /automations/:ref/runs` (newest 20), each decoded with `decodeAutomationRunV0`.
 * - Pause / resume / end: `POST /automations/:ref/<action>` with the user's own token; buttons follow
 *   `automationActionsV0`. The list is read again afterwards, never optimistic.
 * - New automations are only proposed by the Agent in a chat and confirmed there; this screen does not create any.
 * - Titles, instructions, summaries and source labels come from the Agent: plain text (plainDisplayText.ts).
 *   A source link opens only when it is https.
 * No React Native import: the transport and token are injected.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import {
  AUTOMATION_REF_PATTERN_V0,
  decodeAutomationRunV0,
  decodeAutomationViewV0,
  describeAutomationScheduleV0,
  type AutomationDeliveryChannelV0,
  type AutomationPausedReasonV0,
  type AutomationRunStatusV0,
  type AutomationRunV0,
  type AutomationStatusV0,
  type AutomationViewV0,
} from '../../shared/types/agent-automation';
import { plainDisplayLine, plainDisplayText } from './plainDisplayText';

type Copy = { zh: string; en: string };
type Lang = 'zh' | 'en';

export function agentAutomationsEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const AGENT_AUTOMATIONS_ENABLED = agentAutomationsEnabled(process.env.EXPO_PUBLIC_AGENT_AUTOMATIONS);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAutomationRef(value: unknown): value is string {
  return typeof value === 'string' && AUTOMATION_REF_PATTERN_V0.test(value);
}

export type AutomationAction = 'pause' | 'resume' | 'end';

export type AgentAutomationsFailureV0 = 'not_allowed' | 'not_found' | 'conflict' | 'rate_limited' | 'unreadable' | 'unavailable' | 'no_session';

export class AgentAutomationsError extends Error {
  readonly failure: AgentAutomationsFailureV0;
  constructor(failure: AgentAutomationsFailureV0) {
    super(failure);
    this.name = 'AgentAutomationsError';
    this.failure = failure;
  }
}

function failureOf(status: number): AgentAutomationsFailureV0 {
  if (status === 401 || status === 403) return 'not_allowed';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  return 'unavailable';
}

export interface DecodedListV0<T> {
  items: T[];
  /** Entries the phone could not read, or that were not for this Agent / automation; shown as a count. */
  unreadable: number;
}

export interface MobileAgentAutomationsClientV0 {
  list(agentAccountId: string): Promise<DecodedListV0<AutomationViewV0>>;
  runs(automationRef: string): Promise<DecodedListV0<AutomationRunV0>>;
  act(automationRef: string, action: AutomationAction): Promise<AutomationViewV0>;
}

const LIST_MAX = 100;
const RUNS_MAX = 20;

export function createMobileAgentAutomationsClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}): MobileAgentAutomationsClientV0 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const call = async (method: 'GET' | 'POST', path: string): Promise<unknown> => {
    const token = deps.token();
    if (!token) throw new AgentAutomationsError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(method === 'POST' ? { body: {} } : {}),
      });
    } catch {
      throw new AgentAutomationsError('unavailable');
    }
    if (response.status < 200 || response.status >= 300) throw new AgentAutomationsError(failureOf(response.status));
    return response.body;
  };
  const decodeList = <T>(body: unknown, max: number, decode: (value: unknown) => T | null, keep: (item: T) => boolean): DecodedListV0<T> => {
    const raw = body && typeof body === 'object' && !Array.isArray(body) ? (body as { items?: unknown }).items : undefined;
    if (!Array.isArray(raw)) throw new AgentAutomationsError('unreadable');
    const items: T[] = [];
    let unreadable = Math.max(0, raw.length - max);
    for (const entry of raw.slice(0, max)) {
      const decoded = decode(entry);
      if (decoded && keep(decoded)) items.push(decoded);
      else unreadable += 1;
    }
    return { items, unreadable };
  };
  return {
    async list(agentAccountId) {
      // Checked before sending: the id goes into the query string.
      if (!UUID.test(agentAccountId)) throw new AgentAutomationsError('not_found');
      const mine = (view: AutomationViewV0) => view.agentAccountId.toLowerCase() === agentAccountId.toLowerCase();
      return decodeList(await call('GET', `/automations?agentAccountId=${agentAccountId}`), LIST_MAX, decodeAutomationViewV0, mine);
    },
    async runs(automationRef) {
      if (!isAutomationRef(automationRef)) throw new AgentAutomationsError('not_found');
      return decodeList(await call('GET', `/automations/${automationRef}/runs`), RUNS_MAX, decodeAutomationRunV0, (run) => run.automationRef === automationRef);
    },
    async act(automationRef, action) {
      if (!isAutomationRef(automationRef)) throw new AgentAutomationsError('not_found');
      const view = decodeAutomationViewV0(await call('POST', `/automations/${automationRef}/${action}`));
      if (!view || view.automationRef !== automationRef) throw new AgentAutomationsError('unreadable');
      return view;
    },
  };
}

// ── What the screen shows ───────────────────────────────────────────────────────────────

export const AUTOMATION_STATUS_COPY: Readonly<Record<AutomationStatusV0, Copy>> = {
  active: { zh: '运行中', en: 'Running' },
  paused: { zh: '已暂停', en: 'Paused' },
  ended: { zh: '已结束', en: 'Ended' },
};

export const AUTOMATION_PAUSED_COPY: Readonly<Record<AutomationPausedReasonV0, Copy>> = {
  owner: { zh: '你暂停的', en: 'paused by you' },
  emergency_stop: { zh: '急停拉着，先解除急停', en: 'the emergency stop is on; release it first' },
  failures: { zh: '连续失败，检查后再恢复', en: 'it failed several times; check it before resuming' },
  budget: { zh: '预算不够', en: 'not enough budget' },
};

export const AUTOMATION_RUN_STATUS_COPY: Readonly<Record<AutomationRunStatusV0, Copy>> = {
  running: { zh: '正在运行', en: 'Running' },
  succeeded: { zh: '完成', en: 'Done' },
  failed: { zh: '失败', en: 'Failed' },
  skipped: { zh: '跳过', en: 'Skipped' },
  budget_denied: { zh: '预算拒绝', en: 'Budget refused' },
  not_delivered: { zh: '完成但没送到', en: 'Done, not delivered' },
};

export const AUTOMATION_CHANNEL_COPY: Readonly<Record<AutomationDeliveryChannelV0, Copy>> = {
  chat: { zh: '对话', en: 'Chat' },
  push: { zh: '推送', en: 'Push' },
  telegram: { zh: 'Telegram', en: 'Telegram' },
  whatsapp: { zh: 'WhatsApp', en: 'WhatsApp' },
};

export function automationTitle(view: Pick<AutomationViewV0, 'title'>, lang: Lang): string {
  return plainDisplayLine(view.title, 80, lang === 'zh' ? '自动化' : 'Automation');
}

/** When it runs and where it sends: the schedule reads the same as on the web. */
export function automationTriggerLine(view: Pick<AutomationViewV0, 'trigger' | 'delivery'>, lang: Lang): string {
  const when = view.trigger.kind === 'schedule' ? describeAutomationScheduleV0(view.trigger, lang) : plainDisplayLine(view.trigger.summary, 120, '');
  const where = view.delivery.map((d) => AUTOMATION_CHANNEL_COPY[d.channel][lang]).join(lang === 'zh' ? '、' : ', ');
  return lang === 'zh' ? `${when} · 送到 ${where}` : `${when} · sends to ${where}`;
}

/** Status, why it is paused, and the next run (the time text is the caller's, in the phone's locale). */
export function automationStatusLine(view: Pick<AutomationViewV0, 'status' | 'pausedReason' | 'nextRunAt'>, lang: Lang, when: (iso: string) => string): string {
  const reason = view.status === 'paused' && view.pausedReason ? (lang === 'zh' ? `（${AUTOMATION_PAUSED_COPY[view.pausedReason].zh}）` : ` (${AUTOMATION_PAUSED_COPY[view.pausedReason].en})`) : '';
  const next = view.nextRunAt ? (lang === 'zh' ? ` · 下次运行 ${when(view.nextRunAt)}` : ` · next run ${when(view.nextRunAt)}`) : '';
  return `${AUTOMATION_STATUS_COPY[view.status][lang]}${reason}${next}`;
}

/** One run: when, how it went, where it was delivered, and what it spent (USD cents from the server, never computed). */
export function automationRunLine(run: Pick<AutomationRunV0, 'startedAt' | 'status' | 'deliveredTo' | 'spentCents'>, lang: Lang, when: (iso: string) => string): string {
  const parts = [when(run.startedAt), AUTOMATION_RUN_STATUS_COPY[run.status][lang]];
  if (run.deliveredTo.length > 0) {
    const channels = run.deliveredTo.map((channel) => AUTOMATION_CHANNEL_COPY[channel][lang]).join(lang === 'zh' ? '、' : ', ');
    parts.push(lang === 'zh' ? `送到了 ${channels}` : `delivered to ${channels}`);
  }
  if (run.spentCents > 0) parts.push(`${lang === 'zh' ? '花费' : 'spent'} $${(run.spentCents / 100).toFixed(2)}`);
  return parts.join(' · ');
}

export function automationRunSummary(run: Pick<AutomationRunV0, 'resultSummary'>): string | null {
  if (run.resultSummary === null) return null;
  return plainDisplayText(run.resultSummary, 2000) || null;
}

export interface AutomationSourceLineV0 {
  label: string;
  /** Only an https link; anything else is shown as text. */
  url: string | null;
}

export function automationSources(run: Pick<AutomationRunV0, 'sources'>, lang: Lang): AutomationSourceLineV0[] {
  return run.sources.slice(0, 20).map((source) => ({
    label: plainDisplayLine(source.label, 120, lang === 'zh' ? '来源' : 'Source'),
    url: typeof source.url === 'string' && /^https:\/\/[^\s]+$/i.test(source.url) ? source.url : null,
  }));
}

export const AGENT_AUTOMATIONS_FAILURE_COPY: Readonly<Record<AgentAutomationsFailureV0, Copy>> = {
  not_allowed: { zh: '只能用你本人的登录处理。', en: 'Only your own sign-in can do this.' },
  not_found: { zh: '没有这个自动化，或者自动化还没开放。', en: 'Not found, or automations are not open yet.' },
  conflict: { zh: '现在不能这样做（比如急停还拉着，或者已经到上限）。', en: 'Not possible right now (for example the emergency stop is on, or the limit is reached).' },
  rate_limited: { zh: '太频繁了，请稍后再试。', en: 'Too many tries. Try again shortly.' },
  unreadable: { zh: '读不到，下拉重试。', en: 'Could not read it. Pull to retry.' },
  unavailable: { zh: '没有生效，请重试。', en: 'Not recorded. Try again.' },
  no_session: { zh: '请先登录。', en: 'Sign in first.' },
};
