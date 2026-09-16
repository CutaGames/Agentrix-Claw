import { Platform } from 'react-native';

let VideoThumbnails: typeof import('expo-video-thumbnails') | null = null;
let AVModule: typeof import('expo-av') | null = null;

try { VideoThumbnails = require('expo-video-thumbnails'); } catch (_) {}
try { AVModule = require('expo-av'); } catch (_) {}

const MAX_VIDEO_DURATION_MS = 60_000;
const MAX_FRAMES = 8;
const FRAME_INTERVAL_MS = 1_000;
const THUMBNAIL_QUALITY = 0.5;

export interface ExtractedFrame {
  uri: string;
  timeMs: number;
  width: number;
  height: number;
}

async function getVideoDurationMs(videoUri: string): Promise<number | null> {
  if (!AVModule) return null;

  try {
    const { sound } = await AVModule.Audio.Sound.createAsync(
      { uri: videoUri },
      { shouldPlay: false },
    );
    const status = await sound.getStatusAsync();
    await sound.unloadAsync();

    if (status.isLoaded && status.durationMillis) {
      return status.durationMillis;
    }
  } catch {}

  return null;
}

export async function extractVideoFrames(videoUri: string): Promise<ExtractedFrame[]> {
  if (!VideoThumbnails) {
    return [];
  }

  const durationMs = await getVideoDurationMs(videoUri);
  const effectiveDuration = durationMs
    ? Math.min(durationMs, MAX_VIDEO_DURATION_MS)
    : MAX_VIDEO_DURATION_MS;

  const totalFrames = Math.min(
    Math.floor(effectiveDuration / FRAME_INTERVAL_MS),
    MAX_FRAMES,
  );

  if (totalFrames <= 0) {
    try {
      const result = await VideoThumbnails.getThumbnailAsync(videoUri, {
        quality: THUMBNAIL_QUALITY,
        time: 0,
      });
      return [{ uri: result.uri, timeMs: 0, width: result.width, height: result.height }];
    } catch {
      return [];
    }
  }

  const interval = effectiveDuration / totalFrames;
  const frames: ExtractedFrame[] = [];

  for (let i = 0; i < totalFrames; i++) {
    const timeMs = Math.round(i * interval);
    try {
      const result = await VideoThumbnails.getThumbnailAsync(videoUri, {
        quality: THUMBNAIL_QUALITY,
        time: timeMs,
      });
      frames.push({ uri: result.uri, timeMs, width: result.width, height: result.height });
    } catch {
      // Skip failed frames
    }
  }

  return frames;
}

export function isVideoFrameExtractionAvailable(): boolean {
  return VideoThumbnails !== null && Platform.OS !== 'web';
}
