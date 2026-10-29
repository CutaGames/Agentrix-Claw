/**
 * L8 1b A2 on desktop: the owner's inbox of memory the Agent wants to keep (`shared/client/memory-proposals.ts`).
 * Off unless the build sets VITE_MEMORY_PROPOSALS_ENABLED to exactly 1 (desktop's existing `VITE_*_ENABLED` naming);
 * while the server switch is off the routes answer 404 and the panel shows nothing.
 */
import { createMemoryProposalsClientV1, type MemoryProposalsClientV1 } from "../../../shared/client/memory-proposals";
import type { HttpResponseV1, HttpTransportV1 } from "../../../shared/client/transport";

export function memoryProposalsEnabled(env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>): boolean {
  return env.VITE_MEMORY_PROPOSALS_ENABLED === "1";
}

export interface DesktopMemoryProposalsDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  apiBase: string;
  token: () => string | null | undefined;
}

/** `fetch` as the shared client's transport. A non-JSON or empty body is `undefined`; non-2xx is returned, not thrown. */
export function desktopMemoryProposalsTransport(fetchFn: DesktopMemoryProposalsDeps["fetch"]): HttpTransportV1 {
  return {
    async request(req): Promise<HttpResponseV1> {
      const headers: Record<string, string> = { ...(req.headers ?? {}) };
      if (req.body !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetchFn(req.path, {
        method: req.method,
        headers,
        ...(req.body === undefined ? {} : { body: JSON.stringify(req.body) }),
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      return { status: response.status, headers: {}, body };
    },
  };
}

export function createDesktopMemoryProposalsClient(deps: DesktopMemoryProposalsDeps): MemoryProposalsClientV1 {
  return createMemoryProposalsClientV1({ transport: desktopMemoryProposalsTransport(deps.fetch), baseUrl: deps.apiBase, token: deps.token });
}
