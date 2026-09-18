/**
 * Agent Passport v4 — the card model every surface renders from
 * (spec `.kiro/specs/agent-passport-v4/`, R3–R4, R7; integration note
 * `docs/alignment/agent-passport-v4-cross-platform-integration-2026-09-16.md`).
 *
 * One projection, one set of words, three renderers: Web, Mobile and Desktop
 * all call {@link buildAgentPassportCard} on the same
 * {@link AgentPassportProjectionV1} and print the same six stamps, the same
 * `AGX-` number and the same hero line. Nothing here touches the DOM, React,
 * Node or the network; the share payload codec is plain JS so Hermes, WebView2,
 * browsers and Node agree byte for byte.
 */
import {
  isPassportAudience,
  isPassportCountBucket,
  isPassportShareField,
  passportHash,
  passportHashFromNumber,
  passportNumberFromHash,
  readPassportCredentialsPublic,
  PASSPORT_CREDENTIAL_KINDS,
  type AgentPassportAuthorityV1,
  type AgentPassportCredentialsPublicV1,
  type AgentPassportProjectionV1,
  type AgentPassportPublicV1,
  type AgentPassportViewV1,
  type PassportCountBucket,
  type PassportCredentialAnchor,
  type PassportCredentialKind,
  type PassportCredentialsMaterialV1,
  type PassportPersonaStatus,
} from './agent-passport';

export type PassportFactTone = 'ready' | 'todo' | 'unknown';

export interface LocalizedLine {
  zh: string;
  en: string;
}

export interface AgentPassportFact {
  id: string;
  label: LocalizedLine;
  value: LocalizedLine;
  /** One line on why this fact matters for an Agentrix Agent; shown under the stamp. */
  why: LocalizedLine;
  tone: PassportFactTone;
}

// ---------------------------------------------------------------------------
// Themes — six palettes the owner can pick from; the hash picks one by default.
// ---------------------------------------------------------------------------

export type PassportThemeId = 'aurora' | 'sunset' | 'abyss' | 'bamboo' | 'sakura' | 'midnight';

export interface PassportTheme {
  id: PassportThemeId;
  name: LocalizedLine;
  mode: 'dark' | 'light';
  /** Three background gradient stops, top to bottom. */
  bg: [string, string, string];
  /** Two radial glows painted over the background (top-right, bottom-left). */
  glowA: string;
  glowB: string;
  accent: string;
  accentSoft: string;
  /** Text colour on top of `accent` (buttons, pills). */
  accentInk: string;
  ink: string;
  inkMuted: string;
  /** Panel fill and hairline colour for stamps and dividers. */
  paper: string;
  line: string;
  /** Gradient of a stamped (ready) seal. */
  stamp: [string, string];
  stampInk: string;
  /** Sigil colours: ring accent, the second ring, and the disc behind them. */
  sigilRing: string;
  sigilRing2: string;
  sigilDisc: string;
}

export const PASSPORT_THEMES: readonly PassportTheme[] = [
  {
    id: 'aurora',
    name: { zh: '极光', en: 'Aurora' },
    mode: 'dark',
    bg: ['#061A24', '#07111F', '#030812'],
    glowA: 'rgba(45, 212, 191, 0.55)',
    glowB: 'rgba(129, 140, 248, 0.35)',
    accent: '#5EEAD4',
    accentSoft: 'rgba(94, 234, 212, 0.16)',
    accentInk: '#042A2B',
    ink: '#F5FBFA',
    inkMuted: '#94B3B0',
    paper: 'rgba(255,255,255,0.04)',
    line: 'rgba(255,255,255,0.14)',
    stamp: ['#0FB5A6', '#4F6DE8'],
    stampInk: '#F5FBFA',
    sigilRing: '#5EEAD4',
    sigilRing2: '#A5B4FC',
    sigilDisc: 'rgba(15, 118, 110, 0.55)',
  },
  {
    id: 'sunset',
    name: { zh: '落日', en: 'Sunset' },
    mode: 'dark',
    bg: ['#2A0F1E', '#170A17', '#0B050C'],
    glowA: 'rgba(251, 146, 60, 0.6)',
    glowB: 'rgba(236, 72, 153, 0.35)',
    accent: '#FDBA74',
    accentSoft: 'rgba(253, 186, 116, 0.16)',
    accentInk: '#2A0F1E',
    ink: '#FFF7ED',
    inkMuted: '#C4A79A',
    paper: 'rgba(255,255,255,0.04)',
    line: 'rgba(255,255,255,0.14)',
    stamp: ['#F97316', '#DB2777'],
    stampInk: '#FFF7ED',
    sigilRing: '#FDBA74',
    sigilRing2: '#F9A8D4',
    sigilDisc: 'rgba(154, 52, 18, 0.55)',
  },
  {
    id: 'abyss',
    name: { zh: '深海', en: 'Abyss' },
    mode: 'dark',
    bg: ['#0B1A3A', '#081128', '#040816'],
    glowA: 'rgba(59, 130, 246, 0.6)',
    glowB: 'rgba(34, 211, 238, 0.3)',
    accent: '#7DD3FC',
    accentSoft: 'rgba(125, 211, 252, 0.16)',
    accentInk: '#06203F',
    ink: '#F0F7FF',
    inkMuted: '#93A8C7',
    paper: 'rgba(255,255,255,0.04)',
    line: 'rgba(255,255,255,0.14)',
    stamp: ['#2563EB', '#06B6D4'],
    stampInk: '#F0F7FF',
    sigilRing: '#7DD3FC',
    sigilRing2: '#C7D2FE',
    sigilDisc: 'rgba(30, 64, 175, 0.55)',
  },
  {
    id: 'bamboo',
    name: { zh: '竹青', en: 'Bamboo' },
    mode: 'dark',
    bg: ['#0F2A1E', '#0A1A14', '#050D0A'],
    glowA: 'rgba(74, 222, 128, 0.45)',
    glowB: 'rgba(163, 230, 53, 0.25)',
    accent: '#86EFAC',
    accentSoft: 'rgba(134, 239, 172, 0.16)',
    accentInk: '#06261A',
    ink: '#F2FBF5',
    inkMuted: '#98B8A6',
    paper: 'rgba(255,255,255,0.04)',
    line: 'rgba(255,255,255,0.14)',
    stamp: ['#16A34A', '#65A30D'],
    stampInk: '#F2FBF5',
    sigilRing: '#86EFAC',
    sigilRing2: '#D9F99D',
    sigilDisc: 'rgba(22, 101, 52, 0.55)',
  },
  {
    id: 'sakura',
    name: { zh: '樱', en: 'Sakura' },
    mode: 'light',
    bg: ['#FFF4F6', '#FDE8EE', '#F9DCE5'],
    glowA: 'rgba(251, 113, 133, 0.35)',
    glowB: 'rgba(192, 132, 252, 0.25)',
    accent: '#E11D48',
    accentSoft: 'rgba(225, 29, 72, 0.10)',
    accentInk: '#FFF7F9',
    ink: '#3B0A1C',
    inkMuted: '#8A5A6A',
    paper: 'rgba(255,255,255,0.55)',
    line: 'rgba(59, 10, 28, 0.14)',
    stamp: ['#F43F5E', '#C026D3'],
    stampInk: '#FFF7F9',
    sigilRing: '#E11D48',
    sigilRing2: '#A21CAF',
    sigilDisc: 'rgba(251, 207, 232, 0.9)',
  },
  {
    id: 'midnight',
    name: { zh: '星夜', en: 'Midnight' },
    mode: 'dark',
    bg: ['#151515', '#0B0B0F', '#040405'],
    glowA: 'rgba(250, 204, 21, 0.28)',
    glowB: 'rgba(148, 163, 184, 0.18)',
    accent: '#FCD34D',
    accentSoft: 'rgba(252, 211, 77, 0.14)',
    accentInk: '#1C1917',
    ink: '#FAF7EE',
    inkMuted: '#A8A29E',
    paper: 'rgba(255,255,255,0.04)',
    line: 'rgba(255,255,255,0.14)',
    stamp: ['#CA8A04', '#B45309'],
    stampInk: '#FFFBEB',
    sigilRing: '#FCD34D',
    sigilRing2: '#E7E5E4',
    sigilDisc: 'rgba(120, 53, 15, 0.5)',
  },
];

