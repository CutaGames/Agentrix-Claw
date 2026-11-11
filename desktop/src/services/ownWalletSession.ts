/**
 * ownWalletSession — L8-6 S7 part 2: the Agent's own wallet, device session keys on this computer (design 1b (b) and (c),
 * W3.6). Default off.
 *
 * What this file is: the thin TypeScript side of `own_wallet_session.rs`. The session private key is made in Rust, kept in
 * the OS keychain and never leaves it; there is no function here that returns, imports or signs arbitrary bytes. What the
 * owner's screen can do:
 * - make a session key with the owner's own limits (the per-day limit stays on this computer),
 * - hand the session public key and the limits to the wallet origin through the URL FRAGMENT (`#ref=…&t=…&intent=…`,
 *   never in a request), where the wallet passkey signs the enabling,
 * - show the key fingerprint, which the wallet page shows too, so the owner can compare the two,
 * - after the owner signed: compute the permission id HERE from this key and the grant's public salt,
 * - answer the payments the cloud Agent asked for: the server's complete UserOp goes to Rust, which re-checks everything
 *   against this computer's own policy before the key signs (the server's hash and policy are never trusted),
 * - revoke (the key is deleted at once).
 *
 * The commands are the owner's screen only: the fence registry has none of them (a test checks that), so no chat tool,
 * remote channel or agent can call them. Nothing here starts by itself.
 */
import type { OwnWalletGrantSessionIntentV1 } from "../../../shared/types/agent-own-wallet";
import { pickFor } from "../i18n/pick";

export const OWN_WALLET_SESSION_COMMANDS = {
  get: "desktop_bridge_own_wallet_session_get",
  setEnabled: "desktop_bridge_own_wallet_session_set_enabled",
  create: "desktop_bridge_own_wallet_session_create",
  activate: "desktop_bridge_own_wallet_session_activate",
  revoke: "desktop_bridge_own_wallet_session_revoke",
  sign: "desktop_bridge_own_wallet_session_sign",
} as const;

export type OwnWalletSessionIntegrity = "empty" | "ok" | "tampered" | "key_unavailable" | "unknown";
export type OwnWalletSessionSlotStatus = "pending" | "active" | "revoked";

export interface OwnWalletSessionNativePolicy {
  payee: string;
  perTxWei: string;
  dailyWei: string;
  totalWei: string;
  maxCount: number;
}

export interface OwnWalletSessionTokenPolicy {
  payee: string;
  perTransfer: string;
  daily: string;
  total: string;
}

export interface OwnWalletSessionSlot {
  slotId: string;
  ownerUserId: string;
  deviceId: string;
  accountId: string;
  account: string;
  chainId: number;
  pubKeyX: string;
  pubKeyY: string;
  /** Four groups of four hex digits; the same text the wallet page shows. */
  fingerprint: string;
  permissionId: string | null;
  status: OwnWalletSessionSlotStatus;
  policy: { native?: OwnWalletSessionNativePolicy; token?: OwnWalletSessionTokenPolicy };
  createdAt: number;
  /** Unix seconds. */
  validUntil: number;
  expired: boolean;
  nativeUsedToday: string;
  tokenUsedToday: string;
}

/** One line of the local log: the outcome and a reason code only, never an address or an amount. */
export interface OwnWalletSessionLogEntry {
  at: number;
  requestRef: string;
  outcome: "signed" | "refused";
  reason: string;
}

export interface OwnWalletSessionView {
  enabled: boolean;
  integrity: OwnWalletSessionIntegrity;
  sessions: OwnWalletSessionSlot[];
  log: OwnWalletSessionLogEntry[];
}

export const UNKNOWN_OWN_WALLET_SESSION_VIEW: OwnWalletSessionView = { enabled: false, integrity: "unknown", sessions: [], log: [] };

/** What Rust returns for `create`, and what `POST /userops` takes as `params` of `grant_session`. No per-day limit here. */
export interface OwnWalletSessionGrantParams {
  deviceId: string;
  sessionPubKeyX: string;
  sessionPubKeyY: string;
  validUntil: number;
  native?: { payee: string; perTxWei: string; totalWei: string; maxCount: number };
  token?: { payee: string; perTransfer: string; total: string };
}

/** What the owner types on this computer (the per-day limits included). */
export interface OwnWalletSessionCreateInput {
  ownerUserId: string;
  deviceId: string;
  accountId: string;
  account: string;
  chainId: number;
  /** Unix seconds. */
  validUntil: number;
  native?: OwnWalletSessionNativePolicy;
  token?: OwnWalletSessionTokenPolicy;
}

