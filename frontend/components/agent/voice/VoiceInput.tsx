import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from '../../../lib/api/client';

type VoiceTurnState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface FabricDevice {
  deviceId: string;
  deviceType: 'phone' | 'desktop' | 'web' | 'glass' | 'watch';
  isPrimary: boolean;
  capabilities: {
    hasCamera: boolean;
    hasMic: boolean;
    hasSpeaker: boolean;
    hasScreen: boolean;
    screenSize: string;
    hasLocalModel: boolean;
  };
  lastActiveAt: string;
}

type SocketBufferLike = {
  type: 'Buffer';
  data: number[];
};

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onAssistantTextChunk?: (chunk: string) => void;
  onAssistantResponseEnd?: () => void;
  onSessionReady?: (sessionId: string) => void;
  onStateChange?: (state: VoiceTurnState) => void;
  onDeepThinkStart?: (targetModel: string) => void;
  onDeepThinkDone?: (summary: string) => void;
  onFabricDevicesChanged?: (devices: FabricDevice[]) => void;
  requestedPrimaryDeviceId?: string | null;
  onError?: (error: string) => void;
  disabled?: boolean;
  language?: string;
  sessionId?: string;
  autoPlayResponseAudio?: boolean;
}

const INSTANCE_STORAGE_KEY = 'agentrix_web_voice_instance_id';
const TARGET_SAMPLE_RATE = 16000;

function getAccessToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return localStorage.getItem('access_token') || localStorage.getItem('token');
}

function getVoiceServerBaseUrl(): string {
  return API_BASE_URL.replace(/\/api\/?$/, '');
}

function decodeBase64(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toOwnedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function wrapPcmAsWav(pcmBytes: Uint8Array, sampleRate: number): Blob {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmBytes.byteLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, pcmBytes.byteLength, true);

  return new Blob([header, toOwnedArrayBuffer(pcmBytes)], { type: 'audio/wav' });
}

function toAudioBlob(audioBase64: string, format: string): Blob {
  const bytes = decodeBase64(audioBase64);
  if (format === 'pcm24k') {
    return wrapPcmAsWav(bytes, 24000);
  }
  if (format === 'wav' || format === 'pcm') {
    return new Blob([toOwnedArrayBuffer(bytes)], { type: 'audio/wav' });
  }
  return new Blob([toOwnedArrayBuffer(bytes)], { type: 'audio/mpeg' });
}

function float32ToPcm16(input: Float32Array, sampleRate: number): Int16Array {
  if (sampleRate === TARGET_SAMPLE_RATE) {
    const output = new Int16Array(input.length);
    for (let index = 0; index < input.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, input[index] || 0));
      output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return output;
  }

  const ratio = sampleRate / TARGET_SAMPLE_RATE;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Int16Array(length);

  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    let count = 0;

    for (let cursor = start; cursor < end; cursor += 1) {
      sum += input[cursor] || 0;
      count += 1;
    }

    const sample = Math.max(-1, Math.min(1, count > 0 ? sum / count : input[start] || 0));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return output;
}

function toSocketBuffer(audio: Int16Array): SocketBufferLike {
  return {
    type: 'Buffer',
    data: Array.from(new Uint8Array(audio.buffer)),
  };
}

async function resolveVoiceInstanceId(token: string): Promise<string> {
  const cached = typeof window !== 'undefined'
    ? localStorage.getItem(INSTANCE_STORAGE_KEY)
    : null;
  if (cached) {
    return cached;
  }

  const response = await fetch(`${API_BASE_URL}/openclaw/instances`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`无法获取语音实例 (${response.status})`);
  }

  const instances = await response.json();
  if (!Array.isArray(instances) || instances.length === 0) {
    throw new Error('当前账号没有可用的 OpenClaw 实例');
  }

  const activeInstance = instances.find((instance: any) => instance?.isPrimary && instance?.status === 'active')
    || instances.find((instance: any) => instance?.status === 'active')
    || instances[0];

  if (!activeInstance?.id) {
    throw new Error('未找到可用的语音实例');
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem(INSTANCE_STORAGE_KEY, activeInstance.id);
  }

  return activeInstance.id;
}

/**
 * Web 端统一 realtime voice 输入。
 * 浏览器麦克风 PCM16 上行，后端 TTS 音频下行，直接复用 /voice Socket.IO 网关。
 */