export function isPassportThemeId(value: unknown): value is PassportThemeId {
  return typeof value === 'string' && PASSPORT_THEMES.some((theme) => theme.id === value);
}

export function passportTheme(id: PassportThemeId): PassportTheme {
  return PASSPORT_THEMES.find((theme) => theme.id === id) ?? PASSPORT_THEMES[0];
}

// ---------------------------------------------------------------------------
// Hash-derived identity: hue, sigil, default theme (the number lives in agent-passport.ts).
// ---------------------------------------------------------------------------

/** Deterministic visual identity: same Agent, same face, everywhere. */
export interface PassportSigil {
  hue: number;
  rings: Array<{ start: number; sweep: number; width: number; dash: boolean }>;
  core: number;
}

export function passportHue(seed: string): number {
  return passportHash(seed) % 360;
}

/**
 * Three rings whose arcs are cut from the hash bits: a mark the owner learns
 * to recognize at a glance, and one nobody else's Agent shares.
 */
export function passportSigilFromHash(hash: number): PassportSigil {
  const nibble = (index: number) => (hash >>> (index * 4)) & 0xf;
  return {
    hue: hash % 360,
    rings: [0, 1, 2].map((ring) => ({
      start: nibble(ring * 2) * 22.5,
      sweep: 90 + nibble(ring * 2 + 1) * 14,
      width: ring === 1 ? 5 : 3,
      dash: ((hash >>> (24 + ring)) & 1) === 1,
    })),
    core: 6 + (nibble(7) % 5),
  };
}

export function passportSigil(seed: string): PassportSigil {
  return passportSigilFromHash(passportHash(seed));
}

export function defaultPassportThemeIdFromHash(hash: number): PassportThemeId {
  return PASSPORT_THEMES[(hash >>> 0) % PASSPORT_THEMES.length].id;
}

export function defaultPassportThemeId(seed: string): PassportThemeId {
  return defaultPassportThemeIdFromHash(passportHash(seed));
}

// ---------------------------------------------------------------------------
// Evidence — every fact on the passport is derived from this record, on the
// owner's side and on the public page alike.
// ---------------------------------------------------------------------------

export type PassportMemoryState = 'committed' | 'in_progress' | 'none';
export type PassportRecoveryState = 'confirmed' | 'not_confirmed' | 'not_configured' | 'unavailable';
export type PassportBudgetWindow = 'day' | 'month' | 'tx';

export interface PassportBudget {
  amount: string;
  currency: string;
  window: PassportBudgetWindow;
}

/** Who this Agent says it is — only after the owner confirmed the text (spec v4 D2). */
export interface PassportPersonaEvidence {
  status: PassportPersonaStatus;
  tagline: string | null;
  tags: string[];
}

/** Public track record: range buckets only, never exact counts (spec v4 D3). */
export interface PassportTrackEvidence {
  tasksBucket: PassportCountBucket;
  partnersBucket: PassportCountBucket;
  /** YYYY-MM-DD of the first completed task. */
  since: string | null;
}

/**
 * Reputation credentials Agentrix signed over real settlement / fulfilment
 * events, as the public may see them (spec v4 R8): a range of verified
 * credentials, which kinds, whether any reached a chain, and the latest month.
 */
export interface PassportCredentialsEvidence {
  verifiedBucket: PassportCountBucket;
  kinds: PassportCredentialKind[];
  anchor: PassportCredentialAnchor;
  /** YYYY-MM of the newest verified credential. */
  latestOn: string | null;
}

export interface PassportEvidence {
  identityReady: boolean;
  approvalRequired: boolean;
  budget: PassportBudget | null;
  memory: PassportMemoryState;
  memoryCommitted: number;
  memoryPending: number;
  /** Source names (e.g. "ChatGPT") only when the projection exposes them; never guessed. */
  memorySources: string[];
  calendar: boolean | null;
  deviceCount: number | null;
  recovery: PassportRecoveryState;
  /** YYYY-MM-DD the Agent got its home, when the directory knows it. */
  issuedOn: string | null;
  persona: PassportPersonaEvidence;
  /** Up to three registered skill names; `null` when the passport projection could not be read. */
  skills: string[] | null;
  /** How many more skills exist beyond the listed names, so owner and public cards print the same `(+N)`. */
  skillsMore: number;
  /** `null` when the projection could not be read (rendered as "unconfirmed", never as zero). */
  track: PassportTrackEvidence | null;
  /** `null` when the credential store could not be read or the feature is off; a real zero is `{ verifiedBucket: 0, … }`. */
  credentials: PassportCredentialsEvidence | null;
}

export interface PassportVisa {
  id: string;
  label: LocalizedLine;
  state: 'granted' | 'pending';
}

/**
 * The four stamps that carry the story for another Agent or a partner: who it
 * is, what it does, what it has done, who decides. Identity and portability
 * live in the footer. Six facts in all, so the sigil's six notches, the stage
 * thresholds and the poster grid keep their geometry from v3.
 */
export const PASSPORT_SIGNATURE_IDS: readonly string[] = ['persona', 'skills', 'track', 'authority'];

export const PASSPORT_FACT_ORDER: readonly string[] = ['persona', 'skills', 'track', 'authority', 'identity', 'recovery'];

const MAX_VISAS = 6;
const MAX_SOURCES = 3;
const MAX_SHARED_SKILLS = 3;
const MAX_SKILL_LENGTH = 24;

export function emptyPassportEvidence(): PassportEvidence {
  return {
    identityReady: false,
    approvalRequired: false,
    budget: null,
    memory: 'none',
    memoryCommitted: 0,
    memoryPending: 0,
    memorySources: [],
    calendar: null,
    deviceCount: null,
    recovery: 'unavailable',
    issuedOn: null,
    persona: { status: 'none', tagline: null, tags: [] },
    skills: null,
    skillsMore: 0,
    track: null,
    credentials: null,
  };
}

/** `10 → "10+ 单" / "10+ tasks"`, `1 → "1–9 单"`, `0 → null` (the caller words the empty case). */
export function bucketLine(bucket: PassportCountBucket, unit: { zh: string; en: string }): LocalizedLine | null {
  if (bucket === 0) return null;
  const range = bucket === 1 ? '1–9' : `${bucket}+`;
  return { zh: `${range} ${unit.zh}`, en: `${range} ${unit.en}` };
}

const TASK_UNIT = { zh: '单', en: 'tasks' };
const PARTNER_UNIT = { zh: '个伙伴', en: 'partners' };
const CREDENTIAL_UNIT = { zh: '份可验证凭证', en: 'verifiable credentials' };
const ANCHORED_LINE: LocalizedLine = { zh: '已上链锚定', en: 'anchored on-chain' };

function budgetLine(budget: PassportBudget): LocalizedLine {
  const label = `${budget.amount}${budget.currency ? ` ${budget.currency}` : ''}`;
  const window = budget.window === 'day'
    ? { zh: '每天', en: 'per day' }
    : budget.window === 'month'
      ? { zh: '每月', en: 'per month' }
      : { zh: '单笔', en: 'per action' };
  return {
    zh: `${window.zh}最多 ${label}`,
    en: `Up to ${label} ${window.en}`,
  };
}

function joinLines(lines: LocalizedLine[]): LocalizedLine {
  return { zh: lines.map((line) => line.zh).join(' · '), en: lines.map((line) => line.en).join(' · ') };
}

/** Calendar and devices, as the "reaches the real world" tail of the skills stamp. */
function connectedBits(evidence: PassportEvidence): LocalizedLine[] {
  const bits: LocalizedLine[] = [];
  if (evidence.calendar === true) {
    bits.push({ zh: 'Google 日历（只读）', en: 'Google Calendar (read-only)' });
  }
  if (typeof evidence.deviceCount === 'number' && evidence.deviceCount > 0) {
    bits.push({
      zh: `${evidence.deviceCount} 台设备`,
      en: `${evidence.deviceCount} device${evidence.deviceCount === 1 ? '' : 's'}`,
    });
  }
  return bits;
}

/**
 * Six facts, written for the Agent on the other side of the table. Nothing
 * here is guessed: unknown evidence reads as "unconfirmed", not as a claim.
 */
