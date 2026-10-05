/**
 * orderBackgroundDraft — 桌面 D5 后台起草（REQ-desktop-047，合同 `shared/types/desktop-sync-state.ts`）。
 *
 * 有新付款、还没有草稿的单时，电脑在接着电源时先备一份回答草稿，交付照旧要本人在交付台上看过、勾选。
 * 起草本身就是第 2 片的"让电脑先备一份"（`draftWithComputer`：只用本机模型、运行时凭据写、不盖掉已有草稿）。
 *
 * 什么时候动（全部满足才调一次运行时列表）：
 * - 本人在"分身 → 接单与交付"里打开了"后台起草"（本机开关，精确为 "1"；默认关）；
 * - `desktop-sync/state` 的 `orderDrafts` 解得出来，`pendingCount > 0`，`changedAt` 不为空，
 *   而且比本机记下的"上次看过"新（按时间值比，不按字符串比）；
 * - 急停没拉下；这台电脑的绑定有效；接着电源（`desktop_bridge_power_source` 说 `ac`，读不到不算）；
 * - 没有正在进行的一次；上次失败后的冷却时间已过。
 * 一次只起草一张（最早付款的那张）。还有别的单时不记"看过"，下一次 state（30 秒）再起草下一张。
 * 列表里没有这台电脑能起草的单（单是这个用户别的 Agent 的、都已经有草稿了）时记下"看过"，
 * 直到 `changedAt` 变新都不再调。
 * 不用本人的登录凭据（运行时凭据过期就等本人在交付台上点一次），不在后台弹权限框；
 * 只发本机通知，通知里没有订单内容。AI 调不到这里：开关只在交付台上，fence 里没有对应命令。
 */
import { readDesktopSyncOrderDraftsV1 } from "../../../shared/types/desktop-sync-state";
import { decodeOrderSellerView, type OrderSellerView } from "../../../shared/types/order-escrow-view";
import { canDeliver } from "./orderDesk";
import { draftWithComputer, type ComputerDraftResult } from "./orderRuntimeDraft";

export const BACKGROUND_DRAFT_SETTING_KEY = "agentrix_desktop_background_order_drafts";
/** 上次看过的 `changedAt`（毫秒）。只是时间，没有订单内容。 */
export const BACKGROUND_DRAFT_SEEN_KEY = "agentrix_desktop_background_order_drafts_seen";
export const BACKGROUND_DRAFT_CHANGED_EVENT = "agentrix:background-order-drafts-changed";
/** 起草好了一份（交付台据此重新读单）。detail 只有 orderId。 */
export const BACKGROUND_DRAFT_READY_EVENT = "agentrix:background-order-draft-ready";
export const ORDER_LIST_COMMAND = "developer_runtime_order_list";
export const POWER_SOURCE_COMMAND = "desktop_bridge_power_source";

/** 起草失败后多久不再试（任何一张）。 */
export const BACKGROUND_DRAFT_COOLDOWN_MS = 10 * 60 * 1000;
/** 某一张（同一版本）失败后多久不再挑它。 */
export const BACKGROUND_DRAFT_ORDER_BACKOFF_MS = 60 * 60 * 1000;
/** 电源状态缓存多久（不在每次 state 都跑一次 pmset）。 */
export const POWER_SOURCE_CACHE_MS = 60 * 1000;

export const BACKGROUND_DRAFT_NOTICE =
  "电脑先备好了一份订单回答草稿。交付前请在“分身 → 接单与交付”里看一遍、改好，再勾选交付。";

export type PowerSource = "ac" | "battery" | "unknown";

export type BackgroundDraftOutcome =
  | "off"
  | "no_signal"
  | "nothing_pending"
  | "seen"
  | "busy"
  | "cooling_down"
  | "kill_switch"
  | "not_bound"
  | "not_on_ac"
  | "list_failed"
  | "none_for_this_computer"
  | "drafted"
  | "draft_failed";

