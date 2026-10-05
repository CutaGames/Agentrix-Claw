export const APPROX_CHARS_PER_TOKEN = 4;
export const LONG_LOCAL_PREFILL_TOKEN_THRESHOLD = 3000;
export const DESKTOP_LOCAL_CONTEXT_BUDGET_TOKENS = 6500;
export const DESKTOP_DIRECT_CONTEXT_BUDGET_TOKENS = 60000;
export const MANUAL_MODEL_SELECTION_GRACE_MS = 20_000;
export const STALE_DESKTOP_TASK_WINDOW_MS = 45_000;
export const RECENT_DESKTOP_FAILURE_WINDOW_MS = 15_000;
export const CHAT_AUTO_CONTINUE_LIMIT = 6;
export const STREAM_CHUNK_FLUSH_MS = 50;
export const CHECKPOINT_CONTINUE_PROMPT = "Continue from the latest checkpoint. Preserve the active plan, task progress, and any pending background results.";
export const TASK_LIKE_PROMPT_PATTERN = /([a-z]:\\|\\|\/|\.tsx?\b|\.jsx?\b|\.json\b|\.md\b|package\.json|readme|src\/|backend\/|desktop\/|```|\n)|\b(search|find|install|run|execute|debug|fix|edit|write|read|open|grep|list|analy[sz]e|inspect|deploy|build|test|git|ssh|workspace|file|folder|directory|project|repo|code|patch|benchmark|profile|trace|continue|resume)\b|搜索|安装|运行|执行|修复|修改|查看|列出|分析|排查|部署|构建|测试|工作区|文件|目录|项目|仓库|代码/i;

export function estimateLocalPrefillTokens(messages: Array<{ content: string }>): number {
  const totalChars = messages.reduce((sum, message) => sum + message.content.length, 0);
  return Math.max(1, Math.round(totalChars / APPROX_CHARS_PER_TOKEN));
}

export function getLocalPrefillFeedback(messages: Array<{ content: string }>) {
  const estimatedTokens = estimateLocalPrefillTokens(messages);
  const isLongContext = estimatedTokens >= LONG_LOCAL_PREFILL_TOKEN_THRESHOLD;

  return {
    tone: "info" as const,
    label: isLongContext ? "长上下文预填充中" : "上下文预填充中",
    detail: isLongContext
      ? `本地模型已就绪，正在预处理约 ${estimatedTokens.toLocaleString()} tokens 的上下文`
      : `本地模型已就绪，正在预处理约 ${estimatedTokens.toLocaleString()} tokens 的上下文`,
  };
}