export function factsFromEvidence(evidence: PassportEvidence): AgentPassportFact[] {
  const persona: AgentPassportFact = {
    id: 'persona',
    label: { zh: '它是谁', en: 'Who it is' },
    value: evidence.persona.status === 'confirmed' && evidence.persona.tagline
      ? { zh: evidence.persona.tagline, en: evidence.persona.tagline }
      : evidence.persona.status === 'draft'
        ? { zh: '自我介绍待主人确认', en: 'Introduction awaits the owner\u2019s confirmation' }
        : evidence.skills === null && evidence.track === null
          ? { zh: '自我介绍尚未确认', en: 'Introduction not confirmed yet' }
          : { zh: '还没写自我介绍', en: 'No introduction yet' },
    why: evidence.persona.status === 'confirmed' && evidence.persona.tags.length
      ? { zh: evidence.persona.tags.join(' · '), en: evidence.persona.tags.join(' · ') }
      : { zh: '主人确认过的话才会印在这里。', en: 'Only words the owner confirmed are printed here.' },
    tone: evidence.persona.status === 'confirmed'
      ? 'ready'
      : evidence.persona.status === 'draft' || evidence.skills !== null || evidence.track !== null
        ? 'todo'
        : 'unknown',
  };

  const reach = connectedBits(evidence);
  const skillNames = (evidence.skills ?? []).slice(0, MAX_SHARED_SKILLS);
  const skillOverflow = Math.max(0, (evidence.skills?.length ?? 0) - skillNames.length) + Math.max(0, evidence.skillsMore);
  const skillLines: LocalizedLine[] = [
    ...(skillNames.length
      ? [{
          zh: `${skillNames.join(' · ')}${skillOverflow > 0 ? `（+${skillOverflow}）` : ''}`,
          en: `${skillNames.join(' · ')}${skillOverflow > 0 ? ` (+${skillOverflow})` : ''}`,
        }]
      : []),
    ...reach,
  ];
  const skills: AgentPassportFact = {
    id: 'skills',
    label: { zh: '它会什么', en: 'What it does' },
    value: skillLines.length
      ? joinLines(skillLines)
      : evidence.skills === null
        ? { zh: '技能尚未确认', en: 'Skills not confirmed yet' }
        : { zh: '还没登记技能', en: 'No skills registered yet' },
    why: { zh: '只列真正开着的能力；日历只读，设备可见。', en: 'Only abilities that are really on; calendar read-only, devices visible.' },
    tone: skillLines.length ? 'ready' : evidence.skills === null ? 'unknown' : 'todo',
  };

  const trackLines: LocalizedLine[] = [];
  if (evidence.track) {
    const tasks = bucketLine(evidence.track.tasksBucket, TASK_UNIT);
    const partners = bucketLine(evidence.track.partnersBucket, PARTNER_UNIT);
    if (tasks) trackLines.push(tasks);
    if (partners) trackLines.push(partners);
    if (tasks && evidence.track.since) {
      const month = evidence.track.since.slice(0, 7);
      trackLines.push({ zh: `${month} 起`, en: `since ${month}` });
    }
  }
  // Slice 3.1: credentials Agentrix signed over real events join the track record.
  // Only a verified range is printed; "pending" anchoring is not claimed as anchored.
  const credentialLine = evidence.credentials ? bucketLine(evidence.credentials.verifiedBucket, CREDENTIAL_UNIT) : null;
  if (credentialLine) {
    trackLines.push(credentialLine);
    if (evidence.credentials?.anchor === 'anchored') trackLines.push(ANCHORED_LINE);
  }
  const track: AgentPassportFact = {
    id: 'track',
    label: { zh: '它做过什么', en: 'Track record' },
    value: trackLines.length
      ? joinLines(trackLines)
      : evidence.track
        ? { zh: '还没接过单', en: 'No tasks completed yet' }
        : { zh: '履历尚未确认', en: 'Track record not confirmed yet' },
    why: credentialLine
      ? { zh: '数字只来自回执与 Agentrix 签发的凭证，公开只显示区间。', en: 'Counts come from receipts and Agentrix-signed credentials; the public sees ranges.' }
      : { zh: '数字只来自回执，公开只显示区间。', en: 'Counts come from receipts only; the public sees ranges.' },
    tone: trackLines.length ? 'ready' : evidence.track ? 'todo' : 'unknown',
  };

  const authority: AgentPassportFact = {
    id: 'authority',
    label: { zh: '谁做主', en: 'Who decides' },
    value: evidence.budget
      ? evidence.approvalRequired
        ? joinLines([{ zh: '花钱先问主人', en: 'Spending asks the owner first' }, budgetLine(evidence.budget)])
        : joinLines([{ zh: '按主人定的规则办事', en: 'Acts within the owner\u2019s rules' }, budgetLine(evidence.budget)])
      : { zh: '花钱先问主人，随时可停', en: 'Spending asks the owner first. It can be paused anytime.' },
    why: { zh: '它替主人办事，停不停由主人。', en: 'It acts for its owner, and only the owner can stop it.' },
    tone: 'ready',
  };

  const identity: AgentPassportFact = {
    id: 'identity',
    label: { zh: '安家', en: 'Home' },
    value: evidence.identityReady
      ? evidence.issuedOn
        ? { zh: `${evidence.issuedOn} 在 Agentrix 安家`, en: `Home on Agentrix since ${evidence.issuedOn}` }
        : { zh: '已在 Agentrix 安家', en: 'At home on Agentrix' }
      : { zh: '家刚安好，身份还在确认', en: 'Home is new. Identity is still confirming.' },
    why: { zh: '有家、有名字、有编号；改名不换脸。', en: 'A home, a name, a number. Renaming never changes its face.' },
    tone: evidence.identityReady ? 'ready' : 'unknown',
  };

  const recovery: AgentPassportFact = {
    id: 'recovery',
    label: { zh: '走得掉', en: 'Portable' },
    value: evidence.recovery === 'confirmed'
      ? { zh: '恢复备份已确认', en: 'Recovery backup confirmed' }
      : evidence.recovery === 'not_confirmed'
        ? { zh: '恢复尚未就绪，可先导出', en: 'Recovery is not ready. You can export first.' }
        : evidence.recovery === 'not_configured'
          ? { zh: '还没配置恢复备份，可先导出', en: 'No recovery backup set up yet. You can export first.' }
          : { zh: '恢复尚未确认，可随时带走', en: 'Recovery is not confirmed. You can still take it with you.' },
    why: { zh: '记忆能导出、能带走，有备份凭证才算真。', en: 'Memory can be exported and taken away; a backup receipt makes it real.' },
    tone: evidence.recovery === 'confirmed' ? 'ready' : evidence.recovery === 'unavailable' ? 'unknown' : 'todo',
  };

  return [persona, skills, track, authority, identity, recovery];
}

/**
 * The single brightest true line. The owner-confirmed introduction wins; the
 * rest is the v3 chain, reworded for a reader who is not the owner.
 */
export function passportHero(evidence: PassportEvidence): LocalizedLine {
  if (evidence.persona.status === 'confirmed' && evidence.persona.tagline) {
    return { zh: evidence.persona.tagline, en: evidence.persona.tagline };
  }
  if (evidence.memory === 'committed') {
    return { zh: '记忆已从 ChatGPT / Claude 带回家', en: 'Memory came home from ChatGPT / Claude' };
  }
  if (evidence.budget) {
    return { zh: '花多少主人定，花钱先问主人', en: 'The owner sets the limit. Spending asks first.' };
  }
  if (evidence.calendar === true || (evidence.deviceCount ?? 0) > 0) {
    return { zh: '连着真实世界的 AI，主人做主', en: 'Connected to the real world. The owner decides.' };
  }
  if (evidence.recovery === 'confirmed') {
    return { zh: '随时能跟主人走的 AI', en: 'An AI that can leave with its owner' };
  }
  return { zh: '主人做主的 AI', en: 'An AI its owner decides for' };
}

export function passportStage(readyCount: number): LocalizedLine {
  if (readyCount >= 6) return { zh: '全章齐', en: 'Fully stamped' };
  if (readyCount >= 4) return { zh: '家已成形', en: 'Home is taking shape' };
  if (readyCount >= 2) return { zh: '正在安顿', en: 'Settling in' };
  return { zh: '刚安家', en: 'Just moved in' };
}

