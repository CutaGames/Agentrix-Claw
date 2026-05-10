export type SpeechSubscription = { remove: () => void };

export interface SpeechRecognitionResultEvent {
  isFinal?: boolean;
  results?: Array<{ transcript?: string }>;
}

export interface SpeechRecognitionVolumeEvent {
  value?: number;
}

export interface SpeechRecognitionAudioEvent {
  uri?: string | null;
}

export interface SpeechRecognitionErrorEvent {
  error?: string;
  message?: string;
}

export interface SpeechRecognitionServiceInfo {
  packageName?: string;
}

export interface SpeechRecognitionRecordingOptions {
  persist: boolean;
  outputFileName: string;
}

export interface SpeechRecognitionStartOptions {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  addsPunctuation: boolean;
  contextualStrings: string[];
  requiresOnDeviceRecognition: boolean;
  androidIntentOptions?: Record<string, unknown>;
  androidRecognitionServicePackage?: string;
  iosCategory?: {
    category: string;
    categoryOptions: string[];
    mode: string;
  };
  iosVoiceProcessingEnabled?: boolean;
  iosTaskHint?: 'unspecified' | 'dictation' | 'search' | 'confirmation';
  recordingOptions?: SpeechRecognitionRecordingOptions;
  volumeChangeEventOptions?: {
    enabled: boolean;
    intervalMillis: number;
  };
}

export interface SpeechRecognitionModuleLike {
  addListener: (eventName: string, listener: (event?: any) => void) => SpeechSubscription;
  start: (options: SpeechRecognitionStartOptions) => void;
  stop: () => void;
  abort: () => void;
  getSpeechRecognitionServices?: () => string[];
  getDefaultRecognitionService?: () => SpeechRecognitionServiceInfo | null | undefined;
  supportsRecording?: () => boolean;
}

export interface LiveSpeechCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onInterimResult?: (transcript: string) => void;
  onFinalResult?: (transcript: string) => void;
  onError?: (error: SpeechRecognitionErrorEvent) => void;
  onVolumeChange?: (value: number) => void;
}

export interface LiveSpeechStopResult {
  transcript: string;
  audioUri?: string | null;
}

export interface CreateSpeechRecognitionControllerOptions {
  module: SpeechRecognitionModuleLike;
  callbacks: LiveSpeechCallbacks;
  startOptions: SpeechRecognitionStartOptions;
}

export interface SpeechRecognitionSessionController {
  stop: () => Promise<LiveSpeechStopResult>;
  abort: () => void;
}

export interface BuildLiveSpeechOptionsInput {
  lang: string;
  contextualStrings?: string[];
  mode: 'hold' | 'duplex';
  platformOs: 'android' | 'ios' | 'web' | 'windows' | 'macos';
  platformVersion?: number | string;
  module?: Pick<SpeechRecognitionModuleLike, 'getSpeechRecognitionServices' | 'getDefaultRecognitionService' | 'supportsRecording'>;
}

function getTranscriptFromResults(results: Array<{ transcript?: string }> | undefined): string {
  return (results || []).map((item) => item?.transcript || '').join(' ').trim();
}

