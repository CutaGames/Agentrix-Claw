/**
 * Co-Raising client — per docs §6.1.
 */
import { apiFetch } from './api';

export interface CoRaisingInviteView {
  id: string;
  inviter_id: string;
  agent_account_id: string;
  token: string;
  split_bps: number;
  max_feeders: number;
  feeders_count: number;
  total_feeds: number;
  status: 'active' | 'paused' | 'cancelled' | 'expired';
  expires_at: number | null;
  created_at: number;
  share_url: string;
}

export interface CoRaisingPeekView {
  token: string;
  agent_account_id: string;
  split_bps: number;
  feeders_count: number;
  total_feeds: number;
  status: string;
  expires_at: number | null;
}

export async function createCoRaisingInvite(input: {
  agent_account_id: string;
  split_bps?: number;
  max_feeders?: number;
  expires_days?: number;
  metadata?: Record<string, unknown>;
}): Promise<CoRaisingInviteView> {
  return apiFetch('/v1/pet/coraising/invites', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listMyCoRaisingInvites(limit = 20): Promise<{
  items: CoRaisingInviteView[];
}> {
  return apiFetch(`/v1/pet/coraising/invites?limit=${limit}`);
}

export async function cancelCoRaisingInvite(
  inviteId: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/v1/pet/coraising/invites/${inviteId}`, { method: 'DELETE' });
}

export async function peekCoRaisingInvite(token: string): Promise<CoRaisingPeekView> {
  return apiFetch(`/v1/pet/coraising/invites/by-token/${token}`);
}

export async function feedCoRaisingPet(input: {
  token: string;
  kind?: string;
}): Promise<{ energy_given: number; axp_awarded: number; pet_total_feeds: number }> {
  return apiFetch('/v1/pet/coraising/feed', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
