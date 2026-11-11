/**
 * L8 2nd batch A8 on desktop: "export all my data" (`shared/client/account-export.ts`).
 * Off unless the build sets VITE_ACCOUNT_EXPORT_ENABLED to exactly 1 (desktop's existing `VITE_*_ENABLED` naming);
 * while the server switch is off the route answers 404 and the section shows nothing.
 */
import { createAccountExportClientV2, type AccountExportClientV2 } from "../../../shared/client/account-export";
import { desktopMemoryProposalsTransport, type DesktopMemoryProposalsDeps } from "./memoryProposals";

export function accountExportEnabled(env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>): boolean {
  return env.VITE_ACCOUNT_EXPORT_ENABLED === "1";
}

/** Same `fetch` seam as the other shared clients: a non-JSON or empty body is `undefined`, non-2xx is returned, not thrown. */
export function createDesktopAccountExportClient(deps: DesktopMemoryProposalsDeps): AccountExportClientV2 {
  return createAccountExportClientV2({ transport: desktopMemoryProposalsTransport(deps.fetch), baseUrl: deps.apiBase, token: deps.token });
}
