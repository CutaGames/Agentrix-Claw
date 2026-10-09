/**
 * expo-av recorder for global push-to-talk (pushToTalk.ts). Same preset as the chat's hold-to-talk
 * (Audio.RecordingOptionsPresets.HIGH_QUALITY, m4a), and the audio mode is put back after each recording so playback in
 * the rest of the app is unaffected.
 */
import { Audio } from 'expo-av';
import type { PttRecorder } from './pushToTalk';

export function createExpoAvPttRecorder(): PttRecorder {
  let recording: Audio.Recording | null = null;

  const release = async () => {
    const current = recording;
    recording = null;
    if (current) {
      try {
        await current.stopAndUnloadAsync();
      } catch {
        // already stopped
      }
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => undefined);
    return current;
  };

  return {
    async start() {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) return 'denied';
      await release();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: false });
      const created = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recording = created.recording;
      return 'recording';
    },
    async stop() {
      const stopped = await release();
      return stopped?.getURI() ?? null;
    },
    async cancel() {
      await release();
    },
  };
}
