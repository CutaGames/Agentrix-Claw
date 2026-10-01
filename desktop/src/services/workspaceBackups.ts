import {
  deleteWorkspaceFile,
  listWorkspaceDir,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "./workspace";

export interface WorkspaceFileBackup {
  id: string;
  targetPath: string;
  backupPath: string;
  existedBefore: boolean;
  createdAt: number;
  size: number;
  diffPreview?: string;
}

interface WorkspaceFileBackupPayload {
  id: string;
  targetPath: string;
  existedBefore: boolean;
  createdAt: number;
  previousContent: string | null;
}

export interface WorkspaceWriteFileArtifact {
  success: boolean;
  path: string;
  workspaceRoot?: string;
  bytesWritten?: number;
  backup?: WorkspaceFileBackup;
  diffPreview?: string;
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function toDiffLines(value: string) {
  if (!value.length) {
    return [] as string[];
  }
  return normalizeLineEndings(value).split("\n");
}

function diffHunkRange(start: number, count: number) {
  if (count === 0) {
    return "0,0";
  }
  return `${start},${count}`;
}

function buildUnifiedDiff(path: string, beforeContent: string | null, afterContent: string) {
  const beforeLines = toDiffLines(beforeContent || "");
  const afterLines = toDiffLines(afterContent);
  const hadPreviousContent = beforeContent != null;
  const oldStart = beforeLines.length > 0 ? 1 : 0;
  const newStart = afterLines.length > 0 ? 1 : 0;
  const header = [
    `diff --git a/${path} b/${path}`,
    hadPreviousContent ? `--- a/${path}` : "--- /dev/null",
    `+++ b/${path}`,
    `@@ -${diffHunkRange(oldStart, beforeLines.length)} +${diffHunkRange(newStart, afterLines.length)} @@`,
  ];
  const body = [
    ...beforeLines.map((line) => `-${line}`),
    ...afterLines.map((line) => `+${line}`),
  ];
  return [...header, ...body].join("\n");
}

export const BACKUP_DIR = ".agentrix/backup";
export const BACKUP_CREATED_EVENT = "agentrix:workspace-backup-created";

let backupDirIgnored = false;

/**
 * Desktop D3 — snapshots hold the previous file content, which can include
 * secrets (e.g. a `.env` the owner confirmed on this computer). Make sure the
 * snapshot folder can never be committed from the user's workspace.
 */
export async function ensureBackupDirIgnored(): Promise<void> {
  if (backupDirIgnored) return;
  const ignorePath = `${BACKUP_DIR}/.gitignore`;
  try {
    const existing = await readWorkspaceFile(ignorePath);
    if (existing.split(/\r?\n/).some((line) => line.trim() === "*")) {
      backupDirIgnored = true;
      return;
    }
  } catch {
    /* missing — create below */
  }
  await writeWorkspaceFile(ignorePath, "# Agentrix snapshots (may contain previous file contents). Never commit.\n*\n");
  backupDirIgnored = true;
}

/** Test hook: forget the cached "already ignored" state. */
export function resetBackupDirIgnoredCache() {
  backupDirIgnored = false;
}

/** Absolute path inside `workspaceRoot` → workspace-relative path, else null. */
export function toWorkspaceRelativePath(absolutePath: string, workspaceRoot: string | null | undefined): string | null {
  if (!workspaceRoot) return null;
  const norm = (value: string) => value.trim().replace(/\\/g, "/").replace(/\/+$/g, "");
  const root = norm(workspaceRoot);
  const target = norm(absolutePath);
  const caseInsensitive = /^[a-z]:\//i.test(root);
  const rootKey = caseInsensitive ? root.toLowerCase() : root;
  const targetKey = caseInsensitive ? target.toLowerCase() : target;
  if (!targetKey.startsWith(`${rootKey}/`)) return null;
  const relative = target.slice(root.length + 1);
  if (!relative || relative.split("/").some((segment) => segment === ".." || segment === "")) return null;
  return relative;
}

function buildBackupId(relativePath: string) {
  const safePath = relativePath.replace(/[^a-zA-Z0-9._/-]+/g, "-").replace(/[\/]+/g, "_").slice(-80);
  return `backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safePath || "workspace-file"}`;
}

export async function createWorkspaceFileBackup(relativePath: string, nextContent: string) {
  let previousContent: string | null = null;
  let existedBefore = false;

  try {
    previousContent = await readWorkspaceFile(relativePath);
    existedBefore = true;
  } catch {
    previousContent = null;
  }

  await ensureBackupDirIgnored();

  const createdAt = Date.now();
  const id = buildBackupId(relativePath);
  const backupPath = `${BACKUP_DIR}/${id}.json`;
  const diffPreview = buildUnifiedDiff(relativePath, previousContent, nextContent);
  const payload: WorkspaceFileBackupPayload = {
    id,
    targetPath: relativePath,
    existedBefore,
    createdAt,
    previousContent,
  };

  await writeWorkspaceFile(backupPath, JSON.stringify(payload, null, 2));

  const backup: WorkspaceFileBackup = {
    id,
    targetPath: relativePath,
    backupPath,
    existedBefore,
    createdAt,
    size: new TextEncoder().encode(previousContent || "").length,
    diffPreview,
  };

  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(BACKUP_CREATED_EVENT, { detail: backup }));
    } catch {
      /* non-DOM host */
    }
  }

  return { backup, diffPreview };
}

