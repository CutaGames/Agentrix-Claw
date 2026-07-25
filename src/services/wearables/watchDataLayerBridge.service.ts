/**
 * Watch ↔ Phone Data Layer Bridge — Google Wear Data Layer API integration.
 *
 * Provides bidirectional communication between the Agentrix phone app
 * and the WearOS watch app using Google's Data Layer API (Messages + DataItems).
 *
 * Communication paths:
 *   Phone → Watch:  agent responses, approval requests, TTS audio, session state
 *   Watch → Phone:  voice commands, approval decisions, gesture events, heartbeat
 *
 * Native side: AgentrixWearDataLayer Android module wraps Google Wear MessageClient/DataClient.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

// ── Types ──────────────────────────────────────────────

export type WatchDataPath =
  | '/agentrix/voice/command'       // Watch → Phone: voice text command
  | '/agentrix/voice/state'         // Phone → Watch: voice session state
  | '/agentrix/approval/request'    // Phone → Watch: approval request
  | '/agentrix/approval/response'   // Watch → Phone: approve/reject
  | '/agentrix/agent/text'          // Phone → Watch: agent response text
  | '/agentrix/session/state'       // Bidirectional: session sync
  | '/agentrix/auth/request'        // Watch → Phone: request current auth state
  | '/agentrix/auth/state'          // Phone → Watch: scoped auth state snapshot
  | '/agentrix/wearable/gesture'    // Watch/Glass → Phone: gesture intent
  | '/agentrix/heartbeat';          // Bidirectional: keepalive

export interface WatchMessage {
  path: WatchDataPath;
  data: Record<string, unknown>;
  timestamp: number;
  sourceNodeId?: string;
}

export interface WatchDataItem {
  path: string;
  data: Record<string, unknown>;
}

export interface WatchNode {
  id: string;
  displayName: string;
  isNearby: boolean;
}

export interface WatchAuthState {
  accessToken: string;
  userId?: string | null;
  expiresAt?: string | null;
  syncedAt?: number;
}

type MessageCallback = (message: WatchMessage) => void;

// ── Bridge ─────────────────────────────────────────────

interface WearDataLayerBridge {
  sendMessage: (nodeId: string, path: string, data: string) => Promise<void>;
  putDataItem: (path: string, data: string) => Promise<void>;
  getConnectedNodes: () => Promise<WatchNode[]>;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
}

function resolveNativeBridge(): WearDataLayerBridge | null {
  if (Platform.OS !== 'android') return null;
  const modules = NativeModules as Record<string, unknown>;
  const bridge = (modules.AgentrixWearDataLayer ?? modules.WearDataLayerModule) as WearDataLayerBridge | undefined;
  return bridge || null;
}

// ── Service ────────────────────────────────────────────

export class WatchDataLayerService {
  private static emitter: NativeEventEmitter | null = null;
  private static listeners = new Map<WatchDataPath, Set<MessageCallback>>();
  private static isListening = false;
  private static heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Check if Data Layer API is available (Android only).
   */
  static isAvailable(): boolean {
    return resolveNativeBridge() !== null;
  }

  /**
   * Start listening for incoming messages from the watch.
   */
  static async startListening(): Promise<void> {
    const bridge = resolveNativeBridge();
    if (!bridge || this.isListening) return;

    await bridge.startListening();
    this.isListening = true;

    // Set up native event listener
    this.emitter = new NativeEventEmitter(bridge as any);
    this.emitter.addListener('onWearMessage', (event: { path: string; data: string; nodeId?: string }) => {
      try {
        const message: WatchMessage = {
          path: event.path as WatchDataPath,
          data: JSON.parse(event.data || '{}'),
          timestamp: Date.now(),
          sourceNodeId: event.nodeId,
        };
        this.dispatchMessage(message);
      } catch {
        // Malformed message, skip
      }
    });

    // Start heartbeat
    this.heartbeatInterval = setInterval(() => {
      void this.broadcastMessage('/agentrix/heartbeat', { alive: true });
    }, 30_000);
  }

  /**
   * Stop listening and clean up.
   */
  static async stopListening(): Promise<void> {
    const bridge = resolveNativeBridge();
    if (bridge && this.isListening) {
      await bridge.stopListening();
    }
    this.isListening = false;

    this.emitter?.removeAllListeners('onWearMessage');
    this.emitter = null;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Get connected watch nodes.
   */
  static async getConnectedNodes(): Promise<WatchNode[]> {
    const bridge = resolveNativeBridge();
    if (!bridge) return [];
    try {
      return await bridge.getConnectedNodes();
    } catch {
      return [];
    }
  }

  /**
   * Send a message to a specific watch node.
   */
  static async sendMessage(nodeId: string, path: WatchDataPath, data: Record<string, unknown>): Promise<void> {
    const bridge = resolveNativeBridge();
    if (!bridge) throw new Error('Wear Data Layer not available');
    await bridge.sendMessage(nodeId, path, JSON.stringify(data));
  }

  /**
   * Broadcast a message to ALL connected watch nodes.
   */
  static async broadcastMessage(path: WatchDataPath, data: Record<string, unknown>): Promise<void> {
    const nodes = await this.getConnectedNodes();
    const bridge = resolveNativeBridge();
    if (!bridge) return;

    await Promise.allSettled(
      nodes.map((node) => bridge.sendMessage(node.id, path, JSON.stringify(data))),
    );
  }

  /**
   * Put a DataItem (persistent, synced to all connected devices).
   * Use for state that should survive disconnections.
   */
  static async putDataItem(path: string, data: Record<string, unknown>): Promise<void> {
    const bridge = resolveNativeBridge();
    if (!bridge) return;
    await bridge.putDataItem(path, JSON.stringify(data));
  }

  /**
   * Subscribe to messages on a specific path.
   */
  static onMessage(path: WatchDataPath, callback: MessageCallback): () => void {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, new Set());
    }
    this.listeners.get(path)!.add(callback);

    return () => {
      this.listeners.get(path)?.delete(callback);
    };
  }

  // ── High-level helpers ───────────────────────────────

  /**
   * Send agent response text to watch for display.
   */
  static async sendAgentResponse(text: string, isFinal: boolean): Promise<void> {
    await this.broadcastMessage('/agentrix/agent/text', { text, isFinal });
  }

  /**
   * Send approval request to watch.
   */
  static async sendApprovalRequest(request: {
    id: string;
    toolName: string;
    description: string;
    riskLevel: 'low' | 'medium' | 'high';
  }): Promise<void> {
    await this.broadcastMessage('/agentrix/approval/request', request);
  }

  /**
   * Sync voice session state to watch.
   */
  static async syncVoiceState(state: {
    sessionId: string;
    isActive: boolean;
    strategy?: string;
  }): Promise<void> {
    await this.putDataItem('/agentrix/voice/state', state);
  }

  static async requestAuthState(): Promise<void> {
    await this.broadcastMessage('/agentrix/auth/request', { requestedAt: Date.now() });
  }

  static async syncAuthState(state: WatchAuthState): Promise<void> {
    const payload = { ...state, syncedAt: Date.now() };
    await this.putDataItem('/agentrix/auth/state', payload);
    await this.broadcastMessage('/agentrix/auth/state', payload);
  }

  // ── Internal ─────────────────────────────────────────

  private static dispatchMessage(message: WatchMessage): void {
    const callbacks = this.listeners.get(message.path);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(message);
        } catch {
          // Swallow listener errors
        }
      }
    }
  }
}
