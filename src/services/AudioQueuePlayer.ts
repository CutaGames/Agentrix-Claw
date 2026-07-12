import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

interface QueueItem {
  uri?: string;
  fallbackText?: string;
  language?: string;
  rate?: number;
  audioPlaybackRate?: number;
  mode: 'remote' | 'local';
}

export interface InterruptionInfo {
  /** Number of items that finished playing before interruption */
  playedCount: number;
  /** Text of items that were skipped (current + remaining queue) */
  skippedItems: string[];
  /** Total items that were enqueued in this batch */
  totalItems: number;
}

export class AudioQueuePlayer {
  private queue: QueueItem[] = [];
  private isPlaying: boolean = false;
  private currentSound: Audio.Sound | null = null;
  private onFinishedAll: (() => void) | null = null;
  private _destroyed: boolean = false;

  // Interruption tracking
  private playedCount: number = 0;
  private totalEnqueued: number = 0;
  private currentItem: QueueItem | null = null;
  private lastInterruption: InterruptionInfo | null = null;

  constructor(onFinishedAll?: () => void) {
    this.onFinishedAll = onFinishedAll || null;
  }

  /** Permanently destroy this player — stops all audio and rejects future enqueues. */
  destroy() {
    this._destroyed = true;
    this.stopAll();
  }

  get destroyed(): boolean {
    return this._destroyed;
  }

  enqueue(uri: string, fallbackText?: string, language?: string, rate?: number) {
    if (this._destroyed) return;
    this.queue.push({ uri, fallbackText, language, rate, mode: 'remote' });
    this.totalEnqueued++;
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  enqueueGeneratedAudio(uri: string, fallbackText?: string, language?: string, playbackRate?: number) {
    if (this._destroyed) return;
    this.queue.push({
      uri,
      fallbackText,
      language,
      audioPlaybackRate: playbackRate,
      mode: 'remote',
    });
    this.totalEnqueued++;
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  enqueueLocal(text: string, language?: string, rate?: number) {
    if (this._destroyed || !text.trim()) return;
    this.queue.push({ fallbackText: text, language, rate, mode: 'local' });
    this.totalEnqueued++;
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  private playViaDeviceSpeech(item: QueueItem) {
    if (!item.fallbackText) {
      this.currentItem = null;
      this.currentSound = null;
      this.playNext();
      return;
    }

    try {
      Speech.speak(item.fallbackText, {
        language: item.language,
        rate: typeof item.rate === 'number' ? Math.max(0.1, Math.min(1.0, item.rate)) : undefined,
        onDone: () => {
          this.playedCount++;
          this.currentItem = null;
          this.currentSound = null;
          this.playNext();
        },
        onStopped: () => {
          this.currentItem = null;
          this.currentSound = null;
          this.playNext();
        },
        onError: () => {
          this.currentItem = null;
          this.currentSound = null;
          this.playNext();
        },
      });
    } catch (speechError) {
      console.error('AudioQueuePlayer speech fallback error:', speechError);
      this.currentItem = null;
      this.currentSound = null;
      this.playNext();
    }
  }

  private async playNext() {
    if (this._destroyed || this.queue.length === 0) {
      this.isPlaying = false;
      this.currentItem = null;
      // Reset counters on natural completion
      this.playedCount = 0;
      this.totalEnqueued = 0;
      if (this.onFinishedAll) this.onFinishedAll();
      return;
    }

    this.isPlaying = true;
    const nextItem = this.queue.shift();
    if (!nextItem) {
      this.isPlaying = false;
      this.currentItem = null;
      this.playedCount = 0;
      this.totalEnqueued = 0;
      if (this.onFinishedAll) this.onFinishedAll();
      return;
    }

    this.currentItem = nextItem;

    if (nextItem.mode === 'local' || !nextItem.uri) {
      this.playViaDeviceSpeech(nextItem);
      return;
    }

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: nextItem.uri },
        {
          shouldPlay: true,
          rate: typeof nextItem.audioPlaybackRate === 'number'
            ? Math.max(0.5, Math.min(2.0, nextItem.audioPlaybackRate))
            : 1.0,
          shouldCorrectPitch: typeof nextItem.audioPlaybackRate === 'number',
        }
      );
      this.currentSound = sound;

      sound.setOnPlaybackStatusUpdate(async (status: any) => {
        if (status.didJustFinish) {
          this.playedCount++;
          this.currentItem = null;
          await sound.unloadAsync();
          this.currentSound = null;
          this.playNext();
        }
      });
    } catch (e) {
      console.error('AudioQueuePlayer play error:', e);
      if (nextItem.fallbackText) {
        this.playViaDeviceSpeech(nextItem);
        return;
      }
      this.playNext();
    }
  }

  async stopAll() {
    // Capture interruption info before clearing
    const skippedItems: string[] = [];
    if (this.currentItem?.fallbackText) {
      skippedItems.push(this.currentItem.fallbackText);
    }
    for (const item of this.queue) {
      if (item.fallbackText) skippedItems.push(item.fallbackText);
    }
    if (skippedItems.length > 0 || this.playedCount > 0) {
      this.lastInterruption = {
        playedCount: this.playedCount,
        skippedItems,
        totalItems: this.totalEnqueued,
      };
    }

    this.queue = [];
    this.currentItem = null;
    this.playedCount = 0;
    this.totalEnqueued = 0;
    Speech.stop();
    if (this.currentSound) {
      await this.currentSound.stopAsync();
      await this.currentSound.unloadAsync();
      this.currentSound = null;
    }
    this.isPlaying = false;
  }

  /** Get info about the last interruption (barge-in). Returns null if no interruption occurred. */
  getLastInterruption(): InterruptionInfo | null {
    return this.lastInterruption;
  }

  /** Clear saved interruption info after it has been consumed. */
  clearInterruptionInfo(): void {
    this.lastInterruption = null;
  }
}
