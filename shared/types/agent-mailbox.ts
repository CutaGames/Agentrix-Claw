/**
 * Agent mailbox v0 (baseline item 9, owner 10-07: "Agent 邮箱端到端本周补完，开关默认关，先 staging，生产等条款 7.9").
 *
 * Each Agent can have one AgentMail inbox whose address is derived from the Agent (no table): the owner opens it once,
 * people write to it, and in chat the Agent reads what came in and drafts replies. Nothing leaves without the owner:
 * a draft is sent only from the owner's own button, or in chat when the owner's latest message is a plain yes and the
 * recipient matches the draft. Drafts live in the server's memory for `draftTtlMinutes` and are used once.
 *
 * - Mail that came in is outside content: `agent_mail_inbox` / `agent_mail_read` results reach the model marked
 *   untrusted (`untrusted-content.ts`), and the L6-7 commitment check applies to `agent_mail_send`.
 * - Server switch `AGENT_MAILBOX_V0_ENABLED` exactly `1` (plus an AgentMail key): off, every route answers 404 and the
 *   chat tools are not offered.
 */

export const AGENT_MAILBOX_V0_FLAG = 'AGENT_MAILBOX_V0_ENABLED';

export const AGENT_MAILBOX_ROUTES_V0 = {
  status: 'GET /api/agent-mailbox?agentAccountId=:agentAccountId',
  open: 'POST /api/agent-mailbox',
  messages: 'GET /api/agent-mailbox/messages?agentAccountId=:agentAccountId',
  drafts: 'GET /api/agent-mailbox/drafts?agentAccountId=:agentAccountId',
  sendDraft: 'POST /api/agent-mailbox/drafts/:draftRef/send',
  discardDraft: 'DELETE /api/agent-mailbox/drafts/:draftRef',
} as const;

export const AGENT_MAILBOX_LIMITS_V0 = {
  subjectMaxChars: 200,
  textMaxChars: 8_000,
  listMax: 20,
  draftTtlMinutes: 30,
  draftsPerOwnerMax: 20,
} as const;

export const AGENT_MAIL_TOOL_NAMES_V0 = {
  inbox: 'agent_mail_inbox',
  read: 'agent_mail_read',
  draft: 'agent_mail_draft',
  send: 'agent_mail_send',
} as const;

export const AGENT_MAILBOX_ERROR_CODES_V0 = {
  notFound: 'AGENT_MAILBOX_NOT_FOUND',
  notOpened: 'AGENT_MAILBOX_NOT_OPENED',
  notConfigured: 'AGENT_MAILBOX_NOT_CONFIGURED',
  invalid: 'AGENT_MAILBOX_INVALID',
  providerFailed: 'AGENT_MAILBOX_PROVIDER_FAILED',
  signInRequired: 'AGENT_MAILBOX_SIGN_IN_REQUIRED',
} as const;

export interface AgentMailboxViewV0 {
  agentAccountId: string;
  /** null until the owner opens the mailbox. */
  address: string | null;
}

export interface AgentMailSummaryViewV0 {
  messageRef: string;
  from: string;
  subject: string;
  preview: string;
  receivedAt: string | null;
}

export interface AgentMailDraftViewV0 {
  draftRef: string;
  agentAccountId: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  createdAt: string;
  expiresAt: string;
}

export interface AgentMailSentViewV0 {
  sent: true;
  messageRef: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isIso = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;

export function decodeAgentMailboxViewV0(value: unknown): AgentMailboxViewV0 | null {
  if (!isRecord(value) || !isText(value.agentAccountId, 64) || !value.agentAccountId) return null;
  if (value.address !== null && !(isText(value.address, 254) && value.address.includes('@'))) return null;
  return { agentAccountId: value.agentAccountId, address: value.address as string | null };
}

export function decodeAgentMailSummaryViewV0(value: unknown): AgentMailSummaryViewV0 | null {
  if (!isRecord(value) || !isText(value.messageRef, 300) || !value.messageRef) return null;
  if (!isText(value.from, 2_000) || !isText(value.subject, AGENT_MAILBOX_LIMITS_V0.subjectMaxChars) || !isText(value.preview, 300)) return null;
  if (value.receivedAt !== null && !isIso(value.receivedAt)) return null;
  return { messageRef: value.messageRef, from: value.from, subject: value.subject, preview: value.preview, receivedAt: value.receivedAt as string | null };
}

export function decodeAgentMailDraftViewV0(value: unknown): AgentMailDraftViewV0 | null {
  if (!isRecord(value)) return null;
  const { draftRef, agentAccountId, from, to, subject, text, createdAt, expiresAt } = value;
  if (!isText(draftRef, 64) || !draftRef || !isText(agentAccountId, 64) || !agentAccountId) return null;
  if (!isText(from, 254) || !isText(to, 254) || !to.includes('@')) return null;
  if (!isText(subject, AGENT_MAILBOX_LIMITS_V0.subjectMaxChars) || !isText(text, AGENT_MAILBOX_LIMITS_V0.textMaxChars)) return null;
  if (!isIso(createdAt) || !isIso(expiresAt)) return null;
  return { draftRef, agentAccountId, from, to, subject, text, createdAt, expiresAt };
}

/** A list decodes only when every item does: one unreadable item makes the whole list unreadable. */
export function decodeAgentMailListV0<T>(value: unknown, decode: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const out: T[] = [];
  for (const item of value) {
    const decoded = decode(item);
    if (!decoded) return null;
    out.push(decoded);
  }
  return out;
}