export async function revertWorkspaceFileBackup(backup: WorkspaceFileBackup) {
  const raw = await readWorkspaceFile(backup.backupPath);
  const payload = JSON.parse(raw) as WorkspaceFileBackupPayload;

  if (payload.existedBefore) {
    await writeWorkspaceFile(payload.targetPath, payload.previousContent || "");
    return;
  }

  await deleteWorkspaceFile(payload.targetPath);
}

const BACKUP_FILE_PATTERN = /^backup-(\d{10,})-[a-z0-9]+-.*\.json$/;

/**
 * Desktop D3 — snapshots on disk (they survive a restart; the chat runtime
 * store only knows this session's). Newest first. Malformed files are skipped.
 */
export async function listWorkspaceFileBackups(options: { since?: number; limit?: number } = {}): Promise<WorkspaceFileBackup[]> {
  let entries: Array<{ name: string; is_dir: boolean; size: number }> = [];
  try {
    entries = await listWorkspaceDir(BACKUP_DIR);
  } catch {
    return [];
  }
  const candidates = entries
    .filter((entry) => !entry.is_dir)
    .map((entry) => ({ entry, match: BACKUP_FILE_PATTERN.exec(entry.name) }))
    .filter((item): item is { entry: typeof item.entry; match: RegExpExecArray } => Boolean(item.match))
    .map((item) => ({ name: item.entry.name, createdAt: Number(item.match[1]) }))
    .filter((item) => options.since == null || item.createdAt >= options.since)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, options.limit ?? 200);

  const backups: WorkspaceFileBackup[] = [];
  for (const candidate of candidates) {
    const backupPath = `${BACKUP_DIR}/${candidate.name}`;
    try {
      const payload = JSON.parse(await readWorkspaceFile(backupPath)) as WorkspaceFileBackupPayload;
      if (typeof payload.targetPath !== "string" || typeof payload.id !== "string") continue;
      backups.push({
        id: payload.id,
        targetPath: payload.targetPath,
        backupPath,
        existedBefore: Boolean(payload.existedBefore),
        createdAt: Number(payload.createdAt) || candidate.createdAt,
        size: new TextEncoder().encode(payload.previousContent || "").length,
      });
    } catch {
      /* unreadable snapshot — skip */
    }
  }
  return backups.sort((a, b) => b.createdAt - a.createdAt);
}

