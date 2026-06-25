import { invoke } from "@tauri-apps/api/core";

export type LspServer = "typescript" | "rust-analyzer";

export interface LspSidecarStatus {
  server: LspServer;
  available: boolean;
  running: boolean;
  command?: string | null;
  message?: string | null;
}

export function getLspStatus(server: LspServer, workspaceDir?: string): Promise<LspSidecarStatus> {
  return invoke<LspSidecarStatus>("desktop_bridge_lsp_status", {
    server,
    workspaceDir: workspaceDir ?? null,
  });
}

export function startLspSidecar(server: LspServer, workspaceDir?: string): Promise<LspSidecarStatus> {
  return invoke<LspSidecarStatus>("desktop_bridge_start_lsp_sidecar", {
    server,
    workspaceDir: workspaceDir ?? null,
  });
}

export function stopLspSidecar(server: LspServer): Promise<LspSidecarStatus> {
  return invoke<LspSidecarStatus>("desktop_bridge_stop_lsp_sidecar", { server });
}
