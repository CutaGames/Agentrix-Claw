/**
 * Co-Raising API client (Web) — shares backend with Mobile.
 * Per docs/MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 §6.1
 * + docs/WEB_REFACTOR_PLAN_2026-05 §6.
 */

import axios from 'axios';
import { API_BASE_URL } from '../../utils/api-config';

const http = axios.create({ baseURL: API_BASE_URL, withCredentials: true });

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
  pet_name?: string;
  pet_level?: number;
  pet_emotion?: string;
  pet_energy?: number;
  inviter_name?: string;
}

export interface CreateInviteInput {
  agent_account_id: string;
  split_bps?: number;
  max_feeders?: number;
  expires_days?: number;
  metadata?: Record<string, unknown>;
}

export interface FeedResult {
  energy_given: number;
  axp_awarded: number;
  pet_total_feeds: number;
}

export const coRaisingApi = {
  /** Owner creates a new invite link tied to a pet agent. */
  createInvite: (input: CreateInviteInput) =>
    http.post<CoRaisingInviteView>('/api/v1/pet/coraising/invites', input).then((r) => r.data),

  /** Owner lists their own invites. */
  listMyInvites: (limit = 20) =>
    http
      .get<{ items: CoRaisingInviteView[] }>(`/api/v1/pet/coraising/invites`, { params: { limit } })
      .then((r) => r.data),

  /** Owner cancels an active invite. */
  cancelInvite: (inviteId: string) =>
    http.delete<{ ok: boolean }>(`/api/v1/pet/coraising/invites/${inviteId}`).then((r) => r.data),

  /** Public peek by share token (no auth required). */
  peekByToken: (token: string) =>
    http.get<CoRaisingPeekView>(`/api/v1/pet/coraising/invites/by-token/${token}`).then((r) => r.data),

  /** Authenticated feed action — called from the landing page. */
  feed: (input: { token: string; kind?: string }) =>
    http.post<FeedResult>('/api/v1/pet/coraising/feed', input).then((r) => r.data),
};
