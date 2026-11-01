/**
 * Pet Presence — transport-agnostic typed subscriber (P0-2)
 *
 * 三端 (Web / Mobile / Desktop) 共用本 helper：把任意 socket.io 兼容的
 * Socket-like 对象 + 强类型 handler map 转成订阅句柄。这样新增/重命名
 * topic 时，TypeScript 会强制三端同步更新，不再各写一份硬编码字符串。
 *
 * 配套：shared/types/pet-presence.ts 定义 PET_PRESENCE_TOPICS + 各 payload。
 */

import {
  PET_PRESENCE_TOPIC_LIST,
  type PetPresenceEventMap,
  type PetPresenceTopic,
} from '../types/pet-presence';

/** Minimal Socket-like surface shared by socket.io-client across all platforms. */
export interface PetPresenceSocketLike {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener?: (...args: unknown[]) => void): unknown;
}

export type PetPresenceHandlers = Partial<{
  [K in PetPresenceTopic]: (payload: PetPresenceEventMap[K]) => void;
}> & {
  /** Wildcard hook — fired on any pet presence event (after specific handler). */
  onAny?: (event: PetPresenceTopic, payload: unknown) => void;
};

/**
 * Subscribe a Socket-like client to all pet presence topics with type-checked
 * handlers. Returns an `unsubscribe()` to detach all listeners atomically.
 *
 *   const unsub = subscribePetPresence(socket, {
 *     'presence:pet.state': (s) => updatePet(s),
 *     'presence:pet.energy': (e) => setEnergy(e),
 *   });
 */
export function subscribePetPresence(
  socket: PetPresenceSocketLike,
  handlers: PetPresenceHandlers,
): () => void {
  const bound: Array<{ event: string; fn: (...args: unknown[]) => void }> = [];

  for (const topic of PET_PRESENCE_TOPIC_LIST) {
    const handler = (handlers as Record<string, ((p: unknown) => void) | undefined>)[topic];
    if (!handler && !handlers.onAny) continue;
    const fn = (...args: unknown[]) => {
      const payload = args[0];
      try {
        handler?.(payload as never);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[petPresence] handler ${topic} threw:`, e);
      }
      try {
        handlers.onAny?.(topic, payload);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[petPresence] onAny threw on ${topic}:`, e);
      }
    };
    socket.on(topic, fn);
    bound.push({ event: topic, fn });
  }

  return () => {
    for (const { event, fn } of bound) {
      try {
        socket.off(event, fn);
      } catch {
        /* no-op */
      }
    }
    bound.length = 0;
  };
}