export interface OwnWalletSessionSigned {
  signature: string;
  permissionId: string;
  userOpHash: string;
  kind: "native" | "token";
}

export type OwnWalletSessionResult<T> = { ok: true; value: T } | { ok: false; reason: string };

// ── Strict readers ───────────────────────────────────────────────────────────────────────────────────────────

const ADDRESS = /^0x[0-9a-f]{40}$/;
const WORD = /^0x[0-9a-f]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]{0,77})$/;
const FINGERPRINT = /^[0-9a-f]{4}( [0-9a-f]{4}){3}$/;
const IDENT = /^[A-Za-z0-9._:-]{1,64}$/;
const DEVICE_ID = /^[A-Za-z0-9._-]{1,64}$/;
const SLOT_ID = /^ows_[0-9a-f]{24}$/;
const REQUEST_REF = /^owr_[0-9a-f]{32}$/;
const WALLET_TOKEN = /^owt_[A-Za-z0-9_-]{43}$/;
const WALLET_ORIGIN = /^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REASON = /^[a-z][a-z0-9_]{0,63}$/;
const INTEGRITY: ReadonlySet<string> = new Set(["empty", "ok", "tampered", "key_unavailable"]);
const MAX_FRAGMENT = 4096;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const isText = (value: unknown, pattern: RegExp): value is string => typeof value === "string" && pattern.test(value);
const isInt = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);

function nativePolicyOf(raw: unknown): OwnWalletSessionNativePolicy | null {
  if (!isRecord(raw)) return null;
  const { payee, perTxWei, dailyWei, totalWei, maxCount } = raw;
  if (!isText(payee, ADDRESS) || !isText(perTxWei, DECIMAL) || !isText(dailyWei, DECIMAL) || !isText(totalWei, DECIMAL) || !isInt(maxCount)) return null;
  return { payee, perTxWei, dailyWei, totalWei, maxCount };
}

function tokenPolicyOf(raw: unknown): OwnWalletSessionTokenPolicy | null {
  if (!isRecord(raw)) return null;
  const { payee, perTransfer, daily, total } = raw;
  if (!isText(payee, ADDRESS) || !isText(perTransfer, DECIMAL) || !isText(daily, DECIMAL) || !isText(total, DECIMAL)) return null;
  return { payee, perTransfer, daily, total };
}

function slotOf(raw: unknown): OwnWalletSessionSlot | null {
  if (!isRecord(raw)) return null;
  const { slotId, ownerUserId, deviceId, accountId, account, chainId, pubKeyX, pubKeyY, fingerprint, permissionId, status, policy, createdAt, validUntil, expired, nativeUsedToday, tokenUsedToday } = raw;
  if (!isText(slotId, SLOT_ID) || !isText(ownerUserId, IDENT) || !isText(deviceId, IDENT) || !isText(accountId, IDENT) || !isText(account, ADDRESS)) return null;
  if (!isInt(chainId) || !isText(pubKeyX, WORD) || !isText(pubKeyY, WORD) || !isText(fingerprint, FINGERPRINT)) return null;
  let permission: string | null;
  if (permissionId === null) permission = null;
  else if (isText(permissionId, WORD)) permission = permissionId;
  else return null;
  if (status !== "pending" && status !== "active" && status !== "revoked") return null;
  if (!isRecord(policy) || !isInt(createdAt) || !isInt(validUntil) || typeof expired !== "boolean") return null;
  if (!isText(nativeUsedToday, DECIMAL) || !isText(tokenUsedToday, DECIMAL)) return null;
  const out: OwnWalletSessionSlot["policy"] = {};
  if (policy.native !== undefined && policy.native !== null) {
    const native = nativePolicyOf(policy.native);
    if (!native) return null;
    out.native = native;
  }
  if (policy.token !== undefined && policy.token !== null) {
    const token = tokenPolicyOf(policy.token);
    if (!token) return null;
    out.token = token;
  }
  return {
    slotId,
    ownerUserId,
    deviceId,
    accountId,
    account,
    chainId,
    pubKeyX,
    pubKeyY,
    fingerprint,
    permissionId: permission,
    status,
    policy: out,
    createdAt,
    validUntil,
    expired,
    nativeUsedToday,
    tokenUsedToday,
  };
}

function logEntryOf(raw: unknown): OwnWalletSessionLogEntry | null {
  if (!isRecord(raw)) return null;
  const { at, requestRef, outcome, reason } = raw;
  if (!isInt(at) || !isText(requestRef, IDENT) || (outcome !== "signed" && outcome !== "refused") || !isText(reason, REASON)) return null;
  return { at, requestRef, outcome, reason };
}

