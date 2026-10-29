/**
 * nonceLedger.ts — 桌面 D2：远程请求防重放（DRH-R03.3）。
 *
 * 移植自 09-15 的 DRH 分支（`ae2d95b0` desktop/src/ports/desktopNonceLedger.ts，
 * REQ-desktop-005 同意按需取用），接到今天的 executionFence 上：
 *   - remote-control：`requestId` 在 `remote-control:<设备>` 域内只能用一次；
 *   - desktop-sync：`commandId` 在 claim 成功后只能执行一次。
 * 用过的 nonce 保留到有效期结束，持久化到 localStorage，WebView 重载后重放
 * 同样被拒绝。被拒绝的请求不归还 nonce：开关打开以后也不能再"重放"一次。
 */

interface LedgerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const NONCE_LEDGER_STORAGE_KEY = "agentrix_desktop_execution_nonces_v1";
const MAX_TRACKED = 2_000;
export const DEFAULT_NONCE_TTL_MS = 24 * 60 * 60_000;

export interface NonceLedger {
  /** true：第一次见到（现在记为已用）；false：重放或参数无效。 */
  consume(domain: string, nonce: string, expiresAt?: number): boolean;
  has(domain: string, nonce: string): boolean;
  size(): number;
}

function defaultStorage(): LedgerStorage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* unavailable */
  }
  return null;
}

export function createNonceLedger(options: { storage?: LedgerStorage | null; now?: () => number } = {}): NonceLedger {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const now = options.now ?? (() => Date.now());
  const seen = new Map<string, number>(); // `${domain}\u0000${nonce}` → keepUntil
  const key = (domain: string, nonce: string) => `${domain}\u0000${nonce}`;

  const load = () => {
    if (!storage) return;
    try {
      const raw = storage.getItem(NONCE_LEDGER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      for (const item of parsed) {
        if (Array.isArray(item) && typeof item[0] === "string" && typeof item[1] === "number") {
          seen.set(item[0], item[1]);
        }
      }
    } catch {
      /* corrupt ledger → start empty; backend CAS still protects desktop-sync */
    }
  };

  const persist = () => {
    if (!storage) return;
    try {
      storage.setItem(NONCE_LEDGER_STORAGE_KEY, JSON.stringify(Array.from(seen.entries())));
    } catch {
      /* best effort */
    }
  };

  const prune = () => {
    const current = now();
    for (const [entry, keepUntil] of seen) {
      if (keepUntil <= current) seen.delete(entry);
    }
    if (seen.size > MAX_TRACKED) {
      const sorted = Array.from(seen.entries()).sort((a, b) => a[1] - b[1]);
      for (const [entry] of sorted.slice(0, seen.size - MAX_TRACKED)) seen.delete(entry);
    }
  };

  load();
  prune();

  return {
    consume(domain, nonce, expiresAt) {
      const safeDomain = String(domain || "").trim();
      const safeNonce = String(nonce || "").trim();
      if (!safeDomain || !safeNonce) return false;
      prune();
      const entry = key(safeDomain, safeNonce);
      if (seen.has(entry)) return false;
      const current = now();
      const keepUntil = typeof expiresAt === "number" && Number.isFinite(expiresAt) && expiresAt > current
        ? expiresAt
        : current + DEFAULT_NONCE_TTL_MS;
      seen.set(entry, keepUntil);
      persist();
      return true;
    },
    has(domain, nonce) {
      prune();
      return seen.has(key(String(domain || "").trim(), String(nonce || "").trim()));
    },
    size() {
      prune();
      return seen.size;
    },
  };
}

let sharedLedger: NonceLedger | null = null;

export function getNonceLedger(): NonceLedger {
  if (!sharedLedger) sharedLedger = createNonceLedger();
  return sharedLedger;
}

/** 测试用。 */
export function resetNonceLedgerForTests() {
  sharedLedger = null;
}
