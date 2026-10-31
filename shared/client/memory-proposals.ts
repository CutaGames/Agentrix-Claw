/**
 * L8 1b A2: the memory-proposal inbox client, shared by web, phone and desktop (`shared/types/memory-proposal.ts`).
 * Each surface injects its own `HttpTransportV1` and token, the same way the other shared clients do, so the routes,
 * the decoding and the failure mapping live in one place. No React, no platform import.
 *
 * `closed` is the server answering 404: `MEMORY_PROPOSALS_V1_ENABLED` is off there, so the surface shows nothing.
 * The owner is never sent: the server reads it from the login.
 */
import {
  MEMORY_PROPOSAL_DECISION_RESULTS_V1,
  MEMORY_PROPOSAL_SCHEMA_VERSION_V1,
  decodeMemoryAutoAcceptRuleV1,
  decodeMemoryProposalV1,
  type MemoryAutoAcceptRuleV1,
  type MemoryProposalCategoryV1,
  type MemoryProposalDecisionResultKindV1,
  type MemoryProposalDecisionResultV1,
  type MemoryProposalDecisionV1,
  type MemoryProposalV1,
} from '../types/memory-proposal';
import type { HttpTransportV1 } from './transport';

export const MEMORY_PROPOSAL_PATHS_V1 = {
  list: '/memory-proposals',
  decisions: '/memory-proposals/decisions',
  rules: '/memory-proposals/auto-accept-rules',
} as const;

export type MemoryProposalsFailureV1 = 'closed' | 'invalid' | 'no_session' | 'unreadable' | 'unavailable';
export type MemoryProposalsResultV1<T> = { ok: true; value: T } | { ok: false; failure: MemoryProposalsFailureV1 };

export interface MemoryProposalsClientV1 {
  /** Pending proposals, newest first. */
  list(): Promise<MemoryProposalsResultV1<MemoryProposalV1[]>>;
  /** Accept or reject one or several (a batch is one call). Answering twice is harmless. */
  decide(proposalIds: string[], decision: MemoryProposalDecisionV1): Promise<MemoryProposalsResultV1<MemoryProposalDecisionResultV1[]>>;
  rules(): Promise<MemoryProposalsResultV1<MemoryAutoAcceptRuleV1[]>>;
  setRule(category: MemoryProposalCategoryV1, enabled: boolean): Promise<MemoryProposalsResultV1<MemoryAutoAcceptRuleV1>>;
}

function decodeList<T>(body: unknown, decode: (item: unknown) => { ok: true; value: T } | { ok: false }): T[] | null {
  if (!Array.isArray(body)) return null;
  const out: T[] = [];
  for (const item of body) {
    const decoded = decode(item);
    if (decoded.ok === false) return null;
    out.push(decoded.value);
  }
  return out;
}

function decodeDecisionResults(body: unknown): MemoryProposalDecisionResultV1[] | null {
  const results = (body as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return null;
  const out: MemoryProposalDecisionResultV1[] = [];
  for (const item of results) {
    const entry = item as { proposalId?: unknown; result?: unknown } | null;
    if (typeof entry?.proposalId !== 'string' || typeof entry.result !== 'string') return null;
    if (!(MEMORY_PROPOSAL_DECISION_RESULTS_V1 as readonly string[]).includes(entry.result)) return null;
    out.push({ proposalId: entry.proposalId, result: entry.result as MemoryProposalDecisionResultKindV1 });
  }
  return out;
}

function failureOf(status: number): MemoryProposalsFailureV1 {
  if (status === 404) return 'closed';
  if (status === 400) return 'invalid';
  if (status === 401) return 'no_session';
  return 'unavailable';
}

export function createMemoryProposalsClientV1(deps: {
  transport: HttpTransportV1;
  /** Includes the `/api` prefix when the server has one. */
  baseUrl: string;
  token: () => string | null | undefined;
  /** Extra headers, e.g. the mobile surface marker. */
  headers?: Record<string, string>;
}): MemoryProposalsClientV1 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  async function call<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    decode: (body: unknown) => T | null,
    body?: unknown,
  ): Promise<MemoryProposalsResultV1<T>> {
    const token = deps.token();
    if (!token) return { ok: false, failure: 'no_session' };
    let response;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(deps.headers ?? {}) },
        ...(body === undefined ? {} : { body }),
      });
    } catch {
      return { ok: false, failure: 'unavailable' };
    }
    if (response.status !== 200) return { ok: false, failure: failureOf(response.status) };
    const value = decode(response.body);
    return value === null ? { ok: false, failure: 'unreadable' } : { ok: true, value };
  }
  return {
    list: () => call('GET', MEMORY_PROPOSAL_PATHS_V1.list, (body) => decodeList(body, decodeMemoryProposalV1)),
    decide: (proposalIds, decision) =>
      call(
        'POST',
        MEMORY_PROPOSAL_PATHS_V1.decisions,
        decodeDecisionResults,
        { schemaVersion: MEMORY_PROPOSAL_SCHEMA_VERSION_V1, proposalIds, decision },
      ),
    rules: () => call('GET', MEMORY_PROPOSAL_PATHS_V1.rules, (body) => decodeList(body, decodeMemoryAutoAcceptRuleV1)),
    setRule: (category, enabled) =>
      call('PUT', MEMORY_PROPOSAL_PATHS_V1.rules, (body) => {
        const decoded = decodeMemoryAutoAcceptRuleV1(body);
        return decoded.ok ? decoded.value : null;
      }, { schemaVersion: MEMORY_PROPOSAL_SCHEMA_VERSION_V1, category, enabled }),
  };
}