/** A view that does not read back as exactly what Rust writes is "unknown" (off, empty). Only a verified file can be on. */
export function normalizeOwnWalletSessionView(raw: unknown): OwnWalletSessionView {
  if (!isRecord(raw)) return { ...UNKNOWN_OWN_WALLET_SESSION_VIEW };
  const integrity = typeof raw.integrity === "string" && INTEGRITY.has(raw.integrity) ? (raw.integrity as OwnWalletSessionIntegrity) : "unknown";
  const sessions = (Array.isArray(raw.sessions) ? raw.sessions : []).flatMap((item): OwnWalletSessionSlot[] => {
    const slot = slotOf(item);
    return slot ? [slot] : [];
  });
  const log = (Array.isArray(raw.log) ? raw.log : []).flatMap((item): OwnWalletSessionLogEntry[] => {
    const entry = logEntryOf(item);
    return entry ? [entry] : [];
  });
  return { enabled: raw.enabled === true && integrity === "ok", integrity, sessions, log };
}

// ── The key fingerprint (shown here and on the wallet page) ─────────────────────────────────────────────────

/**
 * The first 8 bytes of sha256(0x04 ‖ x ‖ y) as four groups of four hex digits: `keyFingerprintV1` of the wallet origin.
 * Computed here again from the public key, so a fingerprint Rust handed over is never shown unchecked.
 */
export async function sessionFingerprintOf(pubKeyX: string, pubKeyY: string, subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle): Promise<string | null> {
  if (!WORD.test(pubKeyX.toLowerCase()) || !WORD.test(pubKeyY.toLowerCase()) || !subtle) return null;
  const bytes = new Uint8Array(65);
  bytes[0] = 4;
  const hex = pubKeyX.toLowerCase().slice(2) + pubKeyY.toLowerCase().slice(2);
  for (let i = 0; i < 64; i += 1) bytes[1 + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
  const text = Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
  return [0, 4, 8, 12].map((i) => text.slice(i, i + 4)).join(" ");
}

// ── The link to the wallet origin (URL fragment) ────────────────────────────────────────────────────────────

/** The grant parameters as the backend (`decodeSessionParamsV1`) and the wallet origin read them; `null` when they are not exactly that. */
export function grantParamsOf(raw: unknown): OwnWalletSessionGrantParams | null {
  if (!isRecord(raw)) return null;
  const allowed = ["deviceId", "sessionPubKeyX", "sessionPubKeyY", "validUntil", "native", "token"];
  if (Object.keys(raw).some((key) => !allowed.includes(key))) return null;
  const { deviceId, sessionPubKeyX, sessionPubKeyY, validUntil } = raw;
  if (!isText(deviceId, DEVICE_ID) || !isText(sessionPubKeyX, WORD) || !isText(sessionPubKeyY, WORD) || !isInt(validUntil)) return null;
  const out: OwnWalletSessionGrantParams = { deviceId, sessionPubKeyX, sessionPubKeyY, validUntil };
  if (raw.native !== undefined && raw.native !== null) {
    const n = raw.native;
    if (!isRecord(n) || Object.keys(n).some((key) => !["payee", "perTxWei", "totalWei", "maxCount"].includes(key))) return null;
    if (!isText(n.payee, ADDRESS) || !isText(n.perTxWei, DECIMAL) || !isText(n.totalWei, DECIMAL) || !isInt(n.maxCount)) return null;
    out.native = { payee: n.payee, perTxWei: n.perTxWei, totalWei: n.totalWei, maxCount: n.maxCount };
  }
  if (raw.token !== undefined && raw.token !== null) {
    const t = raw.token;
    if (!isRecord(t) || Object.keys(t).some((key) => !["payee", "perTransfer", "total"].includes(key))) return null;
    if (!isText(t.payee, ADDRESS) || !isText(t.perTransfer, DECIMAL) || !isText(t.total, DECIMAL)) return null;
    out.token = { payee: t.payee, perTransfer: t.perTransfer, total: t.total };
  }
  if (!out.native && !out.token) return null;
  return out;
}

/** The local intent I of `grant_session` (shared type). Keys in a fixed order; `agentId` only when given and a UUID. */
export function grantSessionIntentOf(agentId: string | undefined, params: OwnWalletSessionGrantParams): OwnWalletGrantSessionIntentV1 | null {
  const checked = grantParamsOf(params);
  if (!checked) return null;
  if (agentId !== undefined && !isText(agentId, UUID)) return null;
  const intent: OwnWalletGrantSessionIntentV1 = {
    v: 1,
    purpose: "grant_session",
    ...(agentId !== undefined ? { agentId } : {}),
    deviceId: checked.deviceId,
    sessionPubKeyX: checked.sessionPubKeyX,
    sessionPubKeyY: checked.sessionPubKeyY,
    validUntil: checked.validUntil,
    ...(checked.native ? { native: checked.native } : {}),
    ...(checked.token ? { token: checked.token } : {}),
  };
  return intent;
}

function textToBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * `${walletOrigin}/wallet/approve/#ref=<requestRef>&t=<walletToken>&intent=<base64url(JSON)>`: the same shape as the main
 * site's `walletApproveUrlV1`. The key, the limits and the token travel only in the fragment, which is never sent in a
 * request and never in a Referer. `null` when anything is not exactly the expected form (https origin only).
 */
export function walletGrantSessionUrl(walletOrigin: string, requestRef: string, walletToken: string, intent: OwnWalletGrantSessionIntentV1): string | null {
  if (!isText(walletOrigin, WALLET_ORIGIN) || !isText(requestRef, REQUEST_REF) || !isText(walletToken, WALLET_TOKEN)) return null;
  const { v, purpose, agentId, ...params } = intent;
  if (v !== 1 || purpose !== "grant_session") return null;
  const checked = grantSessionIntentOf(agentId, params as OwnWalletSessionGrantParams);
  if (!checked) return null;
  const fragment = new URLSearchParams();
  fragment.set("ref", requestRef);
  fragment.set("t", walletToken);
  fragment.set("intent", textToBase64Url(JSON.stringify(checked)));
  const text = fragment.toString();
  return text.length > MAX_FRAGMENT ? null : `${walletOrigin}/wallet/approve/#${text}`;
}

// ── The native commands ──────────────────────────────────────────────────────────────────────────────────────

export type OwnWalletSessionInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function hasNativeHost(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__?.invoke);
}

