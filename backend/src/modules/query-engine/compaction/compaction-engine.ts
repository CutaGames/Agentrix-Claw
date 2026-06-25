/**
 * Auto-Compaction Engine
 *
 * Reference: Claude Code's snipReplay compaction system.
 * When context grows too large, automatically generates a structured
 * summary of the conversation and replaces the full history.
 *
 * 9-step structured summary:
 * 1. Original user request
 * 2. Completed steps
 * 3. Current state / in-progress work
 * 4. Key decisions made
 * 5. Files touched (created/modified/deleted)
 * 6. Tool results summary
 * 7. Active errors or blockers
 * 8. Remaining tasks
 * 9. Important context to remember
 */
import { Logger } from '@nestjs/common';
import { ChatMessage } from '../interfaces';

const logger = new Logger('AutoCompaction');

// ============================================================
// Configuration
// ============================================================

export interface CompactionConfig {
  /** Context usage ratio threshold to trigger compaction (default 0.8) */
  triggerRatio?: number;
  /** Minimum messages before compaction is considered (default 10) */
  minMessages?: number;
  /** Max summary length in chars (default 6000) */
  maxSummaryChars?: number;
  /** Whether to preserve file references in summary (default true) */
  preserveFileRefs?: boolean;
}

const DEFAULT_CONFIG: Required<CompactionConfig> = {
  triggerRatio: 0.8,
  minMessages: 10,
  maxSummaryChars: 6000,
  preserveFileRefs: true,
};

// ============================================================
// Compaction Result
// ============================================================

export interface CompactionResult {
  /** The structured summary to replace conversation history */
  summary: string;
  /** Number of messages that were compacted */
  compactedMessageCount: number;
  /** Estimated tokens saved */
  tokensSaved: number;
  /** Files referenced in the conversation */
  fileRefs: string[];
  /** Tool names that were used */
  toolsUsed: string[];
}

// ============================================================
// Compaction Engine
// ============================================================

export class CompactionEngine {
  private readonly config: Required<CompactionConfig>;

  constructor(config?: CompactionConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if compaction should be triggered.
   */
  shouldCompact(
    messages: ChatMessage[],
    contextUsageRatio: number,
  ): boolean {
    return (
      messages.length >= this.config.minMessages &&
      contextUsageRatio >= this.config.triggerRatio
    );
  }

  /**
   * Generate a structured summary from conversation history.
   * This summary replaces the full history to free up context budget.
   *
   * Note: For production use, this should call an LLM to generate
   * the summary. This implementation provides a deterministic
   * extraction-based summary as a fallback.
   */
  compact(messages: ChatMessage[]): CompactionResult {
    const analysis = this.analyzeConversation(messages);
    const summary = this.buildStructuredSummary(analysis);

    const originalChars = messages.reduce(
      (sum, m) => sum + (m.content?.length ?? 0),
      0,
    );
    const tokensSaved = Math.floor((originalChars - summary.length) / 4);

    logger.log(
      `Compacted ${messages.length} messages → ${summary.length} chars ` +
      `(saved ~${tokensSaved} tokens)`,
    );

    return {
      summary,
      compactedMessageCount: messages.length,
      tokensSaved: Math.max(0, tokensSaved),
      fileRefs: analysis.fileRefs,
      toolsUsed: analysis.toolsUsed,
    };
  }

  /**
   * Apply compaction: replace message history with summary message.
   * Returns the new message array to use.
   */
  applyCompaction(
    messages: ChatMessage[],
    keepLastN: number = 2,
  ): { messages: ChatMessage[]; result: CompactionResult } {
    // Keep the last N messages (typically the latest user message + response)
    const toCompact = messages.slice(0, -keepLastN);
    const toKeep = messages.slice(-keepLastN);

    if (toCompact.length < this.config.minMessages) {
      return {
        messages,
        result: {
          summary: '',
          compactedMessageCount: 0,
          tokensSaved: 0,
          fileRefs: [],
          toolsUsed: [],
        },
      };
    }

    const result = this.compact(toCompact);

    const newMessages: ChatMessage[] = [
      {
        role: 'system',
        content: result.summary,
        timestamp: Date.now(),
      },
      ...toKeep,
    ];

    return { messages: newMessages, result };
  }

  // ==========================================================
  // Internal: Conversation Analysis
  // ==========================================================

  private analyzeConversation(messages: ChatMessage[]): ConversationAnalysis {
    const analysis: ConversationAnalysis = {
      originalRequest: '',
      completedSteps: [],
      currentState: '',
      keyDecisions: [],
      fileRefs: [],
      toolsUsed: [],
      toolResultsSummary: [],
      errors: [],
      remainingTasks: [],
      importantContext: [],
    };

    let firstUserMsg = true;

    for (const msg of messages) {
      // 1. Extract original request (first user message)
      if (msg.role === 'user' && firstUserMsg) {
        analysis.originalRequest = msg.content?.slice(0, 500) ?? '';
        firstUserMsg = false;
      }

      // Extract file references
      if (msg.content) {
        const fileMatches = msg.content.match(
          /(?:[\w-]+\/)*[\w-]+\.\w{1,10}/g,
        );
        if (fileMatches) {
          for (const f of fileMatches) {
            if (!analysis.fileRefs.includes(f) && f.includes('.')) {
              analysis.fileRefs.push(f);
            }
          }
        }
      }

      // Extract tool usage
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (!analysis.toolsUsed.includes(tc.name)) {
            analysis.toolsUsed.push(tc.name);
          }
        }
      }

      // Extract tool results
      if (msg.role === 'tool') {
        const summary = msg.content?.slice(0, 200) ?? '';
        analysis.toolResultsSummary.push(
          `[${msg.toolName || 'tool'}]: ${summary}`,
        );
      }

      // Extract errors from assistant messages
      if (msg.role === 'assistant' && msg.content) {
        const content = msg.content.toLowerCase();
        if (
          content.includes('error') ||
          content.includes('failed') ||
          content.includes('exception')
        ) {
          const errorLine = msg.content
            .split('\n')
            .find(
              (l) =>
                l.toLowerCase().includes('error') ||
                l.toLowerCase().includes('failed'),
            );
          if (errorLine) {
            analysis.errors.push(errorLine.trim().slice(0, 200));
          }
        }
      }

      // Extract completed steps from assistant messages
      if (msg.role === 'assistant' && msg.content) {
        const completedPatterns = [
          /(?:completed|finished|done|created|updated|fixed|implemented|added)\s+(.{10,80})/gi,
        ];
        for (const pattern of completedPatterns) {
          const matches = msg.content.matchAll(pattern);
          for (const match of matches) {
            if (analysis.completedSteps.length < 15) {
              analysis.completedSteps.push(match[1].trim());
            }
          }
        }
      }
    }

