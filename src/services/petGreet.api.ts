/**
 * petGreet.api — mobile client for /v1/pet/greet
 *
 * Backed by P-9 wave 6 backend `pet-greet.controller.ts`. Returns one
 * short greeting line for the active pet of the authenticated user
 * across 5 scenarios (morning / evening / comeback / milestone / manual).
 */
import { apiFetch } from './api';

export type GreetScenario =
  | 'morning'
  | 'evening'
  | 'comeback'
  | 'milestone'
  | 'manual';

export interface GreetResponse {
  scenario: GreetScenario;
  lang: 'zh' | 'en';
  text: string;
  source: 'bedrock' | 'fallback';
  ttsUrl: string | null;
}

export async function fetchPetGreet(
  scenario: GreetScenario,
  lang: 'zh' | 'en' = 'zh',
): Promise<GreetResponse> {
  const url = `/v1/pet/greet?scenario=${encodeURIComponent(scenario)}&lang=${lang}`;
  return apiFetch<GreetResponse>(url);
}
