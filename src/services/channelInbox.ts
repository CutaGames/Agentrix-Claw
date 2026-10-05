/**
 * A2 on the phone: the channel inbox (contract `shared/types/agent-channel.ts` v0, E98; L5 backlog mobile 4).
 * Off unless the build sets `EXPO_PUBLIC_CHANNEL_INBOX=1`; the server routes are not live yet.
 *
 * - Chats: `GET /agent-channels/bindings?agentAccountId=<uuid>`; each one decoded with
 *   `decodeAgentChannelBindingViewV0`. One that does not decode is counted, never shown half-read.
 * - Messages of one chat: `GET /agent-channels/bindings/:bindingRef/messages` (first page; the page envelope is
 *   not in the contract yet, REQ-backend-096.re-mobile 13), each decoded with `decodeAgentChannelMessageViewV0`.
 * - A draft (`draft_pending`): send as written or edited (`decodeAgentChannelDraftApproveV0` checks the text before
 *   it is sent), or reject. Only the user's own token. The list is read again afterwards, never optimistic.
 * - Disconnect a chat: `POST …/bindings/:bindingRef/revoke` (a tightening, no step-up). Changing the tier waits for
 *   v0.1: the PATCH body is not in the contract.
 * - Everything other people wrote (chat names, sender names, messages) is plain text (plainDisplayText.ts).
 * No React Native import: the transport and token are injected.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import {
  decodeAgentChannelBindingViewV0,
  decodeAgentChannelDraftApproveV0,
  decodeAgentChannelMessageViewV0,
  type AgentChannelBindingStatusV0,
  type AgentChannelBindingViewV0,
  type AgentChannelMessageStateV0,
  type AgentChannelMessageViewV0,
  type AgentChannelPlatformV0,
  type AgentChannelTierV0,
} from '../../shared/types/agent-channel';
import { needsStepUp } from './stepUp';
import { plainDisplayLine, plainDisplayText } from './plainDisplayText';

type Copy = { zh: string; en: string };
type Lang = 'zh' | 'en';

export function channelInboxEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const CHANNEL_INBOX_ENABLED = channelInboxEnabled(process.env.EXPO_PUBLIC_CHANNEL_INBOX);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BINDING_REF = /^acb_[0-9a-f]{32}$/;
const DRAFT_REF = /^acd_[0-9a-f]{32}$/;

export function isChannelBindingRef(value: unknown): value is string {
  return typeof value === 'string' && BINDING_REF.test(value);
}

export type ChannelInboxFailureV0 =
  | 'step_up_required'
  | 'not_allowed'
  | 'not_found'
  | 'already_handled'
  | 'gone'
  | 'rate_limited'
  | 'bad_text'
  | 'unreadable'
  | 'unavailable'
  | 'no_session';

export class ChannelInboxError extends Error {
  readonly failure: ChannelInboxFailureV0;
  constructor(failure: ChannelInboxFailureV0) {
    super(failure);
    this.name = 'ChannelInboxError';
    this.failure = failure;
  }
}

function failureOf(status: number, body: unknown): ChannelInboxFailureV0 {
  if (needsStepUp(status, body)) return 'step_up_required';
  if (status === 401 || status === 403) return 'not_allowed';
  if (status === 404) return 'not_found';
  if (status === 409) return 'already_handled';
  if (status === 410) return 'gone';
  if (status === 429) return 'rate_limited';
  if (status === 400 || status === 422) return 'bad_text';
  return 'unavailable';
}

function itemsOf(body: unknown): unknown[] | null {
  const unwrap = (value: unknown): unknown =>
    value && typeof value === 'object' && !Array.isArray(value) && 'data' in (value as Record<string, unknown>) ? (value as Record<string, unknown>).data : value;
  const value = unwrap(body);
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).items)) return (value as Record<string, unknown>).items as unknown[];
  return null;
}

export interface DecodedListV0<T> {
  items: T[];
  /** Entries the phone could not read; shown as a count, never half-read. */
  unreadable: number;
}

export interface MobileChannelInboxClientV0 {
  listBindings(agentAccountId: string): Promise<DecodedListV0<AgentChannelBindingViewV0>>;
  listMessages(bindingRef: string): Promise<DecodedListV0<AgentChannelMessageViewV0>>;
  approveDraft(draftRef: string, editedText?: string): Promise<void>;
  rejectDraft(draftRef: string): Promise<void>;
  revokeBinding(bindingRef: string): Promise<void>;
}

