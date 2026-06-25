import { Injectable, Logger } from '@nestjs/common';
import { OutputDispatcherService } from './output-dispatcher.service';

/**
 * DeepThinkOrchestratorService — Async routing to ultra-tier (Opus/GPT-5.4).
 *
 * When the LLM Router classifies a task as ULTRA, this service:
 *   1. Immediately sends a soothing "working on it" voice cue to the user
 *   2. Fires a deep-think status event to all devices
 *   3. Streams the ULTRA task via OpenClaw proxy (background)
 *   4. Pipes the result back to the voice pipeline:
 *      - Voice summary → glasses/phone speaker
 *      - Full detail → desktop/web large screen
 *   5. Fires deep-think done event
 *
 * Use: called from CascadeVoiceStrategy or RealtimeVoiceGateway
 * when the task tier >= ULTRA.
 */

export interface DeepThinkRequest {
  sessionId: string;
  userId: string;
  instanceId: string;
  userPrompt: string;
  targetModel?: string;
  lang?: string;
  voiceId?: string;
}

export interface DeepThinkResult {
  success: boolean;
  summary: string;       // Short version for voice readback
  fullContent: string;   // Full version for large-screen display
  model: string;
  durationMs: number;
  error?: string;
}

/** Soothing messages the model "says" while deep-think runs (by language) */
const SOOTHE_MESSAGES: Record<string, string[]> = {
  en: [
    "I'm passing this to our advanced analyst. It'll just be a moment.",
    "This needs deeper analysis. Hang tight, I'm on it.",
    "Got it — routing to our heavy-duty reasoning engine. One moment please.",
  ],
  zh: [
    '这个问题需要深度分析，我已经交给高级分析师了，马上就好。',
    '收到，正在启动深度推理引擎，请稍等片刻。',
    '好的，这需要更深入的分析，正在处理中……',
  ],
};

@Injectable()
export class DeepThinkOrchestratorService {
  private readonly logger = new Logger(DeepThinkOrchestratorService.name);

  constructor(
    private readonly dispatcher: OutputDispatcherService,
  ) {}

  /**
   * Get a random soothing message for the user's language.
   */
  getSootheMessage(lang: string): string {
    const pool = SOOTHE_MESSAGES[lang] || SOOTHE_MESSAGES['en'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Notify all devices that a deep-think task has started.
   */
  async notifyStart(sessionId: string, targetModel: string): Promise<void> {
    await this.dispatcher.broadcast(sessionId, 'voice:deepthink:start', {
      sessionId,
      targetModel,
      startedAt: Date.now(),
    });
  }

  /**
   * Notify all devices with deep-think progress (optional, for long tasks).
   */
  async notifyProgress(sessionId: string, progress: number, stage?: string): Promise<void> {
    await this.dispatcher.broadcast(sessionId, 'voice:deepthink:progress', {
      sessionId,
      progress, // 0-100
      stage,    // e.g. "analyzing", "generating", "reviewing"
    });
  }

  /**
   * Notify all devices that deep-think is complete, then dispatch results.
   * - Voice summary → speaker devices
   * - Full content → large-screen devices
   */
  async notifyDone(sessionId: string, result: DeepThinkResult): Promise<void> {
    // Broadcast done event
    await this.dispatcher.broadcast(sessionId, 'voice:deepthink:done', {
      sessionId,
      success: result.success,
      model: result.model,
      durationMs: result.durationMs,
      summary: result.summary,
      error: result.error,
    });

    // Send full content to large-screen devices
    if (result.fullContent) {
      await this.dispatcher.dispatch({
        sessionId,
        event: 'voice:deepthink:detail',
        data: {
          sessionId,
          content: result.fullContent,
          model: result.model,
        },
        kind: 'detailed_content',
      });
    }
  }
}