    // Limit file refs
    if (analysis.fileRefs.length > 20) {
      analysis.fileRefs = analysis.fileRefs.slice(0, 20);
    }

    return analysis;
  }

  // ==========================================================
  // Internal: Build Structured Summary
  // ==========================================================

  private buildStructuredSummary(analysis: ConversationAnalysis): string {
    const sections: string[] = [
      `[CONVERSATION SUMMARY — Auto-compacted at ${new Date().toISOString()}]`,
      '',
      '## 1. Original Request',
      analysis.originalRequest || '(not captured)',
      '',
    ];

    if (analysis.completedSteps.length > 0) {
      sections.push(
        '## 2. Completed Steps',
        ...analysis.completedSteps.map((s) => `- ${s}`),
        '',
      );
    }

    if (analysis.currentState) {
      sections.push('## 3. Current State', analysis.currentState, '');
    }

    if (analysis.keyDecisions.length > 0) {
      sections.push(
        '## 4. Key Decisions',
        ...analysis.keyDecisions.map((d) => `- ${d}`),
        '',
      );
    }

    if (analysis.fileRefs.length > 0) {
      sections.push(
        '## 5. Files Referenced',
        ...analysis.fileRefs.map((f) => `- ${f}`),
        '',
      );
    }

    if (analysis.toolsUsed.length > 0) {
      sections.push(
        '## 6. Tools Used',
        ...analysis.toolsUsed.map((t) => `- ${t}`),
        '',
      );
    }

    if (analysis.toolResultsSummary.length > 0) {
      const topResults = analysis.toolResultsSummary.slice(0, 10);
      sections.push('## 7. Key Tool Results', ...topResults, '');
    }

    if (analysis.errors.length > 0) {
      sections.push(
        '## 8. Errors / Blockers',
        ...analysis.errors.map((e) => `- ${e}`),
        '',
      );
    }

    if (analysis.remainingTasks.length > 0) {
      sections.push(
        '## 9. Remaining Tasks',
        ...analysis.remainingTasks.map((t) => `- ${t}`),
        '',
      );
    }

    if (analysis.importantContext.length > 0) {
      sections.push(
        '## 10. Important Context',
        ...analysis.importantContext.map((c) => `- ${c}`),
        '',
      );
    }

    let summary = sections.join('\n');

    // Enforce max length
    if (summary.length > this.config.maxSummaryChars) {
      summary =
        summary.slice(0, this.config.maxSummaryChars) +
        '\n...[summary truncated]';
    }

    return summary;
  }
}

// ============================================================
// Internal Types
// ============================================================

interface ConversationAnalysis {
  originalRequest: string;
  completedSteps: string[];
  currentState: string;
  keyDecisions: string[];
  fileRefs: string[];
  toolsUsed: string[];
  toolResultsSummary: string[];
  errors: string[];
  remainingTasks: string[];
  importantContext: string[];
}
