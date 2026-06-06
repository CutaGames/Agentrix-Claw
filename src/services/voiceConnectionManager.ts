/**
 * Voice Connection Manager — Long conversation stability.
 *
 * Handles:
 * 1. WebSocket keepalive (ping/pong heartbeat)
 * 2. Automatic reconnection with exponential backoff
 * 3. Session context compression for long conversations
 * 4. Network state monitoring (online/offline transitions)
 * 5. Graceful degradation on poor networks
 *
 * Used by both mobile (React Native) and desktop voice sessions.
 */

import { Platform, AppState } from 'react-native';

export interface ConnectionManagerConfig {
  /** WebSocket URL for voice gateway */
  wsUrl: string;
  /** Auth token */
  token: string;
  /** Session ID to resume */
  sessionId?: string;
  /** Ping interval in ms (default 25s) */
  pingIntervalMs?: number;
  /** Max reconnection attempts (default 10) */
  maxReconnectAttempts?: number;
  /** Max conversation turns before context compression (default 50) */
  contextCompressionThreshold?: number;
}

export interface ConnectionManagerCallbacks {
  onConnected?: (resumed: boolean) => void;
  onDisconnected?: (reason: string) => void;
  onReconnecting?: (attempt: number, maxAttempts: number) => void;
  onReconnectFailed?: () => void;
  onMessage?: (event: string, data: any) => void;
  onContextCompressed?: (originalTurns: number, compressedTurns: number) => void;
  onNetworkChange?: (online: boolean) => void;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export class VoiceConnectionManager {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private config: ConnectionManagerConfig;
  private callbacks: ConnectionManagerCallbacks;

  // Keepalive
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastPongTime = 0;

  // Reconnection
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  // Context compression
  private turnCount = 0;
  private conversationHistory: Array<{ role: string; text: string; timestamp: number }> = [];

  // Network monitoring
  private appStateSubscription: any = null;
  private networkCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: ConnectionManagerConfig, callbacks: ConnectionManagerCallbacks) {
    this.config = {
      pingIntervalMs: 25_000,
      maxReconnectAttempts: 10,
      contextCompressionThreshold: 50,
      ...config,
    };
    this.callbacks = callbacks;
  }

  // ── Lifecycle ──

  connect(): void {
    if (this.state === 'connected' || this.state === 'connecting') return;

    this.intentionalClose = false;
    this.state = 'connecting';
    this.createWebSocket();
    this.startNetworkMonitoring();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.cleanup();
    this.state = 'disconnected';
    this.callbacks.onDisconnected?.('user_initiated');
  }

  /**
   * Send a message through the WebSocket.
   */
  send(event: string, data: any): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      this.ws.send(JSON.stringify({ event, data }));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Send binary data (audio chunks).
   */
  sendBinary(data: ArrayBuffer | Uint8Array): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(data);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Record a conversation turn for context management.
   */
  addTurn(role: string, text: string): void {
    this.conversationHistory.push({ role, text, timestamp: Date.now() });
    this.turnCount++;

    if (this.turnCount >= (this.config.contextCompressionThreshold || 50)) {
      this.compressContext();
    }
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  get isConnected(): boolean {
    return this.state === 'connected';
  }

  get latencyMs(): number {
    if (this.lastPongTime === 0) return -1;
    return Date.now() - this.lastPongTime;
  }

  // ── WebSocket ──

  private createWebSocket(): void {
    try {
      const url = new URL(this.config.wsUrl);
      url.searchParams.set('token', this.config.token);
      if (this.config.sessionId) {
        url.searchParams.set('sessionId', this.config.sessionId);
      }

      this.ws = new WebSocket(url.toString());

      this.ws.onopen = () => {
        this.state = 'connected';
        this.reconnectAttempts = 0;
        this.startPingLoop();
        this.callbacks.onConnected?.(!!this.config.sessionId);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = (event) => {
        this.stopPingLoop();

        if (this.intentionalClose) {
          this.state = 'disconnected';
          return;
        }

        this.callbacks.onDisconnected?.(event.reason || `code:${event.code}`);
        this.attemptReconnect();
      };

      this.ws.onerror = () => {
        // onclose will follow
      };
    } catch (err: any) {
      console.error('[VoiceConn] WebSocket creation failed:', err);
      this.attemptReconnect();
    }
  }

  private handleMessage(rawData: string | ArrayBuffer): void {
    // Handle pong
    if (rawData === 'pong' || rawData === '__pong__') {
      this.lastPongTime = Date.now();
      if (this.pongTimeout) {
        clearTimeout(this.pongTimeout);
        this.pongTimeout = null;
      }
      return;
    }

    // Handle binary (audio from server)
    if (rawData instanceof ArrayBuffer) {
      this.callbacks.onMessage?.('voice:tts:chunk', rawData);
      return;
    }

    // Handle JSON messages
    try {
      const msg = JSON.parse(rawData as string);
      if (msg.event) {
        this.callbacks.onMessage?.(msg.event, msg.data);
      }
    } catch {
      // Ignore parse errors
    }
  }

  // ── Keepalive ──

  private startPingLoop(): void {
    this.stopPingLoop();
    const interval = this.config.pingIntervalMs || 25_000;

    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      try {
        this.ws.send('__ping__');
      } catch {
        return;
      }

      // Expect pong within 10 seconds
      this.pongTimeout = setTimeout(() => {
        console.warn('[VoiceConn] Pong timeout — connection may be dead');
        // Force close to trigger reconnect
        try { this.ws?.close(4000, 'pong_timeout'); } catch {}
      }, 10_000);
    }, interval);
  }

