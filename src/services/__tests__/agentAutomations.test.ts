/**
 * E1 / E2 automations on the phone (agentAutomations.ts, contract shared/types/agent-automation.ts v0).
 */
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import {
  AgentAutomationsError,
  agentAutomationsEnabled,
  automationRunLine,
  automationRunSummary,
  automationSources,
  automationStatusLine,
  automationTitle,
  automationTriggerLine,
  createMobileAgentAutomationsClient,
} from '../agentAutomations';

const AGENT = '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
const OTHER_AGENT = '7a1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
const AUT = `aut_${'1a'.repeat(16)}`;
const BASE = 'https://api.example.test/api';

const run = (overrides: Record<string, unknown> = {}) => ({
  runRef: `aur_${'2b'.repeat(16)}`,
  automationRef: AUT,
  status: 'succeeded',
  startedAt: '2026-10-02T00:00:00.000Z',
  finishedAt: '2026-10-02T00:00:20.000Z',
  resultSummary: '3 meetings today',
  sources: [{ label: 'Calendar', url: 'https://calendar.google.com/' }],
  deliveredTo: ['telegram', 'chat'],
  spentCents: 0,
  ...overrides,
});
const view = (overrides: Record<string, unknown> = {}) => ({
  automationRef: AUT,
  agentAccountId: AGENT,
  title: 'Morning brief',
  instruction: 'Summarise today',
  trigger: { kind: 'schedule', every: 'day', at: '08:00', timezone: 'Asia/Shanghai' },
  delivery: [{ channel: 'telegram', bindingRef: `acb_${'3c'.repeat(16)}` }, { channel: 'chat' }],
  spendCapCentsPerRun: 0,
  tools: [],
  status: 'active',
  pausedReason: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  nextRunAt: '2026-10-03T00:00:00.000Z',
  lastRun: run(),
  ...overrides,
});

function transport(answers: Array<HttpResponseV1 | Error>): HttpTransportV1 & { calls: HttpRequestV1[] } {
  const calls: HttpRequestV1[] = [];
  return {
    calls,
    async request(req) {
      calls.push(req);
      const next = answers.shift();
      if (!next) throw new Error('no more answers');
      if (next instanceof Error) throw next;
      return next;
    },
  };
}
const ok = (body: unknown): HttpResponseV1 => ({ status: 200, headers: {}, body });
const status = (code: number): HttpResponseV1 => ({ status: code, headers: {}, body: { code: 'X' } });
function client(answers: Array<HttpResponseV1 | Error>, token: string | null = 'user-token') {
  const t = transport(answers);
  return { t, c: createMobileAgentAutomationsClient({ transport: t, baseUrl: `${BASE}/`, token: () => token }) };
}
async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof AgentAutomationsError ? error.failure : `other:${String(error)}`;
  }
  return 'resolved';
}

describe('createMobileAgentAutomationsClient', () => {
  it("lists through the decoder; another Agent's item and a broken one are counted, not shown", async () => {
    const { t, c } = client([ok({ items: [view(), view({ agentAccountId: OTHER_AGENT }), { automationRef: 'x' }] })]);
    const list = await c.list(AGENT);
    expect(list.items.map((item) => item.automationRef)).toEqual([AUT]);
    expect(list.unreadable).toBe(2);
    expect(t.calls[0]).toMatchObject({
      method: 'GET',
      path: `${BASE}/automations?agentAccountId=${AGENT}`,
      headers: { Authorization: 'Bearer user-token', 'X-Agentrix-Surface': 'mobile' },
    });
  });

  it('a wrapped or itemless body is unreadable; a bad Agent id or ref never leaves the phone', async () => {
    const { t, c } = client([ok({ success: true, data: { items: [view()] } }), ok([view()])]);
    expect(await failureOf(c.list(AGENT))).toBe('unreadable');
    expect(await failureOf(c.list(AGENT))).toBe('unreadable');
    expect(await failureOf(c.list('../x'))).toBe('not_found');
    expect(await failureOf(c.runs('aut_../x'))).toBe('not_found');
    expect(await failureOf(c.act('aut_1/../x', 'end'))).toBe('not_found');
    expect(t.calls).toHaveLength(2);
  });

  it("runs keep only that automation's decodable runs, newest 20", async () => {
    const many = Array.from({ length: 22 }, (_, i) => run({ runRef: `aur_${i.toString(16).padStart(32, '0')}` }));
    const { t, c } = client([ok({ items: [run(), run({ automationRef: `aut_${'4d'.repeat(16)}` }), run({ sources: [{ label: 'x', url: 'javascript:alert(1)' }] })] }), ok({ items: many })]);
    const first = await c.runs(AUT);
    expect(first.items).toHaveLength(1);
    expect(first.unreadable).toBe(2);
    const second = await c.runs(AUT);
    expect(second.items).toHaveLength(20);
    expect(second.unreadable).toBe(2);
    expect(t.calls[0]).toMatchObject({ method: 'GET', path: `${BASE}/automations/${AUT}/runs` });
  });

  it('actions post to their own route and return the read-back; a mismatched read-back is unreadable', async () => {
    const { t, c } = client([ok(view({ status: 'paused', pausedReason: 'owner', nextRunAt: null })), ok(view({ automationRef: `aut_${'4d'.repeat(16)}` }))]);
    await expect(c.act(AUT, 'pause')).resolves.toMatchObject({ status: 'paused', pausedReason: 'owner' });
    expect(await failureOf(c.act(AUT, 'resume'))).toBe('unreadable');
    expect(t.calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ['POST', `${BASE}/automations/${AUT}/pause`, {}],
      ['POST', `${BASE}/automations/${AUT}/resume`, {}],
    ]);
  });

  it('maps failures; no token sends nothing; a transport error is unavailable', async () => {
    const { c } = client([status(403), status(404), status(409), status(429), status(500), new Error('offline')]);
    expect(await failureOf(c.act(AUT, 'resume'))).toBe('not_allowed');
    expect(await failureOf(c.act(AUT, 'resume'))).toBe('not_found');
    expect(await failureOf(c.act(AUT, 'resume'))).toBe('conflict');
    expect(await failureOf(c.act(AUT, 'resume'))).toBe('rate_limited');
    expect(await failureOf(c.act(AUT, 'resume'))).toBe('unavailable');
    expect(await failureOf(c.list(AGENT))).toBe('unavailable');
    const none = client([], null);
    expect(await failureOf(none.c.list(AGENT))).toBe('no_session');
    expect(none.t.calls).toHaveLength(0);
  });
});