export function visasFromEvidence(evidence: PassportEvidence): PassportVisa[] {
  const visas: PassportVisa[] = [];
  for (let index = 0; index < evidence.memoryCommitted && visas.length < MAX_VISAS; index += 1) {
    const source = evidence.memorySources[index];
    visas.push({
      id: `visa-granted-${index}`,
      label: source
        ? { zh: `${source} · 已放行`, en: `${source} · granted` }
        : { zh: `记忆入境 ${index + 1} · 已放行`, en: `Memory entry ${index + 1} · granted` },
      state: 'granted',
    });
  }
  for (let index = 0; index < evidence.memoryPending && visas.length < MAX_VISAS; index += 1) {
    visas.push({
      id: `visa-pending-${index}`,
      label: { zh: '记忆入境 · 审核中', en: 'Memory entry · pending' },
      state: 'pending',
    });
  }
  return visas;
}

// ---------------------------------------------------------------------------
// Share payloads. v2 carries evidence codes only, so the QR stays scannable and
// the public page regenerates every line from the same tables. v3 adds the
// partner-facing facts. v1 (labels and values spelled out) is still decoded for
// links already in the wild.
// ---------------------------------------------------------------------------

export interface PublicPassportShareV1 {
  v: 1;
  name: string;
  lineZh: string;
  lineEn: string;
  facts: Array<{ lz: string; le: string; vz: string; ve: string; t?: 'r' | 'd' | 'u' }>;
  /** Hue 0–359 so the public card keeps the same face as the owner's. */
  h?: number;
  /** Passport number, already derived from a hash; never a raw id. */
  n?: string;
  /** Theme id; older links never carry it and fall back to the hash default. */
  th?: PassportThemeId;
}

export interface PublicPassportShareV2 {
  v: 2;
  name: string;
  /** Passport number (hash in hex): rebuilds sigil, hue and the default theme. */
  n: string;
  /** Chosen theme; omitted when the owner kept the hash default. */
  th?: PassportThemeId;
  /** Issued on, YYYY-MM-DD. */
  d?: string;
  e: {
    id: 0 | 1;
    ap: 0 | 1;
    b?: [string, string, 'd' | 'm' | 't'];
    m: 'c' | 'p' | 'n';
    mc?: number;
    mp?: number;
    ms?: string[];
    cal: 1 | 0 | -1;
    dc?: number;
    rec: 'c' | 'n' | 'x' | 'u';
  };
}

/**
 * v3 adds the partner-facing facts on top of v2: confirmed persona (`p`, never a
 * draft), up to three skill names (`sk`, plus `sm` more) and track buckets (`tr`).
 * Still no exact counts and no account id.
 */
export interface PublicPassportShareV3 extends Omit<PublicPassportShareV2, 'v'> {
  v: 3;
  p?: { t: string; g: string[] };
  sk?: string[];
  /** Skills beyond the three names, so the public card prints the same `(+N)`. */
  sm?: number;
  tr?: { c: PassportCountBucket; p: PassportCountBucket; s?: string };
  /**
   * Slice 3.1 — verified reputation credentials: `n` range bucket, `k` kinds
   * (`s` settlement / `f` fulfillment), `a` anchor (`a` anchored / `p` pending;
   * omitted = not anchored), `m` latest month. Links minted before 3.1 omit it → unknown.
   */
  cr?: { n: PassportCountBucket; k?: CredentialKindCode[]; a?: 'a' | 'p'; m?: string };
}

export type PublicPassportShare = PublicPassportShareV1 | PublicPassportShareV2 | PublicPassportShareV3;

type CredentialKindCode = 's' | 'f';
const CREDENTIAL_KIND_CODE: Record<PassportCredentialKind, CredentialKindCode> = { settlement: 's', fulfillment: 'f' };
const CODE_CREDENTIAL_KIND: Record<CredentialKindCode, PassportCredentialKind> = { s: 'settlement', f: 'fulfillment' };
const CREDENTIAL_MONTH = /^\d{4}-\d{2}$/;

function credentialsToShare(credentials: PassportCredentialsEvidence): NonNullable<PublicPassportShareV3['cr']> {
  const out: NonNullable<PublicPassportShareV3['cr']> = { n: credentials.verifiedBucket };
  const kinds = PASSPORT_CREDENTIAL_KINDS.filter((kind) => credentials.kinds.includes(kind)).map((kind) => CREDENTIAL_KIND_CODE[kind]);
  if (kinds.length) out.k = kinds;
  if (credentials.anchor === 'anchored') out.a = 'a';
  else if (credentials.anchor === 'pending') out.a = 'p';
  if (credentials.latestOn && CREDENTIAL_MONTH.test(credentials.latestOn)) out.m = credentials.latestOn;
  return out;
}

function credentialsFromShare(code: PublicPassportShareV3['cr'] | undefined): PassportCredentialsEvidence | null {
  if (!code) return null;
  return {
    verifiedBucket: code.n,
    kinds: (code.k ?? []).map((kind) => CODE_CREDENTIAL_KIND[kind]),
    anchor: code.a === 'a' ? 'anchored' : code.a === 'p' ? 'pending' : 'not_anchored',
    latestOn: code.m ?? null,
  };
}

/** Public credentials block → evidence; `unavailable` reads as unknown (`null`), a real zero stays a zero. */
function credentialsEvidenceFromPublic(value: unknown): PassportCredentialsEvidence | null {
  const credentials: AgentPassportCredentialsPublicV1 = readPassportCredentialsPublic(value);
  if (credentials.state !== 'available') return null;
  return {
    verifiedBucket: credentials.verifiedBucket,
    kinds: [...credentials.kinds],
    anchor: credentials.anchor,
    latestOn: credentials.latestOn,
  };
}

const CODE_TONE: Record<'r' | 'd' | 'u', PassportFactTone> = { r: 'ready', d: 'todo', u: 'unknown' };
const WINDOW_CODE: Record<PassportBudgetWindow, 'd' | 'm' | 't'> = { day: 'd', month: 'm', tx: 't' };
const CODE_WINDOW: Record<'d' | 'm' | 't', PassportBudgetWindow> = { d: 'day', m: 'month', t: 'tx' };
const MEMORY_CODE: Record<PassportMemoryState, 'c' | 'p' | 'n'> = { committed: 'c', in_progress: 'p', none: 'n' };
const CODE_MEMORY: Record<'c' | 'p' | 'n', PassportMemoryState> = { c: 'committed', p: 'in_progress', n: 'none' };
type RecoveryCode = 'c' | 'n' | 'x' | 'u';
const RECOVERY_CODE: Record<PassportRecoveryState, RecoveryCode> = {
  confirmed: 'c',
  not_confirmed: 'n',
  not_configured: 'x',
  unavailable: 'u',
};
const CODE_RECOVERY: Record<RecoveryCode, PassportRecoveryState> = {
  c: 'confirmed',
  n: 'not_confirmed',
  x: 'not_configured',
  u: 'unavailable',
};

export function toneFromShareCode(code: unknown): PassportFactTone {
  return code === 'r' || code === 'd' || code === 'u' ? CODE_TONE[code] : 'unknown';
}

const SHARE_MAX_LENGTH = 1400;
const NUMBER_PATTERN = /^AGX-[0-9A-F]{4}-[0-9A-F]{4}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}(-\d{2})?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanSource(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24);
  return cleaned || null;
}

function cleanShortText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const chars = Array.from(cleaned);
  return chars.length <= max ? cleaned : null;
}

function smallCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 999 ? value : undefined;
}

export function shortAgentRef(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

// --- base64url + UTF-8 without btoa / atob / TextEncoder, so every runtime agrees.

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    let code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const low = text.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        index += 1;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

function utf8Text(bytes: number[]): string {
  let out = '';
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    let code: number;
    if (byte < 0x80) {
      code = byte;
    } else if (byte >= 0xc0 && byte < 0xe0) {
      code = ((byte & 0x1f) << 6) | (bytes[++index] & 0x3f);
    } else if (byte >= 0xe0 && byte < 0xf0) {
      code = ((byte & 0x0f) << 12) | ((bytes[++index] & 0x3f) << 6) | (bytes[++index] & 0x3f);
    } else {
      code = ((byte & 0x07) << 18) | ((bytes[++index] & 0x3f) << 12) | ((bytes[++index] & 0x3f) << 6) | (bytes[++index] & 0x3f);
    }
    if (Number.isNaN(code)) throw new Error('Malformed UTF-8');
    out += String.fromCodePoint(code);
  }
  return out;
}

