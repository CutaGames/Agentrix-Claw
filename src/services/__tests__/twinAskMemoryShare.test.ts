/**
 * Memory review → "friends may hear this too": the memory is kept first and the entry for friends saved second; words
 * that break the entry rules stop before anything is kept; a failed second step retries only the entry.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { TWIN_ASK_LIMITS_V0, type TwinAskTwinTopicV0, type TwinFriendFactInputV0, type TwinFriendFactV0 } from '../../../shared/types/twin-ask';
import { TWIN_ASK_FAILURE_COPY, TwinAskError } from '../twinAsk';
import {
  TWIN_ASK_MEMORY_WORDS,
  keepAndShareTwinAskMemory,
  retryTwinAskMemoryEntry,
  twinAskMemoryDraft,
  twinAskMemoryEntry,
} from '../twinAskMemoryShare';

const L = TWIN_ASK_LIMITS_V0;
const T0 = '2026-11-16T08:00:00.000Z';
const WORDS = '公司楼下那家兰州拉面最好吃';
const CJK = /[\u3400-\u9fff]/;

const saved = (input: TwinFriendFactInputV0): TwinFriendFactV0 => ({ id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', topic: input.topic, text: input.text, source: 'memory', createdAt: T0, updatedAt: T0 });
const topicFacts = (topic: TwinAskTwinTopicV0, count: number) => Array.from({ length: count }, () => ({ topic }));

function steps(options: { keep?: boolean | Error; addFact?: Error } = {}) {
  const order: string[] = [];
  const keep = jest.fn(async () => {
    order.push('keep');
    if (options.keep instanceof Error) throw options.keep;
    return options.keep ?? true;
  });
  const addFact = jest.fn(async (input: TwinFriendFactInputV0) => {
    order.push('addFact');
    if (options.addFact) throw options.addFact;
    return saved(input);
  });
  return { order, keep, addFact };
}

describe('memory review: friends may hear this too', () => {
  it('starts from the memory\'s own words, cut to the entry limit, with no topic picked', () => {
    expect(twinAskMemoryDraft(`  ${WORDS} \n`)).toEqual({ topic: null, text: WORDS });
    const long = twinAskMemoryDraft('面'.repeat(L.factMax + 50));
    expect(Array.from(long.text)).toHaveLength(L.factMax);
    // Counted by character, not by UTF-16 unit: an emoji is never cut in half.
    const emoji = twinAskMemoryDraft('🍜'.repeat(L.factMax + 1));
    expect(Array.from(emoji.text)).toHaveLength(L.factMax);
    expect(emoji.text.endsWith('🍜')).toBe(true);
    expect(twinAskMemoryDraft('   ')).toEqual({ topic: null, text: '' });
  });

  it('checks the entry with the server\'s rules and marks where it came from', () => {
    expect(twinAskMemoryEntry({ topic: 'food', text: ` ${WORDS} ` })).toEqual({ ok: true, value: { topic: 'food', text: WORDS, source: 'memory' } });
    expect(twinAskMemoryEntry({ topic: null, text: WORDS })).toMatchObject({ ok: false, field: 'fact.topic' });
    expect(twinAskMemoryEntry({ topic: 'food', text: '' })).toMatchObject({ ok: false, field: 'fact.text' });
    expect(twinAskMemoryEntry({ topic: 'food', text: '预算多少钱' })).toEqual({ ok: false, reasonCode: 'text_violation', field: 'fact.text' });
    expect(twinAskMemoryEntry({ topic: 'kids_school', text: '孩子叫王小明' })).toEqual({ ok: false, reasonCode: 'text_violation', field: 'fact.text' });
  });

  it('keeps the memory first, then saves the entry for friends', async () => {
    const s = steps();
    const result = await keepAndShareTwinAskMemory({ topic: 'food', text: ` ${WORDS} ` }, { keep: s.keep, addFact: s.addFact, facts: topicFacts('food', L.factsPerTopicMax - 1) });
    expect(result).toEqual({ kind: 'shared', fact: saved({ topic: 'food', text: WORDS }) });
    expect(s.order).toEqual(['keep', 'addFact']);
    expect(s.addFact.mock.calls).toEqual([[{ topic: 'food', text: WORDS, source: 'memory' }]]);
  });

  it('stops before keeping anything when the words or the topic would be refused', async () => {
    const cases: [string, Parameters<typeof keepAndShareTwinAskMemory>[0], ReturnType<typeof topicFacts> | null, string][] = [
      ['no topic', { topic: null, text: WORDS }, null, '请先选一个话题。'],
      ['money', { topic: 'food', text: '预算多少钱' }, null, '条目里不能有钱数、联系方式、链接、地址或孩子的名字。'],
      ['nothing written', { topic: 'food', text: '  ' }, null, '请先写下要告诉朋友的话。'],
      ['topic is full', { topic: 'food', text: WORDS }, topicFacts('food', L.factsPerTopicMax), TWIN_ASK_MEMORY_WORDS.full.zh],
      ['list is full', { topic: 'food', text: WORDS }, topicFacts('work', L.factsPerTopicMax).concat(topicFacts('home', L.factsPerTopicMax), topicFacts('travel', L.factsPerTopicMax)), TWIN_ASK_MEMORY_WORDS.full.zh],
    ];
    for (const [name, draft, facts, zh] of cases) {
      const s = steps();
      const result = await keepAndShareTwinAskMemory(draft, { keep: s.keep, addFact: s.addFact, facts });
      expect([name, result.kind, result.kind === 'invalid' ? result.words.zh : null]).toEqual([name, 'invalid', zh]);
      expect(s.order).toEqual([]);
    }
    // The entries could not be read: the server still has the last word on the limits.
    const unread = steps();
    await expect(keepAndShareTwinAskMemory({ topic: 'food', text: WORDS }, { keep: unread.keep, addFact: unread.addFact, facts: null })).resolves.toMatchObject({ kind: 'shared' });
  });

  it('saves nothing for friends when the memory itself was not kept', async () => {
    for (const keep of [false, new Error('offline')]) {
      const s = steps({ keep });
      await expect(keepAndShareTwinAskMemory({ topic: 'food', text: WORDS }, s)).resolves.toEqual({ kind: 'not_kept' });
      expect(s.order).toEqual(['keep']);
    }
  });

  it('leaves the memory kept when the entry fails, and tries only the entry again', async () => {
    const failing = steps({ addFact: new TwinAskError('facts_full') });
    const result = await keepAndShareTwinAskMemory({ topic: 'food', text: WORDS }, failing);
    expect(result).toEqual({ kind: 'entry_failed', entry: { topic: 'food', text: WORDS, source: 'memory' }, words: TWIN_ASK_FAILURE_COPY.facts_full });
    expect(failing.order).toEqual(['keep', 'addFact']);

    const again = steps();
    // The owner moved it to another topic and shortened it before trying again.
    await expect(retryTwinAskMemoryEntry({ topic: 'local_services', text: '楼下那家拉面好吃' }, again)).resolves.toMatchObject({ kind: 'shared', fact: { topic: 'local_services', source: 'memory' } });
    expect(again.order).toEqual(['addFact']);
    expect(again.addFact.mock.calls).toEqual([[{ topic: 'local_services', text: '楼下那家拉面好吃', source: 'memory' }]]);

    const stillWrong = steps();
    await expect(retryTwinAskMemoryEntry({ topic: 'food', text: '预算多少钱' }, stillWrong)).resolves.toMatchObject({ kind: 'invalid' });
    await expect(retryTwinAskMemoryEntry({ topic: 'food', text: WORDS }, { addFact: stillWrong.addFact, facts: topicFacts('food', L.factsPerTopicMax) })).resolves.toEqual({ kind: 'invalid', words: TWIN_ASK_MEMORY_WORDS.full });
    expect(stillWrong.order).toEqual([]);

    const offline = steps({ addFact: new Error('offline') });
    await expect(retryTwinAskMemoryEntry({ topic: 'food', text: WORDS }, offline)).resolves.toMatchObject({ kind: 'entry_failed', words: TWIN_ASK_FAILURE_COPY.unavailable });
  });

  it('has Chinese and English words for every line the card shows', () => {
    const words = Object.values(TWIN_ASK_MEMORY_WORDS);
    expect(words).toHaveLength(11);
    for (const copy of words) {
      expect(copy.en.length).toBeGreaterThan(0);
      expect(copy.zh).toMatch(CJK);
    }
    expect(TWIN_ASK_MEMORY_WORDS.tick.zh).toBe('也可以告诉朋友');
  });
});