export interface BackgroundDraftDeps {
  isOn: () => boolean;
  killSwitchEngaged: () => boolean;
  /** 绑定有效（读 Rust 的状态）。 */
  bound: () => Promise<boolean>;
  powerSource: () => Promise<PowerSource>;
  /** 运行时列表（卖方视图，解不出的已丢掉）。 */
  listOrders: () => Promise<OrderSellerView[]>;
  draft: (order: OrderSellerView) => Promise<ComputerDraftResult>;
  notify: (orderId: string) => void;
  readSeen: () => number;
  writeSeen: (ms: number) => void;
  now: () => number;
}

function storageGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** 本机开关：精确为 "1" 才算开。 */
export function isBackgroundDraftingOn(): boolean {
  return storageGet(BACKGROUND_DRAFT_SETTING_KEY) === "1";
}

export function setBackgroundDrafting(on: boolean): void {
  try {
    if (on) globalThis.localStorage?.setItem(BACKGROUND_DRAFT_SETTING_KEY, "1");
    else globalThis.localStorage?.removeItem(BACKGROUND_DRAFT_SETTING_KEY);
  } catch {
    /* storage unavailable: stays off */
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(BACKGROUND_DRAFT_CHANGED_EVENT, { detail: { on } }));
    } catch {
      /* non-DOM host */
    }
  }
}

export function decodePowerSource(raw: unknown): PowerSource {
  return raw === "ac" || raw === "battery" ? raw : "unknown";
}

/** 最早付款的那张排在前面（`escrow.heldAt`，没有就用 `createdAt`）。 */
function paidAtMs(order: OrderSellerView): number {
  const escrow = (order as { escrow?: { heldAt?: unknown } }).escrow;
  const at = typeof escrow?.heldAt === "string" ? escrow.heldAt : order.createdAt;
  const ms = Date.parse(at);
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

export function draftableOrders(orders: readonly OrderSellerView[], nowMs: number): OrderSellerView[] {
  return orders
    .filter((order) => order.status === "paid" && !order.deliveryDraft && canDeliver(order, nowMs))
    .sort((a, b) => paidAtMs(a) - paidAtMs(b));
}

export function createBackgroundDrafter(deps: BackgroundDraftDeps) {
  let running = false;
  let coolUntil = 0;
  const failedUntil = new Map<string, number>();
  let power: { value: PowerSource; at: number } | null = null;

  const readPower = async (): Promise<PowerSource> => {
    const now = deps.now();
    if (power && now - power.at < POWER_SOURCE_CACHE_MS) return power.value;
    let value: PowerSource = "unknown";
    try {
      value = decodePowerSource(await deps.powerSource());
    } catch {
      value = "unknown";
    }
    power = { value, at: now };
    return value;
  };

  const onState = async (state: unknown): Promise<BackgroundDraftOutcome> => {
    if (!deps.isOn()) return "off";
    const signal = readDesktopSyncOrderDraftsV1(state);
    if (!signal) return "no_signal";
    if (signal.pendingCount === 0) return "nothing_pending";
    const changedMs = signal.changedAt ? Date.parse(signal.changedAt) : Number.NaN;
    if (!Number.isFinite(changedMs)) return "nothing_pending";
    if (changedMs <= deps.readSeen()) return "seen";
    if (running) return "busy";
    if (deps.now() < coolUntil) return "cooling_down";
    if (deps.killSwitchEngaged()) return "kill_switch";
    running = true;
    try {
      // Power first: it is cached, the binding read goes to the keychain.
      if ((await readPower()) !== "ac") return "not_on_ac";
      if (!(await deps.bound().catch(() => false))) return "not_bound";
      if (deps.killSwitchEngaged()) return "kill_switch";

      let orders: OrderSellerView[];
      try {
        orders = await deps.listOrders();
      } catch {
        coolUntil = deps.now() + BACKGROUND_DRAFT_COOLDOWN_MS;
        return "list_failed";
      }
      const now = deps.now();
      const candidates = draftableOrders(orders, now);
      if (candidates.length === 0) {
        deps.writeSeen(changedMs);
        return "none_for_this_computer";
      }
      const next = candidates.find((order) => (failedUntil.get(`${order.orderId}@${order.version}`) ?? 0) <= now);
      if (!next) return "cooling_down";
      if (deps.killSwitchEngaged()) return "kill_switch";

      const result = await deps.draft(next).catch((): ComputerDraftResult => ({ ok: false, reason: "native_failed" }));
      if (!result.ok) {
        const at = deps.now();
        failedUntil.set(`${next.orderId}@${next.version}`, at + BACKGROUND_DRAFT_ORDER_BACKOFF_MS);
        coolUntil = at + BACKGROUND_DRAFT_COOLDOWN_MS;
        return "draft_failed";
      }
      deps.notify(next.orderId);
      // Nothing else for this computer: done until a newer payment.
      if (candidates.length === 1) deps.writeSeen(changedMs);
      return "drafted";
    } finally {
      running = false;
    }
  };

  return { onState };
}

// ── 接到应用里 ─────────────────────────────────────────────────────────────

async function nativeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

function decodeList(raw: unknown): OrderSellerView[] {
  const items = raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : null;
  if (!items) throw new Error("invalid_response");
  return items.flatMap((item) => {
    const view = decodeOrderSellerView(item);
    return view ? [view] : [];
  });
}

async function notifyDraftReady(orderId: string) {
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(BACKGROUND_DRAFT_READY_EVENT, { detail: { orderId } }));
    } catch {
      /* non-DOM host */
    }
  }
  try {
    const { isPermissionGranted, sendNotification } = await import("@tauri-apps/plugin-notification");
    // Never ask for permission from the background; only notify if it was already granted.
    if (await isPermissionGranted()) sendNotification({ title: "Agentrix", body: BACKGROUND_DRAFT_NOTICE });
  } catch {
    /* notifications unavailable */
  }
}