async function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

function reasonOf(error: unknown): string {
  const text = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  return REASON.test(text) ? text : "invoke_failed";
}

async function call<T>(invoke: OwnWalletSessionInvoke | undefined, command: string, args?: Record<string, unknown>): Promise<OwnWalletSessionResult<T>> {
  if (!invoke && !hasNativeHost()) return { ok: false, reason: "no_native_host" };
  const run: OwnWalletSessionInvoke = invoke ?? invokeNative;
  try {
    return { ok: true, value: await run<T>(command, args) };
  } catch (error) {
    return { ok: false, reason: reasonOf(error) };
  }
}

export async function readOwnWalletSessions(invoke?: OwnWalletSessionInvoke): Promise<OwnWalletSessionView> {
  const res = await call<unknown>(invoke, OWN_WALLET_SESSION_COMMANDS.get);
  return res.ok ? normalizeOwnWalletSessionView(res.value) : { ...UNKNOWN_OWN_WALLET_SESSION_VIEW };
}

export async function setOwnWalletSessionsEnabled(enabled: boolean, invoke?: OwnWalletSessionInvoke): Promise<OwnWalletSessionResult<OwnWalletSessionView>> {
  const res = await call<unknown>(invoke, OWN_WALLET_SESSION_COMMANDS.setEnabled, { enabled });
  return res.ok ? { ok: true, value: normalizeOwnWalletSessionView(res.value) } : res;
}

export interface OwnWalletSessionCreated {
  slotId: string;
  fingerprint: string;
  grantParams: OwnWalletSessionGrantParams;
}

/**
 * Makes the key and a pending session. The fingerprint Rust returns must equal the one computed here from the public
 * key in the grant parameters; if not, the new session is revoked again and nothing is shown.
 */
export async function createOwnWalletSession(
  input: OwnWalletSessionCreateInput,
  invoke?: OwnWalletSessionInvoke,
  subtle?: SubtleCrypto,
): Promise<OwnWalletSessionResult<OwnWalletSessionCreated>> {
  const res = await call<unknown>(invoke, OWN_WALLET_SESSION_COMMANDS.create, { input });
  if (!res.ok) return res;
  const raw = res.value;
  const slotId = isRecord(raw) ? raw.slotId : undefined;
  if (!isRecord(raw) || !isText(slotId, SLOT_ID) || !isText(raw.fingerprint, FINGERPRINT)) return { ok: false, reason: "response_malformed" };
  const params = grantParamsOf(raw.grantParams);
  if (!params) {
    await revokeOwnWalletSession(slotId, invoke);
    return { ok: false, reason: "response_malformed" };
  }
  const local = await sessionFingerprintOf(params.sessionPubKeyX, params.sessionPubKeyY, subtle);
  if (local === null || local !== raw.fingerprint) {
    await revokeOwnWalletSession(slotId, invoke);
    return { ok: false, reason: "fingerprint_mismatch" };
  }
  return { ok: true, value: { slotId, fingerprint: local, grantParams: params } };
}

