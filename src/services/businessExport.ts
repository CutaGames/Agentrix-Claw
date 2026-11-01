/**
 * L9 P2-7 on the phone: "take your business data with you" (`shared/client/account-export-business.ts`).
 * Off unless EXPO_PUBLIC_ACCOUNT_EXPORT_BUSINESS_V1=1, and only next to the full export (EXPO_PUBLIC_ACCOUNT_EXPORT=1).
 * The card asks the L9 list first (`GET /l9/cohort/me`) and draws nothing outside it; a 404 from the export routes
 * (a server switch off) makes it disappear too. The transport and token are injected, so there is no React Native
 * import here.
 */
import { createBusinessExportClientV1, type BusinessExportClientV1 } from '../../shared/client/account-export-business';
import { readL9CohortGateV1, type L9CohortGateResultV1 } from '../../shared/client/l9-cohort';
import type { HttpTransportV1 } from '../../shared/client/transport';

export function businessExportEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const BUSINESS_EXPORT_ENABLED = businessExportEnabled(process.env.EXPO_PUBLIC_ACCOUNT_EXPORT_BUSINESS_V1);

const MOBILE_SURFACE = { 'X-Agentrix-Surface': 'mobile' } as const;

export interface MobileBusinessExportDeps {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}

export function createMobileBusinessExportClient(deps: MobileBusinessExportDeps): BusinessExportClientV1 {
  return createBusinessExportClientV1({ ...deps, headers: { ...MOBILE_SURFACE } });
}

export function readMobileL9Cohort(deps: MobileBusinessExportDeps): Promise<L9CohortGateResultV1> {
  return readL9CohortGateV1({ ...deps, headers: { ...MOBILE_SURFACE } });
}