function base64UrlEncode(bytes: number[]): string {
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += BASE64URL_ALPHABET[(triple >> 18) & 0x3f] + BASE64URL_ALPHABET[(triple >> 12) & 0x3f];
    if (b !== undefined) out += BASE64URL_ALPHABET[(triple >> 6) & 0x3f];
    if (c !== undefined) out += BASE64URL_ALPHABET[triple & 0x3f];
  }
  return out;
}

function base64UrlDecode(text: string): number[] {
  const normalized = text.replace(/[=\s]+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of normalized) {
    const value = BASE64URL_ALPHABET.indexOf(char);
    if (value < 0) throw new Error('Malformed base64url');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

export function encodePassportShare(share: PublicPassportShare): string {
  return base64UrlEncode(utf8Bytes(JSON.stringify(share)));
}

function decodeShareV1(parsed: Record<string, unknown>): PublicPassportShareV1 | null {
  if (typeof parsed.name !== 'string') return null;
  if (typeof parsed.lineZh !== 'string' || typeof parsed.lineEn !== 'string') return null;
  if (!Array.isArray(parsed.facts)) return null;
  const facts = parsed.facts.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (
      typeof item.lz !== 'string'
      || typeof item.le !== 'string'
      || typeof item.vz !== 'string'
      || typeof item.ve !== 'string'
    ) {
      return [];
    }
    const tone: 'r' | 'd' | 'u' | undefined = item.t === 'r' || item.t === 'd' || item.t === 'u'
      ? item.t
      : undefined;
    const fact: PublicPassportShareV1['facts'][number] = { lz: item.lz, le: item.le, vz: item.vz, ve: item.ve };
    if (tone) fact.t = tone;
    return [fact];
  });
  const hue = typeof parsed.h === 'number' && Number.isInteger(parsed.h) && parsed.h >= 0 && parsed.h < 360
    ? parsed.h
    : undefined;
  const number = typeof parsed.n === 'string' && NUMBER_PATTERN.test(parsed.n) ? parsed.n : undefined;
  return {
    v: 1,
    name: parsed.name.slice(0, 80),
    lineZh: parsed.lineZh.slice(0, 160),
    lineEn: parsed.lineEn.slice(0, 160),
    facts: facts.slice(0, 8),
    ...(hue !== undefined ? { h: hue } : {}),
    ...(number ? { n: number } : {}),
    ...(isPassportThemeId(parsed.th) ? { th: parsed.th } : {}),
  };
}

function decodeShareV2(parsed: Record<string, unknown>): PublicPassportShareV2 | null {
  if (typeof parsed.name !== 'string') return null;
  if (typeof parsed.n !== 'string' || !NUMBER_PATTERN.test(parsed.n)) return null;
  if (!isRecord(parsed.e)) return null;
  const raw = parsed.e;
  const memory = raw.m === 'c' || raw.m === 'p' || raw.m === 'n' ? raw.m : 'n';
  const recovery: RecoveryCode = raw.rec === 'c' || raw.rec === 'n' || raw.rec === 'x' || raw.rec === 'u' ? raw.rec : 'u';
  const calendar = raw.cal === 1 || raw.cal === 0 || raw.cal === -1 ? raw.cal : -1;
  const evidence: PublicPassportShareV2['e'] = {
    id: raw.id === 1 ? 1 : 0,
    ap: raw.ap === 1 ? 1 : 0,
    m: memory,
    cal: calendar,
    rec: recovery,
  };
  if (Array.isArray(raw.b) && raw.b.length === 3) {
    const [amount, currency, window] = raw.b;
    if (
      (typeof amount === 'string' || typeof amount === 'number')
      && typeof currency === 'string'
      && (window === 'd' || window === 'm' || window === 't')
    ) {
      evidence.b = [String(amount).slice(0, 24), currency.slice(0, 8), window];
    }
  }
  const committed = smallCount(raw.mc);
  if (committed !== undefined) evidence.mc = committed;
  const pending = smallCount(raw.mp);
  if (pending !== undefined) evidence.mp = pending;
  const devices = smallCount(raw.dc);
  if (devices !== undefined) evidence.dc = devices;
  if (Array.isArray(raw.ms)) {
    const sources = raw.ms.map(cleanSource).filter((item): item is string => Boolean(item)).slice(0, MAX_SOURCES);
    if (sources.length) evidence.ms = sources;
  }
  return {
    v: 2,
    name: parsed.name.slice(0, 80),
    n: parsed.n,
    ...(isPassportThemeId(parsed.th) ? { th: parsed.th } : {}),
    ...(typeof parsed.d === 'string' && DATE_PATTERN.test(parsed.d) ? { d: parsed.d } : {}),
    e: evidence,
  };
}

function decodeShareV3(parsed: Record<string, unknown>): PublicPassportShareV3 | null {
  const base = decodeShareV2(parsed);
  if (!base) return null;
  const share: PublicPassportShareV3 = { ...base, v: 3 };
  if (isRecord(parsed.p)) {
    const tagline = cleanShortText(parsed.p.t, 40);
    const tags = Array.isArray(parsed.p.g)
      ? parsed.p.g.map((tag) => cleanShortText(tag, 16)).filter((tag): tag is string => Boolean(tag)).slice(0, 3)
      : [];
    if (tagline && tags.length) share.p = { t: tagline, g: tags };
  }
  if (Array.isArray(parsed.sk)) {
    share.sk = parsed.sk
      .map((skill) => cleanShortText(skill, MAX_SKILL_LENGTH))
      .filter((skill): skill is string => Boolean(skill))
      .slice(0, MAX_SHARED_SKILLS);
    const more = smallCount(parsed.sm);
    if (more) share.sm = more;
  }
  if (isRecord(parsed.tr) && isPassportCountBucket(parsed.tr.c) && isPassportCountBucket(parsed.tr.p)) {
    share.tr = {
      c: parsed.tr.c,
      p: parsed.tr.p,
      ...(typeof parsed.tr.s === 'string' && MONTH_PATTERN.test(parsed.tr.s) ? { s: parsed.tr.s } : {}),
    };
  }
  if (isRecord(parsed.cr) && isPassportCountBucket(parsed.cr.n)) {
    const rawKinds: unknown[] = Array.isArray(parsed.cr.k) ? parsed.cr.k : [];
    const kinds = (['s', 'f'] as CredentialKindCode[]).filter((code) => rawKinds.includes(code));
    share.cr = {
      n: parsed.cr.n,
      ...(kinds.length ? { k: kinds } : {}),
      ...(parsed.cr.a === 'a' || parsed.cr.a === 'p' ? { a: parsed.cr.a } : {}),
      ...(typeof parsed.cr.m === 'string' && CREDENTIAL_MONTH.test(parsed.cr.m) ? { m: parsed.cr.m } : {}),
    };
  }
  return share;
}

export function decodePassportShare(raw: unknown): PublicPassportShare | null {
  if (typeof raw !== 'string' || !raw || raw.length > SHARE_MAX_LENGTH) return null;
  try {
    const parsed: unknown = JSON.parse(utf8Text(base64UrlDecode(raw)));
    if (!isRecord(parsed)) return null;
    if (parsed.v === 1) return decodeShareV1(parsed);
    if (parsed.v === 2) return decodeShareV2(parsed);
    if (parsed.v === 3) return decodeShareV3(parsed);
    return null;
  } catch {
    return null;
  }
}

/**
 * Public page path for a card. `slug` is whatever the surface exposes publicly
 * — every surface must call this rather than spell the path itself, because
 * the slug moves from the account id to `agentRef` in slice 2.
 */
export function buildPassportSharePath(
  slug: string | null,
  share: PublicPassportShare,
): string {
  const encoded = encodePassportShare(share);
  const segment = slug ? encodeURIComponent(slug) : 'card';
  return `/share/agent/${segment}?c=${encoded}`;
}

