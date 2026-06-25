import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RealtimeVoiceGateway } from './realtime-voice.gateway';

describe('RealtimeVoiceGateway', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  function createGateway() {
    const voiceService = {
      transcribe: jest.fn().mockResolvedValue({ transcript: 'test transcript' }),
    };

    const sessionFabric = {
      joinSession: jest.fn().mockResolvedValue({ deviceId: 'web-socket-1', isPrimary: true }),
      leaveSession: jest.fn().mockResolvedValue(undefined),
      getSessionDevices: jest.fn().mockResolvedValue([]),
      getPrimaryDevice: jest.fn().mockResolvedValue(null),
      switchPrimary: jest.fn().mockResolvedValue(true),
    };

    const outputDispatcher = {
      setServer: jest.fn(),
      dispatch: jest.fn().mockResolvedValue(undefined),
      broadcast: jest.fn().mockResolvedValue(undefined),
      emitToPrimary: jest.fn().mockResolvedValue(undefined),
    };

    const deepThinkOrchestrator = {
      getSootheMessage: jest.fn().mockReturnValue('Working on it...'),
      notifyStart: jest.fn().mockResolvedValue(undefined),
      notifyProgress: jest.fn().mockResolvedValue(undefined),
      notifyDone: jest.fn().mockResolvedValue(undefined),
    };

    const gateway = new RealtimeVoiceGateway(
      {} as JwtService,
      {} as ConfigService,
      voiceService as any,
      {} as any,
      { count: jest.fn().mockResolvedValue(0) } as any,
      sessionFabric as any,
      outputDispatcher as any,
      deepThinkOrchestrator as any,
    );

    (gateway as any).streamingAdapter = { isAvailable: false };

    return { gateway, voiceService, sessionFabric, outputDispatcher, deepThinkOrchestrator };
  }

  function createSession(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      userId: 'user-1',
      socketId: 'socket-1',
      sessionId: 'session-1',
      instanceId: 'instance-1',
      lang: 'en',
      voiceId: undefined,
      model: undefined,
      duplexMode: false,
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
      pendingToolCalls: new Map(),
      fabricDeviceId: undefined,
      ...overrides,
    };
  }

  it('wraps fallback PCM audio as WAV before transcribing', async () => {
    const { gateway, voiceService } = createGateway();
    const client = { userId: 'user-1', emit: jest.fn() } as any;
    const startAgentResponseSpy = jest.spyOn(gateway as any, 'startAgentResponse').mockResolvedValue(undefined);

    (gateway as any).sessions.set('session-1', createSession());

    gateway.handleAudioChunk(client, {
      sessionId: 'session-1',
      audio: Uint8Array.from([0, 1, 2, 3]),
    });

    await gateway.handleAudioEnd(client, { sessionId: 'session-1' });

    expect(voiceService.transcribe).toHaveBeenCalledWith(
      expect.any(Buffer),
      'audio/wav',
      'voice.wav',
      'en',
    );

    const wavBuffer = voiceService.transcribe.mock.calls[0][0] as Buffer;
    expect(wavBuffer.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wavBuffer.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wavBuffer.toString('ascii', 36, 40)).toBe('data');
    expect(wavBuffer.readUInt32LE(40)).toBe(4);
    expect(startAgentResponseSpy).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ sessionId: 'session-1' }),
      'test transcript',
    );
  });

  it('accepts React Native buffer-like audio payloads', () => {
    const { gateway } = createGateway();
    const client = { userId: 'user-1', emit: jest.fn() } as any;

    (gateway as any).sessions.set('session-1', createSession());

    gateway.handleAudioChunk(client, {
      sessionId: 'session-1',
      audio: { type: 'Buffer', data: [1, 2, 3, 4] },
    });

    const session = (gateway as any).sessions.get('session-1');
    expect(session.audioChunks).toHaveLength(1);
    expect(Buffer.isBuffer(session.audioChunks[0])).toBe(true);
    expect(Array.from(session.audioChunks[0].values())).toEqual([1, 2, 3, 4]);
  });

  it('falls back to buffered PCM transcription when streaming final does not arrive in time', async () => {
    jest.useFakeTimers();

    const { gateway, voiceService } = createGateway();
    const client = { userId: 'user-1', emit: jest.fn() } as any;
    const streamingSession = {
      write: jest.fn(),
      end: jest.fn(),
      abort: jest.fn(),
    };

    const initializeStreamingSessionSpy = jest
      .spyOn(gateway as any, 'initializeStreamingSession')
      .mockResolvedValue(undefined);
    const startAgentResponseSpy = jest
      .spyOn(gateway as any, 'startAgentResponse')
      .mockResolvedValue(undefined);

    (gateway as any).sessions.set('session-1', createSession({
      streamingSession,
      activeStreamingToken: Symbol('stream-1'),
      audioChunks: [Buffer.from([1, 2, 3, 4])],
    }));

    const handleAudioEndPromise = gateway.handleAudioEnd(client, { sessionId: 'session-1' });
    await jest.advanceTimersByTimeAsync(2100);
    await handleAudioEndPromise;

    expect(streamingSession.end).toHaveBeenCalledTimes(1);
    expect(voiceService.transcribe).toHaveBeenCalledWith(
      expect.any(Buffer),
      'audio/wav',
      'voice.wav',
      'en',
    );
    expect(startAgentResponseSpy).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ sessionId: 'session-1' }),
      'test transcript',
    );
    expect(initializeStreamingSessionSpy).toHaveBeenCalledTimes(1);
  });

  it('marks wearable approval holds on pending tool calls', () => {
    const { gateway } = createGateway();
    const client = { userId: 'user-1', emit: jest.fn() } as any;
    const session = createSession({
      pendingToolCalls: new Map([
        ['tool-1', {
          toolName: 'create_payment_intent',
          input: { amount: '10', token: 'USDC' },
          requiresApproval: true,
          held: false,
          updatedAt: Date.now(),
        }],
      ]),
    });

    (gateway as any).sessions.set('session-1', session);

    gateway.handleToolHold(client, {
      sessionId: 'session-1',
      toolCallId: 'tool-1',
      reason: 'awaiting_user_payment_confirmation',
    });

    expect(session.pendingToolCalls.get('tool-1')?.held).toBe(true);
    expect(client.emit).toHaveBeenCalledWith(
      'voice:tool:held',
      expect.objectContaining({
        sessionId: 'session-1',
        toolCallId: 'tool-1',
        toolName: 'create_payment_intent',
      }),
    );
  });

  it('continues the voice session after paired-device tool results arrive', async () => {
    const { gateway } = createGateway();
    const client = { userId: 'user-1', emit: jest.fn() } as any;
    const strategy = {
      processText: jest.fn().mockResolvedValue(undefined),
    };

    (gateway as any).cascadeStrategy = strategy;

    const session = createSession({
      v2Strategy: 'cascade',
      pendingToolCalls: new Map([
        ['tool-1', {
          toolName: 'create_payment_intent',
          input: { amount: '10', token: 'USDC' },
          requiresApproval: true,
          held: true,
          updatedAt: Date.now(),
        }],
      ]),
    });

    (gateway as any).sessions.set('session-1', session);

    await gateway.handleToolResult(client, {
      sessionId: 'session-1',
      toolCallId: 'tool-1',
      result: { success: true, txHash: '0xabc' },
    });

    expect(session.pendingToolCalls.size).toBe(0);
    expect(client.emit).toHaveBeenCalledWith(
      'voice:agent:tool_result',
      expect.objectContaining({
        sessionId: 'session-1',
        toolCallId: 'tool-1',
        toolName: 'create_payment_intent',
        success: true,
        source: 'paired-device',
      }),
    );
    expect(strategy.processText).toHaveBeenCalledWith(
      'session-1',
      expect.stringContaining('0xabc'),
    );
    expect(strategy.processText).toHaveBeenCalledWith(
      'session-1',
      expect.stringContaining('create_payment_intent'),
    );
  });

  it('drops local-only realtime model IDs when starting a session', async () => {
    const { gateway, sessionFabric } = createGateway();
    const client = {
      id: 'socket-1',
      userId: 'user-1',
      emit: jest.fn(),
      join: jest.fn(),
    } as any;

    jest.spyOn(gateway as any, 'initializeStreamingSession').mockResolvedValue(undefined);

    await gateway.handleSessionStart(client, {
      sessionId: 'session-1',
      instanceId: 'instance-1',
      duplexMode: false,
      model: 'gemma-4-4b',
      deviceType: 'phone',
    });

    const session = (gateway as any).sessions.get('session-1');
    expect(session.model).toBeUndefined();
    expect(sessionFabric.joinSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        userId: 'user-1',
      }),
    );
    expect(client.emit).toHaveBeenCalledWith(
      'voice:session:ready',
      expect.objectContaining({ sessionId: 'session-1', instanceId: 'instance-1' }),
    );
  });

  it('does not let local-only realtime model IDs overwrite an active session model', async () => {
    const { gateway } = createGateway();
    const client = { userId: 'user-1', emit: jest.fn() } as any;
    const strategy = {
      processText: jest.fn().mockResolvedValue(undefined),
    };

    (gateway as any).cascadeStrategy = strategy;

    const session = createSession({
      model: 'gpt-4o-mini',
      v2Strategy: 'cascade',
    });

    (gateway as any).sessions.set('session-1', session);

    await gateway.handleVoiceText(client, {
      sessionId: 'session-1',
      text: 'hello world',
      model: 'gemma-4-4b',
    });

    expect(session.model).toBe('gpt-4o-mini');
    expect(strategy.processText).toHaveBeenCalledWith('session-1', 'hello world');
  });

  it('returns fabric device list when queried', async () => {
    const { gateway, sessionFabric } = createGateway();
    const client = { userId: 'user-1', emit: jest.fn() } as any;

    sessionFabric.getSessionDevices.mockResolvedValue([
      {
        deviceId: 'phone-1',
        deviceType: 'phone',
        isPrimary: true,
        capabilities: { hasMic: true, hasSpeaker: true, hasScreen: true, screenSize: 'medium', hasCamera: true, hasLocalModel: false },
        lastActiveAt: new Date(),
      },
      {
        deviceId: 'desktop-1',
        deviceType: 'desktop',
        isPrimary: false,
        capabilities: { hasMic: true, hasSpeaker: true, hasScreen: true, screenSize: 'large', hasCamera: false, hasLocalModel: true },
        lastActiveAt: new Date(),
      },
    ]);

    await gateway.handleFabricDevices(client, { sessionId: 'session-1' });

    expect(sessionFabric.getSessionDevices).toHaveBeenCalledWith('session-1');
    expect(client.emit).toHaveBeenCalledWith(
      'voice:fabric:devices:res',
      expect.objectContaining({
        sessionId: 'session-1',
        devices: expect.arrayContaining([
          expect.objectContaining({ deviceId: 'phone-1', isPrimary: true }),
          expect.objectContaining({ deviceId: 'desktop-1', isPrimary: false }),
        ]),
      }),
    );
  });

  it('switches fabric primary and broadcasts change', async () => {
    const { gateway, sessionFabric, outputDispatcher } = createGateway();
    const client = { userId: 'user-1', emit: jest.fn() } as any;

    await gateway.handleFabricSwitchPrimary(client, {
      sessionId: 'session-1',
      targetDeviceId: 'desktop-1',
    });

    expect(sessionFabric.switchPrimary).toHaveBeenCalledWith('session-1', 'desktop-1');
    expect(outputDispatcher.broadcast).toHaveBeenCalledWith(
      'session-1',
      'voice:fabric:primary-changed',
      expect.objectContaining({
        sessionId: 'session-1',
        newPrimaryDeviceId: 'desktop-1',
        success: true,
      }),
    );
  });

  it('initializes output dispatcher with server reference on module init', () => {
    const { gateway, outputDispatcher } = createGateway();
    (gateway as any).server = { to: jest.fn() } as any;

    (gateway as any).cascadeStrategy = { name: 'cascade' };
    (gateway as any).gemmaStrategy = { isAvailable: () => false };
    gateway.onModuleInit();

    expect(outputDispatcher.setServer).toHaveBeenCalled();
  });
});