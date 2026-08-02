/**
 * Messaging client — Sprint E6.
 *
 * Binds the existing `/messaging/*` backend endpoints so Plaza · Messaging
 * can show real DM conversations. Replaces 4 legacy DM screens that were
 * pointing at the wrong path prefix (`/social/dm/*`).
 */
import { apiFetch } from './api';

export interface Conversation {
  partner_id: string;
  partner_name: string;
  partner_avatar?: string | null;
  last_message: string;
  last_message_at: number;
  unread_count: number;
}

export interface DmMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  attachments?: Array<{ url?: string; publicUrl?: string; originalName?: string; mimetype?: string }>;
  read_at?: number | null;
  created_at: number;
}

export interface DmPage {
  items: DmMessage[];
  total: number;
  has_more: boolean;
  page: number;
}

export async function listConversations(): Promise<{ items: Conversation[] }> {
  return apiFetch('/messaging/conversations');
}

export async function fetchDmMessages(
  partnerId: string,
  page = 1,
  limit = 30,
): Promise<DmPage> {
  return apiFetch(`/messaging/dm/${partnerId}?page=${page}&limit=${limit}`);
}

export async function sendDm(
  receiverId: string,
  body: string,
  attachments?: DmMessage['attachments'],
): Promise<DmMessage> {
  return apiFetch(`/messaging/dm/${receiverId}`, {
    method: 'POST',
    body: JSON.stringify({ body, attachments: attachments ?? [] }),
  });
}

export async function markConversationRead(partnerId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/messaging/dm/${partnerId}/read`, { method: 'PATCH' });
}

export async function fetchUnreadDmCount(): Promise<{ count: number }> {
  return apiFetch('/messaging/unread-count');
}
