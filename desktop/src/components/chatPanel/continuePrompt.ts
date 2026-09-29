import { CHECKPOINT_CONTINUE_PROMPT } from "./contextBudget";

const DEFAULT_CONTINUE_PROMPT = "Continue from exactly where you stopped. Do not repeat completed content. Preserve the same language, structure, and formatting. If you were in the middle of a tool-driven task, resume the unfinished steps first and only summarize after the task is complete.";

export function buildContinuePrompt() {
  return DEFAULT_CONTINUE_PROMPT;
}

export function isSyntheticContinuePrompt(value: string) {
  return value === DEFAULT_CONTINUE_PROMPT || value === CHECKPOINT_CONTINUE_PROMPT;
}