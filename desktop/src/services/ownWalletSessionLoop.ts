/**
 * ownWalletSessionLoop — L8-6 S7c: the owner's screen and the 30-second round for the device session keys of the Agent's own
 * wallet ("这台电脑 → 钱包会话"). Off unless the build sets VITE_AGENT_OWN_WALLET_SESSION_V1_ENABLED to exactly 1.
 *
 * This file adds no key handling and no new native command. Everything that touches a key stays in `ownWalletSession.ts` and
 * the Rust side; this file only decides WHEN to ask them and turns what the owner typed into the exact input Rust takes.
 *
 * One round (`pollOwnWalletSessionsOnce`), in this order, and it stops at the first thing that says no:
 *   1. the build switch, a signed-in owner, the emergency stop (engaged: nothing at all, not even a request),
 *   2. the owner's own switch on this computer (read from Rust: only a verified file can be on),
 *   3. the sessions of THIS owner that are not expired or revoked (none: no request at all),
 *   4. pending sessions: look for the owner's signed grant and let Rust activate it (Rust computes the permission id itself),
 *   5. active sessions: for each device id, read the payments waiting for it and let Rust check each one against this
 *      computer's own policy; only what Rust signs is posted back.
 * Rounds never overlap (the timer and the "check now" button share one guard).
 */
import { decodeOwnWalletSummaryV1, ownWalletChainAllowedV1 } from "../../../shared/types/agent-own-wallet";
import { ownerCall } from "./deviceCapabilityUpload";
import { getKillSwitchState } from "./executionFence";
import {
  finishOwnWalletSessionGrant,
  httpOwnWalletSessionApi,
  pollOwnWalletSessionRequests,
  readOwnWalletSessions,
  type OwnWalletSessionApi,
  type OwnWalletSessionCreateInput,
  type OwnWalletSessionInvoke,
  type OwnWalletSessionView,
} from "./ownWalletSession";

export const OWN_WALLET_SESSION_POLL_INTERVAL_MS = 30_000;

type Env = Record<string, string | undefined>;
const defaultEnv = (): Env => (import.meta as { env?: Env }).env ?? {};

/** The build switch; default off. */
export function ownWalletSessionUiEnabled(env: Env = defaultEnv()): boolean {
  return env.VITE_AGENT_OWN_WALLET_SESSION_V1_ENABLED === "1";
}

const WALLET_ORIGIN = /^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?$/;

/** The wallet origin pinned in the build (an https origin and nothing else); never taken from a server answer. */
export function ownWalletOriginOf(env: Env = defaultEnv()): string | null {
  const raw = env.VITE_AGENT_WALLET_ORIGIN;
  return typeof raw === "string" && WALLET_ORIGIN.test(raw) ? raw : null;
}

// ── One round ────────────────────────────────────────────────────────────────────────────────────────────────

export interface OwnWalletSessionLoopDeps {
  /** The build switch. */
  enabled: boolean;
  api: OwnWalletSessionApi;
  invoke?: OwnWalletSessionInvoke;
  /** The owner signed in on this computer; `null` when nobody is. */
  ownerUserId: () => Promise<string | null>;
  killSwitchEngaged: () => boolean;
}

export type OwnWalletSessionTickResult =
  | { kind: "off"; reason: string }
  | {
      kind: "done";
      activated: string[];
      /** Pending sessions still waiting for the owner's signature on the wallet origin. */
      waiting: number;
      signed: string[];
      refused: { requestRef: string; reason: string }[];
      /** Set when the payments could not be read (a server answer or a network error); nothing was signed. */
      unavailable?: string;
    };

