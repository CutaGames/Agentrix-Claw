/**
 * L9 P2-7 on desktop: "take your business data with you" (`shared/client/account-export-business.ts`).
 * Off unless the build sets VITE_ACCOUNT_EXPORT_BUSINESS_V1_ENABLED to exactly 1 (desktop's existing `VITE_*_ENABLED`
 * naming), and only next to the full export (VITE_ACCOUNT_EXPORT_ENABLED=1). The section asks the L9 list first
 * (`GET /l9/cohort/me`) and shows nothing outside it; a 404 from the export routes (a server switch off) hides it too.
 */
import { createBusinessExportClientV1, type BusinessExportClientV1 } from "../../../shared/client/account-export-business";
import { readL9CohortGateV1, type L9CohortGateResultV1 } from "../../../shared/client/l9-cohort";
import { desktopMemoryProposalsTransport, type DesktopMemoryProposalsDeps } from "./memoryProposals";

export function businessExportEnabled(env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>): boolean {
  return env.VITE_ACCOUNT_EXPORT_BUSINESS_V1_ENABLED === "1";
}

/** Same `fetch` seam as the other shared clients: a non-JSON or empty body is `undefined`, non-2xx is returned, not thrown. */
export function createDesktopBusinessExportClient(deps: DesktopMemoryProposalsDeps): BusinessExportClientV1 {
  return createBusinessExportClientV1({ transport: desktopMemoryProposalsTransport(deps.fetch), baseUrl: deps.apiBase, token: deps.token });
}

export function readDesktopL9Cohort(deps: DesktopMemoryProposalsDeps): Promise<L9CohortGateResultV1> {
  return readL9CohortGateV1({ transport: desktopMemoryProposalsTransport(deps.fetch), baseUrl: deps.apiBase, token: deps.token });
}