export function VoiceInput({
  onTranscript,
  onAssistantTextChunk,
  onAssistantResponseEnd,
  onSessionReady,
  onStateChange,
  onDeepThinkStart,
  onDeepThinkDone,
  onFabricDevicesChanged,
  requestedPrimaryDeviceId,
  onError,
  disabled = false,
  language = 'zh-CN',
  sessionId,
  autoPlayResponseAudio = true,
}: VoiceInputProps) {
  const [voiceState, setVoiceState] = useState<VoiceTurnState>('idle');
  const [isSupported, setIsSupported] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const currentSessionIdRef = useRef<string | undefined>(sessionId);
  const lastTranscriptRef = useRef('');
  const playbackQueueRef = useRef<Promise<void>>(Promise.resolve());
  const playbackGenerationRef = useRef(0);
  const playbackCountRef = useRef(0);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  const updateVoiceState = useCallback((nextState: VoiceTurnState) => {
    setVoiceState(nextState);
    onStateChange?.(nextState);
  }, [onStateChange]);

  useEffect(() => {
    currentSessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    const socket = socketRef.current;
    const activeSessionId = currentSessionIdRef.current;
    if (!socket || !activeSessionId || !requestedPrimaryDeviceId) {
      return;
    }

    socket.emit('voice:fabric:switch-primary', {
      sessionId: activeSessionId,
      targetDeviceId: requestedPrimaryDeviceId,
    });
  }, [requestedPrimaryDeviceId]);

  useEffect(() => {
    setIsSupported(
      typeof window !== 'undefined'
      && typeof navigator !== 'undefined'
      && typeof window.AudioContext !== 'undefined'
      && !!navigator.mediaDevices?.getUserMedia,
    );
  }, []);

  const clearPlayback = useCallback(() => {
    playbackGenerationRef.current += 1;
    playbackCountRef.current = 0;
    playbackQueueRef.current = Promise.resolve();
    const activeAudio = activeAudioRef.current;
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.src = '';
      activeAudioRef.current = null;
    }
  }, []);

  const maybeSetIdleAfterPlayback = useCallback(() => {
    if (!socketRef.current && playbackCountRef.current === 0) {
      updateVoiceState('idle');
    }
  }, [updateVoiceState]);

  const enqueueAudioPlayback = useCallback(async (audioBase64: string, format: string) => {
    if (!autoPlayResponseAudio || !audioBase64) {
      return;
    }

    playbackCountRef.current += 1;
    const generation = playbackGenerationRef.current;

    playbackQueueRef.current = playbackQueueRef.current
      .catch((): void => undefined)
      .then(async () => {
        if (generation !== playbackGenerationRef.current) {
          return;
        }

        const blob = toAudioBlob(audioBase64, format);
        const url = URL.createObjectURL(blob);

        try {
          await new Promise<void>((resolve, reject) => {
            const audio = new Audio(url);
            activeAudioRef.current = audio;
            updateVoiceState('speaking');

            const cleanup = () => {
              audio.onended = null;
              audio.onerror = null;
              URL.revokeObjectURL(url);
              if (activeAudioRef.current === audio) {
                activeAudioRef.current = null;
              }
            };

            audio.onended = () => {
              cleanup();
              resolve();
            };
            audio.onerror = () => {
              cleanup();
              reject(new Error('语音播放失败'));
            };

            audio.play().catch((error) => {
              cleanup();
              reject(error);
            });
          });
        } finally {
          playbackCountRef.current = Math.max(0, playbackCountRef.current - 1);
          maybeSetIdleAfterPlayback();
        }
      });

    await playbackQueueRef.current;
  }, [autoPlayResponseAudio, maybeSetIdleAfterPlayback, updateVoiceState]);

  const stopMicrophoneCapture = useCallback((emitAudioEnd: boolean) => {
    const processorNode = processorNodeRef.current;
    const sourceNode = sourceNodeRef.current;
    const silentGain = silentGainRef.current;
    const audioContext = audioContextRef.current;
    const mediaStream = mediaStreamRef.current;

    if (processorNode) {
      processorNode.onaudioprocess = null;
      processorNode.disconnect();
      processorNodeRef.current = null;
    }

    sourceNode?.disconnect();
    silentGain?.disconnect();
    sourceNodeRef.current = null;
    silentGainRef.current = null;

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContext) {
      void audioContext.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (emitAudioEnd && socketRef.current && currentSessionIdRef.current) {
      socketRef.current.emit('voice:audio:end', {
        sessionId: currentSessionIdRef.current,
      });
    }
  }, []);

  const teardownConnection = useCallback((options?: { emitSessionEnd?: boolean; preservePlayback?: boolean }) => {
    stopMicrophoneCapture(false);

    const socket = socketRef.current;
    if (socket && currentSessionIdRef.current && options?.emitSessionEnd !== false) {
      socket.emit('voice:session:end', {
        sessionId: currentSessionIdRef.current,
      });
    }

    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }

    socketRef.current = null;
    if (!options?.preservePlayback) {
      clearPlayback();
    }
  }, [clearPlayback, stopMicrophoneCapture]);

  const failVoiceTurn = useCallback((message: string) => {
    teardownConnection();
    updateVoiceState('error');
    onError?.(message);
  }, [onError, teardownConnection, updateVoiceState]);

  const startMicrophoneCapture = useCallback(async () => {
    const socket = socketRef.current;
    const activeSessionId = currentSessionIdRef.current;
    if (!socket || !activeSessionId) {
      throw new Error('语音会话尚未就绪');
    }

    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const audioContext = new window.AudioContext();
    await audioContext.resume();
    const sourceNode = audioContext.createMediaStreamSource(mediaStream);
    const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    processorNode.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const pcm16 = float32ToPcm16(input, audioContext.sampleRate);
      if (!pcm16.length) {
        return;
      }

      socket.emit('voice:audio:chunk', {
        sessionId: activeSessionId,
        audio: toSocketBuffer(pcm16),
      });
    };

    sourceNode.connect(processorNode);
    processorNode.connect(silentGain);
    silentGain.connect(audioContext.destination);

    mediaStreamRef.current = mediaStream;
    audioContextRef.current = audioContext;
    sourceNodeRef.current = sourceNode;
    processorNodeRef.current = processorNode;
    silentGainRef.current = silentGain;
    updateVoiceState('listening');
  }, [updateVoiceState]);

  const stopListening = useCallback(() => {
    stopMicrophoneCapture(true);
    updateVoiceState('thinking');
  }, [stopMicrophoneCapture, updateVoiceState]);

  const cancelTurn = useCallback(() => {
    if (socketRef.current && currentSessionIdRef.current) {
      socketRef.current.emit('voice:interrupt', {
        sessionId: currentSessionIdRef.current,
      });
    }
    teardownConnection();
    updateVoiceState('idle');
  }, [teardownConnection, updateVoiceState]);

  const startVoiceTurn = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      onError?.('请先登录后再使用语音');
      return;
    }

    updateVoiceState('connecting');
    lastTranscriptRef.current = '';
    clearPlayback();

    try {
      const instanceId = await resolveVoiceInstanceId(token);
      const socket = io(`${getVoiceServerBaseUrl()}/voice`, {
        transports: ['websocket'],
        auth: { token },
        forceNew: true,
        timeout: 10000,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('voice:session:start', {
          sessionId: currentSessionIdRef.current,
          instanceId,
          lang: language,
          duplexMode: true,
          deviceType: 'web',
        });
      });

      socket.on('voice:session:ready', async (payload: { sessionId?: string }) => {
        currentSessionIdRef.current = payload?.sessionId || currentSessionIdRef.current;
        if (payload?.sessionId) {
          onSessionReady?.(payload.sessionId);
          socket.emit('voice:fabric:devices', {
            sessionId: payload.sessionId,
          });
        }
        try {
          await startMicrophoneCapture();
        } catch (error: any) {
          failVoiceTurn(error?.message || '无法访问麦克风');
        }
      });

      socket.on('voice:transcript:final', (payload: { text?: string; error?: string }) => {
        const transcript = (payload?.text || '').trim();
        if (payload?.error && !transcript) {
          failVoiceTurn(payload.error);
          return;
        }
        if (!transcript || transcript === lastTranscriptRef.current) {
          return;
        }
        lastTranscriptRef.current = transcript;
        onTranscript(transcript);
        updateVoiceState('thinking');
      });

      socket.on('voice:stt:final', (payload: { transcript?: string; error?: string }) => {
        const transcript = (payload?.transcript || '').trim();
        if (payload?.error && !transcript) {
          failVoiceTurn(payload.error);
          return;
        }
        if (!transcript || transcript === lastTranscriptRef.current) {
          return;
        }
        lastTranscriptRef.current = transcript;
        onTranscript(transcript);
        updateVoiceState('thinking');
      });

      socket.on('voice:agent:text', (payload: { chunk?: string; text?: string }) => {
        const chunk = payload?.chunk || payload?.text || '';
        if (!chunk) {
          return;
        }
        updateVoiceState('thinking');
        onAssistantTextChunk?.(chunk);
      });

      socket.on('voice:agent:speech:start', () => {
        updateVoiceState('speaking');
      });

      socket.on('voice:agent:audio', (payload: { audio?: string; format?: string }) => {
        if (!payload?.audio) {
          return;
        }
        void enqueueAudioPlayback(payload.audio, payload.format || 'mp3').catch((error: any) => {
          onError?.(error?.message || '语音播放失败');
        });
      });

      socket.on('voice:agent:end', () => {
        onAssistantResponseEnd?.();
        teardownConnection({ preservePlayback: true });
        if (playbackCountRef.current === 0) {
          updateVoiceState('idle');
        }
      });

      socket.on('voice:error', (payload: { error?: string }) => {
        failVoiceTurn(payload?.error || '语音会话失败');
      });

      // ── Deep-think events ──────────────────────────────
      socket.on('voice:deepthink:start', (payload: { targetModel?: string }) => {
        onDeepThinkStart?.(payload?.targetModel || 'ultra');
      });

      socket.on('voice:deepthink:done', (payload: { summary?: string }) => {
        onDeepThinkDone?.(payload?.summary || '');
      });

      // ── Fabric events ──────────────────────────────────
      socket.on('voice:fabric:devices:res', (payload: { devices?: FabricDevice[] }) => {
        onFabricDevicesChanged?.(payload?.devices || []);
      });

      socket.on('voice:fabric:primary-changed', (payload: { newPrimaryDeviceId?: string }) => {
        // Re-query device list to update UI
        if (currentSessionIdRef.current) {
          socket.emit('voice:fabric:devices', { sessionId: currentSessionIdRef.current });
        }
      });

      socket.on('disconnect', () => {
        socketRef.current = null;
        maybeSetIdleAfterPlayback();
      });

      socket.on('connect_error', (error) => {
        failVoiceTurn(error.message || '语音连接失败');
      });
    } catch (error: any) {
      failVoiceTurn(error?.message || '启动语音失败');
    }
  }, [clearPlayback, enqueueAudioPlayback, failVoiceTurn, language, maybeSetIdleAfterPlayback, onAssistantResponseEnd, onAssistantTextChunk, onDeepThinkDone, onDeepThinkStart, onError, onFabricDevicesChanged, onSessionReady, onTranscript, startMicrophoneCapture, teardownConnection, updateVoiceState]);

  useEffect(() => {
    return () => {
      teardownConnection();
    };
  }, [teardownConnection]);

  const toggleListening = () => {
    if (disabled) {
      return;
    }

    if (voiceState === 'idle' || voiceState === 'error') {
      void startVoiceTurn();
      return;
    }

    if (voiceState === 'listening') {
      stopListening();
      return;
    }

    cancelTurn();
  };

  if (!isSupported) {
    return null;
  }

  const isBusy = voiceState === 'connecting' || voiceState === 'thinking' || voiceState === 'speaking';
  const isListening = voiceState === 'listening';
  const title = isListening
    ? '点击结束本轮语音输入'
    : isBusy
    ? '点击中断当前语音会话'
    : '点击开始 realtime 语音';

  return (
    <button
      type="button"
      onClick={toggleListening}
      disabled={disabled}
      className={`
        flex items-center justify-center
        w-10 h-10 rounded-full
        transition-all duration-200
        ${
          isListening
            ? 'bg-red-500 text-white animate-pulse'
            : isBusy
            ? 'bg-emerald-500 text-white'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      title={title}
    >
      {isBusy ? (
        <Loader2 size={18} className="animate-spin" />
      ) : isListening ? (
        <MicOff size={20} />
      ) : (
        <Mic size={20} />
      )}
    </button>
  );
}

