import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import {
  getVoiceUiE2ERuntime,
  isVoiceUiE2EEnabled,
  setVoiceUiE2ELiveSpeechBridge,
} from '../testing/e2e';
import {
  buildLiveSpeechStartOptions,
  createSpeechRecognitionSessionController,
  type LiveSpeechStopResult,
} from './liveSpeechSession.service';

export interface LiveSpeechCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onInterimResult?: (transcript: string) => void;
  onFinalResult?: (transcript: string) => void;
  onError?: (error: { error?: string; message?: string }) => void;
  onVolumeChange?: (value: number) => void;
}

export interface LiveSpeechController {
  stop: () => Promise<LiveSpeechStopResult>;
  abort: () => void;
}

export function isLiveSpeechRecognitionAvailable() {
  try {
    return Boolean(ExpoSpeechRecognitionModule?.isRecognitionAvailable?.());
  } catch {
    return false;
  }
}

export async function requestLiveSpeechPermissions() {
  if (isVoiceUiE2EEnabled()) {
    const runtime = getVoiceUiE2ERuntime();
    const webPermissionState = typeof window !== 'undefined'
      ? window.__AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_PERMISSION__
      : undefined;
    const nextState = webPermissionState ?? runtime?.liveSpeechPermission;
    return { granted: nextState !== 'denied' };
  }

  const microphone = await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync();
  if (!microphone?.granted) {
    return microphone;
  }

  if (Platform.OS === 'ios') {
    const speech = await ExpoSpeechRecognitionModule.requestSpeechRecognizerPermissionsAsync();
    if (!speech?.granted) {
      return speech;
    }
  }

  return { granted: true };
}

export function startLiveSpeechRecognition(
  lang: string,
  callbacks: LiveSpeechCallbacks,
  contextualStrings: string[] = [],
  options?: { mode?: 'hold' | 'duplex' },
): LiveSpeechController {
  if (isVoiceUiE2EEnabled() && typeof window !== 'undefined') {
    let latestTranscript = '';
    let finished = false;
    let resolveStop: ((result: LiveSpeechStopResult) => void) | null = null;

    const cleanup = () => {
      setVoiceUiE2ELiveSpeechBridge(null);
    };

    const finish = () => {
      if (finished) {
        return;
      }

      finished = true;
      callbacks.onEnd?.();
      cleanup();
      if (resolveStop) {
        resolveStop({ transcript: latestTranscript, audioUri: null });
        resolveStop = null;
      }
    };

    setVoiceUiE2ELiveSpeechBridge({
      onStart: () => callbacks.onStart?.(),
      onSpeechStart: () => callbacks.onSpeechStart?.(),
      onSpeechEnd: () => callbacks.onSpeechEnd?.(),
      onInterimResult: (text) => {
        latestTranscript = text?.trim() || latestTranscript;
        callbacks.onInterimResult?.(text);
      },
      onFinalResult: (text) => {
        latestTranscript = text?.trim() || latestTranscript;
        callbacks.onFinalResult?.(text);
      },
      onError: (message) => {
        callbacks.onError?.({ error: message, message });
      },
      onEnd: () => {
        finish();
      },
    });

    callbacks.onStart?.();

    return {
      stop: () => new Promise<LiveSpeechStopResult>((resolve) => {
        if (finished) {
          resolve({ transcript: latestTranscript, audioUri: null });
          return;
        }

        resolveStop = resolve;
        callbacks.onSpeechEnd?.();
        finish();
      }),
      abort: () => {
        finish();
      },
    };
  }

  return createSpeechRecognitionSessionController({
    module: ExpoSpeechRecognitionModule as any,
    callbacks,
    startOptions: buildLiveSpeechStartOptions({
      lang,
      contextualStrings,
      mode: options?.mode || 'duplex',
      platformOs: Platform.OS,
      platformVersion: Platform.Version,
      module: ExpoSpeechRecognitionModule as any,
    }),
  });
}