function evidenceToShare(evidence: PassportEvidence): PublicPassportShareV2['e'] {
  const out: PublicPassportShareV2['e'] = {
    id: evidence.identityReady ? 1 : 0,
    ap: evidence.approvalRequired ? 1 : 0,
    m: MEMORY_CODE[evidence.memory],
    cal: evidence.calendar === true ? 1 : evidence.calendar === false ? 0 : -1,
    rec: RECOVERY_CODE[evidence.recovery],
  };
  if (evidence.budget) out.b = [evidence.budget.amount, evidence.budget.currency, WINDOW_CODE[evidence.budget.window]];
  if (evidence.memoryCommitted > 0) out.mc = Math.min(evidence.memoryCommitted, 999);
  if (evidence.memoryPending > 0) out.mp = Math.min(evidence.memoryPending, 999);
  if (evidence.memorySources.length) out.ms = evidence.memorySources.slice(0, MAX_SOURCES);
  if (typeof evidence.deviceCount === 'number' && evidence.deviceCount > 0) out.dc = Math.min(evidence.deviceCount, 999);
  return out;
}

/** Partner-facing extras for the v3 payload. Drafts never travel; only a confirmed persona does. */
function partnerFactsToShare(evidence: PassportEvidence): Pick<PublicPassportShareV3, 'p' | 'sk' | 'sm' | 'tr' | 'cr'> {
  const out: Pick<PublicPassportShareV3, 'p' | 'sk' | 'sm' | 'tr' | 'cr'> = {};
  if (evidence.persona.status === 'confirmed' && evidence.persona.tagline && evidence.persona.tags.length) {
    out.p = { t: evidence.persona.tagline, g: evidence.persona.tags.slice(0, 3) };
  }
  if (evidence.skills) {
    // An empty list is still a fact ("none registered"); only a missing projection omits `sk`.
    const names = evidence.skills
      .map((skill) => cleanShortText(skill, MAX_SKILL_LENGTH))
      .filter((skill): skill is string => Boolean(skill));
    out.sk = names.slice(0, MAX_SHARED_SKILLS);
    const more = Math.max(0, names.length - out.sk.length) + Math.max(0, evidence.skillsMore);
    if (more > 0) out.sm = Math.min(more, 999);
  }
  if (evidence.track) {
    out.tr = {
      c: evidence.track.tasksBucket,
      p: evidence.track.partnersBucket,
      ...(evidence.track.since ? { s: evidence.track.since.slice(0, 7) } : {}),
    };
  }
  // A known zero travels too ("none verified" is a fact); only an unreadable store omits `cr`.
  if (evidence.credentials) out.cr = credentialsToShare(evidence.credentials);
  return out;
}

function evidenceFromShare(share: PublicPassportShareV2 | PublicPassportShareV3): PassportEvidence {
  const e = share.e;
  const extras = share.v === 3 ? share : null;
  return {
    identityReady: e.id === 1,
    approvalRequired: e.ap === 1,
    budget: e.b ? { amount: e.b[0], currency: e.b[1], window: CODE_WINDOW[e.b[2]] } : null,
    memory: CODE_MEMORY[e.m],
    memoryCommitted: e.mc ?? (e.m === 'c' ? 1 : 0),
    memoryPending: e.mp ?? (e.m === 'p' ? 1 : 0),
    memorySources: e.ms ?? [],
    calendar: e.cal === 1 ? true : e.cal === 0 ? false : null,
    deviceCount: e.dc ?? null,
    recovery: CODE_RECOVERY[e.rec],
    issuedOn: share.d ?? null,
    persona: extras?.p
      ? { status: 'confirmed', tagline: extras.p.t, tags: extras.p.g }
      : { status: 'none', tagline: null, tags: [] },
    // A v2 link predates these facts; a v3 link without them means the projection was unreadable.
    skills: extras?.sk ?? null,
    skillsMore: extras?.sm ?? 0,
    track: extras?.tr
      ? { tasksBucket: extras.tr.c, partnersBucket: extras.tr.p, since: extras.tr.s ? `${extras.tr.s.slice(0, 7)}-01` : null }
      : null,
    credentials: credentialsFromShare(extras?.cr),
  };
}

// ---------------------------------------------------------------------------
// Card model.
// ---------------------------------------------------------------------------

export interface AgentPassportCardModel {
  name: string;
  shortId: string;
  /** e.g. `AGX-7F3A-91C2`; hash-derived, safe to show publicly. */
  number: string;
  hue: number;
  sigil: PassportSigil;
  theme: PassportTheme;
  /** True when the owner picked the theme (as opposed to the hash default). */
  themeChosen: boolean;
  evidence: PassportEvidence;
  /** The one line that says what makes this Agent special, from real facts. */
  hero: LocalizedLine;
  /** Growth stage from the stamped count, e.g. 家已成形. */
  stage: LocalizedLine;
  readyCount: number;
  tagline: LocalizedLine;
  facts: AgentPassportFact[];
  visas: PassportVisa[];
  share: PublicPassportShare;
}

/**
 * What any surface needs to build the card. Mobile and Desktop pass the
 * projection and the two connection facts; the owner-side evidence fields are
 * for surfaces that already resolved them (Web reads the Soul Core aggregate
 * and the experience projection). Anything omitted degrades to "unconfirmed"
 * or to the projection's own floor — never to a claim.
 */
export interface AgentPassportCardInput {
  name: string;
  agentAccountId: string | null;
  /**
   * Per-Agent passport projection from `GET /agent-accounts/:id/passport`.
   * `null` / `undefined` = not readable yet; the persona, skills and track stamps
   * then say "unconfirmed" rather than pretending the Agent has nothing.
   */
  passport?: AgentPassportProjectionV1 | null;
  calendarConnected: boolean | null;
  deviceCount: number | null;
  /** ISO timestamp from the directory record; rendered as the issue date (falls back to `passport.issuedOn`). */
  createdAt?: string | null;
  /** Memory source names when a projection exposes them; omitted otherwise. */
  memorySources?: readonly string[] | null;
  /** Theme the owner picked; null/undefined keeps the hash default. */
  theme?: PassportThemeId | null;
  /** Defaults to "the directory names this Agent" (`agentAccountId` present). */
  identityReady?: boolean;
  /** Explicit approval policy; omitted → the projection's enforced floor (no limit → every spend asks). */
  approvalRequired?: boolean;
  /** Budget from an explicit policy; null / omitted → the projection's spending limits. */
  budget?: PassportBudget | null;
  memory?: { state: PassportMemoryState; committed: number; pending: number };
  recovery?: PassportRecoveryState;
}

const TAGLINE: LocalizedLine = {
  zh: '住在 Agentrix 的 AI。主人做主，记忆可带走。',
  en: 'An AI at home on Agentrix. Its owner decides. Memory can leave with them.',
};

function personaEvidence(passport: AgentPassportProjectionV1 | null | undefined): PassportPersonaEvidence {
  if (!passport) return { status: 'none', tagline: null, tags: [] };
  const tagline = cleanShortText(passport.persona.tagline, 40);
  const tags = passport.persona.tags
    .map((tag) => cleanShortText(tag, 16))
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, 3);
  if (passport.persona.status === 'confirmed' && tagline && tags.length) {
    return { status: 'confirmed', tagline, tags };
  }
  if (passport.persona.status === 'draft') return { status: 'draft', tagline, tags };
  return { status: 'none', tagline: null, tags: [] };
}

function skillsEvidence(
  passport: AgentPassportProjectionV1 | null | undefined,
): Pick<PassportEvidence, 'skills' | 'skillsMore'> {
  if (!passport || passport.skills.state !== 'available') return { skills: null, skillsMore: 0 };
  const names = passport.skills.items
    .map((item) => cleanShortText(item.name, MAX_SKILL_LENGTH))
    .filter((name): name is string => Boolean(name));
  const shown = names.slice(0, MAX_SHARED_SKILLS);
  const total = Math.max(passport.skills.total, names.length);
  return { skills: shown, skillsMore: Math.max(0, total - shown.length) };
}

function trackEvidence(passport: AgentPassportProjectionV1 | null | undefined): PassportTrackEvidence | null {
  if (!passport || passport.track.state !== 'available') return null;
  return {
    tasksBucket: isPassportCountBucket(passport.track.tasksBucket) ? passport.track.tasksBucket : 0,
    partnersBucket: isPassportCountBucket(passport.track.partnersBucket) ? passport.track.partnersBucket : 0,
    since: typeof passport.track.since === 'string' && DATE_PATTERN.test(passport.track.since) ? passport.track.since : null,
  };
}