/** What the owner reads for a proposal's origin. */
export const MEMORY_PROPOSAL_SOURCE_COPY_V1: Readonly<Record<MemoryProposalV1['source']['kind'], { zh: string; en: string }>> = {
  chat_auto: { zh: '对话里自动记下的', en: 'Picked up from a conversation' },
  dream: { zh: '梦境整理出的', en: 'Found while dreaming' },
  agent_tool: { zh: 'Agent 想记住的', en: 'The Agent wants to remember' },
  desktop_mcp: { zh: '电脑上的工具提议的', en: 'Proposed by a desktop tool' },
  oauth_client: { zh: '你登录过的应用提议的', en: 'Proposed by an app you signed in to' },
};

export const MEMORY_PROPOSAL_CATEGORY_COPY_V1: Readonly<Record<MemoryProposalCategoryV1, { zh: string; en: string }>> = {
  preference: { zh: '偏好', en: 'Preference' },
  fact: { zh: '事实', en: 'Fact' },
  decision: { zh: '决定', en: 'Decision' },
  insight: { zh: '洞察', en: 'Insight' },
  other: { zh: '其他', en: 'Other' },
};

export const MEMORY_PROPOSALS_SECTION_COPY_V1 = {
  title: { zh: 'Agent 想记住的', en: 'What the Agent wants to remember' },
  scope: {
    zh: '这里是 Agent 对话里用的记忆。你接受之后才会写进去；拒绝的不会再用，也不会进对话。',
    en: "This is the memory the Agent uses in conversations. Nothing is saved until you accept it; rejected items are never used in a chat.",
  },
  empty: { zh: '没有待确认的记忆。', en: 'Nothing waiting for you.' },
  accept: { zh: '接受', en: 'Accept' },
  reject: { zh: '拒绝', en: 'Reject' },
  acceptAll: { zh: '全部接受', en: 'Accept all' },
  autoAccept: { zh: '以后这几类自动接受：', en: 'Accept these kinds automatically from now on:' },
  /**
   * L8-8 (flags checklist L7): a rule is looked up by owner and kind only, never by who proposed the memory, and the
   * Agent's own "remember this" always files as a fact. Web shows it under the automatic-accept row.
   */
  autoAcceptNote: {
    zh: '自动接受只看类别，不看是谁提的。比如勾了「事实」，Agent 自己决定要记住的事也会直接记下，不再先问你。',
    en: 'Automatic accept looks only at the kind, not at who suggested it. With Fact ticked, for example, things the Agent decides on its own to remember are saved without asking you first.',
  },
  unreadable: { zh: '暂时读不到。', en: 'Unavailable right now.' },
  retry: { zh: '重试', en: 'Try again' },
  emptyNext: { zh: '等你确认的新记忆会出现在这里。', en: 'New memories waiting for you will show up here.' },
  failed: { zh: '没处理成功，请稍后再试。', en: 'Could not save. Please try again.' },
  done: { zh: '已处理。', en: 'Done.' },
  accepted: { zh: '已接受，已经写进记忆。', en: 'Accepted. It is now in memory.' },
  rejected: { zh: '已拒绝，不会写进记忆。', en: 'Rejected. It will not be saved.' },
  /** `{kind}` is the kind's label from `MEMORY_PROPOSAL_CATEGORY_COPY_V1`. */
  ruleOn: { zh: '已保存。以后「{kind}」这一类会直接记下。', en: 'Saved. {kind} items will now be saved without asking.' },
  ruleOff: { zh: '已保存。以后「{kind}」这一类先等你确认。', en: 'Saved. {kind} items will now wait for you to accept them.' },
} as const;