export async function pollOwnWalletSessionsOnce(deps: OwnWalletSessionLoopDeps): Promise<OwnWalletSessionTickResult> {
  if (!deps.enabled) return { kind: "off", reason: "build_off" };
  const owner = await deps.ownerUserId();
  if (!owner) return { kind: "off", reason: "no_session" };
  if (deps.killSwitchEngaged()) return { kind: "off", reason: "kill_switch_engaged" };
  const view = await readOwnWalletSessions(deps.invoke);
  if (!view.enabled) return { kind: "off", reason: "own_wallet_session_off" };
  const live = view.sessions.filter((slot) => slot.ownerUserId === owner && !slot.expired && slot.status !== "revoked");
  if (live.length === 0) return { kind: "off", reason: "no_sessions" };

  const result: Extract<OwnWalletSessionTickResult, { kind: "done" }> = { kind: "done", activated: [], waiting: 0, signed: [], refused: [] };
  const deviceIds = new Set<string>();
  for (const slot of live) {
    if (slot.status === "active") {
      deviceIds.add(slot.deviceId);
      continue;
    }
    const finished = await finishOwnWalletSessionGrant({ api: deps.api, invoke: deps.invoke }, { slotId: slot.slotId, accountId: slot.accountId, deviceId: slot.deviceId });
    if (finished.ok) {
      result.activated.push(slot.slotId);
      deviceIds.add(slot.deviceId);
    } else {
      result.waiting += 1;
    }
  }
  for (const deviceId of deviceIds) {
    // The emergency stop can be pulled while a round runs: look again before each device.
    if (deps.killSwitchEngaged()) break;
    const round = await pollOwnWalletSessionRequests({ api: deps.api, invoke: deps.invoke, ownerUserId: owner, deviceId });
    result.signed.push(...round.signed);
    result.refused.push(...round.refused);
    if (round.unavailable && !result.unavailable) result.unavailable = round.unavailable;
  }
  return result;
}

// ── Rounds do not overlap; the owner can see the last one ────────────────────────────────────────────────────

export interface OwnWalletSessionTickRecord {
  at: number;
  result: OwnWalletSessionTickResult;
}

let inflight: Promise<OwnWalletSessionTickResult> | null = null;
let lastTick: OwnWalletSessionTickRecord | null = null;
const listeners = new Set<(record: OwnWalletSessionTickRecord) => void>();

export function lastOwnWalletSessionTick(): OwnWalletSessionTickRecord | null {
  return lastTick;
}

