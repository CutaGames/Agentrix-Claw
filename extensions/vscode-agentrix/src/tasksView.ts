/**
 * Tree view: list of Agentrix background agent tasks for the signed-in user.
 *
 * Reads from `/api/agent-tasks`. Refreshed every 30s while the view is
 * visible (parent extension wires the timer).
 *
 * Rationale: we want IDE users to see Agentrix's long-running tasks
 * inline so they know "the work is happening even if my Cursor chat
 * window is closed". This is one of A_Path's headline differentiators.
 */

import * as vscode from "vscode";
import type { AgentrixApiClient, AgentTaskRecord } from "./apiClient";

class TaskItem extends vscode.TreeItem {
  constructor(public readonly record: AgentTaskRecord) {
    super(record.title, vscode.TreeItemCollapsibleState.None);
    const icon = TaskItem.statusIcon(record.status);
    this.description = `${icon} ${record.status}${record.progress != null && record.progress > 0 ? ` · ${record.progress}%` : ""}`;
    this.tooltip = TaskItem.buildTooltip(record);
    this.contextValue = `agentrix.task.${record.status}`;
    this.iconPath = new vscode.ThemeIcon(TaskItem.themeIcon(record.status));
  }

  private static statusIcon(status: string): string {
    switch (status) {
      case "queued": return "🟦";
      case "running": return "🟡";
      case "succeeded": return "✅";
      case "failed": return "❌";
      case "canceled": return "⚪";
      default: return "•";
    }
  }

  private static themeIcon(status: string): string {
    switch (status) {
      case "queued": return "circle-outline";
      case "running": return "loading~spin";
      case "succeeded": return "pass";
      case "failed": return "error";
      case "canceled": return "circle-slash";
      default: return "circle-outline";
    }
  }

  private static buildTooltip(record: AgentTaskRecord): string {
    const lines = [
      `${record.title}`,
      `Status: ${record.status}`,
      `Created: ${record.createdAt}`,
    ];
    if (record.resultSummary) {
      lines.push("", "Result:", record.resultSummary.slice(0, 800));
    }
    if (record.errorMessage) {
      lines.push("", "Error:", record.errorMessage.slice(0, 400));
    }
    return lines.join("\n");
  }
}

export class TasksViewProvider implements vscode.TreeDataProvider<TaskItem> {
  private readonly emitter = new vscode.EventEmitter<TaskItem | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly client: AgentrixApiClient,
    private readonly log: vscode.OutputChannel,
  ) {}

  refresh(): void {
    this.emitter.fire(undefined);
  }

  getTreeItem(element: TaskItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<TaskItem[]> {
    if (!(await this.client.hasToken())) {
      const item = new vscode.TreeItem("Sign in to view tasks");
      item.command = { command: "agentrix.signIn", title: "Sign in" };
      return [item as unknown as TaskItem];
    }
    try {
      const records = await this.client.listAgentTasks();
      if (records.length === 0) {
        const empty = new vscode.TreeItem("No background tasks yet");
        empty.description = "Use 'Agentrix: Create Long-Running Task'";
        return [empty as unknown as TaskItem];
      }
      return records.slice(0, 50).map((r) => new TaskItem(r));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.appendLine(`[tasksView] error: ${msg}`);
      const errItem = new vscode.TreeItem("Failed to load tasks");
      errItem.description = msg.slice(0, 80);
      return [errItem as unknown as TaskItem];
    }
  }
}
