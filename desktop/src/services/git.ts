import { invoke } from "@tauri-apps/api/core";

export interface GitFileChange {
  status: string;
  file: string;
}

export interface GitStatusResult {
  branch: string;
  changes: GitFileChange[];
  ahead: number;
  behind: number;
  isClean: boolean;
}

export interface GitLogEntry {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
}

export interface GitCommitResult {
  hash: string;
  message: string;
  filesChanged: number;
}

export interface GitCommandResult {
  success: boolean;
  command: string;
  output: string;
}

export async function gitStatus(): Promise<GitStatusResult> {
  return invoke<GitStatusResult>("desktop_bridge_git_status");
}

export async function gitDiff(staged = false, filePath?: string): Promise<string> {
  return invoke<string>("desktop_bridge_git_diff", { staged, filePath: filePath ?? null });
}

export async function gitLog(count = 10): Promise<GitLogEntry[]> {
  return invoke<GitLogEntry[]>("desktop_bridge_git_log", { count });
}

export async function gitCommit(message: string, addAll = true): Promise<GitCommitResult> {
  return invoke<GitCommitResult>("desktop_bridge_git_commit", { message, addAll });
}

export async function gitBranchList(): Promise<string[]> {
  return invoke<string[]>("desktop_bridge_git_branch_list");
}

export async function gitPush(remote?: string, branch?: string, setUpstream = false): Promise<GitCommandResult> {
  return invoke<GitCommandResult>("desktop_bridge_git_push", {
    remote: remote ?? null,
    branch: branch ?? null,
    setUpstream,
  });
}

export async function gitPull(remote?: string, branch?: string, rebase = false, autostash = true): Promise<GitCommandResult> {
  return invoke<GitCommandResult>("desktop_bridge_git_pull", {
    remote: remote ?? null,
    branch: branch ?? null,
    rebase,
    autostash,
  });
}

export async function gitCheckout(branch: string, create = false): Promise<GitCommandResult> {
  return invoke<GitCommandResult>("desktop_bridge_git_checkout", { branch, create });
}

export async function gitStash(action: "push" | "pop" | "list" = "push", message?: string, includeUntracked = false): Promise<GitCommandResult> {
  return invoke<GitCommandResult>("desktop_bridge_git_stash", {
    action,
    message: message ?? null,
    includeUntracked,
  });
}
