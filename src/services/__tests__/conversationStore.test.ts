/**
 * Unit tests for the P-9 Sprint Q2 conversationStore (T5.2 / T5.4).
 *
 * Pure-Node jest. conversationStore.ts has zero react-native imports — it's
 * a plain pub/sub module — so it runs without the RN runtime.
 */
import {
  getConversationSnapshot,
  publishConversation,
  clearConversation,
  subscribeConversation,
  setPendingPrefill,
  consumePendingPrefill,
  _resetConversationStoreForTests,
  type ConversationSnapshot,
} from '../conversationStore';

function baseSnapshot(
  over: Partial<Omit<ConversationSnapshot, 'version'>> = {},
): Omit<ConversationSnapshot, 'version'> {
  return {
    sessionId: 's1',
    agentName: 'Aira',
    routing: 'cloud',
    busy: false,
    messages: [],
    ...over,
  };
}

describe('conversationStore', () => {
  beforeEach(() => {
    _resetConversationStoreForTests();
  });

  it('starts empty', () => {
    const snap = getConversationSnapshot();
    expect(snap.messages).toEqual([]);
    expect(snap.sessionId).toBeNull();
    expect(snap.routing).toBe('cloud');
    expect(snap.busy).toBe(false);
  });

  it('publish updates the snapshot and bumps version', () => {
    const v0 = getConversationSnapshot().version;
    publishConversation(
      baseSnapshot({
        messages: [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 }],
      }),
    );
    const snap = getConversationSnapshot();
    expect(snap.version).toBe(v0 + 1);
    expect(snap.messages).toHaveLength(1);
    expect(snap.messages[0].content).toBe('hi');
  });

  it('trims to the most recent maxMessages', () => {
    const messages = Array.from({ length: 50 }, (_, i) => ({
      id: `m${i}`,
      role: 'user' as const,
      content: String(i),
      createdAt: i,
    }));
    publishConversation(baseSnapshot({ messages }), 40);
    const snap = getConversationSnapshot();
    expect(snap.messages).toHaveLength(40);
    // Kept the most recent 40 (10..49)
    expect(snap.messages[0].content).toBe('10');
    expect(snap.messages[snap.messages.length - 1].content).toBe('49');
  });

  it('notifies subscribers on publish and pushes current state on subscribe', () => {
    const received: ConversationSnapshot[] = [];
    const unsub = subscribeConversation((s) => received.push(s));
    // immediate push of current (empty) state
    expect(received).toHaveLength(1);

    publishConversation(baseSnapshot({ busy: true }));
    expect(received).toHaveLength(2);
    expect(received[1].busy).toBe(true);

    unsub();
    publishConversation(baseSnapshot({ busy: false }));
    expect(received).toHaveLength(2); // no more after unsubscribe
  });

  it('a throwing subscriber does not break publishing to others', () => {
    const good: number[] = [];
    subscribeConversation(() => {
      throw new Error('boom');
    });
    subscribeConversation((s) => good.push(s.version));
    expect(() => publishConversation(baseSnapshot())).not.toThrow();
    // good subscriber still received the publish
    expect(good.length).toBeGreaterThan(0);
  });

  it('clearConversation resets to empty and notifies', () => {
    publishConversation(
      baseSnapshot({
        messages: [{ id: 'm1', role: 'user', content: 'x', createdAt: 1 }],
      }),
    );
    clearConversation();
    const snap = getConversationSnapshot();
    expect(snap.messages).toEqual([]);
    expect(snap.sessionId).toBeNull();
  });

  it('pending prefill is consumed exactly once', () => {
    setPendingPrefill({ text: 'draft', autoVoice: true });
    const first = consumePendingPrefill();
    expect(first?.text).toBe('draft');
    expect(first?.autoVoice).toBe(true);
    // Second consume returns null (consumed-once semantics)
    expect(consumePendingPrefill()).toBeNull();
  });

  it('setPendingPrefill(null) clears any pending draft', () => {
    setPendingPrefill({ text: 'draft' });
    setPendingPrefill(null);
    expect(consumePendingPrefill()).toBeNull();
  });
});
