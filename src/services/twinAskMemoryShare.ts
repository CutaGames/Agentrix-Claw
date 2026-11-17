/**
 * Memory review → "friends may hear this too" (asking around, phase 2). When the owner keeps a memory the Agent proposed
 * and ticks the box, the same words — as the owner edits them, filed under one topic — are also saved as an entry their
 * twin may pass on to friends (`POST /twin-ask/facts` with `source: 'memory'`). Two steps, always in this order: the
 * memory is kept first, the entry is saved second.
 *
 * - Words that break the entry rules (money, contact details, links, addresses, children's names, too long, no topic),
 *   or a topic that is already full, stop before the first step: nothing is kept yet and the owner can fix the words.
 * - A failed second step leaves the memory kept; only the entry is tried again, with the words still there.
 * - Nothing is ever shared without the tick: keeping a memory alone does not tell friends anything.
 *
 * Only in builds with both `EXPO_PUBLIC_MEMORY_PROPOSALS=1` and `EXPO_PUBLIC_TWIN_ASK=1`. No React Native import: both
 * calls are injected.
 */
import {
  TWIN_ASK_LIMITS_V0,
  decodeTwinFriendFactInputV0,
  type TwinAskDecodeResultV0,
  type TwinAskTwinTopicV0,
  type TwinFriendFactInputV0,
  type TwinFriendFactV0,
} from '../../shared/types/twin-ask';
import { twinAskFactFits, twinAskFailureWords, twinAskProblemWords, type TwinAskWords } from './twinAskView';

const L = TWIN_ASK_LIMITS_V0;

export interface TwinAskMemoryDraft {
  topic: TwinAskTwinTopicV0 | null;
  text: string;
}

/** What a ticked memory starts from: its readable words, cut to the entry limit. The owner picks the topic. */
export function twinAskMemoryDraft(readable: string): TwinAskMemoryDraft {
  return { topic: null, text: Array.from(readable.trim()).slice(0, L.factMax).join('').trim() };
}

/** The entry the server would accept for this draft, checked with the server's own rules. */
export function twinAskMemoryEntry(draft: TwinAskMemoryDraft): TwinAskDecodeResultV0<TwinFriendFactInputV0> {
  return decodeTwinFriendFactInputV0({ topic: draft.topic, text: draft.text, source: 'memory' }, 'fact', true);
}

export const TWIN_ASK_MEMORY_WORDS = {
  tick: { en: 'Friends may hear this too', zh: '也可以告诉朋友' },
  tickHint: {
    en: 'When a friend asks about this topic, your twin may pass these words on, word for word. Change them first if you like.',
    zh: '朋友问到这个话题时，分身可以原样转述这句话。可以先改一改再存。',
  },
  rules: {
    en: `Up to ${L.factMax} characters. No amounts of money, contact details, links, addresses or children's names.`,
    zh: `最多 ${L.factMax} 个字。不要写钱数、联系方式、链接、地址或孩子的名字。`,
  },
  entryLabel: { en: 'What friends may hear', zh: '可以告诉朋友的话' },
  keepAndShare: { en: 'Keep, and friends may hear it', zh: '记住，并可以告诉朋友' },
  shared: { en: 'Kept. Your twin may now tell friends this.', zh: '记住了，分身也可以把这句话告诉朋友了。' },
  full: {
    en: `Up to ${L.factsMax} entries in all and ${L.factsPerTopicMax} per topic. Delete one in settings first, or pick another topic.`,
    zh: `最多 ${L.factsMax} 条，每个话题最多 ${L.factsPerTopicMax} 条。请先到设置里删一条，或者换一个话题。`,
  },
  entryFailed: {
    en: 'The memory is kept, but the entry for friends was not saved.',
    zh: '记忆已经记住了，但「可以告诉朋友」的这一条还没存上。',
  },
  retry: { en: 'Try again', zh: '再试一次' },
  drop: { en: "Don't tell friends", zh: '算了，不告诉朋友' },
  pendingFirst: {
    en: 'One line above has not been saved for friends yet. Try it again or leave it out first.',
    zh: '上面还有一句没存上。先把它再试一次，或者点「算了，不告诉朋友」。',
  },
} as const;

export type TwinAskMemoryEntryResult =
  | { kind: 'shared'; fact: TwinFriendFactV0 }
  /** The memory is kept; the entry was not saved. `entry` is what to try again with. */
  | { kind: 'entry_failed'; entry: TwinFriendFactInputV0; words: TwinAskWords };

export type TwinAskMemoryShareResult =
  /** Stopped before anything was sent: the memory is still waiting. */
  | { kind: 'invalid'; words: TwinAskWords }
  /** The memory could not be kept, so nothing was saved for friends either. */
  | { kind: 'not_kept' }
  | TwinAskMemoryEntryResult;

export interface TwinAskMemoryShareDeps {
  /** Keeps the memory (accepts the proposal). False when it was not kept. */
  keep(): Promise<boolean>;
  addFact(input: TwinFriendFactInputV0): Promise<TwinFriendFactV0>;
  /** The owner's entries, when they could be read: a full topic then stops before the memory is kept. */
  facts?: readonly Pick<TwinFriendFactV0, 'topic'>[] | null;
}

/** The second step alone. */
export async function saveTwinAskMemoryEntry(entry: TwinFriendFactInputV0, deps: Pick<TwinAskMemoryShareDeps, 'addFact'>): Promise<TwinAskMemoryEntryResult> {
  try {
    return { kind: 'shared', fact: await deps.addFact({ topic: entry.topic, text: entry.text, source: 'memory' }) };
  } catch (error) {
    return { kind: 'entry_failed', entry, words: twinAskFailureWords(error) };
  }
}

/** "Try again" after `entry_failed`: the memory is already kept, so only the entry is checked and saved. */
export async function retryTwinAskMemoryEntry(
  draft: TwinAskMemoryDraft,
  deps: Pick<TwinAskMemoryShareDeps, 'addFact' | 'facts'>,
): Promise<{ kind: 'invalid'; words: TwinAskWords } | TwinAskMemoryEntryResult> {
  const entry = twinAskMemoryEntry(draft);
  if (entry.ok === false) return { kind: 'invalid', words: twinAskProblemWords(entry.reasonCode, entry.field) };
  if (deps.facts && !twinAskFactFits(deps.facts, entry.value.topic)) return { kind: 'invalid', words: TWIN_ASK_MEMORY_WORDS.full };
  return saveTwinAskMemoryEntry(entry.value, deps);
}

export async function keepAndShareTwinAskMemory(draft: TwinAskMemoryDraft, deps: TwinAskMemoryShareDeps): Promise<TwinAskMemoryShareResult> {
  const entry = twinAskMemoryEntry(draft);
  if (entry.ok === false) return { kind: 'invalid', words: twinAskProblemWords(entry.reasonCode, entry.field) };
  if (deps.facts && !twinAskFactFits(deps.facts, entry.value.topic)) return { kind: 'invalid', words: TWIN_ASK_MEMORY_WORDS.full };
  let kept = false;
  try {
    kept = await deps.keep();
  } catch {
    kept = false;
  }
  if (!kept) return { kind: 'not_kept' };
  return saveTwinAskMemoryEntry(entry.value, deps);
}
