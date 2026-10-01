/**
 * BYO Subscription Providers V1 — wire contract for the server-side provider
 * authorization flows (`/ai-providers/auth/*`) and the secret-free description
 * of an OAuth-obtained credential (`user_provider_configs.metadata.auth`).
 *
 * Consumed by the backend (`ai-provider/provider-auth/**`), the web settings
 * page (`frontend/lib/api/ai-providers.api.ts`) and the desktop / mobile
 * settings surfaces. Nothing in this file ever carries a token: access and
 * refresh tokens stay encrypted on the server and are exchanged, refreshed and
 * used there only.
 */

/** Ways a BYO credential can be obtained through a server-side authorization flow. */
export const BYO_AUTH_MODES = ["codex_oauth"] as const;
export type ByoAuthMode = (typeof BYO_AUTH_MODES)[number];

/** Authorization flow kinds a provider can offer; today identical to the auth modes. */
export type ProviderAuthFlowKind = ByoAuthMode;

/** One rolling usage window as reported by the upstream (e.g. Codex 5h primary / 7d secondary). */
export interface ByoQuotaWindowV1 {
  /** 0–100, share of the window already consumed. */
  usedPercent?: number;
  /** ISO timestamp at which the window resets. */
  resetAt?: string;
  /** Length of the window in seconds (18000 = 5h, 604800 = 7d). */
  windowSeconds?: number;
}

/**
 * Secret-free description of how a BYO credential was obtained. Lives under
 * `user_provider_configs.metadata.auth`. Everything here is safe to return to
 * the owning user; nothing here can be used to call the upstream.
 */
export interface ByoOAuthCredentialMeta {
  mode: ByoAuthMode;
  /** Upstream account reference (e.g. ChatGPT `chatgpt_account_id`). Needed as a request header; not a secret. */
  accountRef: string;
  planType?: string;
  emailMasked?: string;
  obtainedAt: string;
  /** Last successful refresh, if any. */
  refreshedAt?: string;
  /** Models the upstream manifest reported for this account at connect/refresh time (ids only, capped). */
  probedModels?: string[];
  probedAt?: string;
  /** Provider-specific rolling windows keyed `primary` / `secondary` (Codex: 5h / 7d). */
  quotaWindows?: Record<string, ByoQuotaWindowV1>;
  /** Monotonic counter bumped every time the stored tokens change. */
  tokenVersion: number;
}

/** `GET /ai-providers/auth/flows` */
export interface ProviderAuthFlowsResult {
  /** `byoProviderAuthFlows` flag; while false every start / complete / refresh call is refused (403). */
  enabled: boolean;
  /** providerId → flow kind, for every provider that offers a server-side authorization flow. */
  flows: Record<string, ProviderAuthFlowKind>;
}

/** `POST /ai-providers/auth/:providerId/start` */
export interface ProviderAuthStartResult {
  sessionId: string;
  providerId: string;
  flow: ProviderAuthFlowKind;
  /** Provider login page; the browser only ever opens this URL. */
  authorizationUrl: string;
  /** Loopback redirect the provider sends the one-time code to; the user pastes that URL back. */
  redirectUri: string;
  expiresAt: string;
  /** Plain-language steps the client shows next to the button; no secrets. */
  instructions: string[];
}

export type ProviderAuthProbeOutcome = "ok" | "needs_reauth" | "unknown";

/** `POST /ai-providers/auth/complete` */
export interface ProviderAuthCompleteResult {
  providerId: string;
  configId: string;
  selectedModel: string;
  auth: ByoOAuthCredentialMeta;
  /** Results of the connect-time probes against the real upstream. */
  probe: {
    models: { ok: boolean; count: number; authOutcome: ProviderAuthProbeOutcome };
    usage: { ok: boolean; authOutcome: ProviderAuthProbeOutcome };
  };
}

/** `POST /ai-providers/auth/:providerId/refresh` */
export interface ProviderAuthRefreshResult {
  providerId: string;
  refreshed: boolean;
  outcome: "ok" | "needs_reauth" | "upstream_unavailable";
  expiresAt?: string;
  tokenVersion?: number;
}

/** `GET /ai-providers/auth/:providerId/status` */
export interface ProviderAuthStatus {
  providerId: string;
  connected: boolean;
  auth: ByoOAuthCredentialMeta | null;
  health: { refreshState: string; expiresAt?: string; lastAuthFailureAt?: string } | null;
  /** True once the chat adapter for this credential kind is enabled. */
  dispatchReady: boolean;
}

/** `POST /ai-providers/configs/:providerId/active` */
export interface ProviderConfigActiveResult {
  id: string;
  providerId: string;
  isActive: boolean;
}
