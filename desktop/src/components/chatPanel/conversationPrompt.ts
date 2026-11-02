/**
 * ChatPanel helpers with no React state (moved out of ChatPanelImpl.tsx
 * unchanged): model label, system messages, chat-mode routing, the
 * "looks unfinished" check for auto-continue, and small formatters.
 */
import type { GitFileChange } from "../../services/git";
import type { DesktopAgent, OpenClawInstance } from "../../services/store";
import { getDesktopLocalModelLabel, isDesktopLocalModelId } from "../../services/localChat";

export type ChatMode = "ask" | "agent" | "plan";

export function filterWorkspaceChangeList(changes: GitFileChange[]) {
  return changes.filter((change) => !change.file.startsWith(".agentrix/backup/"));
}

export function getConversationModelLabel(
  modelId: string,
  models: Array<{ id: string; label?: string }>,
  activeInstance?: OpenClawInstance,
): string | null {
  if (!modelId && activeInstance?.resolvedModelLabel) {
    return activeInstance.resolvedModelLabel;
  }

  if (isDesktopLocalModelId(modelId)) {
    return getDesktopLocalModelLabel(modelId);
  }

  const matchedModel = models.find((model) => model.id === modelId);
  if (matchedModel?.label) {
    return matchedModel.label;
  }

  if (activeInstance?.resolvedModel === modelId && activeInstance.resolvedModelLabel) {
    return activeInstance.resolvedModelLabel;
  }

  return modelId || activeInstance?.resolvedModel || null;
}

export function looksIncompleteAssistantOutput(text: string): boolean {
  const value = text.trim();
  if (value.length < 24) return false;

  const codeFenceCount = (value.match(/```/g) || []).length;
  if (codeFenceCount % 2 === 1) return true;

  const lastLine = value.split(/\r?\n/).filter(Boolean).pop() || value;
  if (/[。！？.!?…」』】》`]$/.test(lastLine)) return false;

  if (/[：:]$/.test(lastLine)) return true;
  if (/([（(\[{「『《]$|[,，、;；]$)/.test(lastLine)) return true;
  if (/(让我|我来|我会|现在|接下来|下一步|首先|然后|继续|准备|开始|正在|请稍等|稍等|马上|立刻|即将|尝试|测试|验证|检查|执行|运行|实施|展示|演示|看看|让我们|let me|i will|i'll|next|first|then|now|trying|testing|running|verifying|checking|let's|going to)\s*[：:]?$/i.test(lastLine)) {
    return true;
  }
  if (/[-*]\s*$/.test(lastLine)) return true;

  // Trailing "现在我..." / "我现在..." style sentences without terminal
  // punctuation (exactly the user-reported "stops at '需要测试'" case).
  if (/(现在我|我现在|让我现在|此刻我|目前我)/.test(lastLine) && lastLine.length < 80) {
    return true;
  }

  // Tool-narration without follow-up action: "我会调用 desktop_run_command"
  // often appears as the very last sentence when the loop terminates early.
  if (/(调用|invoke|call)\s*(?:tool|工具|desktop_|computer_use_|\w+_\w+)/i.test(lastLine)) {
    return true;
  }

  return false;
}

export function sanitizeAgentProfile(raw?: string | null): string {
  if (!raw) return "";
  // Strip phrases that falsely hardcode an underlying model (e.g. "我的底层驱动是 Gemini 3.1 Pro").
  // Keeps persona/role description intact while preventing identity contradictions across tiers.
  const patterns: RegExp[] = [
    /my (underlying |底层\s*)?(model|engine|llm|驱动)[^\n]*?(gemini|claude|gpt|gemma|llama|qwen|mistral|deepseek)[^\n]*/gi,
    /powered by (gemini|claude|gpt|gemma|llama|qwen|mistral|deepseek)[^\n]*/gi,
    /我的底层驱动是[^\n。]*/g,
    /我基于[^\n。]*(gemini|claude|gpt|gemma)[^\n]*/gi,
  ];
  let cleaned = raw;
  for (const p of patterns) cleaned = cleaned.replace(p, "");
  return cleaned.trim();
}

export function buildConversationSystemMessages(
  activeAgent: DesktopAgent | null,
  modelLabel: string | null,
  tier: "local" | "cloud" = "cloud",
  installedSkills?: Array<{ id?: string; name?: string; version?: string }> | null,
): Array<{ role: "system"; content: string }> {
  const systemMessages: Array<{ role: "system"; content: string }> = [];

  if (tier === "local") {
    // Local tier (Gemma/llama.cpp) can latch onto training-data identities (e.g. claim to be
    // Gemini/Claude) unless strongly anchored. Keep this block terse but emphatic.
    systemMessages.push({
      role: "system",
      content:
        "You run locally on the user's device via the Agentrix desktop runtime. " +
        "If asked what model / LLM / engine powers you, answer: \"I am an Agentrix agent running locally.\" " +
        "Do NOT claim to be Gemini, Claude, GPT, Bard, Gemma, Llama, or any other specific model, " +
        "even if internal training suggests one. Never contradict this identity.",
    });
    if (installedSkills && installedSkills.length > 0) {
      const skillList = installedSkills
        .slice(0, 30)
        .map((s) => s.name || s.id || "")
        .filter(Boolean)
        .join(", ");
      if (skillList) {
        systemMessages.push({
          role: "system",
          content:
            `Installed skills on this Agentrix instance (${installedSkills.length} total): ${skillList}. ` +
            "If the user asks which skills are installed, list these by name. Do NOT say 'no skills' or 'I don't have skills'.",
        });
      }
    } else if (installedSkills && installedSkills.length === 0) {
      systemMessages.push({
        role: "system",
        content: "No skills are currently installed on this Agentrix instance.",
      });
    }
  } else if (modelLabel) {
    systemMessages.push({
      role: "system",
      content: `Current selected model for this conversation: "${modelLabel}". If the user asks which model is currently selected, answer with this exact label. Do not claim to be a different model.`,
    });
  }

  const agentProfile = sanitizeAgentProfile(activeAgent?.description);
  if (agentProfile) {
    systemMessages.push({
      role: "system",
      content: `Agent profile: ${agentProfile}\nKeep replies aligned with this profile while preserving the user's intent.`,
    });
  }

  return systemMessages;
}

export function resolveEffectiveChatMode(
  requestedMode: ChatMode,
  _text: string,
  _attachmentCount: number,
  _hasActivePlan: boolean,
): ChatMode {
  // Respect the user's explicit mode selection.
  // The previous heuristic downgraded manually-selected `agent` mode back to
  // `ask` for short prompts, which silently disabled tools for queries like
  // weather/search/file requests and made the desktop feel "permissionless".
  return requestedMode;
}

export function shouldEscalateDesktopLocalTurn(effectiveChatMode: ChatMode, hasCloudPath: boolean): boolean {
  // Desktop targets VSCode-level capability for complex tasks.
  // agent/plan modes escalate to cloud for full tool orchestration (40+ tools, file ops, commands, 16-22 rounds).
  // ask mode runs locally without the heavier tool loop — fast, private, offline-capable.
  return hasCloudPath && (effectiveChatMode === "agent" || effectiveChatMode === "plan");
}

export function formatBytes(size: number) {
  if (!size) return "Unknown size";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function summarizeToolInput(input: unknown) {
  if (input == null) return "准备执行工具";
  if (typeof input === "string") return truncateMiddle(input, 120);
  try {
    return truncateMiddle(JSON.stringify(input), 120);
  } catch {
    return "工具参数已准备";
  }
}

export function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}
