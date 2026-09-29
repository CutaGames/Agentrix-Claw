/**
 * worktreeLanes — backend client for the W1 multi-agent worktree
 * lane storage. Replaces localStorage as source-of-truth (still used
 * as offline cache).
 *
 * Spec: multi-agent-collaboration-2026-06 W1.3
 * Design: §6.1
 */
import { API_BASE, apiFetch, useAuthStore } from "./store";

export type WorktreeLaneStatus = "idle" | "running" | "review" | "blocked";

export interface WorktreeLane {
  id: string;
  userId: string;
  workspaceDir: string;
  baseBranch: string;
  worktreeBranch: string;
  worktreeDirectory: string;
  mission: string;
  focusFiles: string;
  status: WorktreeLaneStatus;
  agentId: string | null;
  agentTaskId: string | null;
  createdAt: string;
  updatedAt: string;
}

const LOCAL_CACHE_KEY = "agentrix_worktree_lanes_cache_v2";
const LOCAL_LEGACY_KEY = "agentrix_worktree_lanes";
const BULK_IMPORT_FLAG = "agentrix_worktree_lanes_bulk_imported_at";

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Load legacy localStorage lanes (the existing WorktreePanel.tsx
 * persisted them as `agentrix_worktree_lanes`). Returns the raw stored
 * shape — caller maps to `WorktreeLane`.
 */
function loadLegacyStoredLanes(): Array<Partial<WorktreeLane> & { branch?: string }> {
  try {
    const raw = localStorage.getItem(LOCAL_LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

/** SWR-style: read backend, fall back to localStorage cache on failure. */
export async function listLanes(workspaceDir?: string): Promise<WorktreeLane[]> {
  const url = workspaceDir
    ? `${API_BASE}/worktree-lanes?workspaceDir=${encodeURIComponent(workspaceDir)}`
    : `${API_BASE}/worktree-lanes`;
  try {
    const res = await apiFetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(`worktree-lanes list ${res.status}`);
    const body = (await res.json()) as { lanes: WorktreeLane[] };
    const lanes = body.lanes ?? [];
    try {
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(lanes));
    } catch {
      /* best-effort cache */
    }
    return lanes;
  } catch {
    // Offline / not-yet-imported fallback: read cache
    try {
      const cached = localStorage.getItem(LOCAL_CACHE_KEY);
      if (cached) return JSON.parse(cached) as WorktreeLane[];
    } catch {
      /* ignore */
    }
    return [];
  }
}

/**
 * Idempotent migration of legacy localStorage lanes to backend. Called
 * once per session at boot (`useServiceBootstrapper`); guard via
 * `BULK_IMPORT_FLAG` so we don't re-import on every page reload.
 */
export async function bulkImportFromLocalStorage(userId: string): Promise<{
  imported: number;
  updated: number;
  skipped: boolean;
}> {
  // Guard — don't re-import if already done in this session
  try {
    const flag = localStorage.getItem(BULK_IMPORT_FLAG);
    if (flag) {
      const last = parseInt(flag, 10);
      if (!Number.isNaN(last) && Date.now() - last < 24 * 3600 * 1000) {
        return { imported: 0, updated: 0, skipped: true };
      }
    }
  } catch {
    /* ignore */
  }

  const legacy = loadLegacyStoredLanes();
  if (!legacy.length) {
    try {
      localStorage.setItem(BULK_IMPORT_FLAG, String(Date.now()));
    } catch {
      /* ignore */
    }
    return { imported: 0, updated: 0, skipped: false };
  }

  const payload = {
    lanes: legacy.map((l) => ({
      userId,
      workspaceDir: typeof (l as { workspaceDir?: string }).workspaceDir === "string"
        ? (l as { workspaceDir?: string }).workspaceDir!
        : "",
      baseBranch: l.baseBranch || (l as { branch?: string }).branch || "",
      worktreeBranch: l.worktreeBranch || `lane-${l.id ?? "unknown"}`,
      worktreeDirectory: l.worktreeDirectory || `worktree-${l.id ?? "unknown"}`,
      mission: l.mission ?? "",
      focusFiles: l.focusFiles ?? "",
      status: (l.status as WorktreeLaneStatus) ?? "idle",
      agentId: null,
      agentTaskId: null,
    })),
  };

  try {
    const res = await apiFetch(`${API_BASE}/worktree-lanes/bulk-import`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`bulk-import ${res.status}`);
    const body = (await res.json()) as { imported: number; updated: number };
    try {
      localStorage.setItem(BULK_IMPORT_FLAG, String(Date.now()));
    } catch {
      /* ignore */
    }
    return { ...body, skipped: false };
  } catch {
    return { imported: 0, updated: 0, skipped: false };
  }
}

export async function updateLane(
  laneId: string,
  patch: Partial<
    Pick<
      WorktreeLane,
      | "mission"
      | "focusFiles"
      | "status"
      | "agentId"
      | "agentTaskId"
      | "baseBranch"
      | "worktreeBranch"
      | "worktreeDirectory"
    >
  >,
): Promise<WorktreeLane | null> {
  try {
    const res = await apiFetch(
      `${API_BASE}/worktree-lanes/${encodeURIComponent(laneId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(patch),
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { lane: WorktreeLane };
    return body.lane;
  } catch {
    return null;
  }
}

export async function rollbackLane(laneId: string): Promise<boolean> {
  try {
    const res = await apiFetch(
      `${API_BASE}/worktree-lanes/${encodeURIComponent(laneId)}/rollback`,
      {
        method: "POST",
        headers: authHeaders(),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}