function parseAndroidApiLevel(platformVersion?: number | string): number | null {
  if (typeof platformVersion === 'number' && Number.isFinite(platformVersion)) {
    return platformVersion;
  }

  if (typeof platformVersion === 'string') {
    const parsed = Number(platformVersion);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function pickPreferredAndroidRecognitionService(
  module?: Pick<SpeechRecognitionModuleLike, 'getSpeechRecognitionServices' | 'getDefaultRecognitionService'>,
): string | undefined {
  if (!module) {
    return undefined;
  }

  const services = module.getSpeechRecognitionServices?.() || [];
  const defaultService = module.getDefaultRecognitionService?.()?.packageName;
  const preferredOrder = [
    'com.google.android.tts',
    'com.google.android.as',
    'com.google.android.googlequicksearchbox',
  ];

  for (const service of preferredOrder) {
    if (services.includes(service)) {
      return service;
    }
  }

  return defaultService || services[0];
}

export function buildLiveSpeechStartOptions(input: BuildLiveSpeechOptionsInput): SpeechRecognitionStartOptions {
  const {
    lang,
    contextualStrings = [],
    mode,
    platformOs,
    platformVersion,
    module,
  } = input;
  const onAndroid = platformOs === 'android';
  const androidApiLevel = onAndroid ? parseAndroidApiLevel(platformVersion) : null;
  const continuous = mode === 'duplex' && (!onAndroid || androidApiLevel === null || androidApiLevel >= 33);
  const androidRecognitionServicePackage = onAndroid
    ? pickPreferredAndroidRecognitionService(module)
    : undefined;
  const supportsRecording = !!module?.supportsRecording?.();

  return {
    lang: lang === 'zh' ? 'zh-CN' : 'en-US',
    interimResults: true,
    continuous,
    maxAlternatives: 1,
    addsPunctuation: true,
    contextualStrings: contextualStrings.filter(Boolean).slice(0, 8),
    requiresOnDeviceRecognition: platformOs === 'ios',
    androidRecognitionServicePackage,
    androidIntentOptions: onAndroid ? {
      EXTRA_LANGUAGE_MODEL: mode === 'hold' ? 'free_form' : 'free_form',
      EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: mode === 'hold' ? 1200 : 1800,
      EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: mode === 'hold' ? 700 : 1000,
    } : undefined,
    iosCategory: {
      category: 'playAndRecord',
      categoryOptions: ['defaultToSpeaker', 'allowBluetooth'],
      mode: 'measurement',
    },
    iosVoiceProcessingEnabled: true,
    iosTaskHint: mode === 'hold' ? 'dictation' : 'search',
    recordingOptions: supportsRecording ? {
      persist: true,
      outputFileName: mode === 'hold' ? 'hold-speech.wav' : 'duplex-speech.wav',
    } : undefined,
    volumeChangeEventOptions: {
      enabled: true,
      intervalMillis: 150,
    },
  };
}

export function createSpeechRecognitionSessionController(
  input: CreateSpeechRecognitionControllerOptions,
): SpeechRecognitionSessionController {
  const { module, callbacks, startOptions } = input;
  const subscriptions: SpeechSubscription[] = [];
  let cleanedUp = false;
  let latestTranscript = '';
  let latestFinalTranscript = '';
  let latestAudioUri: string | null = null;
  let stopPending = false;
  let stopResolved = false;
  let resolveStop: ((result: LiveSpeechStopResult) => void) | null = null;

  const cleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    subscriptions.splice(0).forEach((subscription) => {
      try {
        subscription.remove();
      } catch {}
    });
  };

  const resolveStopIfNeeded = () => {
    if (!stopPending || stopResolved || !resolveStop) {
      return;
    }

    stopResolved = true;
    resolveStop({
      transcript: latestFinalTranscript || latestTranscript,
      audioUri: latestAudioUri,
    });
  };

  subscriptions.push(
    module.addListener('start', () => callbacks.onStart?.()),
    module.addListener('speechstart', () => callbacks.onSpeechStart?.()),
    module.addListener('speechend', () => callbacks.onSpeechEnd?.()),
    module.addListener('volumechange', (event: SpeechRecognitionVolumeEvent) => {
      callbacks.onVolumeChange?.(typeof event?.value === 'number' ? event.value : -2);
    }),
    module.addListener('audiostart', (event: SpeechRecognitionAudioEvent) => {
      latestAudioUri = event?.uri || latestAudioUri;
    }),
    module.addListener('audioend', (event: SpeechRecognitionAudioEvent) => {
      latestAudioUri = event?.uri || latestAudioUri;
    }),
    module.addListener('result', (event: SpeechRecognitionResultEvent) => {
      const transcript = getTranscriptFromResults(event?.results);
      if (!transcript) {
        return;
      }

      latestTranscript = transcript;
      if (event?.isFinal) {
        latestFinalTranscript = transcript;
        callbacks.onFinalResult?.(transcript);
        if (stopPending) {
          resolveStopIfNeeded();
        }
        return;
      }

      callbacks.onInterimResult?.(transcript);
    }),
    module.addListener('nomatch', () => {
      resolveStopIfNeeded();
    }),
    module.addListener('error', (event: SpeechRecognitionErrorEvent) => {
      callbacks.onError?.(event || {});
      if (stopPending && event?.error !== 'aborted') {
        resolveStopIfNeeded();
      }
    }),
    module.addListener('end', () => {
      callbacks.onEnd?.();
      resolveStopIfNeeded();
      cleanup();
    }),
  );

  module.start(startOptions);

  return {
    stop: () => new Promise<LiveSpeechStopResult>((resolve) => {
      if (cleanedUp) {
        resolve({ transcript: latestFinalTranscript || latestTranscript, audioUri: latestAudioUri });
        return;
      }

      stopPending = true;
      resolveStop = resolve;
      module.stop();
    }),
    abort: () => {
      stopPending = false;
      try {
        module.abort();
      } finally {
        cleanup();
      }
    },
  };
}