describe('what the screen shows', () => {
  const when = (iso: string) => iso.slice(5, 16).replace('T', ' ');

  it('trigger and delivery read the same as on the web; event summaries are plain text', () => {
    expect(automationTriggerLine(view() as any, 'zh')).toBe('每天 08:00（Asia/Shanghai） · 送到 Telegram、对话');
    expect(automationTriggerLine(view({ trigger: { kind: 'payment_received', summary: 'When\u202E paid' }, delivery: [{ channel: 'push' }] }) as any, 'en')).toBe('When paid · sends to Push');
  });

  it('status says why it is paused and when it runs next', () => {
    expect(automationStatusLine(view() as any, 'zh', when)).toBe('运行中 · 下次运行 10-03 00:00');
    expect(automationStatusLine(view({ status: 'paused', pausedReason: 'emergency_stop', nextRunAt: null }) as any, 'zh', when)).toBe('已暂停（急停拉着，先解除急停）');
    expect(automationStatusLine(view({ status: 'ended', nextRunAt: null }) as any, 'en', when)).toBe('Ended');
  });

  it('a run line says where it went and what it spent, only when it spent something', () => {
    expect(automationRunLine(run() as any, 'zh', when)).toBe('10-02 00:00 · 完成 · 送到了 Telegram、对话');
    expect(automationRunLine(run({ status: 'not_delivered', deliveredTo: [], spentCents: 125 }) as any, 'en', when)).toBe('10-02 00:00 · Done, not delivered · spent $1.25');
  });

  it('Agent text is plain; only https sources are links', () => {
    expect(automationTitle({ title: 'Brief\u202E\u0007' }, 'en')).toBe('Brief');
    expect(automationTitle({ title: '\u200B' }, 'zh')).toBe('自动化');
    expect(automationRunSummary({ resultSummary: 'a\r\nb\u2066' })).toBe('a\nb');
    expect(automationRunSummary({ resultSummary: null })).toBeNull();
    expect(automationSources({ sources: [{ label: 'Cal', url: 'https://calendar.google.com/' }, { label: 'Bad', url: 'http://x.example/' }, { label: '', url: null }] }, 'en')).toEqual([
      { label: 'Cal', url: 'https://calendar.google.com/' },
      { label: 'Bad', url: null },
      { label: 'Source', url: null },
    ]);
  });

  it('the flag is on only for exactly 1', () => {
    expect(agentAutomationsEnabled(undefined)).toBe(false);
    expect(agentAutomationsEnabled('true')).toBe(false);
    expect(agentAutomationsEnabled('1')).toBe(true);
  });
});

describe('wiring (static)', () => {
  const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');

  it('the screen is registered and reachable only behind the flag', () => {
    const nav = read('navigation/four-zone/FourZoneTabNavigator.tsx');
    expect(nav).toMatch(/\{AGENT_AUTOMATIONS_ENABLED \? \(\s*<TwinStack\.Screen name="TwinAutomations"/);
    const home = read('screens/four-zone/TwinHomeScreen.tsx');
    expect(home).toMatch(/\{AGENT_AUTOMATIONS_ENABLED \? \(\s*<TouchableOpacity[\s\S]{0,120}navigation\.navigate\('TwinAutomations'\)/);
  });

  it('buttons follow the contract, ending is two taps, and the list is read back', () => {
    const src = read('screens/four-zone/TwinAutomationsScreen.tsx');
    expect(src).toMatch(/const actions = automationActionsV0\(item\)/);
    expect(src).toMatch(/onPress=\{\(\) => confirmEnd\(item\.automationRef, title\)\}/);
    expect(src).toMatch(/onPress: \(\) => act\.mutate\(\{ automationRef, action: 'end' \}\)/);
    expect(src).toMatch(/onSettled: \(\) => void queryClient\.invalidateQueries\(\{ queryKey: key \}\)/);
    // Only links that automationSources kept as https open.
    expect(src).toMatch(/source\.url \? \(\s*<TouchableOpacity[\s\S]{0,80}onPress=\{\(\) => void Linking\.openURL\(source\.url as string\)\}/);
    expect(src.match(/Linking\.openURL/g)).toHaveLength(1);
  });

  it('the flag is read as a literal so the Expo build inlines it', () => {
    expect(read('services/agentAutomations.ts')).toMatch(/agentAutomationsEnabled\(process\.env\.EXPO_PUBLIC_AGENT_AUTOMATIONS\)/);
  });
});