/** The owner enabled it on the wallet origin. Rust computes the permission id from its own key and the salt. */
export async function activateOwnWalletSession(slotId: string, salt: string, permissionId?: string | null, invoke?: OwnWalletSessionInvoke): Promise<OwnWalletSessionResult<string>> {
  if (!isText(slotId, SLOT_ID) || !isText(salt, WORD)) return { ok: false, reason: "input_invalid" };
  if (permissionId !== undefined && permissionId !== null && !isText(permissionId, WORD)) return { ok: false, reason: "input_invalid" };
  const res = await call<unknown>(invoke, OWN_WALLET_SESSION_COMMANDS.activate, { slotId, salt, permissionId: permissionId ?? null });
  if (!res.ok) return res;
  return isText(res.value, WORD) ? { ok: true, value: res.value } : { ok: false, reason: "response_malformed" };
}

/** Stops signing for this session for good; `value` says whether the key is gone from the keychain. */
export async function revokeOwnWalletSession(slotId: string, invoke?: OwnWalletSessionInvoke): Promise<OwnWalletSessionResult<boolean>> {
  if (!isText(slotId, SLOT_ID)) return { ok: false, reason: "input_invalid" };
  const res = await call<unknown>(invoke, OWN_WALLET_SESSION_COMMANDS.revoke, { slotId });
  if (!res.ok) return res;
  return typeof res.value === "boolean" ? { ok: true, value: res.value } : { ok: false, reason: "response_malformed" };
}

// ── A payment the cloud Agent asked for ─────────────────────────────────────────────────────────────────────

const USER_OP_KEYS = [
  "sender", "nonce", "factory", "factoryData", "callData", "callGasLimit", "verificationGasLimit", "preVerificationGas", "maxFeePerGas",
  "maxPriorityFeePerGas", "paymaster", "paymasterVerificationGasLimit", "paymasterPostOpGasLimit", "paymasterData", "signature",
] as const;
const NULLABLE_USER_OP_KEYS: readonly string[] = ["factory", "paymaster"];

/** What Rust takes (`SignRequest`): the server's request without `grantId` and `expiresAt`, plus the owner signed in here. */
export interface OwnWalletSessionSignRequest {
  ownerUserId: string;
  requestRef: string;
  permissionId: string;
  chainId: number;
  entryPoint: string;
  userOp: Record<(typeof USER_OP_KEYS)[number], string | null>;
  userOpHash: string;
}

/** `null` when the server's request is not exactly the form (unknown or missing fields, wrong types): it is never passed on. */
export function signRequestOf(ownerUserId: string, raw: unknown): OwnWalletSessionSignRequest | null {
  if (!isText(ownerUserId, IDENT) || !isRecord(raw)) return null;
  const { requestRef, permissionId, chainId, entryPoint, userOp, userOpHash } = raw;
  if (!isText(requestRef, IDENT) || !isText(permissionId, WORD) || !isInt(chainId) || typeof entryPoint !== "string" || !isText(userOpHash, WORD)) return null;
  if (!isRecord(userOp)) return null;
  const keys = Object.keys(userOp);
  if (keys.length !== USER_OP_KEYS.length || keys.some((key) => !(USER_OP_KEYS as readonly string[]).includes(key))) return null;
  const copy = {} as OwnWalletSessionSignRequest["userOp"];
  for (const key of USER_OP_KEYS) {
    const value = userOp[key];
    if (typeof value === "string" || (value === null && NULLABLE_USER_OP_KEYS.includes(key))) copy[key] = value;
    else return null;
  }
  return { ownerUserId, requestRef, permissionId, chainId, entryPoint, userOp: copy, userOpHash };
}

/** Rust checks the whole request against this computer's policy, signs only if everything holds, and logs the outcome. */
export async function signOwnWalletSessionRequest(ownerUserId: string, rawRequest: unknown, invoke?: OwnWalletSessionInvoke): Promise<OwnWalletSessionResult<OwnWalletSessionSigned>> {
  const request = signRequestOf(ownerUserId, rawRequest);
  if (!request) return { ok: false, reason: "request_malformed" };
  const res = await call<unknown>(invoke, OWN_WALLET_SESSION_COMMANDS.sign, { request });
  if (!res.ok) return res;
  const out = res.value;
  if (!isRecord(out) || !isText(out.signature, /^0x[0-9a-f]{128}$/) || !isText(out.permissionId, WORD) || !isText(out.userOpHash, WORD) || (out.kind !== "native" && out.kind !== "token")) {
    return { ok: false, reason: "response_malformed" };
  }
  return { ok: true, value: { signature: out.signature, permissionId: out.permissionId, userOpHash: out.userOpHash, kind: out.kind } };
}