export function createMobileChannelInboxClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}): MobileChannelInboxClientV0 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const call = async (method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> => {
    const token = deps.token();
    if (!token) throw new ChannelInboxError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(method === 'POST' ? { body: body ?? {} } : {}),
      });
    } catch {
      throw new ChannelInboxError('unavailable');
    }
    if (response.status < 200 || response.status >= 300) throw new ChannelInboxError(failureOf(response.status, response.body));
    return response.body;
  };
  const decodeList = <T>(body: unknown, decode: (value: unknown) => T | null): DecodedListV0<T> => {
    const raw = itemsOf(body);
    if (!raw) throw new ChannelInboxError('unreadable');
    const items: T[] = [];
    let unreadable = 0;
    for (const entry of raw.slice(0, 200)) {
      const decoded = decode(entry);
      if (decoded) items.push(decoded);
      else unreadable += 1;
    }
    return { items, unreadable: unreadable + Math.max(0, raw.length - 200) };
  };
  return {
    async listBindings(agentAccountId) {
      // Checked before sending: the id goes into the query string.
      if (!UUID.test(agentAccountId)) throw new ChannelInboxError('not_found');
      const list = decodeList(await call('GET', `/agent-channels/bindings?agentAccountId=${agentAccountId}`), decodeAgentChannelBindingViewV0);
      // Another account's chat is not shown, even if the server sent it.
      const mine = list.items.filter((binding) => binding.agentAccountId.toLowerCase() === agentAccountId.toLowerCase());
      return { items: mine, unreadable: list.unreadable + (list.items.length - mine.length) };
    },
    async listMessages(bindingRef) {
      if (!isChannelBindingRef(bindingRef)) throw new ChannelInboxError('not_found');
      const list = decodeList(await call('GET', `/agent-channels/bindings/${bindingRef}/messages`), decodeAgentChannelMessageViewV0);
      const mine = list.items.filter((message) => message.bindingRef === bindingRef);
      return { items: mine, unreadable: list.unreadable + (list.items.length - mine.length) };
    },
    async approveDraft(draftRef, editedText) {
      if (!DRAFT_REF.test(draftRef)) throw new ChannelInboxError('not_found');
      const body = decodeAgentChannelDraftApproveV0(editedText === undefined ? {} : { text: editedText });
      // An edit that is empty or too long is refused here; it is never sent as "approve the original".
      if (!body || (editedText !== undefined && body.text === undefined)) throw new ChannelInboxError('bad_text');
      await call('POST', `/agent-channels/drafts/${draftRef}/approve`, body);
    },
    async rejectDraft(draftRef) {
      if (!DRAFT_REF.test(draftRef)) throw new ChannelInboxError('not_found');
      await call('POST', `/agent-channels/drafts/${draftRef}/reject`);
    },
    async revokeBinding(bindingRef) {
      if (!isChannelBindingRef(bindingRef)) throw new ChannelInboxError('not_found');
      await call('POST', `/agent-channels/bindings/${bindingRef}/revoke`);
    },
  };
}

// ── What the screens show ───────────────────────────────────────────────────────────────

export const CHANNEL_PLATFORM_COPY: Readonly<Record<AgentChannelPlatformV0, Copy>> = {
  telegram: { zh: 'Telegram', en: 'Telegram' },
  whatsapp: { zh: 'WhatsApp', en: 'WhatsApp' },
};

/** Same words as the contract's group notice (`agentChannelGroupNoticeV0`). */
export const CHANNEL_TIER_COPY: Readonly<Record<AgentChannelTierV0, Copy>> = {
  observe: { zh: '只看，不回复', en: 'reads only, does not reply' },
  assist: { zh: '起草回复，由本人确认后发出', en: 'drafts replies that the owner sends' },
  represent: { zh: '会自动回复', en: 'replies on its own' },
};

export const CHANNEL_BINDING_STATUS_COPY: Readonly<Record<AgentChannelBindingStatusV0, Copy>> = {
  active: { zh: '已接上', en: 'Connected' },
  revoked: { zh: '已解除', en: 'Disconnected' },
  bot_removed: { zh: '机器人已被移出', en: 'The bot was removed' },
};

