/**
 * L8 1b A2 on the phone: the owner's inbox of memory the Agent wants to keep (`shared/client/memory-proposals.ts`).
 * Off unless EXPO_PUBLIC_MEMORY_PROPOSALS=1; while the server switch is off the routes answer 404 and the card renders
 * nothing. The transport and token are injected, so there is no React Native import here.
 */
import { createMemoryProposalsClientV1, type MemoryProposalsClientV1 } from '../../shared/client/memory-proposals';
import type { HttpTransportV1 } from '../../shared/client/transport';

export function memoryProposalsEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const MEMORY_PROPOSALS_ENABLED = memoryProposalsEnabled(process.env.EXPO_PUBLIC_MEMORY_PROPOSALS);

export function createMobileMemoryProposalsClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}): MemoryProposalsClientV1 {
  return createMemoryProposalsClientV1({ ...deps, headers: { 'X-Agentrix-Surface': 'mobile' } });
}