/**
 * Platform-enforced spending limits from the passport projection: the floor a
 * surface without the Soul Core aggregate (phone, desktop) can still print.
 */
function budgetFromProjection(authority: AgentPassportProjectionV1['authority'] | null | undefined): PassportBudget | null {
  const limits = authority?.limits;
  if (!limits) return null;
  const pick: Array<[number | undefined, PassportBudgetWindow]> = [
    [limits.daily, 'day'],
    [limits.singleTx, 'tx'],
    [limits.monthly, 'month'],
  ];
  for (const [amount, window] of pick) {
    if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) {
      return { amount: String(amount), currency: limits.currency ?? '', window };
    }
  }
  return null;
}

export function passportIssuedOn(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const time = Date.parse(createdAt);
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString().slice(0, 10);
}

interface ComposeInput {
  name: string;
  shortId: string;
  hash: number;
  hue?: number;
  themeId: PassportThemeId | null;
  evidence: PassportEvidence;
}

function composeCard(input: ComposeInput): Omit<AgentPassportCardModel, 'share'> {
  const sigil = passportSigilFromHash(input.hash);
  const hue = input.hue ?? sigil.hue;
  const defaultTheme = defaultPassportThemeIdFromHash(input.hash);
  const themeId = input.themeId ?? defaultTheme;
  const facts = factsFromEvidence(input.evidence);
  const readyCount = facts.filter((fact) => fact.tone === 'ready').length;
  return {
    name: input.name,
    shortId: input.shortId,
    number: passportNumberFromHash(input.hash),
    hue,
    sigil: { ...sigil, hue },
    theme: passportTheme(themeId),
    themeChosen: input.themeId !== null && input.themeId !== defaultTheme,
    evidence: input.evidence,
    hero: passportHero(input.evidence),
    stage: passportStage(readyCount),
    readyCount,
    tagline: TAGLINE,
    facts,
    visas: visasFromEvidence(input.evidence),
  };
}

/** Builds the card any surface renders; see {@link AgentPassportCardInput} for what to pass. */
export function buildAgentPassportCard(input: AgentPassportCardInput): AgentPassportCardModel {
  const name = input.name.trim() || 'My AI';
  const memory = input.memory ?? { state: 'none' as const, committed: 0, pending: 0 };

  const evidence: PassportEvidence = {
    identityReady: input.identityReady ?? Boolean(input.agentAccountId),
    approvalRequired: input.approvalRequired ?? Boolean(input.passport?.authority.approvalRequired),
    budget: input.budget ?? budgetFromProjection(input.passport?.authority),
    memory: memory.state,
    memoryCommitted: memory.committed,
    memoryPending: memory.pending,
    memorySources: (input.memorySources ?? [])
      .map(cleanSource)
      .filter((item): item is string => Boolean(item))
      .slice(0, MAX_SOURCES),
    calendar: input.calendarConnected,
    deviceCount: input.deviceCount,
    recovery: input.recovery ?? 'unavailable',
    issuedOn: passportIssuedOn(input.createdAt) ?? input.passport?.issuedOn ?? null,
    persona: personaEvidence(input.passport),
    ...skillsEvidence(input.passport),
    track: trackEvidence(input.passport),
    credentials: input.passport ? credentialsEvidenceFromPublic(input.passport.credentials) : null,
  };

  // The visual identity is seeded by the account id so the card never changes
  // face on rename; a nameless draft falls back to the name so it still gets one.
  const seed = input.agentAccountId?.trim() || `name:${name}`;
  const hash = passportHash(seed);
  const themeId = isPassportThemeId(input.theme) ? input.theme : null;
  const card = composeCard({
    name,
    shortId: shortAgentRef(input.agentAccountId),
    hash,
    themeId,
    evidence,
  });

  // The public payload carries the hash-derived number, evidence codes and the
  // partner-facing buckets — never the account id, exact counts or a draft.
  const share: PublicPassportShareV3 = {
    v: 3,
    name,
    n: card.number,
    ...(card.themeChosen ? { th: card.theme.id } : {}),
    ...(evidence.issuedOn ? { d: evidence.issuedOn } : {}),
    e: evidenceToShare(evidence),
    ...partnerFactsToShare(evidence),
  };
  return { ...card, share };
}

/** Rebuilds a card for the public page from a decoded share payload only. */
export function cardFromPassportShare(share: PublicPassportShare): AgentPassportCardModel {
  if (share.v === 2 || share.v === 3) {
    const hash = passportHashFromNumber(share.n) ?? passportHash(`name:${share.name}`);
    const card = composeCard({
      name: share.name,
      shortId: '',
      hash,
      themeId: share.th ?? null,
      evidence: evidenceFromShare(share),
    });
    return { ...card, share };
  }

  // v1: labels and values were spelled out; keep them verbatim and mark the rest unknown.
  const hash = (share.n ? passportHashFromNumber(share.n) : null) ?? passportHash(`name:${share.name}`);
  const sigil = passportSigilFromHash(hash);
  const hue = share.h ?? sigil.hue;
  const facts: AgentPassportFact[] = share.facts.map((fact, index) => ({
    id: `share-${index}`,
    label: { zh: fact.lz, en: fact.le },
    value: { zh: fact.vz, en: fact.ve },
    why: { zh: '', en: '' },
    tone: toneFromShareCode(fact.t),
  }));
  const readyCount = facts.filter((fact) => fact.tone === 'ready').length;
  const themeId = share.th ?? defaultPassportThemeIdFromHash(hash);
  return {
    name: share.name,
    shortId: '',
    number: share.n ?? passportNumberFromHash(hash),
    hue,
    sigil: { ...sigil, hue },
    theme: passportTheme(themeId),
    themeChosen: Boolean(share.th),
    evidence: emptyPassportEvidence(),
    hero: { zh: share.lineZh, en: share.lineEn },
    stage: passportStage(readyCount),
    readyCount,
    tagline: { zh: share.lineZh, en: share.lineEn },
    facts,
    visas: [],
    share,
  };
}

// ---------------------------------------------------------------------------
// Public passport ⇄ per-Agent A2A card (spec R6). The card is the machine face
// of the passport; a bare `/share/agent/<agentRef>` link (no `?c=`) renders
// from it and prints the same stamps the owner sees.
// ---------------------------------------------------------------------------

/**
 * The public passport as a v3 share payload: buckets, the confirmed persona,
 * skill names, the verified-credential range and the enforced spending floor.
 * What the public view does not know (memory, calendar, recovery) is coded as
 * unknown, never as a fact.
 */
export function shareFromPublicPassport(passport: AgentPassportPublicV1): PublicPassportShareV3 {
  const name = passport.name.trim() || 'My AI';
  const budget = budgetFromProjection(passport.authority);
  const evidence: PublicPassportShareV2['e'] = {
    // Only active, directory-named Agents have a public face at all.
    id: 1,
    ap: passport.authority.approvalRequired ? 1 : 0,
    m: 'n',
    cal: -1,
    rec: 'u',
  };
  if (budget) evidence.b = [budget.amount, budget.currency, WINDOW_CODE[budget.window]];

  const share: PublicPassportShareV3 = {
    v: 3,
    name,
    n: NUMBER_PATTERN.test(passport.passportNumber) ? passport.passportNumber : passportNumberFromHash(passportHash(`name:${name}`)),
    ...(typeof passport.issuedOn === 'string' && DATE_PATTERN.test(passport.issuedOn) ? { d: passport.issuedOn } : {}),
    e: evidence,
  };
  const tagline = cleanShortText(passport.tagline, 40);
  const tags = passport.tags
    .map((tag) => cleanShortText(tag, 16))
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, 3);
  if (tagline && tags.length) share.p = { t: tagline, g: tags };

  const names = passport.skills
    .map((skill) => cleanShortText(skill, MAX_SKILL_LENGTH))
    .filter((skill): skill is string => Boolean(skill));
  share.sk = names.slice(0, MAX_SHARED_SKILLS);
  const more = names.length - share.sk.length;
  if (more > 0) share.sm = Math.min(more, 999);

  const track = passport.track;
  if (track.state === 'available' && isPassportCountBucket(track.tasksBucket) && isPassportCountBucket(track.partnersBucket)) {
    share.tr = {
      c: track.tasksBucket,
      p: track.partnersBucket,
      ...(typeof track.since === 'string' && DATE_PATTERN.test(track.since) ? { s: track.since.slice(0, 7) } : {}),
    };
  }
  const credentials = credentialsEvidenceFromPublic(passport.credentials);
  if (credentials) share.cr = credentialsToShare(credentials);
  return share;
}

