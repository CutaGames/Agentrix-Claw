/**
 * Desktop Live Speech Recognition Service
 *
 * Uses the Web Speech API (webkitSpeechRecognition) for real-time
 * speech-to-text in Chrome/Edge-based environments (Tauri WebView).
 *
 * Provides the same interface as the mobile liveSpeech.service.ts
 * for unified cross-platform voice session management.
 */

export interface LiveSpeechCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onInterimResult?: (transcript: string) => void;
  onFinalResult?: (transcript: string) => void;
  onError?: (error: { error?: string; message?: string }) => void;
}

export interface LiveSpeechController {
  stop: () => void;
  abort: () => void;
}

/**
 * Check if the Web Speech API is available in the current environment.
 */
export function isLiveSpeechAvailable(): boolean {
  return Boolean(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  );
}

/**
 * Request microphone permission (browser will prompt automatically,
 * but we can pre-check via navigator.permissions if available).
 */
export async function requestLiveSpeechPermissions(): Promise<{ granted: boolean }> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return { granted: true };
  } catch {
    return { granted: false };
  }
}

/**
 * Start live speech recognition with interim results.
 *
 * @param lang - Language hint: 'zh' → 'zh-CN', 'en' → 'en-US'
 * @param callbacks - Event callbacks for speech events
 * @param contextualStrings - Hint phrases (not supported by Web Speech API, ignored)
 * @returns Controller with stop/abort methods
 */
export function startLiveSpeechRecognition(
  lang: string,
  callbacks: LiveSpeechCallbacks,
  contextualStrings: string[] = [],
): LiveSpeechController {
  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    callbacks.onError?.({ error: 'not-supported', message: 'Web Speech API not available' });
    return { stop: () => {}, abort: () => {} };
  }

  const recognition = new SpeechRecognition();
  recognition.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let aborted = false;

  recognition.onstart = () => {
    callbacks.onStart?.();
  };

  recognition.onend = () => {
    callbacks.onEnd?.();
  };

  recognition.onspeechstart = () => {
    callbacks.onSpeechStart?.();
  };

  recognition.onspeechend = () => {
    callbacks.onSpeechEnd?.();
  };

  recognition.onresult = (event: any) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0]?.transcript || '';
      if (result.isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    if (finalTranscript) {
      callbacks.onFinalResult?.(finalTranscript.trim());
    } else if (interimTranscript) {
      callbacks.onInterimResult?.(interimTranscript.trim());
    }
  };

  recognition.onerror = (event: any) => {
    if (aborted) return;
    callbacks.onError?.({
      error: event.error,
      message: event.message || `Speech recognition error: ${event.error}`,
    });
  };

  try {
    recognition.start();
  } catch (err: any) {
    callbacks.onError?.({ error: 'start-failed', message: err?.message });
  }

  return {
    stop: () => {
      try { recognition.stop(); } catch {}
    },
    abort: () => {
      aborted = true;
      try { recognition.abort(); } catch {}
    },
  };
}
