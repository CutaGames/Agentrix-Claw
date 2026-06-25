import { Logger } from '@nestjs/common';
import * as WebSocket from 'ws';
import type {
  RealtimeVoiceAdapter,
  RealtimeVoiceSession,
  RealtimeVoiceCallbacks,
} from './voice-provider.interface';

/**
 * Gemini Live Adapter — End-to-end realtime voice via Gemini Live API.
 *
 * Tiered API key strategy:
 *   INPUT  (STT): Gemini Free → Gemini Paid → (caller falls back to AWS)
 *   OUTPUT (TTS): Gemini Free → (caller falls back to Edge/Polly)
 *
 * Keys read from env:
 *   GEMINI_API_KEY  — free-tier key  (priority 1)
 *   GEMINI_API_KEY1 — paid-tier key  (priority 2)
 *
 * Users with their own key bypass the tiered chain entirely.
 */

const GEMINI_LIVE_WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const GEMINI_REST_BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiLiveConfig {
  model?: string;
  voice?: string;   // 'Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede'
  lang?: string;
  sampleRate?: number;
}

/** Which tier was used for this session */
export type GeminiTier = 'free' | 'paid' | 'user';

export class GeminiLiveAdapter implements RealtimeVoiceAdapter {
  readonly name = 'gemini-live';
  private readonly logger = new Logger(GeminiLiveAdapter.name);

  /** Ordered list of platform keys: free first, then paid */
  private readonly platformKeys: Array<{ key: string; tier: GeminiTier }> = [];

  constructor() {
    const free = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || '';
    const paid = process.env.GEMINI_API_KEY1 || '';
    if (free) this.platformKeys.push({ key: free, tier: 'free' });
    if (paid && paid !== free) this.platformKeys.push({ key: paid, tier: 'paid' });
  }

  get isAvailable(): boolean {
    return this.platformKeys.length > 0;
  }

  /**
   * Resolve which API key to use.
   * If the caller provides a userApiKey, use it exclusively.
   * Otherwise walk the platform chain: free → paid.
   */
  getApiKeys(userApiKey?: string): Array<{ key: string; tier: GeminiTier }> {
    if (userApiKey) return [{ key: userApiKey, tier: 'user' }];
    return [...this.platformKeys];
  }

  // ─── Batch STT via Gemini REST (non-streaming) ────────────

