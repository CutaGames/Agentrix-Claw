import { invoke } from "@tauri-apps/api/core";

export type SupportedIdeTarget = "cursor" | "vscode";

export interface OpenInIdeOptions {
  path: string;
  line?: number;
  column?: number;
  editor?: SupportedIdeTarget;
}

export async function openInIde({
  path,
  line,
  column,
  editor,
}: OpenInIdeOptions): Promise<string> {
  return invoke<string>("desktop_bridge_open_in_ide", {
    path,
    line,
    column,
    editor,
  });
}
