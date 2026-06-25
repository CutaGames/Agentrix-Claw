import { EventEmitter } from 'events';

export const DESKTOP_SYNC_EVENT = 'desktop-sync:event';

export interface DesktopSyncEventEnvelope {
  userId: string;
  event: string;
  payload: unknown;
}

export const desktopSyncEventBus = new EventEmitter();

export function emitDesktopSyncEvent(userId: string, event: string, payload: unknown) {
  desktopSyncEventBus.emit(DESKTOP_SYNC_EVENT, {
    userId,
    event,
    payload,
  } satisfies DesktopSyncEventEnvelope);
}