import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { forwardRef, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VoiceService } from './voice.service';
import { edgeTTS, resolveEdgeVoice } from './adapters/edge-tts.adapter';
import { DeepgramSTTAdapter } from './adapters/deepgram-stt.adapter';
import { GeminiLiveAdapter, type GeminiTier } from './adapters/gemini-live.adapter';
import type { StreamingSTTSession, RealtimeVoiceSession as GeminiSession } from './adapters/voice-provider.interface';
import { OpenClawProxyService } from '../openclaw-proxy/openclaw-proxy.service';
import type { StreamEvent } from '../query-engine/interfaces/stream-event.interface';
import { UserProviderConfig } from '../../entities/user-provider-config.entity';
import { CascadeVoiceStrategy, GemmaMultimodalVoiceStrategy } from './strategies';
import type { IVoiceStreamStrategy, VoiceStrategyCallbacks, VoiceStrategyName } from './strategies';
import { SessionFabricService } from './session-fabric.service';
import { OutputDispatcherService } from './output-dispatcher.service';
import { DeepThinkOrchestratorService } from './deep-think-orchestrator.service';
import type { FabricDeviceType } from '../../entities/device-session.entity';

/**
 * RealtimeVoiceGateway — WebSocket gateway for bidirectional voice streaming.
 *
 * Protocol (Socket.IO namespace /voice):
 *
 * Client → Server:
 *   voice:session:start  { sessionId, lang, voiceId?, duplexMode? }
 *   voice:audio:chunk    { sessionId, audio: Buffer (PCM/opus) }
 *   voice:audio:end      { sessionId }
 *   voice:tts:request    { sessionId, text, voice?, lang? }
 *   voice:session:end    { sessionId }
 *
 * Server → Client:
 *   voice:session:ready  { sessionId }
 *   voice:stt:interim    { sessionId, transcript }
 *   voice:stt:final      { sessionId, transcript, lang }
 *   voice:tts:chunk      { sessionId, audio: Buffer (mp3) }
 *   voice:tts:end        { sessionId }
 *   voice:error          { sessionId, error, code? }
 *   voice:session:ended  { sessionId }
 *
 * v2 additions (tri-tier hybrid):
 * Client → Server:
 *   voice:image:frame    { sessionId, frame: Base64, mimeType }
 *
 * Server → Client:
 *   voice:strategy:info  { sessionId, strategy }
 *   voice:deepthink:start { sessionId, targetModel }
 *   voice:deepthink:done  { sessionId }
 *   voice:model:used      { sessionId, model, tier }
 */

interface AuthenticatedVoiceSocket extends Socket {
  userId?: string;
}

interface PendingVoiceToolCall {
  toolName: string;
  input?: Record<string, any>;
  requiresApproval: boolean;
  held: boolean;
  updatedAt: number;
}

interface VoiceSession {
  userId: string;
  socketId: string;
  sessionId: string;
  instanceId: string;
  lang: string;
  voiceId?: string;
  model?: string;
  duplexMode: boolean;
  audioChunks: Buffer[];
  streamingSession: StreamingSTTSession | null;
  currentResponseAbort: AbortController | null;
  responseGeneration: number;
  ttsSentenceBuffer: string;
  ttsQueue: Promise<void>;
  lastFinalTranscript: string;
  lastFinalAt: number;
  createdAt: number;
  activeStreamingToken: symbol | null;
  ignoredStreamingTokens: Set<symbol>;
  pendingStreamingEnd: {
    token: symbol;
    settled: boolean;
    resolve: (receivedFinal: boolean) => void;
    timeout: NodeJS.Timeout;
  } | null;
  /** Stores the last streaming final transcript (for non-duplex race recovery) */
  streamingFinalText: string;
  streamingFinalToken: symbol | null;
  /** Gemini Live end-to-end session (when enabled) */
  geminiSession: GeminiSession | null;
  useGeminiLive: boolean;
  /** v2: which strategy is active for this session */
  v2Strategy: VoiceStrategyName | null;
  pendingAgentEndTimer: NodeJS.Timeout | null;
  pendingToolCalls: Map<string, PendingVoiceToolCall>;
  /** v2: device type declared by client */
  deviceType?: 'phone' | 'desktop' | 'web' | 'glass' | 'watch';
  /** Fabric device ID for cleanup on disconnect */
  fabricDeviceId?: string;
}

const PCM_SAMPLE_RATE = 16000;
const PCM_CHANNEL_COUNT = 1;
const PCM_BITS_PER_SAMPLE = 16;
const STREAMING_FINALIZATION_TIMEOUT_MS = 2000;
const LOCAL_ONLY_MODEL_IDS = new Set(['gemma-nano-2b', 'gemma-4-2b', 'gemma-4-4b', 'qwen2.5-omni-3b', 'gemma-nano-2b-local']);

