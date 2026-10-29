/**
 * L8 2nd batch A8 on the phone: "export all my data" (`shared/client/account-export.ts`).
 * Off unless EXPO_PUBLIC_ACCOUNT_EXPORT=1; while the server switch is off the route answers 404 and the card renders
 * nothing. The transport and token are injected, so there is no React Native import here.
 */
import { createAccountExportClientV2, type AccountExportClientV2 } from '../../shared/client/account-export';
import type { HttpTransportV1 } from '../../shared/client/transport';

export function accountExportEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const ACCOUNT_EXPORT_ENABLED = accountExportEnabled(process.env.EXPO_PUBLIC_ACCOUNT_EXPORT);

export function createMobileAccountExportClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}): AccountExportClientV2 {
  return createAccountExportClientV2({ ...deps, headers: { 'X-Agentrix-Surface': 'mobile' } });
}
