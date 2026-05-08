/**
 * Chinese assistants intent bridge (PRD mobile-prd-v3 §6 / P2-5).
 *
 * Three target ecosystems wire `agentrix://intent/<name>?...` deep links into
 * the same `intentBridge.handleDeepLink()` that powers iOS App Intents and
 * Android App Actions, so Watch / Siri / Assistant / 小艺 / 小爱 / 鸿蒙 all
 * land on one dispatcher.
 *
 * This file ships:
 *   1. Stable `INTENT_MANIFEST` describing the 6 cross-vendor intents.
 *   2. Helpers that build the per-vendor deep-link URL or Manifest JSON snippet
 *      developers can paste into HUAWEI/Xiaomi/小艺 dev portals.
 *
 * No native code yet — vendors require their own SDK reviews. The manifest is
 * the source of truth so when we add native modules we don't drift.
 */

export type AgentrixIntentName =
  | 'ask_aira'
  | 'pet_mood'
  | 'approve_request'
  | 'wallet_status'
  | 'invoke_agent'
  | 'draft_message';

export interface IntentSpec {
  name: AgentrixIntentName;
  /** Human title for assistant cards. */
  zhTitle: string;
  enTitle: string;
  /** Sample utterances. First entry is the canonical phrase. */
  utterances: { zh: string[]; en: string[] };
  /** Parameter name → free-text description. */
  params: Record<string, string>;
}

export const INTENT_MANIFEST: IntentSpec[] = [
  {
    name: 'ask_aira',
    zhTitle: '问 Aira',
    enTitle: 'Ask Aira',
    utterances: { zh: ['问 Aira ${query}', 'Aira ${query}'], en: ['Ask Aira ${query}'] },
    params: { query: '用户想问的问题原文' },
  },
  {
    name: 'pet_mood',
    zhTitle: '主宠心情',
    enTitle: 'Pet Mood',
    utterances: { zh: ['看看主宠心情', '主宠现在怎么样'], en: ['How is my pet?'] },
    params: {},
  },
  {
    name: 'approve_request',
    zhTitle: '批准请求',
    enTitle: 'Approve Request',
    utterances: { zh: ['批准 ${target}', '同意 ${target}'], en: ['Approve ${target}'] },
    params: { target: '审批 id 或描述' },
  },
  {
    name: 'wallet_status',
    zhTitle: '钱包余额',
    enTitle: 'Wallet Status',
    utterances: { zh: ['钱包余额', '看看资产'], en: ["What's my wallet balance?"] },
    params: {},
  },
  {
    name: 'invoke_agent',
    zhTitle: '调用 Agent',
    enTitle: 'Invoke Agent',
    utterances: { zh: ['让 ${agent} 处理 ${task}'], en: ['Have ${agent} handle ${task}'] },
    params: { agent: 'Agent 名字或 id', task: '任务描述' },
  },
  {
    name: 'draft_message',
    zhTitle: '起草消息',
    enTitle: 'Draft Message',
    utterances: { zh: ['给 ${recipient} 写一条 ${topic}'], en: ['Draft a message to ${recipient} about ${topic}'] },
    params: { recipient: '收件人', topic: '主题' },
  },
];

/** Build the in-app deep-link the vendor will fire. */
export function buildAgentrixDeepLink(name: AgentrixIntentName, params?: Record<string, string>): string {
  const qs = params
    ? '?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    : '';
  return `agentrix://intent/${name}${qs}`;
}

// ─── 小米 / 小爱 (Xiao AI) skill manifest entries ────────────────────────────
// Submit at: https://xiaoai.mi.com/dev → 技能创建 → 自定义意图。
export interface XiaomiSkillEntry {
  intent: string;
  title: string;
  utterances: string[];
  deepLink: string;
}
export function buildXiaomiSkillManifest(): XiaomiSkillEntry[] {
  return INTENT_MANIFEST.map((spec) => ({
    intent: `agentrix.${spec.name}`,
    title: spec.zhTitle,
    utterances: spec.utterances.zh,
    deepLink: buildAgentrixDeepLink(spec.name),
  }));
}

// ─── HUAWEI HarmonyOS Intent (鸿蒙意图框架) ─────────────────────────────────
// Submit at: https://developer.huawei.com/consumer → AppGallery Connect →
// 意图框架 → 意图列表。
export interface HarmonyIntentEntry {
  intentName: string;
  displayName: string;
  parameters: Array<{ name: string; description: string }>;
  uriPattern: string;
}
export function buildHarmonyIntentManifest(): HarmonyIntentEntry[] {
  return INTENT_MANIFEST.map((spec) => ({
    intentName: `agentrix.${spec.name}`,
    displayName: spec.zhTitle,
    parameters: Object.entries(spec.params).map(([name, description]) => ({ name, description })),
    uriPattern: buildAgentrixDeepLink(spec.name, Object.fromEntries(Object.keys(spec.params).map((k) => [k, `\${${k}}`]))),
  }));
}

// ─── 华为 / 荣耀 / OPPO 小布 / vivo Jovi 通用 ─────────────────────────────
// 这三家审核口径接近：都是 "意图 + 触发短语 + 落地页 deep link"，可复用
// `INTENT_MANIFEST`。开发者控制台分别为：
//   OPPO    https://open.oppomobile.com/new/developmentDoc/info?id=11251
//   vivo    https://dev.vivo.com.cn/documentCenter/doc/677
//   HUAWEI  https://developer.huawei.com/consumer/cn/doc/quickapp-References/agc-intents
export function buildGenericVendorManifest(): Array<{ intent: string; phrases: string[]; uri: string }> {
  return INTENT_MANIFEST.map((spec) => ({
    intent: `agentrix.${spec.name}`,
    phrases: [...spec.utterances.zh, ...spec.utterances.en],
    uri: buildAgentrixDeepLink(spec.name),
  }));
}
