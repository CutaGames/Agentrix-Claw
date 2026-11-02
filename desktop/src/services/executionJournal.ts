/**
 * executionJournal.ts — 桌面 D2：本机执行预写日志（DRH-R01.2、DESK-05）。
 *
 * 移植自 09-15 DRH 分支（`ae2d95b0` desktop/src/ports/desktopExecutionJournal.ts，
 * REQ-desktop-005 同意按需取用），接到 desktopExecutionPort：
 *   - 改动类（mutating）操作在审批开始前先写一条记录，写不进去就不执行（fail closed）；
 *   - 结束时写终态（completed / failed / rejected）；
 *   - 应用重启时还在"等审批 / 执行中"的记录改成 unknown，放进"中断的操作"，
 *     **绝不自动重放**，由本人查看后标记已处理。
 *
 * 只记动作类型、来源、编号和一行标题（最多 80 字），不记文件内容、命令输出等
 * 原始数据。它是本机证据，不是 backend 的 ActionReceipt（DRH-R07）。
 */
import type { ApprovalRiskLevel } from "./desktop";
import type { FenceSource } from "./executionFence";

export type JournalState = "awaiting_approval" | "executing" | "completed" | "failed" | "rejected" | "unknown";

export interface JournalEntry {
  journalRef: string;
  source: FenceSource;
  /** 通道里的命令名（desktop-sync kind、remote-control 命令、聊天工具名）。 */
  command: string;
  /** 规范化动作类型。 */
  kind: string;
  riskLevel: ApprovalRiskLevel;
  /** 通道里的请求编号（commandId / requestId / 工具调用 id），可能为空。 */
  requestRef?: string;
  title?: string;
  state: JournalState;
  reservedAt: number;
  updatedAt: number;
  note?: string;
  /** unknown 记录被本人看过并标记已处理。 */
  acknowledged?: boolean;
}

export interface ExecutionJournal {
  /** 写入一条在途记录；持久化失败返回 null（调用方必须拒绝执行）。 */
  reserve(input: Omit<JournalEntry, "journalRef" | "state" | "reservedAt" | "updatedAt" | "acknowledged">, state: "awaiting_approval" | "executing"): string | null;
  transition(journalRef: string, state: JournalState, note?: string): void;
  acknowledge(journalRef: string): void;
  list(): JournalEntry[];
  /** 结果未知、还没被本人处理的记录。 */
  listReconcile(): JournalEntry[];
  subscribe(listener: (entries: JournalEntry[]) => void): () => void;
}

export const JOURNAL_STORAGE_KEY = "agentrix_desktop_execution_journal_v1";
const MAX_ENTRIES = 200;
const IN_FLIGHT: ReadonlySet<JournalState> = new Set(["awaiting_approval", "executing"]);

interface JournalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): JournalStorage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* unavailable */
  }
  return null;
}

function randomRef(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `dj-${crypto.randomUUID()}`;
  } catch {
    /* fall through */
  }
  return `dj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function clip(value: string | undefined, max = 80): string | undefined {
  if (!value) return undefined;
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

export function createExecutionJournal(options: { storage?: JournalStorage | null; now?: () => number; maxEntries?: number } = {}): ExecutionJournal {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const now = options.now ?? (() => Date.now());
  const maxEntries = options.maxEntries ?? MAX_ENTRIES;
  const listeners = new Set<(entries: JournalEntry[]) => void>();

  const load = (): JournalEntry[] => {
    if (!storage) return [];
    try {
      const raw = storage.getItem(JOURNAL_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item): item is JournalEntry => Boolean(item) && typeof item === "object" && typeof (item as JournalEntry).journalRef === "string",
      );
    } catch {
      return [];
    }
  };

  let entries = load();

  const persist = (): boolean => {
    if (entries.length > maxEntries) {
      // 未处理的 unknown 必须留着；其余保留最近的。
      const keep = entries.filter((entry) => entry.state === "unknown" && !entry.acknowledged);
      const rest = entries.filter((entry) => !(entry.state === "unknown" && !entry.acknowledged)).slice(-Math.max(0, maxEntries - keep.length));
      entries = [...keep, ...rest].sort((a, b) => a.reservedAt - b.reservedAt);
    }
    if (!storage) return true;
    try {
      storage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(entries));
      return true;
    } catch {
      return false;
    }
  };

  const notify = () => {
    const snapshot = entries.slice();
    for (const listener of [...listeners]) {
      try {
        listener(snapshot);
      } catch {
        /* never break the fence */
      }
    }
  };

  // 上次进程结束时还在途的操作：结果未知，放进待处理，绝不重放。
  let recovered = false;
  for (const entry of entries) {
    if (IN_FLIGHT.has(entry.state)) {
      entry.state = "unknown";
      entry.note = "应用在这一步完成前退出了，结果未知，不会自动重试";
      entry.updatedAt = now();
      recovered = true;
    }
  }
  if (recovered) persist();

  return {
    reserve(input, state) {
      const journalRef = randomRef();
      const timestamp = now();
      entries.push({ ...input, title: clip(input.title), journalRef, state, reservedAt: timestamp, updatedAt: timestamp });
      if (!persist()) {
        entries = entries.filter((item) => item.journalRef !== journalRef);
        return null;
      }
      notify();
      return journalRef;
    },
    transition(journalRef, state, note) {
      const entry = entries.find((item) => item.journalRef === journalRef);
      if (!entry) return;
      entry.state = state;
      entry.updatedAt = now();
      if (note !== undefined) entry.note = clip(note, 200);
      persist();
      notify();
    },
    acknowledge(journalRef) {
      const entry = entries.find((item) => item.journalRef === journalRef);
      if (!entry) return;
      entry.acknowledged = true;
      entry.updatedAt = now();
      persist();
      notify();
    },
    list() {
      return entries.slice();
    },
    listReconcile() {
      return entries.filter((item) => item.state === "unknown" && !item.acknowledged);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let sharedJournal: ExecutionJournal | null = null;

export function getExecutionJournal(): ExecutionJournal {
  if (!sharedJournal) sharedJournal = createExecutionJournal();
  return sharedJournal;
}

/** 测试用。 */
export function resetExecutionJournalForTests() {
  sharedJournal = null;
}
