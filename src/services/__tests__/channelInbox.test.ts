/**
 * A2 channel inbox on the phone (channelInbox.ts, contract shared/types/agent-channel.ts v0) and plainDisplayText.ts.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import {
  ChannelInboxError,
  channelChatLabel,
  channelInboxEnabled,
  channelMessageText,
  channelSenderLabel,
  channelTierLine,
  createMobileChannelInboxClient,
  pendingDrafts,
} from '../channelInbox';
import { plainDisplayLine, plainDisplayText } from '../plainDisplayText';

const AGENT = '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
const OTHER_AGENT = '7a1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
const BIND = `acb_${'1a'.repeat(16)}`;
const DRAFT = `acd_${'2b'.repeat(16)}`;
const BASE = 'https://api.example.test/api';

const binding = (overrides: Record<string, unknown> = {}) => ({
  bindingRef: BIND,
  agentAccountId: AGENT,
  platform: 'telegram',
  chatKind: 'group',
  chatLabel: 'Family',
  mode: 'agent',
  tier: 'represent',
  effectiveTier: 'assist',
  effectiveReason: 'agent_represent_disabled',
  proof: { method: 'telegram_bind_code', at: '2026-10-01T07:00:00Z' },
  status: 'active',
  boundAt: '2026-10-01T07:00:00Z',
  ...overrides,
});
const message = (overrides: Record<string, unknown> = {}) => ({
  messageRef: `acm_${'3c'.repeat(16)}`,
  bindingRef: BIND,
  direction: 'inbound',
  senderLabel: 'Alice',
  text: 'hi',
  state: 'received',
  sentBy: null,
  draftRef: null,
  createdAt: '2026-10-01T07:10:00Z',
  ...overrides,
});
const draft = (n: string, createdAt: string) =>
  message({ messageRef: `acm_${n.repeat(32)}`, direction: 'outbound', senderLabel: '', state: 'draft_pending', sentBy: 'agent', draftRef: `acd_${n.repeat(32)}`, createdAt });

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
function client(answers: Array<HttpResponseV1 | Error>, token: string | null = 'user-token') {
  const t = transport(answers);
  return { t, c: createMobileChannelInboxClient({ transport: t, baseUrl: `${BASE}/`, token: () => token }) };
}
async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof ChannelInboxError ? error.failure : `other:${String(error)}`;
  }
  return 'resolved';
}

describe('flag', () => {
  it('is on only for exactly "1"', () => {
    expect(channelInboxEnabled('1')).toBe(true);
    for (const value of [undefined, '', '0', 'true', 1]) expect(channelInboxEnabled(value)).toBe(false);
  });
});

describe('client: reading', () => {
  it('lists the chats of this agent with the user token', async () => {
    const { t, c } = client([ok([binding()])]);
    const list = await c.listBindings(AGENT);
    expect(list).toEqual({ items: [expect.objectContaining({ bindingRef: BIND })], unreadable: 0 });
    expect(t.calls[0]).toMatchObject({ method: 'GET', path: `${BASE}/agent-channels/bindings?agentAccountId=${AGENT}` });
    expect(t.calls[0].headers?.Authorization).toBe('Bearer user-token');
  });

  it.each([
    ['array', [binding()]],
    ['items', { items: [binding()] }],
    ['data array', { success: true, data: [binding()] }],
    ['data items', { success: true, data: { items: [binding()], nextCursor: null } }],
  ])('accepts the %s envelope', async (_name, body) => {
    expect((await client([ok(body)]).c.listBindings(AGENT)).items).toHaveLength(1);
  });

  it('counts what does not decode or belongs to another account, never shows it', async () => {
    const wider = binding({ bindingRef: `acb_${'4d'.repeat(16)}`, tier: 'assist', effectiveTier: 'represent', effectiveReason: null });
    const other = binding({ bindingRef: `acb_${'5e'.repeat(16)}`, agentAccountId: OTHER_AGENT });
    const list = await client([ok([binding(), wider, other, { bindingRef: 'x' }])]).c.listBindings(AGENT);
    expect(list.items.map((b) => b.bindingRef)).toEqual([BIND]);
    expect(list.unreadable).toBe(3);
  });

  it('a body that is not a list is unreadable', async () => {
    expect(await failureOf(client([ok({ bindings: 'no' })]).c.listBindings(AGENT))).toBe('unreadable');
  });

  it('never sends a bad id or ref, or a request without a token', async () => {
    const bad = client([]);
    expect(await failureOf(bad.c.listBindings('../x'))).toBe('not_found');
    expect(await failureOf(bad.c.listMessages('acb_1'))).toBe('not_found');
    expect(await failureOf(bad.c.approveDraft('acd_1'))).toBe('not_found');
    expect(await failureOf(bad.c.revokeBinding('x'))).toBe('not_found');
    expect(bad.t.calls).toHaveLength(0);
    const signedOut = client([], null);
    expect(await failureOf(signedOut.c.listBindings(AGENT))).toBe('no_session');
    expect(signedOut.t.calls).toHaveLength(0);
  });

  it('messages of one chat only', async () => {
    const elsewhere = message({ messageRef: `acm_${'6f'.repeat(16)}`, bindingRef: `acb_${'7a'.repeat(16)}` });
    const { t, c } = client([ok({ items: [message(), elsewhere] })]);
    const list = await c.listMessages(BIND);
    expect(list.items).toHaveLength(1);
    expect(list.unreadable).toBe(1);
    expect(t.calls[0].path).toBe(`${BASE}/agent-channels/bindings/${BIND}/messages`);
  });
});

describe('client: drafts and disconnect', () => {
  it('sends a draft as written, or the edited text trimmed', async () => {
    const { t, c } = client([ok({}), ok({})]);
    await c.approveDraft(DRAFT);
    await c.approveDraft(DRAFT, '  edited reply  ');
    expect(t.calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ['POST', `${BASE}/agent-channels/drafts/${DRAFT}/approve`, {}],
      ['POST', `${BASE}/agent-channels/drafts/${DRAFT}/approve`, { text: 'edited reply' }],
    ]);
  });

  it('an empty or too long edit is refused before sending (never "approve the original")', async () => {
    const { t, c } = client([]);
    expect(await failureOf(c.approveDraft(DRAFT, '   '))).toBe('bad_text');
    expect(await failureOf(c.approveDraft(DRAFT, 'x'.repeat(4097)))).toBe('bad_text');
    expect(t.calls).toHaveLength(0);
  });

  it('rejects a draft and disconnects a chat on their own routes', async () => {
    const { t, c } = client([ok({}), ok({})]);
    await c.rejectDraft(DRAFT);
    await c.revokeBinding(BIND);
    expect(t.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${BASE}/agent-channels/drafts/${DRAFT}/reject`,
      `POST ${BASE}/agent-channels/bindings/${BIND}/revoke`,
    ]);
  });

  it.each([
    [403, { code: 'STEP_UP_REQUIRED', reasonCode: 'recent_sign_in_required' }, 'step_up_required'],
    [403, { code: 'FORBIDDEN' }, 'not_allowed'],
    [401, {}, 'not_allowed'],
    [404, {}, 'not_found'],
    [409, {}, 'already_handled'],
    [410, {}, 'gone'],
    [429, {}, 'rate_limited'],
    [400, {}, 'bad_text'],
    [500, {}, 'unavailable'],
  ])('HTTP %i %j → %s', async (status, body, failure) => {
    expect(await failureOf(client([{ status, headers: {}, body }]).c.approveDraft(DRAFT))).toBe(failure);
  });

  it('a network failure is unavailable, not sent', async () => {
    expect(await failureOf(client([new Error('offline')]).c.rejectDraft(DRAFT))).toBe('unavailable');
  });
});

describe('what the screens show', () => {
  it('a stepped-down tier says both the choice and what it does now', () => {
    expect(channelTierLine(binding() as any, 'zh')).toBe('你选了"会自动回复"，但 Agent 的代表档还没开放，现在起草回复，由本人确认后发出。');
    expect(channelTierLine(binding({ tier: 'observe', effectiveTier: 'observe', effectiveReason: null }) as any, 'en')).toBe('reads only, does not reply');
  });

  it('names from other people are plain text with a fallback', () => {
    expect(channelChatLabel({ chatLabel: 'Fam\u202Eily', chatKind: 'group' }, 'en')).toBe('Family');
    expect(channelChatLabel({ chatLabel: '\u200B', chatKind: 'private' }, 'zh')).toBe('私聊');
    expect(channelSenderLabel({ direction: 'inbound', senderLabel: '\u2066Bob\u2069', sentBy: null }, 'en')).toBe('Bob');
    expect(channelSenderLabel({ direction: 'inbound', senderLabel: '', sentBy: null }, 'zh')).toBe('访客');
    expect(channelSenderLabel({ direction: 'outbound', senderLabel: 'ignored', sentBy: 'agent' }, 'zh')).toBe('Agent');
    expect(channelSenderLabel({ direction: 'outbound', senderLabel: 'ignored', sentBy: 'owner' }, 'zh')).toBe('你');
  });

  it('message text keeps line breaks, drops control and direction characters', () => {
    expect(channelMessageText({ text: 'line 1\r\nline\u202E 2\n\n\n\nend\u0007' }, 'en')).toBe('line 1\nline 2\n\nend');
    expect(channelMessageText({ text: null }, 'zh')).toBe('（这条消息过了保存期，或者被删了）');
    expect(channelMessageText({ text: '\u200B' }, 'en')).toBe('(empty message)');
  });

  it('drafts waiting for the owner, newest first', () => {
    const list = [message(), draft('a', '2026-10-01T07:20:00Z'), draft('b', '2026-10-01T07:30:00Z')] as any[];
    expect(pendingDrafts(list).map((m) => m.draftRef)).toEqual([`acd_${'b'.repeat(32)}`, `acd_${'a'.repeat(32)}`]);
  });

  it('plainDisplayLine cuts and collapses', () => {
    expect(plainDisplayLine('  a \n b  ', 80, '-')).toBe('a b');
    expect(plainDisplayLine('x'.repeat(100), 80, '-')).toHaveLength(80);
    expect(plainDisplayLine(undefined, 80, '-')).toBe('-');
    expect(plainDisplayText('a\u2028b', 10)).toBe('ab');
  });
});

describe('wiring (static)', () => {
  const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');

  it('the screens are registered and reachable only behind the flag', () => {
    const nav = read('navigation/four-zone/FourZoneTabNavigator.tsx');
    expect(nav).toMatch(/\{CHANNEL_INBOX_ENABLED \? \(\s*<>\s*<TwinStack\.Screen name="TwinChannels"/);
    const home = read('screens/four-zone/TwinHomeScreen.tsx');
    expect(home).toMatch(/\{CHANNEL_INBOX_ENABLED \? \(\s*<TouchableOpacity[\s\S]{0,120}navigation\.navigate\('TwinChannels'\)/);
  });

  it('the chat screen honours the WhatsApp window and reads the list again after a decision', () => {
    const src = read('screens/four-zone/TwinChannelMessagesScreen.tsx');
    expect(src).toMatch(/const canSend = platform !== 'whatsapp' \|\| agentChannelWhatsAppCanReplyV0\(lastInbound, Date\.now\(\)\)/);
    expect(src).toMatch(/\{canSend \? \(\s*<TouchableOpacity\s*style=\{styles\.sendButton\}/);
    expect(src).toMatch(/onSettled: \(\) => void queryClient\.invalidateQueries\(\{ queryKey: key \}\)/);
    // Text from other people never becomes tappable.
    expect(src).not.toMatch(/dataDetectorType|Linking/);
  });

  it('disconnect is two taps and the list is read back', () => {
    const src = read('screens/four-zone/TwinChannelsScreen.tsx');
    expect(src).toMatch(/onPress=\{\(\) => confirmRevoke\(binding\.bindingRef, label\)\}/);
    expect(src).toMatch(/onPress: \(\) => revoke\.mutate\(bindingRef\)/);
    expect(src).toMatch(/onSettled: \(\) => void queryClient\.invalidateQueries\(\{ queryKey: key \}\)/);
  });

  it('the flag is read as a literal so the Expo build inlines it', () => {
    expect(read('services/channelInbox.ts')).toMatch(/channelInboxEnabled\(process\.env\.EXPO_PUBLIC_CHANNEL_INBOX\)/);
  });
});
