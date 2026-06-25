/**
 * Agentrix VS Code / Cursor / Windsurf extension — entry point.
 *
 * C_Path main form per `docs/agentrix-positioning-2026-05.zh-CN.md` §7 P3.
 *
 * What this extension does:
 *   - Sign in / out against api.agentrix.top (PAT or device-code flow)
 *   - Inject an Agentrix chat view in the activity bar
 *   - List background agent tasks (long-running)
 *   - Recall cross-tool memory slots from the IDE
 *
 * What this extension explicitly does NOT do:
 *   - Compete with Cursor on inline editor features (Tab completion,
 *     Cmd+K inline edit, Go-to-Definition). The extension *uses*
 *     IDE-native versions of these — it does not reimplement them.
 *   - Bundle a Monaco instance. We render diffs and code via VS Code's
 *     own editor where possible (`vscode.commands.executeCommand`).
 */

import * as vscode from "vscode";
import { AgentrixApiClient } from "./apiClient";
import { ChatViewProvider } from "./chatView";
import { TasksViewProvider } from "./tasksView";

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel("Agentrix");
  context.subscriptions.push(log);

  const config = () => vscode.workspace.getConfiguration("agentrix");
  const apiBase = () =>
    String(config().get("apiBaseUrl") || "https://api.agentrix.top");

  const client = new AgentrixApiClient({
    apiBase,
    secrets: context.secrets,
    log,
  });

  // ── Webview chat ────────────────────────────────────────────────────
  const chatProvider = new ChatViewProvider(context, client, log);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "agentrix.chat",
      chatProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // ── Tree view: background tasks ─────────────────────────────────────
  const tasksProvider = new TasksViewProvider(client, log);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("agentrix.tasks", tasksProvider),
  );
  // Refresh tasks every 30s while the view is visible.
  const tasksTicker = setInterval(() => tasksProvider.refresh(), 30_000);
  context.subscriptions.push({ dispose: () => clearInterval(tasksTicker) });

  // ── Commands ────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("agentrix.openChat", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.agentrix");
      await vscode.commands.executeCommand("agentrix.chat.focus");
    }),

    vscode.commands.registerCommand("agentrix.signIn", async () => {
      try {
        const ok = await client.signInWithPat();
        if (ok) {
          void vscode.window.showInformationMessage("Agentrix: signed in");
          await chatProvider.refreshHandshake();
          await tasksProvider.refresh();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Agentrix sign-in failed: ${msg}`);
      }
    }),

    vscode.commands.registerCommand("agentrix.signOut", async () => {
      await client.signOut();
      void vscode.window.showInformationMessage("Agentrix: signed out");
      await chatProvider.refreshHandshake();
    }),

    vscode.commands.registerCommand("agentrix.createAgentTask", async () => {
      const title = await vscode.window.showInputBox({
        prompt: "Agentrix — task title",
        placeHolder: "e.g. 整理本周开发周报",
      });
      if (!title) return;
      const prompt = await vscode.window.showInputBox({
        prompt: "Agentrix — what should the agent do?",
        placeHolder: "Describe in plain language…",
      });
      if (!prompt) return;
      try {
        const task = await client.createAgentTask({ title, prompt });
        void vscode.window.showInformationMessage(
          `Agentrix: task created — id ${task.id.slice(0, 8)}`,
        );
        await tasksProvider.refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Agentrix task failed: ${msg}`);
      }
    }),

    vscode.commands.registerCommand("agentrix.recallMemory", async () => {
      try {
        const slots = await client.recallMemory({ limit: 10 });
        if (!slots || slots.length === 0) {
          void vscode.window.showInformationMessage(
            "Agentrix: no cross-tool memory yet for this user.",
          );
          return;
        }
        const lines = slots.map((s, i) => `${i + 1}. ${s.summary || s.key}`);
        const doc = await vscode.workspace.openTextDocument({
          content: lines.join("\n"),
          language: "markdown",
        });
        await vscode.window.showTextDocument(doc, { preview: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(
          `Agentrix recall failed: ${msg}`,
        );
      }
    }),
  );

  log.appendLine(`Agentrix extension activated (apiBase=${apiBase()})`);
}

export function deactivate(): void {
  // VS Code disposes registered subscriptions automatically. Nothing
  // to do here — we intentionally avoid global state.
}
