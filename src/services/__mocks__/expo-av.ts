/**
 * Jest mock for `expo-av` (ESM in node_modules). Models the `Audio.Sound`
 * surface `src/services/AudioQueuePlayer.ts` touches; playback is a no-op
 * that reports "finished" so queue logic can drain deterministically.
 */
type StatusListener = (status: Record<string, unknown>) => void;

class Sound {
  private listener: StatusListener | null = null;

  static async createAsync(_source: unknown, _initialStatus?: unknown, onStatus?: StatusListener) {
    const sound = new Sound();
    if (onStatus) sound.listener = onStatus;
    return { sound, status: { isLoaded: true } };
  }

  setOnPlaybackStatusUpdate(listener: StatusListener | null): void {
    this.listener = listener;
  }

  async playAsync(): Promise<Record<string, unknown>> {
    this.listener?.({ isLoaded: true, isPlaying: false, didJustFinish: true });
    return { isLoaded: true, didJustFinish: true };
  }

  async stopAsync(): Promise<Record<string, unknown>> { return { isLoaded: true }; }
  async pauseAsync(): Promise<Record<string, unknown>> { return { isLoaded: true }; }
  async unloadAsync(): Promise<Record<string, unknown>> { return { isLoaded: false }; }
  async setVolumeAsync(_volume: number): Promise<Record<string, unknown>> { return { isLoaded: true }; }
  async getStatusAsync(): Promise<Record<string, unknown>> { return { isLoaded: true, isPlaying: false }; }
}

export const Audio = {
  Sound,
  setAudioModeAsync: async (_mode: unknown): Promise<void> => {},
  requestPermissionsAsync: async () => ({ status: 'granted', granted: true }),
  getPermissionsAsync: async () => ({ status: 'granted', granted: true }),
};

export const InterruptionModeIOS = { MixWithOthers: 0, DoNotMix: 1, DuckOthers: 2 } as const;
export const InterruptionModeAndroid = { DoNotMix: 1, DuckOthers: 2 } as const;

export default { Audio, InterruptionModeIOS, InterruptionModeAndroid };