// ── The server side (the owner is signed in on this computer) ───────────────────────────────────────────────

export interface OwnWalletSessionGrantView {
  id: string;
  accountId: string;
  deviceId: string;
  permissionId: string | null;
  salt: string | null;
  status: string;
}

export interface OwnWalletSessionApi {
  /** `POST /agent-own-wallet/userops` with purpose `grant_session`. */
  prepareGrant(input: { accountId: string; params: OwnWalletSessionGrantParams }): Promise<{ requestRef: string; walletToken: string; expiresAt: string }>;
  /** `GET /agent-own-wallet/sessions?accountId=`. */
  listGrants(accountId: string): Promise<OwnWalletSessionGrantView[]>;
  /** `GET /agent-own-wallet/sessions/requests?deviceId=`. */
  pendingRequests(deviceId: string): Promise<unknown[]>;
  /** `POST /agent-own-wallet/sessions/requests/:ref/signature`. */
  postSignature(requestRef: string, body: { permissionId: string; signature: string }): Promise<void>;
}

/** An API call that failed: the backend's `code` when it has one (`session_module_installed`, …), else `http_<status>`. */
export class OwnWalletSessionApiError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

export function httpOwnWalletSessionApi(deps: {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Includes the `/api` prefix. */
  apiBase: string;
  token: () => string | null | undefined;
}): OwnWalletSessionApi {
  const base = `${deps.apiBase.replace(/\/+$/, "")}/agent-own-wallet`;
  const send = async (method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> => {
    const token = deps.token();
    if (!token) throw new OwnWalletSessionApiError("no_session");
    let response: Response;
    try {
      response = await deps.fetch(`${base}${path}`, {
        method,
        headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new OwnWalletSessionApiError("network_unavailable");
    }
    const json: unknown = await response.json().catch(() => null);
    if (response.status < 200 || response.status >= 300) {
      const code = isRecord(json) ? json.code : undefined;
      throw new OwnWalletSessionApiError(typeof code === "string" && REASON.test(code) ? code : `http_${response.status}`);
    }
    return json;
  };
  return {
    async prepareGrant({ accountId, params }) {
      const out = await send("POST", "/userops", { purpose: "grant_session", accountId, params });
      if (!isRecord(out) || !isText(out.requestRef, REQUEST_REF) || !isText(out.walletToken, WALLET_TOKEN) || typeof out.expiresAt !== "string") {
        throw new OwnWalletSessionApiError("response_malformed");
      }
      return { requestRef: out.requestRef, walletToken: out.walletToken, expiresAt: out.expiresAt };
    },
    async listGrants(accountId) {
      const out = await send("GET", `/sessions?accountId=${encodeURIComponent(accountId)}`);
      const list = isRecord(out) && Array.isArray(out.grants) ? out.grants : null;
      if (!list) throw new OwnWalletSessionApiError("response_malformed");
      return list.flatMap((item): OwnWalletSessionGrantView[] => {
        if (!isRecord(item) || typeof item.id !== "string" || typeof item.accountId !== "string" || !isText(item.deviceId, DEVICE_ID) || typeof item.status !== "string") return [];
        return [
          {
            id: item.id,
            accountId: item.accountId,
            deviceId: item.deviceId,
            permissionId: isText(item.permissionId, WORD) ? item.permissionId : null,
            salt: isText(item.salt, WORD) ? item.salt : null,
            status: item.status,
          },
        ];
      });
    },
    async pendingRequests(deviceId) {
      const out = await send("GET", `/sessions/requests?deviceId=${encodeURIComponent(deviceId)}`);
      if (!isRecord(out) || !Array.isArray(out.requests)) throw new OwnWalletSessionApiError("response_malformed");
      return out.requests;
    },
    async postSignature(requestRef, body) {
      await send("POST", `/sessions/requests/${encodeURIComponent(requestRef)}/signature`, body);
    },
  };
}

export interface OwnWalletSessionDeps {
  api: OwnWalletSessionApi;
  invoke?: OwnWalletSessionInvoke;
  subtle?: SubtleCrypto;
}

/**
 * Starts a grant: makes the key, asks the backend for the owner's `grant_session` UserOp request and returns the wallet
 * origin link to open. If the backend refuses, the new key is deleted again at once (no orphan key).
 */
export async function startOwnWalletSessionGrant(
  deps: OwnWalletSessionDeps,
  input: OwnWalletSessionCreateInput & { agentId?: string; walletOrigin: string },
): Promise<OwnWalletSessionResult<{ slotId: string; fingerprint: string; url: string; expiresAt: string }>> {
  const { agentId, walletOrigin, ...createInput } = input;
  const created = await createOwnWalletSession(createInput, deps.invoke, deps.subtle);
  if (!created.ok) return created;
  const abandon = async (reason: string) => {
    await revokeOwnWalletSession(created.value.slotId, deps.invoke);
    return { ok: false as const, reason };
  };
  let prepared: { requestRef: string; walletToken: string; expiresAt: string };
  try {
    prepared = await deps.api.prepareGrant({ accountId: input.accountId, params: created.value.grantParams });
  } catch (error) {
    return abandon(error instanceof OwnWalletSessionApiError ? error.reason : "request_failed");
  }
  const intent = grantSessionIntentOf(agentId, created.value.grantParams);
  const url = intent ? walletGrantSessionUrl(walletOrigin, prepared.requestRef, prepared.walletToken, intent) : null;
  if (!url) return abandon("link_invalid");
  return { ok: true, value: { slotId: created.value.slotId, fingerprint: created.value.fingerprint, url, expiresAt: prepared.expiresAt } };
}

/**
 * After the owner signed on the wallet origin: finds the backend's active grant of this device whose salt makes THIS
 * key's permission id, and lets Rust activate the session. Rust computes the id itself; a grant that does not fit is
 * skipped, so a wrong or hostile list entry cannot activate anything.
 */
export async function finishOwnWalletSessionGrant(deps: OwnWalletSessionDeps, input: { slotId: string; accountId: string; deviceId: string }): Promise<OwnWalletSessionResult<string>> {
  let grants: OwnWalletSessionGrantView[];
  try {
    grants = await deps.api.listGrants(input.accountId);
  } catch (error) {
    return { ok: false, reason: error instanceof OwnWalletSessionApiError ? error.reason : "request_failed" };
  }
  const candidates = grants.filter((g) => g.accountId === input.accountId && g.deviceId === input.deviceId && g.status === "active" && g.salt !== null && g.permissionId !== null);
  if (candidates.length === 0) return { ok: false, reason: "grant_not_active_yet" };
  let last = "permission_id_mismatch";
  for (const grant of candidates) {
    const res = await activateOwnWalletSession(input.slotId, grant.salt as string, grant.permissionId, deps.invoke);
    if (res.ok) return res;
    last = res.reason;
    if (res.reason !== "permission_id_mismatch") break;
  }
  return { ok: false, reason: last };
}

export interface OwnWalletSessionPollResult {
  signed: string[];
  refused: { requestRef: string; reason: string }[];
  /** Set when the list itself could not be read (nothing was signed). */
  unavailable?: string;
}

const MAX_PER_POLL = 20;

/**
 * One round: reads this device's pending payments, lets Rust check and sign each (or refuse it), and posts the
 * signature. A failure to post leaves the payment unsigned on the server; Rust has already counted it (the safe side).
 */
export async function pollOwnWalletSessionRequests(deps: OwnWalletSessionDeps & { ownerUserId: string; deviceId: string }): Promise<OwnWalletSessionPollResult> {
  const result: OwnWalletSessionPollResult = { signed: [], refused: [] };
  let pending: unknown[];
  try {
    pending = await deps.api.pendingRequests(deps.deviceId);
  } catch (error) {
    return { ...result, unavailable: error instanceof OwnWalletSessionApiError ? error.reason : "request_failed" };
  }
  for (const raw of pending.slice(0, MAX_PER_POLL)) {
    const requestRef = isRecord(raw) && isText(raw.requestRef, IDENT) ? raw.requestRef : "invalid";
    const signed = await signOwnWalletSessionRequest(deps.ownerUserId, raw, deps.invoke);
    if (!signed.ok) {
      result.refused.push({ requestRef, reason: signed.reason });
      continue;
    }
    try {
      await deps.api.postSignature(requestRef, { permissionId: signed.value.permissionId, signature: signed.value.signature });
      result.signed.push(requestRef);
    } catch (error) {
      result.refused.push({ requestRef, reason: error instanceof OwnWalletSessionApiError ? error.reason : "post_failed" });
    }
  }
  return result;
}

// ── Words for the owner ─────────────────────────────────────────────────────────────────────────────────────

/** [zh, en] per reason (Rust refusals and backend codes). */
const REASON_TEXT: Record<string, readonly [string, string]> = {
  own_wallet_session_off: ["这台电脑上的钱包会话开关没开", "The wallet-session switch on this computer is off"],
  kill_switch_engaged: ["急停拉着，不能创建、启用或签名", "Emergency stop is on, so nothing can be created, enabled or signed"],
  session_module_installed: [
    "这个钱包已经授权过一台设备；改额度或换设备，需要新建一个钱包",
    "This wallet has already authorized a device; to change the limits or switch devices you need to create a new wallet",
  ],
  fingerprint_mismatch: ["指纹对不上，这把会话钥没有启用", "The fingerprint does not match, so this session key was not used"],
  session_not_active: ["这个会话还没启用，或者已经撤销", "This session is not enabled yet, or it was revoked"],
  session_expired: ["这个会话已经到期", "This session has expired"],
  session_not_found: ["找不到这个会话", "No such session"],
  permission_id_mismatch: ["服务器给的授权编号和本机算出来的不一样，没有启用", "The permission id from the server is not the one computed here, so it was not enabled"],
  owner_mismatch: ["这笔付款不是当前登录的主人的", "This payment is not for the owner signed in here"],
  chain_not_allowed: ["这条链不支持", "This chain is not supported"],
  chain_mismatch: ["这笔付款的链和会话的链不一样", "The chain of this payment is not the chain of the session"],
  entry_point_not_pinned: ["入口合约不是钉住的那个", "The entry point is not the pinned one"],
  permission_not_registered: ["这台电脑上没有这个会话", "This computer has no such session"],
  account_not_registered: ["付款账户不是这个会话的账户", "The paying account is not this session's account"],
  user_op_hash_mismatch: ["服务器给的哈希和本机算出来的不一样", "The hash from the server is not the one computed here"],
  payee_not_allowed: ["收款人不是你设的那一个", "The payee is not the one you set"],
  amount_over_limit: ["超过了你设的单笔上限", "Over the per-payment limit you set"],
  daily_limit_exceeded: ["超过了你设的当天上限", "Over the daily limit you set"],
  action_not_allowed: ["这种付款不在你设的范围内", "This kind of payment is not in what you set"],
  keychain_unavailable: ["读不到系统钥匙串", "The system keychain is not available"],
  session_key_missing: ["这个会话的钥匙已经不在本机", "The key of this session is no longer on this computer"],
  too_many_sessions: ["会话太多了，先撤销几个", "Too many sessions; revoke some first"],
  expiry_invalid: ["到期时间要在 1 分钟到 30 天之间", "The expiry must be between 1 minute and 30 days from now"],
  policy_invalid: ["额度或收款人不合规", "The limits or the payee are not valid"],
  request_malformed: ["服务器给的付款请求格式不对，没有签", "The payment request from the server is malformed and was not signed"],
  response_malformed: ["本机或服务器的回答格式不对", "The answer from this computer or the server is malformed"],
  link_invalid: ["生成钱包链接失败", "Could not build the wallet link"],
  grant_not_active_yet: ["钱包那边还没确认启用，稍后再试", "The wallet has not confirmed it yet; try again in a moment"],
  no_session: ["还没有登录", "Not signed in"],
  network_unavailable: ["连不上服务器", "Can't reach the server"],
  no_native_host: ["这个窗口不能调用本机功能", "This window can't call the computer's own functions"],
  // S7c: the owner's screen (the form, the Agent list, the wallet link).
  agent_required: ["先选一个 Agent", "Pick an Agent first"],
  nothing_selected: ["原生币和代币至少要选一样", "Pick the coin, the token or both"],
  payee_invalid: ["收款地址要写成 0x 开头的 40 位十六进制", "The payee must be a 0x address of 40 hex digits"],
  amount_invalid: ["数额要写成大于 0 的数，小数位不能超过这种币的位数", "Amounts must be numbers above 0 with no more decimals than the coin has"],
  max_count_invalid: ["最多几次要写 1 到 1000 的整数", "The most payments must be a whole number from 1 to 1000"],
  no_wallet_origin: ["这个版本没有配置钱包页地址，不能去签", "This build has no wallet page address, so the grant can't be signed"],
  switch_off: ["服务器上这个功能还没开", "This is not turned on on the server yet"],
  summary_unavailable: ["读不到你的 Agent 列表", "Can't read your Agent list"],
  round_failed: ["这一轮检查没有完成", "This check did not finish"],
  build_off: ["这个版本没有打开钱包会话", "Wallet sessions are not turned on in this build"],
  no_sessions: ["还没有可用的会话", "No usable session yet"],
};

/** One language, the app's (`locale`; Chinese when none is given). */
export function describeOwnWalletSessionReason(reason: string | undefined, locale: string = "zh"): string {
  if (!reason) return "";
  const pick = pickFor(locale);
  const words = REASON_TEXT[reason];
  return words ? pick(...words) : pick(`没有完成（${reason}）`, `Not done (${reason})`);
}
