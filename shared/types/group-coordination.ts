/**
 * Multi-Agent group coordination (T14), v0 contract only (L6-5). No runtime reads this yet: WhatsApp needs the
 * business verification (OA-95 6); Telegram groups come first.
 *
 * In a group thread the owner, clients and their Agents agree on a time or split tasks. The owner's twin answers only
 * on topics the owner authorized for that group.
 */

/** Future server switch; nothing reads it in v0. */
export const GROUP_COORDINATION_V0_FLAG = 'GROUP_COORDINATION_V0_ENABLED';

export const GROUP_COORDINATION_CHANNELS_V0 = ['telegram', 'whatsapp'] as const;
export type GroupCoordinationChannelV0 = (typeof GROUP_COORDINATION_CHANNELS_V0)[number];

export const GROUP_PARTICIPANT_ROLES_V0 = ['owner', 'client', 'agent'] as const;
export type GroupParticipantRoleV0 = (typeof GROUP_PARTICIPANT_ROLES_V0)[number];

export interface GroupScheduleProposalV0 {
  kind: 'schedule_proposal';
  /** 1-10 candidate starts (ISO). */
  slots: string[];
  durationMinutes: number;
}

export interface GroupTaskSplitV0 {
  kind: 'task_split';
  /** 1-20 tasks, each with an opaque participant ref. */
  tasks: { title: string; assigneeRef: string }[];
}

export type GroupCoordinationMessageV0 = GroupScheduleProposalV0 | GroupTaskSplitV0;

/** The twin may answer only on a topic in the group's authorized list (exact, case-insensitive). */
export function twinMayAnswerInGroupV0(topic: string, authorizedTopics: readonly string[]): boolean {
  const t = topic.trim().toLowerCase();
  return t.length > 0 && authorizedTopics.some((a) => a.trim().toLowerCase() === t);
}

// ---------------------------------------------------------------------------
// L8 B2: topic grants and the shared schedule. The group is a Telegram group bound to one owner's Agent.

export const GROUP_COORDINATION_TIER_PRESETS_V0 = ['client', 'collaborator', 'family', 'community'] as const;
export type GroupCoordinationTierPresetV0 = (typeof GROUP_COORDINATION_TIER_PRESETS_V0)[number];

export const GROUP_COORDINATION_LIMITS_V0 = {
  topicsMax: 20,
  topicMax: 40,
  questionMax: 1000,
  /** Other owners' Agents that can join one schedule (the group's own Agent is always in it). */
  participantsMax: 4,
  candidatesMax: 10,
  durationStepMinutes: 15,
  durationMinMinutes: 15,
  durationMaxMinutes: 240,
  scheduleTtlHours: 48,
} as const;

/**
 * What the owner starts from when the grant names no topics. Placeholder wording, not a promise about what is safe to
 * discuss: the owner can replace the list at any time, and an empty list means the twin answers nothing in that group.
 */
export const GROUP_TIER_DEFAULT_TOPICS_V0: Record<GroupCoordinationTierPresetV0, readonly string[]> = {
  client: ['pricing', 'schedule', 'scope'],
  collaborator: ['schedule', 'scope', 'status'],
  family: ['schedule'],
  community: ['faq', 'schedule'],
};

const TOPIC_PATTERN = /^[\p{L}\p{N}_-]+$/u;

/** One topic as the owner writes it and as a member names it: trimmed, NFKC, lower case, letters / digits / `_` / `-` only. */
export function normalizeGroupTopicV0(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const topic = value.normalize('NFKC').trim().toLowerCase();
  if (!topic || topic.length > GROUP_COORDINATION_LIMITS_V0.topicMax || !TOPIC_PATTERN.test(topic)) return null;
  return topic;
}

/**
 * A group message names its topic up front: `#pricing how much for a logo?`. No topic, or a message that only has a
 * topic and no question, is not a question the twin may answer. Everything after the topic is the question.
 */
export function parseGroupTopicQuestionV0(text: unknown): { topic: string; question: string } | null {
  if (typeof text !== 'string') return null;
  const match = /^\s*#([^\s#]+)\s+([\s\S]+)$/.exec(text);
  if (!match) return null;
  const topic = normalizeGroupTopicV0(match[1]);
  const question = match[2].trim().slice(0, GROUP_COORDINATION_LIMITS_V0.questionMax);
  return topic && question ? { topic, question } : null;
}