  /**
   * Transcribe audio using Gemini REST multimodal API.
   * Tries each key in tier order; on 429/quota error, falls to the next key.
   * Returns `null` when all Gemini keys are exhausted (caller should fall back to AWS).
   */
  async transcribeAudio(
    audioBase64: string,
    mimeType: string,
    lang?: string,
    userApiKey?: string,
  ): Promise<{ transcript: string; tier: GeminiTier } | null> {
    const keys = this.getApiKeys(userApiKey);
    if (keys.length === 0) return null;

    const model = process.env.GEMINI_STT_MODEL || 'gemini-2.0-flash';
    const prompt = lang === 'zh'
      ? '请将以下音频内容精确转录为文本。优先输出中文、保留标点和专有名词。只返回转录文本，不要添加任何解释。'
      : lang === 'en'
        ? 'Transcribe the following audio accurately. Return only the transcript text, no explanations.'
        : 'Transcribe the following audio accurately. The audio may be in Chinese, English, or mixed. Return only the transcript text.';

    for (const { key, tier } of keys) {
      try {
        const url = `${GEMINI_REST_BASE}/models/${model}:generateContent?key=${key}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inlineData: { mimeType, data: audioBase64 } },
              ],
            }],
            generationConfig: { temperature: 0, maxOutputTokens: 1024 },
          }),
          signal: AbortSignal.timeout(15_000),
        });

        if (resp.status === 429 || resp.status === 503) {
          this.logger.warn(`Gemini STT tier=${tier} rate-limited (${resp.status}), trying next key`);
          continue;
        }
        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          this.logger.warn(`Gemini STT tier=${tier} error ${resp.status}: ${errText.slice(0, 200)}`);
          continue;
        }

        const data = await resp.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
          this.logger.log(`Gemini STT success (tier=${tier}): ${text.slice(0, 60)}...`);
          return { transcript: text, tier };
        }
        this.logger.warn(`Gemini STT tier=${tier} returned empty text`);
      } catch (err: any) {
        this.logger.warn(`Gemini STT tier=${tier} exception: ${err.message}`);
      }
    }
    return null; // All keys exhausted → caller falls back to AWS
  }

  // ─── Batch TTS via Gemini REST ────────────────────────────

  /**
   * Synthesize speech using Gemini REST API (text → audio).
   * Only uses FREE tier key. Returns null if free tier exhausted → caller uses Edge/Polly.
   */
  async synthesizeSpeech(
    text: string,
    lang?: string,
    userApiKey?: string,
  ): Promise<{ audioBase64: string; mimeType: string; tier: GeminiTier } | null> {
    // For OUTPUT: only free key (skip paid — $12/M too expensive)
    const keys = userApiKey
      ? [{ key: userApiKey, tier: 'user' as GeminiTier }]
      : this.platformKeys.filter(k => k.tier === 'free');
    if (keys.length === 0) return null;

    const model = process.env.GEMINI_TTS_MODEL || 'gemini-2.0-flash';

    for (const { key, tier } of keys) {
      try {
        const url = `${GEMINI_REST_BASE}/models/${model}:generateContent?key=${key}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `Please read the following text aloud naturally:\n\n${text}` }],
            }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: lang === 'zh' ? 'Aoede' : 'Puck',
                  },
                },
              },
            },
          }),
          signal: AbortSignal.timeout(15_000),
        });

        if (resp.status === 429 || resp.status === 503) {
          this.logger.warn(`Gemini TTS tier=${tier} rate-limited, skipping`);
          continue;
        }
        if (!resp.ok) continue;

        const data = await resp.json();
        const part = data?.candidates?.[0]?.content?.parts?.[0];
        if (part?.inlineData?.data) {
          this.logger.log(`Gemini TTS success (tier=${tier})`);
          return {
            audioBase64: part.inlineData.data,
            mimeType: part.inlineData.mimeType || 'audio/pcm',
            tier,
          };
        }
      } catch (err: any) {
        this.logger.warn(`Gemini TTS tier=${tier} exception: ${err.message}`);
      }
    }
    return null; // Free tier exhausted → caller uses Edge/Polly
  }

  // ─── Realtime WebSocket Session ───────────────────────────

  async createSession(
    systemPrompt: string,
    callbacks: RealtimeVoiceCallbacks,
    options?: { model?: string; voice?: string; lang?: string; apiKey?: string },
  ): Promise<RealtimeVoiceSession> {
    // Resolve API key: user key > free platform key > paid platform key
    const keys = this.getApiKeys(options?.apiKey);
    if (keys.length === 0) throw new Error('Gemini API key not configured');
    const apiKey = keys[0].key; // WebSocket session uses first available key
    const tier = keys[0].tier;

    const model = options?.model || process.env.GEMINI_LIVE_MODEL || 'gemini-2.0-flash-live-001';
    const voice = options?.voice || (options?.lang === 'zh' ? 'Aoede' : 'Puck');
    const sampleRate = 24000; // Gemini Live outputs 24kHz PCM

    const wsUrl = `${GEMINI_LIVE_WS_BASE}?key=${apiKey}`;
    this.logger.log(`Opening Gemini Live session (tier=${tier}, model=${model}, voice=${voice})`);

    const ws = new WebSocket(wsUrl);
    let closed = false;
    let setupSent = false;

    // ── WebSocket handlers ──

    ws.on('open', () => {
      this.logger.debug('Gemini Live WebSocket connected');

      // Send setup message
      const setupMessage = {
        setup: {
          model: `models/${model}`,
          generationConfig: {
            responseModalities: ['AUDIO', 'TEXT'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voice,
                },
              },
            },
          },
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          tools: this.buildToolDeclarations(),
        },
      };

      ws.send(JSON.stringify(setupMessage));
      setupSent = true;
    });

    ws.on('message', (rawData: Buffer) => {
      if (closed) return;

      try {
        const msg = JSON.parse(rawData.toString('utf8'));
        this.handleServerMessage(msg, callbacks);
      } catch (err) {
        this.logger.warn('Failed to parse Gemini Live message', err);
      }
    });

    ws.on('error', (err) => {
      if (!closed) {
        this.logger.error('Gemini Live WebSocket error:', err);
        callbacks.onError?.(err as Error);
      }
    });

    ws.on('close', (code, reason) => {
      closed = true;
      this.logger.debug(`Gemini Live WebSocket closed: ${code} ${reason}`);
      callbacks.onSessionEnd?.();
    });

    // ── Session interface ──

    return {
      sendAudio: (chunk: Buffer) => {
        if (closed || ws.readyState !== WebSocket.OPEN || !setupSent) return;

        // Gemini expects base64-encoded PCM audio in realtimeInput
        const message = {
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: `audio/pcm;rate=${sampleRate}`,
                data: chunk.toString('base64'),
              },
            ],
          },
        };

        ws.send(JSON.stringify(message));
      },

      sendText: (text: string, role: 'user' | 'system' = 'user') => {
        if (closed || ws.readyState !== WebSocket.OPEN) return;

        const message = {
          clientContent: {
            turns: [
              {
                role: role === 'system' ? 'model' : 'user',
                parts: [{ text }],
              },
            ],
            turnComplete: true,
          },
        };

        ws.send(JSON.stringify(message));
      },

      interrupt: () => {
        if (closed || ws.readyState !== WebSocket.OPEN) return;
        // Gemini Live doesn't have explicit interrupt — sending new audio triggers barge-in
        // We can send an empty client content to signal turn end
        this.logger.debug('Interrupt requested');
      },

      close: () => {
        closed = true;
        try { ws.close(); } catch {}
      },
    };
  }

  // ── Message Handling ──

  private handleServerMessage(msg: any, callbacks: RealtimeVoiceCallbacks): void {
    // Setup complete
    if (msg.setupComplete) {
      this.logger.debug('Gemini Live setup complete');
      return;
    }

    // Server content (text and/or audio)
    if (msg.serverContent) {
      const content = msg.serverContent;

      // Model turn parts
      if (content.modelTurn?.parts) {
        for (const part of content.modelTurn.parts) {
          // Text response
          if (part.text) {
            callbacks.onAgentText?.(part.text, !!content.turnComplete);
          }

          // Audio response (inline data)
          if (part.inlineData?.mimeType?.startsWith('audio/')) {
            const audioData = Buffer.from(part.inlineData.data, 'base64');
            callbacks.onAgentAudio?.(audioData);
          }
        }
      }

      // Turn complete signal
      if (content.turnComplete) {
        callbacks.onAgentAudioEnd?.();
      }

      // Interrupted (user barge-in detected by server)
      if (content.interrupted) {
        this.logger.debug('Gemini detected user barge-in');
        callbacks.onAgentAudioEnd?.();
      }
    }

    // Tool call
    if (msg.toolCall) {
      const functionCalls = msg.toolCall.functionCalls || [];
      for (const call of functionCalls) {
        callbacks.onToolCall?.(call.name, call.args || {});
      }
    }

    // Tool call cancellation (barge-in during tool execution)
    if (msg.toolCallCancellation) {
      this.logger.debug('Tool call cancelled by barge-in');
    }
  }

  /**
   * Build tool declarations for Gemini Live.
   * These enable the voice model to call agent tools.
   */
  private buildToolDeclarations(): any[] {
    // Base tools that all voice sessions can use
    return [
      {
        functionDeclarations: [
          {
            name: 'route_to_backend',
            description:
              'Call this when the user request requires deep reasoning, multi-step tasks, ' +
              'code generation, detailed analysis, complex calculations, file operations, ' +
              'or any task beyond simple conversational Q&A. Do NOT answer yourself — ' +
              'route the task to a more capable backend model.',
            parameters: {
              type: 'object',
              properties: {
                complexity: {
                  type: 'string',
                  enum: ['medium', 'high'],
                  description: 'medium = moderate analysis/coding; high = multi-step reasoning/planning',
                },
                transcript: {
                  type: 'string',
                  description: 'The full user request text to forward',
                },
                task_type: {
                  type: 'string',
                  description: 'Category: coding, analysis, planning, math, research, other',
                },
              },
              required: ['complexity', 'transcript'],
            },
          },
          {
            name: 'search_web',
            description: 'Search the web for current information',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' },
              },
              required: ['query'],
            },
          },
          {
            name: 'execute_agent_skill',
            description: 'Execute an agent skill or capability',
            parameters: {
              type: 'object',
              properties: {
                skillName: { type: 'string', description: 'Name of the skill to execute' },
                parameters: { type: 'object', description: 'Skill parameters' },
              },
              required: ['skillName'],
            },
          },
          {
            name: 'set_reminder',
            description: 'Set a reminder or timer',
            parameters: {
              type: 'object',
              properties: {
                message: { type: 'string', description: 'Reminder message' },
                delaySeconds: { type: 'number', description: 'Seconds until reminder' },
              },
              required: ['message'],
            },
          },
        ],
      },
    ];
  }
}