export function onOwnWalletSessionTick(listener: (record: OwnWalletSessionTickRecord) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test hook: forget the last round and any round in flight. */
export function resetOwnWalletSessionTickForTests(): void {
  inflight = null;
  lastTick = null;
  listeners.clear();
}

/** One round, or the round already running. Never throws: a failure is an "off" record with a reason code. */
export function runOwnWalletSessionTick(deps: OwnWalletSessionLoopDeps, nowMs: () => number = () => Date.now()): Promise<OwnWalletSessionTickResult> {
  if (inflight) return inflight;
  const run = (async (): Promise<OwnWalletSessionTickResult> => {
    let result: OwnWalletSessionTickResult;
    try {
      result = await pollOwnWalletSessionsOnce(deps);
    } catch {
      result = { kind: "off", reason: "round_failed" };
    }
    lastTick = { at: nowMs(), result };
    for (const listener of [...listeners]) listener(lastTick);
    return result;
  })();
  inflight = run;
  void run.finally(() => {
    if (inflight === run) inflight = null;
  });
  return run;
}

/** Started once by the desktop shell; a no-op unless the build switch is on. Returns the stop function. */
export function startOwnWalletSessionLoop(deps: OwnWalletSessionLoopDeps, intervalMs = OWN_WALLET_SESSION_POLL_INTERVAL_MS): () => void {
  if (!deps.enabled) return () => undefined;
  let stopped = false;
  const tick = () => {
    if (!stopped) void runOwnWalletSessionTick(deps);
  };
  const timer = setInterval(tick, intervalMs);
  tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

// ── The real dependencies ────────────────────────────────────────────────────────────────────────────────────

/** The session routes with the owner's sign-in. The store is loaded on first use, so importing this file stays light. */
export function lazyOwnWalletSessionApi(): OwnWalletSessionApi {
  const inner = async (): Promise<OwnWalletSessionApi> => {
    const { API_BASE, apiFetch, useAuthStore } = await import("./store");
    return httpOwnWalletSessionApi({ fetch: apiFetch, apiBase: API_BASE, token: () => useAuthStore.getState().token });
  };
  return {
    prepareGrant: async (input) => (await inner()).prepareGrant(input),
    listGrants: async (accountId) => (await inner()).listGrants(accountId),
    pendingRequests: async (deviceId) => (await inner()).pendingRequests(deviceId),
    postSignature: async (requestRef, body) => (await inner()).postSignature(requestRef, body),
  };
}

const OWNER_ID = /^[A-Za-z0-9._:-]{1,64}$/;

export async function signedInOwnerUserId(): Promise<string | null> {
  const { useAuthStore } = await import("./store");
  const state = useAuthStore.getState();
  const id = state.token ? (state.user as { id?: unknown } | null)?.id : undefined;
  return typeof id === "string" && OWNER_ID.test(id) ? id : null;
}

export function desktopOwnWalletSessionLoopDeps(env: Env = defaultEnv()): OwnWalletSessionLoopDeps {
  return {
    enabled: ownWalletSessionUiEnabled(env),
    api: lazyOwnWalletSessionApi(),
    ownerUserId: signedInOwnerUserId,
    killSwitchEngaged: () => getKillSwitchState().engaged,
  };
}

// ── Which Agent's account the owner can give a session to ───────────────────────────────────────────────────

export interface OwnWalletSessionTarget {
  agentId: string;
  name: string;
  accountId: string;
  /** Lower case. */
  account: string;
  chainId: number;
}

export interface OwnWalletSessionTargetDeps {
  call: (method: "GET" | "POST", path: string, body?: unknown) => Promise<{ status: number; body: unknown }>;
  agentName: (agentId: string) => Promise<string | null>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ADDRESS_ANY_CASE = /^0x[0-9a-fA-F]{40}$/;
const MAX_TARGETS = 20;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const unwrap = (body: unknown): unknown => (isRecord(body) && isRecord(body.data) ? body.data : body);

/**
 * The owner's Agents whose own account is deployed (summary status `active`), each with the account id and address the
 * server gives (`POST accounts/agent` is idempotent and only reads an account that exists). An Agent whose answer is not
 * exactly the expected form is left out, never guessed.
 */
export async function loadOwnWalletSessionTargets(deps: OwnWalletSessionTargetDeps): Promise<{ ok: true; targets: OwnWalletSessionTarget[] } | { ok: false; reason: string }> {
  let summary: { status: number; body: unknown };
  try {
    summary = await deps.call("GET", "/agent-own-wallet/summary");
  } catch {
    return { ok: false, reason: "network_unavailable" };
  }
  if (summary.status === 404) return { ok: false, reason: "switch_off" };
  if (summary.status !== 200) return { ok: false, reason: "summary_unavailable" };
  const decoded = decodeOwnWalletSummaryV1(unwrap(summary.body));
  if (decoded.ok === false) return { ok: false, reason: "response_malformed" };
  const targets: OwnWalletSessionTarget[] = [];
  for (const agent of decoded.value.agents.filter((a) => a.ownWalletStatus === "active").slice(0, MAX_TARGETS)) {
    try {
      const answer = await deps.call("POST", "/agent-own-wallet/accounts/agent", { agentId: agent.agentId });
      if (answer.status !== 200 && answer.status !== 201) continue;
      const view = unwrap(answer.body);
      if (!isRecord(view)) continue;
      const { accountId, accountAddress, chainId, status } = view;
      if (typeof accountId !== "string" || !UUID.test(accountId)) continue;
      if (typeof accountAddress !== "string" || !ADDRESS_ANY_CASE.test(accountAddress)) continue;
      if (!ownWalletChainAllowedV1(chainId) || status !== "deployed") continue;
      const name = (await deps.agentName(agent.agentId).catch(() => null)) ?? agent.agentId.slice(0, 8);
      targets.push({ agentId: agent.agentId, name, accountId, account: accountAddress.toLowerCase(), chainId });
    } catch {
      // One Agent that cannot be read does not hide the others.
    }
  }
  return { ok: true, targets };
}

export function desktopOwnWalletSessionTargetDeps(): OwnWalletSessionTargetDeps {
  return {
    call: (method, path, body) => ownerCall(method, path, body),
    agentName: async (agentId) => (await (await import("./agentIdentity")).fetchAgentIdentity(agentId))?.displayName ?? null,
  };
}

// ── What the owner types → the exact input Rust takes ───────────────────────────────────────────────────────

export const OWN_WALLET_SESSION_VALID_HOURS = [1, 24, 168, 696] as const;

/** A decimal number typed in whole coins as the smallest unit; `null` for anything else (no sign, no exponent, no float maths, not zero). */
export function decimalToUnitsV1(text: string, decimals: number): string | null {
  const match = /^(0|[1-9][0-9]{0,30})(?:\.([0-9]{1,30}))?$/.exec(text.trim());
  if (!match || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) return null;
  const units = (match[1] + fraction.padEnd(decimals, "0")).replace(/^0+(?=[0-9])/, "");
  return /^[1-9][0-9]{0,77}$/.test(units) ? units : null;
}

export interface OwnWalletSessionForm {
  agentId: string;
  validHours: number;
  native: { on: boolean; payee: string; perTx: string; daily: string; total: string; maxCount: string };
  token: { on: boolean; payee: string; perTransfer: string; daily: string; total: string };
}

export const EMPTY_OWN_WALLET_SESSION_FORM: OwnWalletSessionForm = {
  agentId: "",
  validHours: 24,
  native: { on: false, payee: "", perTx: "", daily: "", total: "", maxCount: "10" },
  token: { on: false, payee: "", perTransfer: "", daily: "", total: "" },
};

export type OwnWalletSessionBuild = { ok: true; input: OwnWalletSessionCreateInput; target: OwnWalletSessionTarget } | { ok: false; reason: string };

/** Native coin: 18 decimals on both testnets. Token: the decimals of the token pinned for the chain. */
export function ownWalletSessionCoinOf(chainId: number): { nativeSymbol: string; nativeDecimals: number; tokenSymbol: string; tokenDecimals: number } | null {
  if (chainId === 97) return { nativeSymbol: "tBNB", nativeDecimals: 18, tokenSymbol: "USDT", tokenDecimals: 18 };
  if (chainId === 84532) return { nativeSymbol: "ETH", nativeDecimals: 18, tokenSymbol: "USDC", tokenDecimals: 6 };
  return null;
}

/**
 * The form → `createOwnWalletSession` input. Only conversion and the plain checks Rust repeats anyway (Rust is the judge);
 * a payee typed in mixed case is lower-cased, and the wallet page shows the payee again before the passkey signs.
 */
export function buildOwnWalletSessionCreateInput(
  form: OwnWalletSessionForm,
  context: { targets: OwnWalletSessionTarget[]; ownerUserId: string; deviceId: string; nowMs: number },
): OwnWalletSessionBuild {
  const target = context.targets.find((t) => t.agentId === form.agentId);
  if (!target) return { ok: false, reason: "agent_required" };
  const coin = ownWalletSessionCoinOf(target.chainId);
  if (!coin) return { ok: false, reason: "chain_not_allowed" };
  if (!form.native.on && !form.token.on) return { ok: false, reason: "nothing_selected" };
  if (!(OWN_WALLET_SESSION_VALID_HOURS as readonly number[]).includes(form.validHours)) return { ok: false, reason: "expiry_invalid" };
  const validUntil = Math.floor(context.nowMs / 1000) + form.validHours * 3600;
  const input: OwnWalletSessionCreateInput = {
    ownerUserId: context.ownerUserId,
    deviceId: context.deviceId,
    accountId: target.accountId,
    account: target.account,
    chainId: target.chainId,
    validUntil,
  };
  const payeeOf = (text: string): string | null => (ADDRESS_ANY_CASE.test(text.trim()) ? text.trim().toLowerCase() : null);
  if (form.native.on) {
    const n = form.native;
    const payee = payeeOf(n.payee);
    if (!payee) return { ok: false, reason: "payee_invalid" };
    const perTxWei = decimalToUnitsV1(n.perTx, coin.nativeDecimals);
    const dailyWei = decimalToUnitsV1(n.daily, coin.nativeDecimals);
    const totalWei = decimalToUnitsV1(n.total, coin.nativeDecimals);
    if (!perTxWei || !dailyWei || !totalWei) return { ok: false, reason: "amount_invalid" };
    if (!/^[1-9][0-9]{0,3}$/.test(n.maxCount.trim()) || Number(n.maxCount) > 1000) return { ok: false, reason: "max_count_invalid" };
    input.native = { payee, perTxWei, dailyWei, totalWei, maxCount: Number(n.maxCount) };
  }
  if (form.token.on) {
    const t = form.token;
    const payee = payeeOf(t.payee);
    if (!payee) return { ok: false, reason: "payee_invalid" };
    const perTransfer = decimalToUnitsV1(t.perTransfer, coin.tokenDecimals);
    const daily = decimalToUnitsV1(t.daily, coin.tokenDecimals);
    const total = decimalToUnitsV1(t.total, coin.tokenDecimals);
    if (!perTransfer || !daily || !total) return { ok: false, reason: "amount_invalid" };
    input.token = { payee, perTransfer, daily, total };
  }
  return { ok: true, input, target };
}

/** A smallest-unit integer string as a plain decimal (no floating point); anything that is not an integer string is returned as it is. */
export function unitsToDecimalV1(units: string, decimals: number): string {
  if (!/^[0-9]{1,78}$/.test(units) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return units;
  const digits = units.replace(/^0+(?=[0-9])/, "").padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, "");
  return fraction.length > 0 ? `${whole}.${fraction}` : whole;
}

/** Read-only helper for the screen: whether the session view can be shown as "on". */
export function ownWalletSessionViewIsOn(view: OwnWalletSessionView): boolean {
  return view.enabled && view.integrity === "ok";
}