let installed: (() => void) | null = null;

/** 应用启动时装一次：每次 `agentrix:desktop-sync-state` 都交给后台起草判断。 */
export async function installBackgroundOrderDrafting(): Promise<() => void> {
  if (installed) return installed;
  if (typeof window === "undefined") return () => undefined;
  const [{ readEnrollmentStatus }, { getKillSwitchState }] = await Promise.all([
    import("./deviceEnrollment"),
    import("./executionFence"),
  ]);
  const drafter = createBackgroundDrafter({
    isOn: isBackgroundDraftingOn,
    killSwitchEngaged: () => getKillSwitchState().engaged,
    bound: async () => (await readEnrollmentStatus()).bound,
    powerSource: async () => decodePowerSource(await nativeInvoke<unknown>(POWER_SOURCE_COMMAND)),
    listOrders: async () => decodeList(await nativeInvoke<unknown>(ORDER_LIST_COMMAND)),
    draft: (order) => draftWithComputer({ order }),
    notify: (orderId) => void notifyDraftReady(orderId),
    readSeen: () => {
      const value = Number(storageGet(BACKGROUND_DRAFT_SEEN_KEY));
      return Number.isFinite(value) ? value : 0;
    },
    writeSeen: (ms) => {
      try {
        globalThis.localStorage?.setItem(BACKGROUND_DRAFT_SEEN_KEY, String(ms));
      } catch {
        /* storage unavailable */
      }
    },
    now: () => Date.now(),
  });
  const onState = (event: Event) => {
    void drafter.onState((event as CustomEvent).detail);
  };
  window.addEventListener("agentrix:desktop-sync-state", onState);
  installed = () => {
    window.removeEventListener("agentrix:desktop-sync-state", onState);
    installed = null;
  };
  return installed;
}
