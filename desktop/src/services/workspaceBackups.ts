import {
  deleteWorkspaceFile,
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

  const createdAt = Date.now();
  const id = buildBackupId(relativePath);
  const backupPath = `.agentrix/backup/${id}.json`;
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