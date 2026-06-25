import { Injectable, Logger } from '@nestjs/common';
import { VoiceSessionStore, type VoiceSessionRecord } from './voice-session.store';

/**
 * VoiceSessionHandoffService — Cross-device voice session continuity.
 *
 * Enables seamless transfer of an active voice session between devices:
 *   Mobile (walking) → Desktop (sit down) → Mobile (leave desk)
 *
 * Protocol:
 *   1. Source device calls `initiateHandoff(sessionId, targetDeviceId)`
 *   2. Backend creates a handoff token (short-lived, single-use)
 *   3. Target device receives handoff notification via WebSocket
 *   4. Target device calls `acceptHandoff(token)` to take over
 *   5. Source device is notified to release mic/speaker resources
 *   6. Session continues on target device with full context
 *
 * Context transferred:
 *   - Conversation history (last N turns)
 *   - Voice preferences (voice ID, lang, duplex mode)
 *   - Agent context (system prompt, active tools)
 *   - Audio state (was TTS playing? queue position?)
 */

export interface HandoffToken {
  token: string;
  sessionId: string;
  sourceDeviceId: string;
  targetDeviceId?: string; // null = any device of same user
  userId: string;
  createdAt: number;
  expiresAt: number;
  accepted: boolean;
  context: HandoffContext;
}

export interface HandoffContext {
  /** Last N conversation turns for context continuity */
  recentTurns: Array<{ role: string; text: string }>;
  /** Voice configuration */
  voiceConfig: {
    lang: string;
    voiceId?: string;
    duplexMode: boolean;
    autoSpeak: boolean;
  };
  /** Agent info */
  agentId?: string;
  agentName?: string;
  systemPrompt?: string;
  /** TTS state at handoff time */
  ttsState?: {
    wasSpeaking: boolean;
    pendingText?: string;
  };
}

export interface HandoffResult {
  success: boolean;
  sessionId?: string;
  context?: HandoffContext;
  error?: string;
}

@Injectable()
export class VoiceSessionHandoffService {
  private readonly logger = new Logger(VoiceSessionHandoffService.name);
  private readonly tokens = new Map<string, HandoffToken>();
  private readonly TOKEN_TTL_MS = 60_000; // 60 seconds to accept

  constructor(private readonly sessionStore: VoiceSessionStore) {
    // Cleanup expired tokens periodically
    setInterval(() => this.cleanupTokens(), 30_000);
  }

  /**
   * Step 1: Source device initiates handoff.
   * Returns a short-lived token that the target device uses to accept.
   */
  async initiateHandoff(
    sessionId: string,
    sourceDeviceId: string,
    targetDeviceId?: string,
  ): Promise<{ token: string; expiresAt: number } | { error: string }> {
    const session = await this.sessionStore.get(sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }
    if (session.state !== 'active') {
      return { error: 'Session is not active' };
    }

    const token = this.generateToken();
    const now = Date.now();

    const handoff: HandoffToken = {
      token,
      sessionId,
      sourceDeviceId,
      targetDeviceId,
      userId: session.userId,
      createdAt: now,
      expiresAt: now + this.TOKEN_TTL_MS,
      accepted: false,
      context: this.buildHandoffContext(session),
    };

    this.tokens.set(token, handoff);

    // Pause the session on source device
    await this.sessionStore.update(sessionId, {
      state: 'paused',
      metadata: {
        ...session.metadata,
        handoffToken: token,
        handoffSourceDevice: sourceDeviceId,
      },
    });

    this.logger.log(`Handoff initiated: ${sessionId} from ${sourceDeviceId} → ${targetDeviceId || 'any'}`);

    return { token, expiresAt: handoff.expiresAt };
  }

  /**
   * Step 2: Target device accepts the handoff.
   * Returns the session context for seamless continuation.
   */
  async acceptHandoff(
    token: string,
    targetDeviceId: string,
    userId: string,
  ): Promise<HandoffResult> {
    const handoff = this.tokens.get(token);

    if (!handoff) {
      return { success: false, error: 'Invalid or expired handoff token' };
    }

    if (handoff.accepted) {
      return { success: false, error: 'Handoff already accepted' };
    }

    if (handoff.userId !== userId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (handoff.expiresAt < Date.now()) {
      this.tokens.delete(token);
      return { success: false, error: 'Handoff token expired' };
    }

    if (handoff.targetDeviceId && handoff.targetDeviceId !== targetDeviceId) {
      return { success: false, error: 'Wrong target device' };
    }

    // Accept the handoff
    handoff.accepted = true;
    this.tokens.delete(token);

    // Reactivate session with new device info
    await this.sessionStore.update(handoff.sessionId, {
      state: 'active',
      metadata: {
        currentDeviceId: targetDeviceId,
        handoffFrom: handoff.sourceDeviceId,
        handoffAt: Date.now(),
      },
    });

    this.logger.log(`Handoff accepted: ${handoff.sessionId} → device ${targetDeviceId}`);

    return {
      success: true,
      sessionId: handoff.sessionId,
      context: handoff.context,
    };
  }

  /**
   * Cancel a pending handoff (source device changed mind, or timeout).
   */
  async cancelHandoff(token: string, userId: string): Promise<boolean> {
    const handoff = this.tokens.get(token);
    if (!handoff || handoff.userId !== userId) return false;

    this.tokens.delete(token);

    // Reactivate on source device
    await this.sessionStore.update(handoff.sessionId, {
      state: 'active',
      metadata: { currentDeviceId: handoff.sourceDeviceId },
    });

    this.logger.log(`Handoff cancelled: ${handoff.sessionId}`);
    return true;
  }

  /**
   * Get pending handoff for a user (target device polls or receives via WS).
   */
  getPendingHandoff(userId: string): HandoffToken | null {
    for (const handoff of this.tokens.values()) {
      if (handoff.userId === userId && !handoff.accepted && handoff.expiresAt > Date.now()) {
        return handoff;
      }
    }
    return null;
  }

  // ── Internal ──

  private buildHandoffContext(session: VoiceSessionRecord): HandoffContext {
    const recentTurns = session.turns.slice(-10).map((t) => [
      { role: 'user', text: t.userTranscript },
      { role: 'assistant', text: t.agentResponse },
    ]).flat().filter((t) => t.text);

    return {
      recentTurns,
      voiceConfig: {
        lang: session.lang,
        voiceId: session.voiceId,
        duplexMode: session.duplexMode,
        autoSpeak: true,
      },
      agentId: session.agentId,
    };
  }

  private generateToken(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let token = 'hoff_';
    for (let i = 0; i < 16; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  private cleanupTokens(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [token, handoff] of this.tokens.entries()) {
      if (handoff.expiresAt < now) {
        this.tokens.delete(token);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug(`Cleaned ${cleaned} expired handoff tokens`);
    }
  }
}