function sanitizeRealtimeModelId(modelId?: string | null): string | undefined {
  if (!modelId) {
    return undefined;
  }

  return LOCAL_ONLY_MODEL_IDS.has(modelId) ? undefined : modelId;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  namespace: '/voice',
  maxHttpBufferSize: 1e7, // 10MB for audio data
})
export class RealtimeVoiceGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeVoiceGateway.name);
  private sessions = new Map<string, VoiceSession>();
  private readonly streamingAdapter = new DeepgramSTTAdapter();
  private readonly geminiAdapter = new GeminiLiveAdapter();
  private cascadeStrategy: CascadeVoiceStrategy;
  private gemmaStrategy: GemmaMultimodalVoiceStrategy;
  private staleCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly voiceService: VoiceService,
    @Inject(forwardRef(() => OpenClawProxyService))
    private readonly openClawProxyService: OpenClawProxyService,
    @InjectRepository(UserProviderConfig)
    private readonly providerConfigRepo: Repository<UserProviderConfig>,
    private readonly sessionFabric: SessionFabricService,
    private readonly outputDispatcher: OutputDispatcherService,
    private readonly deepThinkOrchestrator: DeepThinkOrchestratorService,
  ) {}

  onModuleInit() {
    this.cascadeStrategy = new CascadeVoiceStrategy(
      this.voiceService,
      this.openClawProxyService,
    );
    this.gemmaStrategy = new GemmaMultimodalVoiceStrategy();
    this.outputDispatcher.setServer(this.server);
    this.logger.log(
      `Voice strategies initialized: cascade=available, gemma-multimodal=${this.gemmaStrategy.isAvailable() ? 'available' : 'unavailable'}`,
    );

    // Periodic stale session cleanup (every 60s)
    this.staleCheckInterval = setInterval(() => this.cleanupStaleSessions(), 60_000);
  }

  onModuleDestroy() {
    if (this.staleCheckInterval) {
      clearInterval(this.staleCheckInterval);
      this.staleCheckInterval = null;
    }
  }

  /** Remove voice sessions whose socket has disconnected */
  private cleanupStaleSessions() {
    const now = Date.now();
    const maxIdleMs = 10 * 60_000; // 10 minutes
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const socketStillConnected = this.server?.sockets?.sockets?.has(session.socketId);
      const idle = now - session.createdAt > maxIdleMs;

      if (!socketStillConnected || idle) {
        session.geminiSession?.close?.();
        session.streamingSession?.abort();
        session.currentResponseAbort?.abort();
        this.clearPendingAgentEnd(session);
        this.getStrategyForSession(session)?.endSession(sessionId);
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned ${cleaned} stale voice session(s). Active: ${this.sessions.size}`);
    }
  }

  /**
   * Select the best voice strategy for a session.
   *   - glass/watch devices → prefer gemma-multimodal (vision)
   *   - gemma-multimodal healthy → use it for premium users
   *   - fallback → cascade (always available)
   */
  private selectStrategy(session: VoiceSession): IVoiceStreamStrategy {
    // Devices with camera always prefer multimodal
    if (session.deviceType === 'glass' || session.deviceType === 'watch') {
      if (this.gemmaStrategy.isAvailable()) return this.gemmaStrategy;
    }

    // Default: cascade pipeline (proven, always available)
    return this.cascadeStrategy;
  }

  // ── Connection Lifecycle ─────────────────────────────────

  async handleConnection(client: AuthenticatedVoiceSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.query?.token?.toString() ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Voice client ${client.id} rejected: no token`);
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      client.userId = payload.sub || payload.id;
      client.join(`user:${client.userId}`);
      this.logger.log(`Voice client connected: ${client.id} (user: ${client.userId})`);
    } catch (error) {
      this.logger.error(`Voice client ${client.id} auth failed: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedVoiceSocket) {
    // Clean up any sessions for this socket
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.socketId === client.id) {
        session.geminiSession?.close?.();
        session.streamingSession?.abort();
        session.currentResponseAbort?.abort();
        this.clearPendingAgentEnd(session);
        this.getStrategyForSession(session)?.endSession(sessionId);
        this.sessions.delete(sessionId);

        // Leave fabric (async, best-effort)
        if (session.fabricDeviceId && session.userId) {
          this.sessionFabric.leaveSession(session.userId, session.fabricDeviceId).catch(() => {});
        }

        this.logger.debug(`Cleaned up voice session ${sessionId} on disconnect`);
      }
    }
    this.logger.log(`Voice client disconnected: ${client.id}`);
  }

  // ── Session Management ───────────────────────────────────

  @SubscribeMessage('voice:session:start')
  async handleSessionStart(
    @ConnectedSocket() client: AuthenticatedVoiceSocket,
    @MessageBody() data: { sessionId?: string; instanceId?: string; lang?: string; voiceId?: string; duplexMode?: boolean; model?: string; deviceType?: 'phone' | 'desktop' | 'web' | 'glass' | 'watch' },
  ) {
    if (!client.userId) {
      client.emit('voice:error', { error: 'Not authenticated' });
      return;
    }

    if (!data.instanceId) {
      client.emit('voice:error', { error: 'Missing instanceId' });
      return;
    }

    const sessionId = data.sessionId || `vs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const session: VoiceSession = {
      userId: client.userId,
      socketId: client.id,
      sessionId,
      instanceId: data.instanceId,
      lang: data.lang || 'en',
      voiceId: data.voiceId,
      model: sanitizeRealtimeModelId(data.model),
      duplexMode: data.duplexMode ?? false,
      audioChunks: [],
      streamingSession: null,
      currentResponseAbort: null,
      responseGeneration: 0,
      ttsSentenceBuffer: '',
      ttsQueue: Promise.resolve(),
      lastFinalTranscript: '',
      lastFinalAt: 0,
      createdAt: Date.now(),
      activeStreamingToken: null,
      ignoredStreamingTokens: new Set<symbol>(),
      pendingStreamingEnd: null,
      streamingFinalText: '',
      streamingFinalToken: null,
      geminiSession: null,
      useGeminiLive: false,
      v2Strategy: null,
      pendingAgentEndTimer: null,
      pendingToolCalls: new Map<string, PendingVoiceToolCall>(),
      deviceType: data.deviceType,
    };

    this.sessions.set(sessionId, session);
    client.join(`voice:${sessionId}`);

    // Register device in Session Fabric
    const deviceId = (data as Record<string, any>).deviceId || `${data.deviceType || 'web'}-${client.id}`;
    session.fabricDeviceId = deviceId;
    this.sessionFabric.joinSession({
      userId: client.userId,
      sessionId,
      deviceId,
      deviceType: (data.deviceType || 'web') as FabricDeviceType,
      socketId: client.id,
    }).catch((err: Error) => {
      this.logger.warn(`Fabric join failed for ${sessionId}: ${err.message}`);
    });

    // Try Gemini Live for end-to-end voice — only for platform users without custom API
    const hasCustomProvider = await this.providerConfigRepo.count({ where: { userId: client.userId, isActive: true } }) > 0;
    if (!hasCustomProvider && this.geminiAdapter.isAvailable && data.duplexMode !== false) {
      try {
        await this.initializeGeminiLiveSession(session, client);
        session.v2Strategy = 'gemini-live';
        client.emit('voice:strategy:info', { sessionId, strategy: session.v2Strategy });
      } catch (err: any) {
        this.logger.warn(`Gemini Live init failed, falling back to Deepgram+OpenClaw: ${err.message}`);
        session.useGeminiLive = false;
        session.geminiSession = null;
      }
    }

    if (!session.useGeminiLive) {
      const strategy = this.selectStrategy(session);
      try {
        await strategy.initSession(
          {
            sessionId,
            userId: session.userId,
            instanceId: session.instanceId,
            lang: session.lang,
            voiceId: session.voiceId,
            model: session.model,
            duplexMode: session.duplexMode,
            deviceType: session.deviceType,
          },
          this.buildStrategyCallbacks(client, session),
        );
        session.v2Strategy = strategy.name;
        client.emit('voice:strategy:info', { sessionId, strategy: strategy.name });
      } catch (error: any) {
        this.logger.warn(`Voice strategy init failed for ${sessionId}, falling back to legacy pipeline: ${error.message}`);
        session.v2Strategy = null;
        await this.initializeStreamingSession(session, client);
      }
    }

    this.logger.debug(`Voice session started: ${sessionId} (user: ${client.userId}, lang: ${session.lang}, duplex: ${session.duplexMode})`);

    client.emit('voice:session:ready', { sessionId, instanceId: session.instanceId });
  }

  @SubscribeMessage('voice:session:end')
  handleSessionEnd(
    @ConnectedSocket() client: AuthenticatedVoiceSocket,
    @MessageBody() data: { sessionId: string },
  ) {
    const session = this.getSession(data.sessionId, client);
    if (!session) return;

    session.geminiSession?.close?.();
    session.streamingSession?.abort();
    session.currentResponseAbort?.abort();
    this.clearPendingAgentEnd(session);
    this.getStrategyForSession(session)?.endSession(data.sessionId);
    this.sessions.delete(data.sessionId);
    client.leave(`voice:${data.sessionId}`);
    client.emit('voice:session:ended', { sessionId: data.sessionId });
    this.logger.debug(`Voice session ended: ${data.sessionId}`);
  }

  @SubscribeMessage('voice:text')
  async handleVoiceText(
    @ConnectedSocket() client: AuthenticatedVoiceSocket,
    @MessageBody() data: { sessionId: string; text: string; model?: string },
  ) {
    const session = this.getSession(data.sessionId, client);
    if (!session) {
      return;
    }

    const text = String(data.text || '').trim();
    if (!text) {
      client.emit('voice:error', { sessionId: data.sessionId, error: 'Empty text' });
      return;
    }

    this.logger.debug(`voice:text received for session ${data.sessionId} (instance: ${session.instanceId})`);

    session.model = sanitizeRealtimeModelId(data.model) || session.model;

    // Route text to Gemini Live when active
    if (session.useGeminiLive && session.geminiSession) {
      session.geminiSession.sendText(text);
      return;
    }

    const strategy = this.getStrategyForSession(session);
    if (strategy) {
      await strategy.processText(data.sessionId, text);
      return;
    }

    await this.startAgentResponse(client, session, text);
  }

  @SubscribeMessage('voice:interrupt')
  handleVoiceInterrupt(
    @ConnectedSocket() client: AuthenticatedVoiceSocket,
    @MessageBody() data: { sessionId: string },
  ) {
    const session = this.getSession(data.sessionId, client);
    if (!session) {
      return;
    }

    const strategy = this.getStrategyForSession(session);
    if (strategy) {
      this.clearPendingAgentEnd(session);
      strategy.interrupt(data.sessionId);
      return;
    }

    this.interruptSessionResponse(client, session);
  }

  // ── Session Fabric ───────────────────────────────────────

  @SubscribeMessage('voice:fabric:devices')
  async handleFabricDevices(
    @ConnectedSocket() client: AuthenticatedVoiceSocket,
    @MessageBody() data: { sessionId: string },
  ) {
    if (!client.userId || !data.sessionId) {
      client.emit('voice:error', { error: 'Missing sessionId' });
      return;
    }

    const devices = await this.sessionFabric.getSessionDevices(data.sessionId);
    client.emit('voice:fabric:devices:res', {
      sessionId: data.sessionId,
      devices: devices.map((d) => ({
        deviceId: d.deviceId,
        deviceType: d.deviceType,
        isPrimary: d.isPrimary,
        capabilities: d.capabilities,
        lastActiveAt: d.lastActiveAt,
      })),
    });
  }

  @SubscribeMessage('voice:fabric:switch-primary')
  async handleFabricSwitchPrimary(
    @ConnectedSocket() client: AuthenticatedVoiceSocket,
    @MessageBody() data: { sessionId: string; targetDeviceId: string },
  ) {
    if (!client.userId || !data.sessionId || !data.targetDeviceId) {
      client.emit('voice:error', { error: 'Missing sessionId or targetDeviceId' });
      return;
    }

    const success = await this.sessionFabric.switchPrimary(data.sessionId, data.targetDeviceId);

    // Notify all devices in the session about the primary change
    await this.outputDispatcher.broadcast(data.sessionId, 'voice:fabric:primary-changed', {
      sessionId: data.sessionId,
      newPrimaryDeviceId: data.targetDeviceId,
      success,
    });
  }

  // ── Heartbeat / Health ─────────────────────────────────

  @SubscribeMessage('voice:ping')
  async handlePing(
    @ConnectedSocket() client: AuthenticatedVoiceSocket,
    @MessageBody() data: { sessionId?: string },
  ) {
    // Touch fabric heartbeat if session is active
    if (data?.sessionId) {
      const session = this.sessions.get(data.sessionId);
      if (session && session.fabricDeviceId && session.userId) {
        this.sessionFabric.heartbeat(session.userId, session.fabricDeviceId).catch(() => {});
        // Refresh createdAt so stale cleanup doesn't kill active sessions
        session.createdAt = Date.now();
      }
    }

    client.emit('voice:pong', {
      sessionId: data?.sessionId,
      ts: Date.now(),
      activeSessions: this.sessions.size,
    });
  }

  @SubscribeMessage('voice:reconnect')
  async handleReconnect(
    @ConnectedSocket() client: AuthenticatedVoiceSocket,
    @MessageBody() data: { sessionId: string; instanceId?: string; deviceType?: string },
  ) {
    if (!client.userId) {
      client.emit('voice:error', { error: 'Not authenticated' });
      return;
    }

    const existingSession = this.sessions.get(data.sessionId);
    if (existingSession) {
      // Re-bind socket ID (client reconnected with new socket)
      const oldSocketId = existingSession.socketId;
      existingSession.socketId = client.id;
      existingSession.createdAt = Date.now(); // reset idle timer

      // Update fabric device socket
      if (existingSession.fabricDeviceId) {
        this.sessionFabric.updateSocketId(
          existingSession.userId,
          existingSession.fabricDeviceId,
          client.id,
        ).catch(() => {});
      }

      client.join(`voice:${data.sessionId}`);
      client.emit('voice:reconnect:ok', {
        sessionId: data.sessionId,
        strategy: existingSession.v2Strategy,
        resumed: true,
      });

      this.logger.log(`Voice session ${data.sessionId} reconnected: ${oldSocketId} → ${client.id}`);
      return;
    }

    // Session expired — tell client to start fresh
    client.emit('voice:reconnect:expired', {
      sessionId: data.sessionId,
      reason: 'Session no longer exists. Please start a new voice:session:start.',
    });
  }

  @SubscribeMessage('voice:tool_hold')
  handleToolHold(
    @ConnectedSocket() client: AuthenticatedVoiceSocket,
    @MessageBody() data: { sessionId: string; toolCallId: string; reason?: string },
  ) {
    const session = this.getSession(data.sessionId, client);
    if (!session) {
      return;
    }

    if (!data.toolCallId) {
      client.emit('voice:error', {
        sessionId: data.sessionId,
        error: 'Missing toolCallId for tool hold',
        code: 'INVALID_TOOL_HOLD',
      });
      return;
    }

    const pending = session.pendingToolCalls.get(data.toolCallId);
    if (pending) {
      pending.held = true;
      pending.updatedAt = Date.now();
    }

    client.emit('voice:tool:held', {
      sessionId: data.sessionId,
      toolCallId: data.toolCallId,
      toolName: pending?.toolName,
      reason: data.reason || 'awaiting_user_confirmation',
    });
  }

  @SubscribeMessage('voice:tool_result')
  async handleToolResult(
    @ConnectedSocket() client: AuthenticatedVoiceSocket,
    @MessageBody() data: { sessionId: string; toolCallId: string; result?: Record<string, any> },
  ) {
    const session = this.getSession(data.sessionId, client);
    if (!session) {
      return;
    }

    if (!data.toolCallId) {
      client.emit('voice:error', {
        sessionId: data.sessionId,
        error: 'Missing toolCallId for tool result',
        code: 'INVALID_TOOL_RESULT',
      });
      return;
    }

    const toolResult = data.result || {};
    const pending = session.pendingToolCalls.get(data.toolCallId);
    session.pendingToolCalls.delete(data.toolCallId);

    client.emit('voice:tool:end', {
      sessionId: data.sessionId,
      tool: pending?.toolName || 'paired-device-tool',
      toolCallId: data.toolCallId,
      success: toolResult.success !== false,
      error: toolResult.error,
    });
    client.emit('voice:agent:tool_result', {
      sessionId: data.sessionId,
      toolName: pending?.toolName || 'paired-device-tool',
      toolCallId: data.toolCallId,
      success: toolResult.success !== false,
      result: toolResult,
      error: toolResult.error,
      source: 'paired-device',
    });

    const followUp = this.buildToolDecisionFollowUpPrompt(data.toolCallId, pending, toolResult);
    if (!followUp) {
      return;
    }

    try {
      const strategy = this.getStrategyForSession(session);
      if (strategy) {
        await strategy.processText(data.sessionId, followUp);
        return;
      }

      if (session.useGeminiLive && session.geminiSession) {
        session.geminiSession.sendText(followUp);
        return;
      }

      await this.startAgentResponse(client, session, followUp);
    } catch (error: any) {
      this.logger.warn(`Failed to continue tool result follow-up for ${data.sessionId}: ${error.message}`);
      client.emit('voice:error', {
        sessionId: data.sessionId,
        error: 'Paired device result was received, but follow-up generation failed',
        code: 'VOICE_TOOL_RESULT_FOLLOWUP_ERROR',
      });
    }
  }

  // ── Image Frame (v2 — multimodal strategies) ─────────────

  @SubscribeMessage('voice:image:frame')
  async handleImageFrame(
    @ConnectedSocket() client: AuthenticatedVoiceSocket,
    @MessageBody() data: { sessionId: string; frame: string; mimeType?: string },
  ) {
    const session = this.getSession(data.sessionId, client);
    if (!session) return;

    if (!data.frame) {
      client.emit('voice:error', { sessionId: data.sessionId, error: 'Missing frame data', code: 'INVALID_IMAGE_FRAME' });
      return;
    }

    const strategy = this.getStrategyForSession(session);
    if (!strategy?.processImageFrame || session.v2Strategy !== 'gemma-multimodal') {
      // Silently ignore for cascade sessions (camera not relevant)
      return;
    }

    const frameBuffer = Buffer.from(data.frame, 'base64');
    const mimeType = data.mimeType || 'image/jpeg';

    try {
      await strategy.processImageFrame(data.sessionId, frameBuffer, mimeType);
    } catch (error: any) {
      this.logger.warn(`Image frame processing failed for ${data.sessionId}: ${error.message}`);
    }
  }

  // ── Audio Streaming (Client → Server) ────────────────────

  @SubscribeMessage('voice:audio:chunk')
  handleAudioChunk(
    @ConnectedSocket() client: AuthenticatedVoiceSocket,
    @MessageBody() data: { sessionId: string; audio: unknown },
  ) {
    const session = this.getSession(data.sessionId, client);
    if (!session) return;

    const chunk = this.normalizeAudioChunk(data.audio);
    if (!chunk || chunk.length === 0) {
      client.emit('voice:error', {
        sessionId: data.sessionId,
        error: 'Invalid audio payload received',
        code: 'INVALID_AUDIO_PAYLOAD',
      });
      return;
    }

    // Route to Gemini Live if active
    if (session.useGeminiLive && session.geminiSession) {
      session.geminiSession.sendAudio(chunk);
      return;
    }

    const strategy = this.getStrategyForSession(session);
    if (strategy) {
      strategy.processAudioChunk(data.sessionId, chunk);
      return;
    }

    if (session.streamingSession) {
      session.streamingSession.write(chunk);
      session.audioChunks.push(chunk);
      return;
    }

    session.audioChunks.push(chunk);
  }

  @SubscribeMessage('voice:audio:end')
  async handleAudioEnd(
    @ConnectedSocket() client: AuthenticatedVoiceSocket,
    @MessageBody() data: { sessionId: string },
  ) {
    const session = this.getSession(data.sessionId, client);
    if (!session) {
      return;
    }

    // Gemini Live manages turn detection itself — audio:end is a no-op
    if (session.useGeminiLive && session.geminiSession) {
      return;
    }

    const strategy = this.getStrategyForSession(session);
    if (strategy) {
      await strategy.processAudioEnd(data.sessionId);
      return;
    }

    if (session.streamingSession) {
      const endingStreamingSession = session.streamingSession;
      const endingToken = session.activeStreamingToken;

      session.streamingSession = null;
      session.activeStreamingToken = null;

      const finalReceived = endingToken
        ? await this.awaitStreamingTurnFinalization(session, endingToken, () => endingStreamingSession.end())
        : false;

      // Non-duplex: check if streaming already delivered a final (race recovery)
      const storedFinal = session.streamingFinalText;
      const storedToken = session.streamingFinalToken;
      session.streamingFinalText = '';
      session.streamingFinalToken = null;

      if (finalReceived || (storedToken === endingToken && storedFinal)) {
        // Streaming gave us a valid transcript — use it directly
        const transcript = storedFinal;
        session.audioChunks = [];
        await this.initializeStreamingSession(session, client);
        if (!session.duplexMode && transcript) {
          await this.startAgentResponse(client, session, transcript);
        }
        return;
      }

      if (session.audioChunks.length > 0) {
        this.logger.warn(
          `Streaming final transcript timed out for session ${session.sessionId}; falling back to buffered PCM transcription`,
        );
        if (endingToken) {
          session.ignoredStreamingTokens.add(endingToken);
        }
        await this.processBufferedAudioTurn(client, session, data.sessionId);
      }

      session.audioChunks = [];
      await this.initializeStreamingSession(session, client);
      return;
    }

    if (session.audioChunks.length === 0) {
      client.emit('voice:error', { sessionId: data.sessionId, error: 'No audio data received' });
      return;
    }

    await this.processBufferedAudioTurn(client, session, data.sessionId);
  }

  // ── TTS Streaming (Server → Client) ──────────────────────

  @SubscribeMessage('voice:tts:request')
  async handleTTSRequest(
    @ConnectedSocket() client: AuthenticatedVoiceSocket,
    @MessageBody() data: { sessionId: string; text: string; voice?: string; lang?: string },
  ) {
    const session = this.getSession(data.sessionId, client);
    if (!session) return;

    if (!data.text?.trim()) {
      client.emit('voice:error', { sessionId: data.sessionId, error: 'Empty text' });
      return;
    }

    const isChinese = (data.lang || session.lang) === 'zh' ||
      /[\u4e00-\u9fff]/.test(data.text);
    const voice = resolveEdgeVoice(data.voice || session.voiceId, isChinese);

    try {
      const audioBuffer = await edgeTTS(data.text, { voice });

      // Send in chunks (16KB each) for streaming playback
      const CHUNK_SIZE = 16 * 1024;
      for (let offset = 0; offset < audioBuffer.length; offset += CHUNK_SIZE) {
        const chunk = audioBuffer.subarray(offset, offset + CHUNK_SIZE);
        client.emit('voice:tts:chunk', {
          sessionId: data.sessionId,
          audio: chunk,
          offset,
          total: audioBuffer.length,
        });
      }

      client.emit('voice:tts:end', { sessionId: data.sessionId });
    } catch (error: any) {
      this.logger.error(`TTS error for session ${data.sessionId}: ${error.message}`);
      client.emit('voice:error', {
        sessionId: data.sessionId,
        error: 'TTS synthesis failed',
        code: 'TTS_ERROR',
      });
    }
  }

  // ── Helpers ──────────────────────────────────────────────

  private getSession(sessionId: string, client: AuthenticatedVoiceSocket): VoiceSession | null {
    if (!sessionId) {
      client.emit('voice:error', { error: 'Missing sessionId' });
      return null;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      client.emit('voice:error', { sessionId, error: 'Session not found' });
      return null;
    }

    if (session.userId !== client.userId) {
      client.emit('voice:error', { sessionId, error: 'Unauthorized' });
      return null;
    }

    return session;
  }

  /** Get active session count (for monitoring) */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  // ── Gemini Live End-to-End Session ────────────────────────

  private async initializeGeminiLiveSession(
    session: VoiceSession,
    client: AuthenticatedVoiceSocket,
  ): Promise<void> {
    const systemPrompt =
      `You are Agentrix, a helpful AI voice assistant. ` +
      `Respond naturally and concisely in ${session.lang === 'zh' ? 'Chinese' : 'English'}. ` +
      `For simple questions (weather, time, greetings, quick Q&A), answer directly. ` +
      `For complex tasks (coding, analysis, multi-step reasoning, planning), ` +
      `call the route_to_backend tool with the full user request.`;

    session.geminiSession = await this.geminiAdapter.createSession(
      systemPrompt,
      {
        onTranscript: (text, isFinal) => {
          if (isFinal) {
            client.emit('voice:stt:final', {
              sessionId: session.sessionId,
              transcript: text,
              lang: session.lang,
              provider: 'gemini-live',
            });
          } else {
            client.emit('voice:stt:interim', {
              sessionId: session.sessionId,
              transcript: text,
            });
          }
        },
        onAgentText: (text, isFinal) => {
          client.emit('voice:agent:text', {
            sessionId: session.sessionId,
            chunk: text,
          });
          if (isFinal) {
            client.emit('voice:agent:end', { sessionId: session.sessionId });
          }
        },
        onAgentAudio: (chunk) => {
          // Gemini returns 24kHz PCM — send to client as base64
          client.emit('voice:agent:audio', {
            sessionId: session.sessionId,
            audio: chunk.toString('base64'),
            format: 'pcm24k',
            text: '',
          });
        },
        onAgentAudioEnd: () => {
          client.emit('voice:agent:end', { sessionId: session.sessionId });
        },
        onToolCall: async (toolName, args) => {
          if (toolName === 'route_to_backend') {
            // Complexity routing: forward to Haiku/Sonnet via OpenClaw proxy
            this.logger.log(`Gemini routed complex task (${args.complexity}): "${(args.transcript || '').slice(0, 80)}"`);

            // Close Gemini audio output for this turn, use traditional TTS for the response
            session.geminiSession?.interrupt?.();

            // Route through OpenClaw proxy (user's configured model)
            await this.startAgentResponse(client, session, args.transcript || '');
          } else {
            this.logger.log(`Gemini tool call: ${toolName}(${JSON.stringify(args).slice(0, 100)})`);
          }
        },
        onError: (err) => {
          this.logger.error(`Gemini Live session error: ${err.message}`);
          // Fall back to traditional pipeline
          session.useGeminiLive = false;
          session.geminiSession = null;
          this.initializeStreamingSession(session, client).catch(() => {});
          client.emit('voice:error', {
            sessionId: session.sessionId,
            error: 'Voice session degraded to standard mode',
            code: 'GEMINI_FALLBACK',
          });
        },
        onSessionEnd: () => {
          this.logger.debug(`Gemini Live session ended for ${session.sessionId}`);
          session.geminiSession = null;
          session.useGeminiLive = false;
        },
      },
      { lang: session.lang, voice: session.voiceId },
    );

    session.useGeminiLive = true;
    this.logger.log(`Gemini Live session initialized for ${session.sessionId}`);
  }

  private async initializeStreamingSession(
    session: VoiceSession,
    client: AuthenticatedVoiceSocket,
  ): Promise<void> {
    if (!this.streamingAdapter.isAvailable) {
      this.logger.warn(
        `Streaming STT unavailable for session ${session.sessionId}; falling back to turn-based PCM transcription`,
      );
      return;
    }

    try {
      const streamingToken = Symbol(`stream-${session.sessionId}-${Date.now()}`);
      session.streamingSession?.abort();
      session.activeStreamingToken = streamingToken;
      session.streamingSession = await this.streamingAdapter.createStreamingSession(
        {
          lang: session.lang,
          encoding: 'linear16',
          sampleRate: 16000,
        },
        {
          onInterim: (transcript) => {
            client.emit('voice:stt:interim', {
              sessionId: session.sessionId,
              transcript,
              lang: session.lang,
            });
            client.emit('voice:transcript:interim', {
              sessionId: session.sessionId,
              text: transcript,
              lang: session.lang,
            });
          },
          onFinal: (result) => {
            if (session.ignoredStreamingTokens.has(streamingToken)) {
              session.ignoredStreamingTokens.delete(streamingToken);
              this.resolvePendingStreamingTurn(session, streamingToken, false);
              return;
            }

            const normalizedTranscript = (result.text || '').trim();
            client.emit('voice:stt:final', {
              sessionId: session.sessionId,
              transcript: normalizedTranscript,
              lang: result.lang || session.lang,
              provider: result.provider,
            });
            client.emit('voice:transcript:final', {
              sessionId: session.sessionId,
              text: normalizedTranscript,
              lang: result.lang || session.lang,
              provider: result.provider,
            });

            this.resolvePendingStreamingTurn(session, streamingToken, Boolean(normalizedTranscript));
            session.audioChunks = [];

            // Store streaming final for non-duplex handleAudioEnd recovery
            if (normalizedTranscript) {
              session.streamingFinalText = normalizedTranscript;
              session.streamingFinalToken = streamingToken;
            }

            if (!session.duplexMode || !normalizedTranscript) {
              return;
            }

            const now = Date.now();
            if (
              normalizedTranscript === session.lastFinalTranscript
              && now - session.lastFinalAt < 2000
            ) {
              this.logger.debug(`Skipping duplicate duplex final transcript for session ${session.sessionId}`);
              return;
            }

            session.lastFinalTranscript = normalizedTranscript;
            session.lastFinalAt = now;
            void this.startAgentResponse(client, session, normalizedTranscript);
          },
          onError: (error) => {
            this.logger.warn(`Streaming STT error for session ${session.sessionId}: ${error.message}`);
            session.streamingSession = null;
            this.resolvePendingStreamingTurn(session, streamingToken, false);
            client.emit('voice:error', {
              sessionId: session.sessionId,
              error: 'Streaming transcription failed',
              code: 'STREAMING_STT_ERROR',
            });
          },
        },
      );
    } catch (error: any) {
      session.streamingSession = null;
      session.activeStreamingToken = null;
      this.logger.warn(`Failed to initialize streaming STT for session ${session.sessionId}: ${error.message}`);
    }
  }

  private async awaitStreamingTurnFinalization(
    session: VoiceSession,
    token: symbol,
    closeStream: () => void,
  ): Promise<boolean> {
    if (session.pendingStreamingEnd?.token === token && !session.pendingStreamingEnd.settled) {
      return new Promise<boolean>((resolve) => resolve(false));
    }

    return await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        this.resolvePendingStreamingTurn(session, token, false);
      }, STREAMING_FINALIZATION_TIMEOUT_MS);

      session.pendingStreamingEnd = {
        token,
        settled: false,
        resolve,
        timeout,
      };

      closeStream();
    });
  }

  private resolvePendingStreamingTurn(
    session: VoiceSession,
    token: symbol,
    receivedFinal: boolean,
  ) {
    const pending = session.pendingStreamingEnd;
    if (!pending || pending.token !== token || pending.settled) {
      return;
    }

    pending.settled = true;
    clearTimeout(pending.timeout);
    session.pendingStreamingEnd = null;
    pending.resolve(receivedFinal);
  }

  private async processBufferedAudioTurn(
    client: AuthenticatedVoiceSocket,
    session: VoiceSession,
    sessionId: string,
  ): Promise<void> {
    const audioBuffer = Buffer.concat(session.audioChunks);
    session.audioChunks = [];

    try {
      const wavBuffer = this.wrapPcm16AsWav(audioBuffer);
      const result = await this.voiceService.transcribe(
        wavBuffer,
        'audio/wav',
        'voice.wav',
        session.lang,
      );

      const transcript = result?.transcript || '';

      if (transcript) {
        client.emit('voice:stt:final', {
          sessionId,
          transcript,
          lang: session.lang,
        });
        client.emit('voice:transcript:final', {
          sessionId,
          text: transcript,
          lang: session.lang,
        });

        await this.startAgentResponse(client, session, transcript);
      } else {
        client.emit('voice:stt:final', {
          sessionId,
          transcript: '',
          lang: session.lang,
        });
      }
    } catch (error: any) {
      this.logger.error(`STT error for session ${sessionId}: ${error.message}`);
      // Emit a non-fatal error so the client stays connected and can retry
      client.emit('voice:stt:final', {
        sessionId,
        transcript: '',
        lang: session.lang,
        error: 'transcription_failed',
      });
    }
  }

  private normalizeAudioChunk(audio: unknown): Buffer | null {
    if (!audio) {
      return null;
    }

    if (Buffer.isBuffer(audio)) {
      return audio;
    }

    if (audio instanceof Uint8Array) {
      return Buffer.from(audio);
    }

    if (audio instanceof ArrayBuffer) {
      return Buffer.from(audio);
    }

    if (ArrayBuffer.isView(audio)) {
      return Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength);
    }

    if (Array.isArray(audio)) {
      return Buffer.from(audio);
    }

    if (typeof audio === 'string') {
      return Buffer.from(audio, 'base64');
    }

    if (
      typeof audio === 'object'
      && audio !== null
      && (audio as { type?: string }).type === 'Buffer'
      && Array.isArray((audio as { data?: unknown }).data)
    ) {
      return Buffer.from((audio as { data: number[] }).data);
    }

    return null;
  }

  private wrapPcm16AsWav(pcmBuffer: Buffer): Buffer {
    const header = Buffer.alloc(44);
    const byteRate = PCM_SAMPLE_RATE * PCM_CHANNEL_COUNT * (PCM_BITS_PER_SAMPLE / 8);
    const blockAlign = PCM_CHANNEL_COUNT * (PCM_BITS_PER_SAMPLE / 8);

    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(36 + pcmBuffer.length, 4);
    header.write('WAVE', 8, 'ascii');
    header.write('fmt ', 12, 'ascii');
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(PCM_CHANNEL_COUNT, 22);
    header.writeUInt32LE(PCM_SAMPLE_RATE, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(PCM_BITS_PER_SAMPLE, 34);
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(pcmBuffer.length, 40);

    return Buffer.concat([header, pcmBuffer]);
  }

  private interruptSessionResponse(client: AuthenticatedVoiceSocket, session: VoiceSession) {
    this.clearPendingAgentEnd(session);
    // Interrupt Gemini Live audio output if active
    session.geminiSession?.interrupt?.();

    const hadActiveResponse = !!session.currentResponseAbort;
    session.currentResponseAbort?.abort();
    session.currentResponseAbort = null;
    session.responseGeneration += 1;
    session.ttsSentenceBuffer = '';
    if (hadActiveResponse) {
      client.emit('voice:agent:end', {
        sessionId: session.sessionId,
        interrupted: true,
      });
    }
  }

  private getStrategyForSession(session: VoiceSession): IVoiceStreamStrategy | null {
    if (!session.v2Strategy || session.v2Strategy === 'gemini-live') {
      return null;
    }

    if (session.v2Strategy === 'gemma-multimodal') {
      return this.gemmaStrategy;
    }

    return this.cascadeStrategy;
  }

  private clearPendingAgentEnd(session: VoiceSession) {
    if (!session.pendingAgentEndTimer) {
      return;
    }

    clearTimeout(session.pendingAgentEndTimer);
    session.pendingAgentEndTimer = null;
  }

  private scheduleStrategyAgentEnd(client: AuthenticatedVoiceSocket, session: VoiceSession) {
    this.clearPendingAgentEnd(session);
    session.pendingAgentEndTimer = setTimeout(() => {
      session.pendingAgentEndTimer = null;
      client.emit('voice:agent:end', { sessionId: session.sessionId });
    }, 0);
  }

  private emitStrategyStreamEvent(
    client: AuthenticatedVoiceSocket,
    session: VoiceSession,
    event: StreamEvent,
  ) {
    client.emit('voice:stream:event', {
      sessionId: session.sessionId,
      event,
    });

    switch (event.type) {
      case 'tool_start':
        this.rememberPendingToolCall(session, event.toolCallId, event.toolName, event.input, false);
        client.emit('voice:tool:start', {
          sessionId: session.sessionId,
          tool: event.toolName,
          toolCallId: event.toolCallId,
        });
        client.emit('voice:agent:tool_call', {
          sessionId: session.sessionId,
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          arguments: event.input,
        });
        break;
      case 'tool_result':
        session.pendingToolCalls.delete(event.toolCallId);
        client.emit('voice:tool:end', {
          sessionId: session.sessionId,
          tool: event.toolName,
          toolCallId: event.toolCallId,
          success: event.success,
          error: event.error,
        });
        client.emit('voice:agent:tool_result', {
          sessionId: session.sessionId,
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          success: event.success,
          result: event.result,
          error: event.error,
        });
        break;
      case 'tool_error':
        session.pendingToolCalls.delete(event.toolCallId);
        client.emit('voice:tool:end', {
          sessionId: session.sessionId,
          tool: event.toolName,
          toolCallId: event.toolCallId,
          success: false,
          error: event.error,
        });
        break;
      case 'approval_required':
        this.rememberPendingToolCall(session, event.toolCallId, event.toolName, event.input, true);
        client.emit('voice:tool:approval_required', {
          sessionId: session.sessionId,
          tool: event.toolName,
          toolCallId: event.toolCallId,
          reason: event.reason,
          riskLevel: event.riskLevel,
        });
        client.emit('voice:agent:tool_call', {
          sessionId: session.sessionId,
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          arguments: event.input,
          requiresApproval: true,
          reason: event.reason,
          riskLevel: event.riskLevel,
        });
        break;
      case 'usage':
        client.emit('voice:meta', {
          sessionId: session.sessionId,
          usage: event,
        });
        if (event.model) {
          client.emit('voice:model:used', {
            sessionId: session.sessionId,
            model: event.model,
            tier: 'usage',
          });
        }
        break;
      case 'thinking':
        client.emit('voice:meta', {
          sessionId: session.sessionId,
          thinking: event.text,
        });
        break;
      case 'error':
        client.emit('voice:error', {
          sessionId: session.sessionId,
          error: event.error,
          code: event.code,
        });
        break;
      default:
        break;
    }
  }

  private rememberPendingToolCall(
    session: VoiceSession,
    toolCallId: string,
    toolName: string,
    input: Record<string, any> | undefined,
    requiresApproval: boolean,
  ) {
    session.pendingToolCalls.set(toolCallId, {
      toolName,
      input,
      requiresApproval,
      held: false,
      updatedAt: Date.now(),
    });
  }

  private buildToolDecisionFollowUpPrompt(
    toolCallId: string,
    pending: PendingVoiceToolCall | undefined,
    result: Record<string, any>,
  ): string {
    const toolName = pending?.toolName || 'paired-device-tool';
    const inputText = pending?.input ? JSON.stringify(pending.input) : '{}';
    const resultText = JSON.stringify(result || {});

    if (result.success !== false) {
      return `System update from the user's paired device: the pending tool call "${toolName}" (id: ${toolCallId}) was approved and completed outside the LLM tool runner. Original input: ${inputText}. Result: ${resultText}. Briefly confirm the completed outcome to the user and continue the conversation without asking to rerun the same tool.`;
    }

    return `System update from the user's paired device: the pending tool call "${toolName}" (id: ${toolCallId}) was rejected or failed outside the LLM tool runner. Original input: ${inputText}. Result: ${resultText}. Briefly explain that the action did not complete and ask the user for the next step without retrying automatically.`;
  }

  private buildStrategyCallbacks(
    client: AuthenticatedVoiceSocket,
    session: VoiceSession,
  ): VoiceStrategyCallbacks {
    return {
      onTranscriptInterim: (sessionId, text) => {
        client.emit('voice:stt:interim', { sessionId, transcript: text, lang: session.lang });
        client.emit('voice:transcript:interim', { sessionId, text, lang: session.lang });
      },
      onTranscriptFinal: (sessionId, text, lang, provider) => {
        client.emit('voice:stt:final', {
          sessionId,
          transcript: text,
          lang: lang || session.lang,
          provider,
        });
        client.emit('voice:transcript:final', {
          sessionId,
          text,
          lang: lang || session.lang,
          provider,
        });
      },
      onAgentText: (sessionId, chunk) => {
        client.emit('voice:agent:text', { sessionId, chunk });
      },
      onAgentTextEnd: () => {
        this.scheduleStrategyAgentEnd(client, session);
      },
      onAgentAudio: (sessionId, audio, format, text) => {
        client.emit('voice:agent:speech:start', {
          sessionId,
          text: text || '',
        });
        client.emit('voice:agent:audio', {
          sessionId,
          audio: audio.toString('base64'),
          format,
          text: text || '',
        });
      },
      onAgentAudioEnd: () => {
        this.clearPendingAgentEnd(session);
        client.emit('voice:agent:end', { sessionId: session.sessionId });
      },
      onDeepThinkStart: (sessionId, targetModel) => {
        client.emit('voice:deepthink:start', { sessionId, targetModel });
        // Also broadcast to all fabric devices
        this.deepThinkOrchestrator.notifyStart(sessionId, targetModel).catch(() => {});
        // Send soothing voice message
        const soothe = this.deepThinkOrchestrator.getSootheMessage(session.lang);
        client.emit('voice:agent:text', { sessionId, chunk: soothe });
        this.queueSentenceTts(client, session, soothe, true, session.responseGeneration);
      },
      onDeepThinkDone: (sessionId, result) => {
        client.emit('voice:deepthink:done', { sessionId, result });
        this.deepThinkOrchestrator.notifyDone(sessionId, {
          success: true,
          summary: typeof result === 'string' ? result.slice(0, 300) : '',
          fullContent: typeof result === 'string' ? result : '',
          model: 'ultra',
          durationMs: 0,
        }).catch(() => {});
      },
      onModelUsed: (sessionId, model, tier) => {
        client.emit('voice:model:used', { sessionId, model, tier });
      },
      onStreamEvent: (sessionId, event) => {
        if (sessionId !== session.sessionId) {
          return;
        }
        this.emitStrategyStreamEvent(client, session, event);
      },
      onError: (sessionId, error, code) => {
        client.emit('voice:error', { sessionId, error, code });
      },
    };
  }

  private async startAgentResponse(
    client: AuthenticatedVoiceSocket,
    session: VoiceSession,
    text: string,
  ): Promise<void> {
    this.interruptSessionResponse(client, session);

    const generation = session.responseGeneration;
    const abortController = new AbortController();
    session.currentResponseAbort = abortController;
    session.ttsSentenceBuffer = '';

    this.logger.debug(`Starting realtime agent response for session ${session.sessionId} (instance: ${session.instanceId})`);

    try {
      await this.openClawProxyService.streamChatToCallbacks(
        session.userId,
        session.instanceId,
        {
          message: text,
          sessionId: session.sessionId,
          model: session.model,
          voiceId: session.voiceId,
        },
        {
          signal: abortController.signal,
          onMeta: async (meta) => {
            this.logger.debug(`voice:meta for session ${session.sessionId}: ${JSON.stringify(meta)}`);
            client.emit('voice:meta', {
              sessionId: session.sessionId,
              ...meta,
            });
          },
          onChunk: async (chunk) => {
            if (abortController.signal.aborted || generation !== session.responseGeneration) {
              return;
            }
            this.logger.debug(`voice:agent:text chunk for session ${session.sessionId}: ${chunk.slice(0, 80)}`);
            client.emit('voice:agent:text', {
              sessionId: session.sessionId,
              chunk,
            });
            this.queueSentenceTts(client, session, chunk, false, generation);
          },
          onDone: async () => {
            if (abortController.signal.aborted || generation !== session.responseGeneration) {
              return;
            }
            this.logger.debug(`voice:agent:end for session ${session.sessionId}`);
            this.queueSentenceTts(client, session, '', true, generation);
            await session.ttsQueue.catch(() => undefined);
            if (generation === session.responseGeneration) {
              client.emit('voice:agent:end', { sessionId: session.sessionId });
            }
          },
        },
      );
    } catch (error: any) {
      if (abortController.signal.aborted) {
        return;
      }
      this.logger.error(`Realtime agent response failed for session ${session.sessionId}: ${error.message}`);
      client.emit('voice:error', {
        sessionId: session.sessionId,
        error: error.message || 'Realtime agent response failed',
        code: 'VOICE_AGENT_RESPONSE_ERROR',
      });
    } finally {
      if (session.currentResponseAbort === abortController) {
        session.currentResponseAbort = null;
      }
    }
  }

  private queueSentenceTts(
    client: AuthenticatedVoiceSocket,
    session: VoiceSession,
    incomingText: string,
    flush: boolean,
    generation: number,
  ) {
    if (generation !== session.responseGeneration) {
      return;
    }

    if (incomingText) {
      session.ttsSentenceBuffer += incomingText;
    }

    const sentenceRegex = /[^。！？.!?\n]+[。！？.!?\n]+/g;
    const segments = (session.ttsSentenceBuffer.match(sentenceRegex) || [])
      .map((item) => item.trim())
      .filter(Boolean);

    if (segments.length > 0) {
      session.ttsSentenceBuffer = session.ttsSentenceBuffer.slice((session.ttsSentenceBuffer.match(sentenceRegex) || []).join('').length);
    }

    if (flush) {
      const remainder = session.ttsSentenceBuffer.trim();
      if (remainder) {
        segments.push(remainder);
      }
      session.ttsSentenceBuffer = '';
    }

    for (const sentence of segments) {
      session.ttsQueue = session.ttsQueue
        .then(() => this.emitSentenceAudio(client, session, sentence, generation))
        .catch((error) => {
          this.logger.warn(`Realtime TTS queue error for session ${session.sessionId}: ${error.message}`);
        });
    }
  }

  private async emitSentenceAudio(
    client: AuthenticatedVoiceSocket,
    session: VoiceSession,
    sentence: string,
    generation: number,
  ): Promise<void> {
    if (!sentence || generation !== session.responseGeneration) {
      return;
    }

    // Strip markdown formatting before TTS — **bold**, *italic*, `code`, #headers, []() links
    const cleanSentence = sentence
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_~`#>|]/g, '')
      .trim();

    if (!cleanSentence) {
      return;
    }

    const isChinese = session.lang === 'zh' || /[\u4e00-\u9fff]/.test(cleanSentence);
    const voice = resolveEdgeVoice(session.voiceId, isChinese);
    const audioBuffer = await edgeTTS(cleanSentence, { voice });

    if (generation !== session.responseGeneration) {
      return;
    }

    client.emit('voice:agent:speech:start', {
      sessionId: session.sessionId,
      text: sentence,
    });
    client.emit('voice:agent:audio', {
      sessionId: session.sessionId,
      audio: audioBuffer.toString('base64'),
      format: 'mp3',
      text: sentence,
    });
  }
}
