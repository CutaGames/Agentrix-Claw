/**
 * Greeting Card client — per docs §6.2.
 */
import { apiFetch } from './api';

export interface GreetingTemplate {
  key: string;
  label_zh: string;
  label_en: string;
  category: 'holiday' | 'milestone' | 'casual' | 'emotion';
  premium: boolean;
  axp_cost: number;
  asset_key: string;
}

export interface GreetingCardView {
  id: string;
  sender_id: string;
  sender_pet_id: string;
  receiver_id: string | null;
  receiver_hint: string | null;
  token: string;
  template: string;
  message: string | null;
  axp_cost: number;
  axp_reward: number;
  status: 'sent' | 'delivered' | 'opened' | 'redeemed' | 'expired';
  opened_at: number | null;
  redeemed_at: number | null;
  reply_card_id: string | null;
  created_at: number;
  share_url: string;
}

export async function fetchGreetingCatalog(): Promise<{
  templates: GreetingTemplate[];
}> {
  return apiFetch('/v1/pet/greeting/catalog');
}

export async function sendGreetingCard(input: {
  sender_pet_id: string;
  receiver_id?: string;
  receiver_hint?: string;
  template: string;
  message?: string;
}): Promise<GreetingCardView> {
  return apiFetch('/v1/pet/greeting/send', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchGreetingInbox(limit = 20): Promise<{
  items: GreetingCardView[];
}> {
  return apiFetch(`/v1/pet/greeting/inbox?limit=${limit}`);
}

export async function fetchGreetingOutbox(limit = 20): Promise<{
  items: GreetingCardView[];
}> {
  return apiFetch(`/v1/pet/greeting/outbox?limit=${limit}`);
}

export async function peekGreetingCard(token: string): Promise<GreetingCardView> {
  return apiFetch(`/v1/pet/greeting/by-token/${token}`);
}

export async function openGreetingCard(
  token: string,
): Promise<GreetingCardView> {
  return apiFetch(`/v1/pet/greeting/by-token/${token}/open`, { method: 'POST' });
}

export async function redeemGreetingCard(
  token: string,
): Promise<{ already: boolean; axp_awarded: number }> {
  return apiFetch(`/v1/pet/greeting/by-token/${token}/redeem`, { method: 'POST' });
}