export interface GroupTopicGrantCommandV0 {
  tierPreset: GroupCoordinationTierPresetV0;
  /** Normalized, unique, in the owner's order. */
  topics: string[];
}

/** `PUT` body: `tierPreset` and, optionally, `topics` (omitted: the preset's starting list). Unknown fields are refused. */
export function decodeGroupTopicGrantCommandV0(value: unknown): GroupTopicGrantCommandV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => key !== 'tierPreset' && key !== 'topics')) return null;
  const preset = raw.tierPreset;
  if (typeof preset !== 'string' || !(GROUP_COORDINATION_TIER_PRESETS_V0 as readonly string[]).includes(preset)) return null;
  const tierPreset = preset as GroupCoordinationTierPresetV0;
  if (raw.topics === undefined) return { tierPreset, topics: [...GROUP_TIER_DEFAULT_TOPICS_V0[tierPreset]] };
  if (!Array.isArray(raw.topics) || raw.topics.length > GROUP_COORDINATION_LIMITS_V0.topicsMax) return null;
  const topics: string[] = [];
  for (const entry of raw.topics) {
    const topic = normalizeGroupTopicV0(entry);
    if (!topic) return null;
    if (!topics.includes(topic)) topics.push(topic);
  }
  return { tierPreset, topics };
}

export interface GroupScheduleCommandV0 {
  durationMinutes: number;
  /** Public Agent ids (`agentUniqueId`) of the other owners' Agents; unique. */
  participantAgentIds: string[];
}

/** `POST` body of a new schedule proposal. */
export function decodeGroupScheduleCommandV0(value: unknown): GroupScheduleCommandV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => key !== 'durationMinutes' && key !== 'participantAgentIds')) return null;
  const L = GROUP_COORDINATION_LIMITS_V0;
  const duration = raw.durationMinutes;
  if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < L.durationMinMinutes || duration > L.durationMaxMinutes || duration % L.durationStepMinutes !== 0) return null;
  const ids = raw.participantAgentIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > L.participantsMax) return null;
  const participantAgentIds: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_:.-]{1,120}$/.test(id) || participantAgentIds.includes(id)) return null;
    participantAgentIds.push(id);
  }
  return { durationMinutes: duration, participantAgentIds };
}

export const GROUP_SCHEDULE_REF_PATTERN_V0 = /^acs_[0-9a-f]{32}$/;

/** `/confirm acs_<32 hex> <n>` in the group; `n` is the 1-based number of the candidate in the announcement. */
export function parseGroupConfirmCommandV0(text: unknown): { scheduleRef: string; choice: number } | null {
  if (typeof text !== 'string') return null;
  const match = /^\/confirm(?:@[A-Za-z0-9_]{5,32})?\s+(acs_[0-9a-f]{32})\s+([1-9]|10)\s*$/.exec(text.trim());
  return match ? { scheduleRef: match[1], choice: Number(match[2]) } : null;
}

export function decodeGroupCoordinationMessageV0(value: unknown): GroupCoordinationMessageV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind === 'schedule_proposal') {
    const slots = raw.slots;
    const duration = raw.durationMinutes;
    if (!Array.isArray(slots) || slots.length < 1 || slots.length > 10) return null;
    const kept: string[] = [];
    for (const slot of slots) {
      if (typeof slot !== 'string' || slot.length > 40 || Number.isNaN(Date.parse(slot))) return null;
      kept.push(new Date(slot).toISOString());
    }
    if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 15 || duration > 480) return null;
    return { kind: 'schedule_proposal', slots: kept, durationMinutes: duration };
  }
  if (raw.kind === 'task_split') {
    const tasks = raw.tasks;
    if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 20) return null;
    const kept: { title: string; assigneeRef: string }[] = [];
    for (const task of tasks) {
      const t = task as Record<string, unknown> | null;
      const title = t ? t.title : undefined;
      const ref = t ? t.assigneeRef : undefined;
      if (typeof title !== 'string' || !title.trim() || title.length > 200) return null;
      if (typeof ref !== 'string' || !/^[A-Za-z0-9_:-]{1,64}$/.test(ref)) return null;
      kept.push({ title: title.trim(), assigneeRef: ref });
    }
    return { kind: 'task_split', tasks: kept };
  }
  return null;
}
