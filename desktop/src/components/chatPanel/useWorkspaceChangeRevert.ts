import { useCallback } from "react";
import {
  parseWorkspaceWriteArtifact,
  revertWorkspaceFileBackup,
  type WorkspaceFileBackup,
} from "../../services/workspaceBackups";

interface UseWorkspaceChangeRevertParams {
  workspaceBackups: Record<string, WorkspaceFileBackup>;
  upsertWorkspaceBackup: (backup: WorkspaceFileBackup) => void;
  removeWorkspaceBackup: (filePath: string) => void;
  refreshWorkspaceChanges: () => Promise<void> | void;
  addSystemMessage: (content: string) => void;
}

export function useWorkspaceChangeRevert({
  workspaceBackups,
  upsertWorkspaceBackup,
  removeWorkspaceBackup,
  refreshWorkspaceChanges,
  addSystemMessage,
}: UseWorkspaceChangeRevertParams) {
  const handleWorkspaceWriteArtifact = useCallback((toolName: string, rawResult: unknown) => {
    if (!/(write|edit)/i.test(toolName)) {
      return;
    }

    const artifact = parseWorkspaceWriteArtifact(rawResult);
    if (!artifact) {
      return;
    }

    if (artifact.backup) {
      upsertWorkspaceBackup(artifact.backup);
    }

    if (artifact.diffPreview?.trim()) {
      addSystemMessage([
        `🧩 Workspace file updated: ${artifact.path}`,
        "Inline diff preview:",
        `\`\`\`diff\n${artifact.diffPreview.slice(0, 4000)}\n\`\`\``,
        "Undo is available from Task Workbench.",
      ].join("\n"));
    }
  }, [addSystemMessage, upsertWorkspaceBackup]);

  const handleRevertWorkspaceChange = useCallback(async (filePath: string) => {
    const backup = workspaceBackups[filePath];
    if (!backup) {
      return;
    }

    try {
      await revertWorkspaceFileBackup(backup);
      removeWorkspaceBackup(filePath);
      await refreshWorkspaceChanges();
      addSystemMessage(`↩️ Reverted workspace change for ${filePath}.`);
    } catch (error: any) {
      addSystemMessage(`❌ Failed to revert ${filePath}: ${error?.message || String(error)}`);
    }
  }, [addSystemMessage, refreshWorkspaceChanges, removeWorkspaceBackup, workspaceBackups]);

  return {
    handleWorkspaceWriteArtifact,
    handleRevertWorkspaceChange,
  };
}
