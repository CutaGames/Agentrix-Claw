import { invoke } from "@tauri-apps/api/core";

export interface FileEntry {
  name: string;
  is_dir: boolean;
  size: number;
}

export interface WorkspaceSearchMatch {
  path: string;
  lineNumber: number;
  column: number;
  lineText: string;
}

export interface WorkspaceSearchResult {
  query: string;
  root: string;
  matches: WorkspaceSearchMatch[];
  truncated: boolean;
  durationMs: number;
}

export interface WorkspaceSearchParams {
  query: string;
  pathFilter?: string;
  maxResults?: number;
  caseSensitive?: boolean;
}

export async function setWorkspaceDir(path: string): Promise<string> {
  return invoke<string>("desktop_bridge_set_workspace_dir", { path });
}

export async function getWorkspaceDir(): Promise<string | null> {
  return invoke<string | null>("desktop_bridge_get_workspace_dir");
}

export async function listWorkspaceDir(relativePath: string = ""): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("desktop_bridge_list_workspace_dir", { relativePath });
}

export async function readWorkspaceFile(relativePath: string): Promise<string> {
  return invoke<string>("desktop_bridge_read_workspace_file", { relativePath });
}

export async function writeWorkspaceFile(relativePath: string, content: string): Promise<void> {
  return invoke<void>("desktop_bridge_write_workspace_file", { relativePath, content });
}

export async function deleteWorkspaceFile(relativePath: string): Promise<void> {
  return invoke<void>("desktop_bridge_delete_workspace_file", { relativePath });
}

export async function searchWorkspaceFiles(params: WorkspaceSearchParams): Promise<WorkspaceSearchResult> {
  return invoke<WorkspaceSearchResult>("desktop_bridge_search_workspace_files", {
    query: params.query,
    pathFilter: params.pathFilter,
    maxResults: params.maxResults,
    caseSensitive: params.caseSensitive,
  });
}

function normalizeDialogSelection(selected: string | string[] | null): string | null {
  if (!selected) return null;
  if (typeof selected === "string") return selected;
  return selected[0] || null;
}

export async function pickWorkspaceFolder(): Promise<string | null> {
  let dialogError: unknown = null;

  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = normalizeDialogSelection(
      await open({
        directory: true,
        multiple: false,
        title: "Select Workspace Folder",
      }),
    );
    if (!selected) return null;
    return setWorkspaceDir(selected);
  } catch (error: unknown) {
    dialogError = error;
  }

  try {
    return await invoke<string | null>("desktop_bridge_pick_workspace_dir");
  } catch (bridgeError: any) {
    const dialogMessage = typeof (dialogError as any)?.message === "string" && (dialogError as any).message.trim()
      ? (dialogError as any).message.trim()
      : null;
    const bridgeMessage = typeof bridgeError?.message === "string" && bridgeError.message.trim()
      ? bridgeError.message.trim()
      : null;

    const message = dialogMessage && bridgeMessage
      ? `Failed to open the workspace picker. dialog=${dialogMessage}; bridge=${bridgeMessage}`
      : dialogMessage || bridgeMessage || "Failed to open the workspace picker.";

    throw new Error(message);
  }
}