export const CHANNEL_MESSAGE_STATE_COPY: Readonly<Record<AgentChannelMessageStateV0, Copy>> = {
  received: { zh: '收到', en: 'Received' },
  draft_pending: { zh: '草稿，等你确认', en: 'Draft, waiting for you' },
  sent: { zh: '已发出', en: 'Sent' },
  draft_rejected: { zh: '草稿已拒绝', en: 'Draft rejected' },
  send_failed: { zh: '没发出去', en: 'Not sent' },
  rate_limited: { zh: '太频繁，只记下没发', en: 'Too many; recorded, not sent' },
};

export const CHANNEL_SENT_BY_COPY: Readonly<Record<'owner' | 'agent' | 'twin', Copy>> = {
  owner: { zh: '你', en: 'You' },
  agent: { zh: 'Agent', en: 'Agent' },
  twin: { zh: '分身', en: 'Twin' },
};

/** What a chat does now. When the tier was stepped down, both the chosen and the actual one are said. */
export function channelTierLine(binding: Pick<AgentChannelBindingViewV0, 'tier' | 'effectiveTier' | 'effectiveReason'>, lang: Lang): string {
  const actual = CHANNEL_TIER_COPY[binding.effectiveTier][lang];
  if (binding.effectiveTier === binding.tier) return actual;
  return lang === 'zh'
    ? `你选了"${CHANNEL_TIER_COPY[binding.tier].zh}"，但 Agent 的代表档还没开放，现在${actual}。`
    : `You chose "${CHANNEL_TIER_COPY[binding.tier].en}", but the agent's represent tier is not open yet, so it ${actual}.`;
}

export function channelChatLabel(binding: Pick<AgentChannelBindingViewV0, 'chatLabel' | 'chatKind'>, lang: Lang): string {
  const fallback = binding.chatKind === 'private' ? (lang === 'zh' ? '私聊' : 'Private chat') : lang === 'zh' ? '群聊' : 'Group';
  return plainDisplayLine(binding.chatLabel, 80, fallback);
}

export function channelSenderLabel(message: Pick<AgentChannelMessageViewV0, 'direction' | 'senderLabel' | 'sentBy'>, lang: Lang): string {
  if (message.direction === 'outbound' && message.sentBy) return CHANNEL_SENT_BY_COPY[message.sentBy][lang];
  return plainDisplayLine(message.senderLabel, 80, lang === 'zh' ? '访客' : 'Visitor');
}

export function channelMessageText(message: Pick<AgentChannelMessageViewV0, 'text'>, lang: Lang): string {
  if (message.text === null) return lang === 'zh' ? '（这条消息过了保存期，或者被删了）' : '(This message is past its retention or was deleted.)';
  return plainDisplayText(message.text, 4096) || (lang === 'zh' ? '（空消息）' : '(empty message)');
}

/** Drafts waiting for the owner, newest first. */
export function pendingDrafts(messages: readonly AgentChannelMessageViewV0[]): AgentChannelMessageViewV0[] {
  return messages
    .filter((message) => message.state === 'draft_pending' && message.draftRef !== null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export const CHANNEL_INBOX_FAILURE_COPY: Readonly<Record<ChannelInboxFailureV0, Copy>> = {
  step_up_required: { zh: '要先确认是你本人。', en: 'Confirm it is you first.' },
  not_allowed: { zh: '只能用你本人的登录处理。', en: 'Only your own sign-in can do this.' },
  not_found: { zh: '没有这条，或者它不属于你的 Agent。', en: 'Not found, or not for your agent.' },
  already_handled: { zh: '这条已经处理过了。', en: 'This was already handled.' },
  gone: { zh: '这个聊天已经解除或机器人被移出，不能再发。', en: 'This chat was disconnected or the bot removed; nothing can be sent.' },
  rate_limited: { zh: '太频繁了，请稍后再试。', en: 'Too many tries. Try again shortly.' },
  bad_text: { zh: '改过的回复要 1 到 4096 个字。', en: 'An edited reply needs 1 to 4096 characters.' },
  unreadable: { zh: '读不到，下拉重试。', en: 'Could not read it. Pull to retry.' },
  unavailable: { zh: '没有生效，请重试。', en: 'Not recorded. Try again.' },
  no_session: { zh: '请先登录。', en: 'Sign in first.' },
};
