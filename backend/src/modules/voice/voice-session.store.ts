import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

/**
 * VoiceSessionStore — Persists voice session state.
 *
 * Current: In-memory Map with TTL-based expiration.
 * Future: Swap to Redis for multi-instance support (see VOICE_SESSION_STORE env).
 *
 * Each voice session tracks:
 * - Session metadata (user, lang, voice, duplex mode)
 * - Turn history (user utterance → agent response pairs)
 * - Timing metrics (latency per turn)
 * - State (active, paused, ended)
 */

export interface VoiceSessionTurn {
  turnId: string;
  userTranscript: string;
  agentResponse: string;
  sttProvider?: string;
  ttsProvider?: string;
  sttLatencyMs?: number;
  llmLatencyMs?: number;
  ttsLatencyMs?: number;
  timestamp: number;
}

export interface VoiceSessionRecord {
  sessionId: string;
  userId: string;
  agentId?: string;
  lang: string;
  voiceId?: string;
  duplexMode: boolean;
  state: 'active' | 'paused' | 'ended';
  turns: VoiceSessionTurn[];
  createdAt: number;
  updatedAt: number;
  endedAt?: number;
  metadata?: Record<string, any>;
}

export interface VoiceSessionStoreInterface {
  create(session: Omit<VoiceSessionRecord, 'turns' | 'createdAt' | 'updatedAt'>): Promise<VoiceSessionRecord>;
  get(sessionId: string): Promise<VoiceSessionRecord | null>;
  update(sessionId: string, updates: Partial<VoiceSessionRecord>): Promise<VoiceSessionRecord | null>;
  addTurn(sessionId: string, turn: VoiceSessionTurn): Promise<void>;
  end(sessionId: string): Promise<void>;
  listByUser(userId: string, limit?: number): Promise<VoiceSessionRecord[]>;
  delete(sessionId: string): Promise<void>;
  getActiveCount(): Promise<number>;
}

@Injectable()
export class VoiceSessionStore implements VoiceSessionStoreInterface, OnModuleDestroy {
  private readonly logger = new Logger(VoiceSessionStore.name);
  private readonly store = new Map<string, VoiceSessionRecord>();
  private readonly SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Periodic cleanup of expired sessions
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    this.logger.log('VoiceSessionStore initialized (in-memory mode)');
  }

  onModuleDestroy() {
    clearInterval(this.cleanupInterval);
  }

  async create(
    input: Omit<VoiceSessionRecord, 'turns' | 'createdAt' | 'updatedAt'>,
  ): Promise<VoiceSessionRecord> {
    const now = Date.now();
    const session: VoiceSessionRecord = {
      ...input,
      turns: [],
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(session.sessionId, session);
    this.logger.debug(`Session created: ${session.sessionId} (user: ${session.userId})`);
    return session;
  }

  async get(sessionId: string): Promise<VoiceSessionRecord | null> {
    return this.store.get(sessionId) || null;
  }

  async update(
    sessionId: string,
    updates: Partial<VoiceSessionRecord>,
  ): Promise<VoiceSessionRecord | null> {
    const session = this.store.get(sessionId);
    if (!session) return null;
    Object.assign(session, updates, { updatedAt: Date.now() });
    return session;
  }

  async addTurn(sessionId: string, turn: VoiceSessionTurn): Promise<void> {
    const session = this.store.get(sessionId);
    if (!session) return;
    session.turns.push(turn);
    session.updatedAt = Date.now();

    // Cap turns to prevent unbounded growth
    if (session.turns.length > 200) {
      session.turns = session.turns.slice(-200);
    }
  }

  async end(sessionId: string): Promise<void> {
    const session = this.store.get(sessionId);
    if (!session) return;
    session.state = 'ended';
    session.endedAt = Date.now();
    session.updatedAt = Date.now();
  }

  async listByUser(userId: string, limit = 20): Promise<VoiceSessionRecord[]> {
    const results: VoiceSessionRecord[] = [];
    for (const session of this.store.values()) {
      if (session.userId === userId) {
        results.push(session);
      }
    }
    return results
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }

  async delete(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  async getActiveCount(): Promise<number> {
    let count = 0;
    for (const session of this.store.values()) {
      if (session.state === 'active') count++;
    }
    return count;
  }

  /**
   * Get session metrics for monitoring.
   */
  async getMetrics(): Promise<{
    totalSessions: number;
    activeSessions: number;
    avgTurnsPerSession: number;
    avgLatency: { stt: number; llm: number; tts: number };
  }> {
    let active = 0;
    let totalTurns = 0;
    let sttTotal = 0, sttCount = 0;
    let llmTotal = 0, llmCount = 0;
    let ttsTotal = 0, ttsCount = 0;

    for (const session of this.store.values()) {
      if (session.state === 'active') active++;
      totalTurns += session.turns.length;
      for (const turn of session.turns) {
        if (turn.sttLatencyMs) { sttTotal += turn.sttLatencyMs; sttCount++; }
        if (turn.llmLatencyMs) { llmTotal += turn.llmLatencyMs; llmCount++; }
        if (turn.ttsLatencyMs) { ttsTotal += turn.ttsLatencyMs; ttsCount++; }
      }
    }

    const total = this.store.size;
    return {
      totalSessions: total,
      activeSessions: active,
      avgTurnsPerSession: total > 0 ? Math.round(totalTurns / total) : 0,
      avgLatency: {
        stt: sttCount > 0 ? Math.round(sttTotal / sttCount) : 0,
        llm: llmCount > 0 ? Math.round(llmTotal / llmCount) : 0,
        tts: ttsCount > 0 ? Math.round(ttsTotal / ttsCount) : 0,
      },
    };
  }

  private cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of this.store.entries()) {
      if (session.state === 'ended' && now - session.updatedAt > this.SESSION_TTL_MS) {
        this.store.delete(id);
        cleaned++;
      }
      // Also expire very old active sessions (stuck)
      if (session.state === 'active' && now - session.updatedAt > 2 * this.SESSION_TTL_MS) {
        session.state = 'ended';
        session.endedAt = now;
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired voice sessions`);
    }
  }
}