/** Newest snapshot per file. */
export function latestBackupPerFile(backups: WorkspaceFileBackup[]): WorkspaceFileBackup[] {
  const byPath = new Map<string, WorkspaceFileBackup>();
  for (const backup of backups) {
    const current = byPath.get(backup.targetPath);
    if (!current || backup.createdAt > current.createdAt) byPath.set(backup.targetPath, backup);
  }
  return [...byPath.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * "撤销全部": for each file, the OLDEST snapshot in the set — restoring it puts
 * the file back to how it was before the first AI change in that period.
 */
export function planRevertAll(backups: WorkspaceFileBackup[]): WorkspaceFileBackup[] {
  const byPath = new Map<string, WorkspaceFileBackup>();
  for (const backup of backups) {
    const current = byPath.get(backup.targetPath);
    if (!current || backup.createdAt < current.createdAt) byPath.set(backup.targetPath, backup);
  }
  return [...byPath.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * One row per file (REQ-desktop-052 a, same rule as other AIs' rows): undo
 * goes back to the file's OLDEST snapshot in the set, i.e. to how it was
 * before the first AI change in that period. `latestAt` is only for display.
 */
export interface WorkspaceBackupFileRow {
  targetPath: string;
  earliest: WorkspaceFileBackup;
  latestAt: number;
  edits: number;
}

export function groupBackupsByFile(backups: WorkspaceFileBackup[]): WorkspaceBackupFileRow[] {
  const byPath = new Map<string, WorkspaceBackupFileRow>();
  for (const backup of backups) {
    const row = byPath.get(backup.targetPath);
    if (!row) {
      byPath.set(backup.targetPath, { targetPath: backup.targetPath, earliest: backup, latestAt: backup.createdAt, edits: 1 });
      continue;
    }
    row.edits += 1;
    if (backup.createdAt < row.earliest.createdAt) row.earliest = backup;
    if (backup.createdAt > row.latestAt) row.latestAt = backup.createdAt;
  }
  return [...byPath.values()].sort((a, b) => b.latestAt - a.latestAt);
}

/**
 * Whether restoring `backup` would change the file now:
 * - `same`: the file is already as the snapshot left it (undone, or the edit
 *   never landed) — nothing to undo;
 * - `changed`: undo would change it (including a file that was deleted since);
 * - `unknown`: the snapshot or the file cannot be read — treated as undoable,
 *   never as "same".
 * Reads only; never writes the file or the snapshot folder.
 */
export type BackupCurrentState = "same" | "changed" | "unknown";

async function workspaceFileExists(relativePath: string): Promise<boolean | null> {
  const slash = relativePath.lastIndexOf("/");
  const dir = slash >= 0 ? relativePath.slice(0, slash) : "";
  const name = slash >= 0 ? relativePath.slice(slash + 1) : relativePath;
  try {
    const entry = (await listWorkspaceDir(dir)).find((item) => item.name === name);
    if (!entry) return false;
    return entry.is_dir ? null : true;
  } catch {
    return null;
  }
}

export async function backupCurrentState(backup: WorkspaceFileBackup): Promise<BackupCurrentState> {
  let payload: WorkspaceFileBackupPayload;
  try {
    payload = JSON.parse(await readWorkspaceFile(backup.backupPath)) as WorkspaceFileBackupPayload;
  } catch {
    return "unknown";
  }
  if (!payload || payload.targetPath !== backup.targetPath) return "unknown";
  if (!payload.existedBefore) {
    const exists = await workspaceFileExists(backup.targetPath);
    return exists === null ? "unknown" : exists ? "changed" : "same";
  }
  try {
    const now = await readWorkspaceFile(backup.targetPath);
    return now === (payload.previousContent || "") ? "same" : "changed";
  } catch {
    // Gone since: undo would bring it back. Anything else: cannot tell.
    return (await workspaceFileExists(backup.targetPath)) === false ? "changed" : "unknown";
  }
}

/** Merge snapshot lists by id (store + disk). */
export function mergeBackups(...lists: WorkspaceFileBackup[][]): WorkspaceFileBackup[] {
  const byId = new Map<string, WorkspaceFileBackup>();
  for (const list of lists) for (const backup of list) byId.set(backup.id, { ...byId.get(backup.id), ...backup });
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function parseWorkspaceWriteArtifact(raw: unknown): WorkspaceWriteFileArtifact | null {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const artifact = parsed as Partial<WorkspaceWriteFileArtifact>;
    if (artifact.success !== true || typeof artifact.path !== "string") {
      return null;
    }

    return {
      success: true,
      path: artifact.path,
      workspaceRoot: typeof artifact.workspaceRoot === "string" ? artifact.workspaceRoot : undefined,
      bytesWritten: typeof artifact.bytesWritten === "number" ? artifact.bytesWritten : undefined,
      backup: artifact.backup && typeof artifact.backup === "object"
        ? artifact.backup as WorkspaceFileBackup
        : undefined,
      diffPreview: typeof artifact.diffPreview === "string" ? artifact.diffPreview : undefined,
    };
  } catch {
    return null;
  }
}