  private stopPingLoop(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  // ── Reconnection ──

  private attemptReconnect(): void {
    const maxAttempts = this.config.maxReconnectAttempts || 10;
    if (this.intentionalClose || this.reconnectAttempts >= maxAttempts) {
      this.state = 'disconnected';
      this.callbacks.onReconnectFailed?.();
      return;
    }

    this.state = 'reconnecting';
    this.reconnectAttempts++;

    // Exponential backoff: 1s, 2s, 4s, 8s, ... capped at 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30_000);

    this.callbacks.onReconnecting?.(this.reconnectAttempts, maxAttempts);

    this.reconnectTimer = setTimeout(() => {
      this.createWebSocket();
    }, delay);
  }

  // ── Context Compression ──

  /**
   * Compress conversation context to prevent memory/token overflow.
   * Keeps first 2 turns (system context) + last 20 turns.
   * Summarizes middle turns into a compact note.
   */
  private compressContext(): void {
    const history = this.conversationHistory;
    if (history.length < 30) return;

    const originalCount = history.length;

    // Keep first 2 (initial context) + last 20
    const head = history.slice(0, 2);
    const tail = history.slice(-20);
    const middle = history.slice(2, -20);

    // Create a summary of compressed turns
    const summaryTurn = {
      role: 'system',
      text: `[Context compressed: ${middle.length} earlier turns summarized. Topics discussed: ${this.extractTopics(middle).join(', ')}]`,
      timestamp: Date.now(),
    };

    this.conversationHistory = [...head, summaryTurn, ...tail];
    this.turnCount = this.conversationHistory.length;

    this.callbacks.onContextCompressed?.(originalCount, this.conversationHistory.length);
  }

  private extractTopics(turns: Array<{ role: string; text: string }>): string[] {
    // Simple keyword extraction — in production, use LLM summarization
    const allText = turns.map((t) => t.text).join(' ');
    const words = allText.split(/\s+/).filter((w) => w.length > 4);
    const freq = new Map<string, number>();

    for (const word of words) {
      const lower = word.toLowerCase().replace(/[^a-z\u4e00-\u9fff]/g, '');
      if (!lower) continue;
      freq.set(lower, (freq.get(lower) || 0) + 1);
    }

    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  // ── Network Monitoring ──

  private startNetworkMonitoring(): void {
    // Monitor app state (background/foreground)
    this.appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && this.state === 'disconnected' && !this.intentionalClose) {
        // Returned from background — try to reconnect
        this.reconnectAttempts = 0;
        this.attemptReconnect();
      }
    });

    // Periodic connectivity check
    this.networkCheckTimer = setInterval(() => {
      if (this.state === 'connected' && this.ws?.readyState !== WebSocket.OPEN) {
        // WebSocket claims connected but socket is actually closed
        this.state = 'disconnected';
        this.attemptReconnect();
      }
    }, 15_000);
  }

  // ── Cleanup ──

  private cleanup(): void {
    this.stopPingLoop();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.networkCheckTimer) {
      clearInterval(this.networkCheckTimer);
      this.networkCheckTimer = null;
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    if (this.ws) {
      try { this.ws.close(1000, 'cleanup'); } catch {}
      this.ws = null;
    }
  }
}
