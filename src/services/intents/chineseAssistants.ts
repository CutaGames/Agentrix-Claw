/**
 * Chinese assistants intent bridge (PRD mobile-prd-v3 §6 / mobile-prd-v4 §8).
 *
 * Three target ecosystems wire `agentrix://intent/<name>?...` deep links into
 * the same `intentBridge.handleDeepLink()` that powers iOS App Intents and
 * Android App Actions, so Watch / Siri / Assistant / 小艺 / 小爱 / 鸿蒙 all
 * land on one dispatcher.
 *
 * This file ships:
 *   1. Stable `INTENT_MANIFEST` describing the 9 cross-vendor intents
 *      (V3 core 6 + V4 additions 3, plus the gesture alias `draft_message`).
 *   2. Helpers that build the per-vendor deep-link URL or Manifest JSON snippet
 *      developers can paste into HUAWEI/Xiaomi/小艺 dev portals.
 *
 * No native code yet — vendors require their own SDK reviews. The manifest is
 * the source of truth so when we add native modules we don't drift.
 */

export type AgentrixIntentName =
  // V3 core
  | 'ask_aira'
  | 'pet_mood'
  | 'approve_request'
  | 'wallet_status'
  | 'invoke_agent'
  | 'draft_message'
  // V4 additions
  | 'create_pet'
  | 'switch_skin'
  | 'market_search'
  // P-9 wave 9 additions (mobile-pet-companion-redesign §9.4 / 9.5)
  | 'start_world_scan'
  | 'enter_dungeon'
  | 'install_skill'
  | 'remote_control'
  | 'quiet_30';

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
  // ── V4 additions (mobile-prd-v4 §8) ────────────────────────────────────
  {
    name: 'create_pet',
    zhTitle: '生成萌宠',
    enTitle: 'Create Pet',
    utterances: {
      zh: ['让 Aira 生成一只 ${prompt}', '帮我做一只 ${prompt} 萌宠', '创建萌宠'],
      en: ['Create a pet that is ${prompt}', 'Generate a new pet'],
    },
    params: { prompt: '宠物外观描述,如"蓝色独角兽"' },
  },
  {
    name: 'switch_skin',
    zhTitle: '切换皮肤',
    enTitle: 'Switch Skin',
    utterances: {
      zh: ['换上 ${skinName} 皮肤', '给 Aira 换装 ${skinName}', '切换皮肤'],
      en: ['Switch to ${skinName} skin', 'Equip ${skinName}'],
    },
    params: { skinName: '皮肤名字片段', skinId: '皮肤 id (优先匹配)' },
  },
  {
    name: 'market_search',
    zhTitle: '市场搜索',
    enTitle: 'Marketplace Search',
    utterances: {
      zh: ['在市场找 ${query}', '搜 ${query} 皮肤', '${query} 任务'],
      en: ['Search marketplace for ${query}', 'Find ${query} skin'],
    },
    params: { query: '搜索关键字', category: 'skin / skill / task,默认 skin' },
  },
  // ── P-9 wave 9 additions (mobile-pet-companion-redesign §9.4 / 9.5) ───
  {
    name: 'start_world_scan',
    zhTitle: '开始扫描',
    enTitle: 'Start World Scan',
    utterances: {
      zh: ['打开扫描', '扫描物体', '快速扫描', '${mode} 扫描'],
      en: ['Open World scan', 'Scan an object', 'Quick scan', '${mode} scan'],
    },
    params: { mode: 'quick / detail / room,默认 quick' },
  },
  {
    name: 'enter_dungeon',
    zhTitle: '进入副本',
    enTitle: 'Enter Dungeon',
    utterances: {
      zh: ['用分享码 ${shareCode} 进副本', '进副本 ${shareCode}'],
      en: ['Enter dungeon ${shareCode}', 'Join dungeon with code ${shareCode}'],
    },
    params: { shareCode: '副本分享码 / 房间号' },
  },
  {
    name: 'install_skill',
    zhTitle: '安装技能',
    enTitle: 'Install Skill',
    utterances: {
      zh: ['给 Aira 装 ${name} 技能', '安装 ${name}'],
      en: ['Install ${name} skill', 'Add ${name} to Aira'],
    },
    params: { name: '技能名字片段' },
  },
  {
    name: 'remote_control',
    zhTitle: '远程控制',
    enTitle: 'Remote Control',
    utterances: {
      zh: ['让桌面 ${command}', '在音箱播报 ${command}', '执行 ${command}'],
      en: ['Run ${command} on desktop', 'Have speaker ${command}'],
    },
    params: { command: '命令名(白名单中的 desktop.* / speaker.* / watch.*)' },
  },
  {
    name: 'quiet_30',
    zhTitle: '静音半小时',
    enTitle: 'Quiet 30',
    utterances: {
      zh: ['让 Aira 安静 30 分钟', '别打扰我半小时', '静音半小时'],
      en: ['Quiet for 30 minutes', "Don't disturb me for half an hour"],
    },
    params: {},
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