/** The card another Agent's owner sees at `/share/agent/<agentRef>` — same words, same number, same seal. */
export function cardFromPublicPassport(passport: AgentPassportPublicV1): AgentPassportCardModel {
  return cardFromPassportShare(shareFromPublicPassport(passport));
}

function positiveAmount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Mirrors the backend floor: with no limit every spend waits for the owner. */
function authorityFromCard(value: unknown): AgentPassportAuthorityV1 {
  const record = isRecord(value) ? value : {};
  const raw = isRecord(record.limits) ? record.limits : null;
  const singleTx = positiveAmount(raw?.singleTx);
  const daily = positiveAmount(raw?.daily);
  const monthly = positiveAmount(raw?.monthly);
  const limits = raw && (singleTx !== undefined || daily !== undefined || monthly !== undefined)
    ? {
        ...(singleTx !== undefined ? { singleTx } : {}),
        ...(daily !== undefined ? { daily } : {}),
        ...(monthly !== undefined ? { monthly } : {}),
        currency: typeof raw.currency === 'string' && raw.currency ? raw.currency : 'USDC',
      }
    : null;
  return {
    approvalRequired: typeof record.approvalRequired === 'boolean' ? record.approvalRequired : limits === null,
    limits,
  };
}

/**
 * Reads the public passport back out of a per-Agent A2A card
 * (`GET /api/a2a/agents/:agentRef/card`); `null` when the JSON is not one.
 * Anything malformed degrades to "unavailable" — the page then says
 * "unconfirmed" instead of inventing a stamp.
 */
export function publicPassportFromAgentCard(value: unknown): AgentPassportPublicV1 | null {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name.trim()) return null;
  const extension = value['x-agentrix'];
  if (!isRecord(extension)) return null;
  const agentRef = typeof extension.agentRef === 'string' ? extension.agentRef.trim() : '';
  if (!agentRef) return null;
  if (typeof extension.passportNumber !== 'string' || !NUMBER_PATTERN.test(extension.passportNumber)) return null;

  const skills = Array.isArray(value.skills)
    ? value.skills.flatMap((skill) => (isRecord(skill) && typeof skill.name === 'string' && skill.name.trim() ? [skill.name.trim()] : []))
    : [];
  const rawTrack = isRecord(extension.track) ? extension.track : null;
  const track: AgentPassportPublicV1['track'] = rawTrack
    && rawTrack.state === 'available'
    && isPassportCountBucket(rawTrack.tasksBucket)
    && isPassportCountBucket(rawTrack.partnersBucket)
    ? {
        state: 'available',
        tasksBucket: rawTrack.tasksBucket,
        partnersBucket: rawTrack.partnersBucket,
        since: typeof rawTrack.since === 'string' && DATE_PATTERN.test(rawTrack.since) ? rawTrack.since : null,
      }
    : { state: 'unavailable', tasksBucket: 0, partnersBucket: 0, since: null };

  const tagline = typeof extension.tagline === 'string' && extension.tagline.trim() ? extension.tagline.trim() : null;
  const description = typeof value.description === 'string' && value.description.trim() ? value.description.trim() : null;
  return {
    schemaVersion: 1,
    agentRef,
    passportNumber: extension.passportNumber,
    name: value.name.trim(),
    issuedOn: typeof extension.issuedOn === 'string' && DATE_PATTERN.test(extension.issuedOn) ? extension.issuedOn : null,
    // The card prints the confirmed tagline as its description; the owner's own description only travels when there is none.
    description: description && description !== tagline ? description : null,
    tagline,
    tags: Array.isArray(extension.tags)
      ? extension.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0).slice(0, 3)
      : [],
    skills,
    track,
    authority: authorityFromCard(extension.authority),
    // Cards from a backend before slice 3.1 have no block → unavailable, never zero.
    credentials: readPassportCredentialsPublic(extension.credentials),
  };
}

/**
 * Slice 3.2: reads the `view` a grant link resolves to
 * (`GET /api/a2a/agents/:agentRef/passport?g=<token>` → `{ audience, fields, view }`).
 * Same normalisation as the card reader; anything malformed is `null` so the
 * page says "no such link" instead of drawing a half-card. The result is a
 * public passport, so `cardFromPublicPassport(view)` renders it as-is.
 */
export function passportViewFromJson(value: unknown): AgentPassportViewV1 | null {
  const record = isRecord(value) && isRecord(value.view) ? value.view : value;
  if (!isRecord(record) || typeof record.name !== 'string' || !record.name.trim()) return null;
  const agentRef = typeof record.agentRef === 'string' ? record.agentRef.trim() : '';
  if (!agentRef) return null;
  if (typeof record.passportNumber !== 'string' || !NUMBER_PATTERN.test(record.passportNumber)) return null;
  if (!isPassportAudience(record.audience)) return null;

  const rawTrack = isRecord(record.track) ? record.track : null;
  const track: AgentPassportPublicV1['track'] = rawTrack
    && rawTrack.state === 'available'
    && isPassportCountBucket(rawTrack.tasksBucket)
    && isPassportCountBucket(rawTrack.partnersBucket)
    ? {
        state: 'available',
        tasksBucket: rawTrack.tasksBucket,
        partnersBucket: rawTrack.partnersBucket,
        since: typeof rawTrack.since === 'string' && DATE_PATTERN.test(rawTrack.since) ? rawTrack.since : null,
      }
    : { state: 'unavailable', tasksBucket: 0, partnersBucket: 0, since: null };
  const fields = Array.isArray(record.fields) ? record.fields.filter(isPassportShareField) : [];
  const view: AgentPassportViewV1 = {
    schemaVersion: 1,
    agentRef,
    passportNumber: record.passportNumber,
    name: record.name.trim(),
    issuedOn: typeof record.issuedOn === 'string' && DATE_PATTERN.test(record.issuedOn) ? record.issuedOn : null,
    description: typeof record.description === 'string' && record.description.trim() ? record.description.trim() : null,
    tagline: typeof record.tagline === 'string' && record.tagline.trim() ? record.tagline.trim() : null,
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0).slice(0, 3)
      : [],
    skills: Array.isArray(record.skills)
      ? record.skills.filter((skill): skill is string => typeof skill === 'string' && skill.trim().length > 0).map((skill) => skill.trim())
      : [],
    track,
    authority: authorityFromCard(record.authority),
    credentials: readPassportCredentialsPublic(record.credentials),
    audience: record.audience,
    fields,
  };
  if (isRecord(record.credentialsMaterial)) {
    const material = record.credentialsMaterial;
    view.credentialsMaterial = material.state === 'available' && Array.isArray(material.items)
      ? {
          state: 'available',
          issuer: typeof material.issuer === 'string' ? material.issuer : null,
          issuerKeyHistory: Array.isArray(material.issuerKeyHistory)
            ? material.issuerKeyHistory.filter((entry): entry is { version: string; address: string } => (
              isRecord(entry) && typeof entry.version === 'string' && typeof entry.address === 'string'
            ))
            : [],
          items: material.items.filter(isRecord) as unknown as PassportCredentialsMaterialV1['items'],
        }
      : { state: 'unavailable', issuer: null, issuerKeyHistory: [], items: [] };
  }
  return view;
}

export function formatPassportShareText(
  card: AgentPassportCardModel,
  language: 'zh' | 'en',
  href: string,
): string {
  const lines = language === 'zh'
    ? [
        card.name,
        card.hero.zh,
        `${card.readyCount}/${card.facts.length} 项已盖章 · ${card.stage.zh}`,
        ...card.facts.map((fact) => `${fact.label.zh}：${fact.value.zh}`),
        href,
      ]
    : [
        card.name,
        card.hero.en,
        `${card.readyCount}/${card.facts.length} stamped · ${card.stage.en}`,
        ...card.facts.map((fact) => `${fact.label.en}: ${fact.value.en}`),
        href,
      ];
  return lines.join('\n');
}
