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
