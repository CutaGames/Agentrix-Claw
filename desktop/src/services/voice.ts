/**
 * Voice service — handles recording, STT, and TTS playback.
 * Uses browser MediaRecorder for audio capture and backend /voice/* endpoints.
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { API_BASE } from "./store";

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let currentAudio: HTMLAudioElement | null = null;

export type VoiceState = "idle" | "recording" | "processing" | "speaking";

/**
 * Start recording audio from the microphone.
 * Returns a cleanup function.
 */
export async function startRecording(): Promise<void> {
  audioChunks = [];
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  mediaRecorder = new MediaRecorder(stream, { mimeType: selectMimeType() });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.start(100); // Collect in 100ms chunks
}

/**
 * Stop recording and return the audio blob.
 */
export function stopRecording(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      reject(new Error("Not recording"));
      return;
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: mediaRecorder!.mimeType });
      // Stop all tracks to release microphone
      mediaRecorder!.stream.getTracks().forEach((t) => t.stop());
      mediaRecorder = null;
      audioChunks = [];
      resolve(blob);
    };

    mediaRecorder.stop();
  });
}

/**
 * Cancel current recording without returning data.
 */
export function cancelRecording(): void {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stream.getTracks().forEach((t) => t.stop());
    mediaRecorder.stop();
  }
  mediaRecorder = null;
  audioChunks = [];
}

/**
 * Send audio to AWS Transcribe via backend.
 * Backend endpoint: POST /api/voice/transcribe (multipart/form-data)
 * Supports auto language detection (Chinese/English) via AWS Transcribe Streaming.
 * Audio is converted server-side to 16kHz 16-bit PCM via ffmpeg.
 */
export async function speechToText(
  audioBlob: Blob,
  token: string,
  lang?: "zh" | "en",
): Promise<string> {
  // Read blob to ArrayBuffer for reliable Tauri IPC serialization
  const arrayBuffer = await audioBlob.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: audioBlob.type });

  const formData = new FormData();
  formData.append("audio", blob, `recording.${getExtension(audioBlob.type)}`);

  const langParam = lang ? `?lang=${lang}` : "";
  let res: Response;
  try {
    res = await tauriFetch(`${API_BASE}/voice/transcribe${langParam}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` } as any,
      body: formData as any,
    } as any);
  } catch {
    res = await fetch(`${API_BASE}/voice/transcribe${langParam}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
  }

  if (!res.ok) throw new Error(`STT failed: ${res.status}`);
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  return data.transcript || data.text || "";
}

/**
 * Play TTS audio via AWS Polly (neural engine).
 * Backend endpoint: GET /api/voice/tts?text=...&lang=...
 * Returns audio/mpeg stream. Chinese uses Zhiyu voice, English uses Matthew.
 * Auto-detects language from text if lang not specified.
 */
export function playTTS(text: string, token: string, lang?: "zh" | "en"): Promise<void> {
  return new Promise((resolve) => {
    stopTTS(); // Stop any current playback

    // Truncate long text to prevent TTS abuse (Polly has limits)
    const truncated = text.slice(0, 1500);
    const langParam = lang ? `&lang=${lang}` : "";
    const url = `${API_BASE}/voice/tts?text=${encodeURIComponent(truncated)}${langParam}`;
    currentAudio = new Audio();

    // Fetch with auth header then play via blob URL (use tauriFetch to bypass CORS)
    const doFetch = async () => {
      try {
        return await tauriFetch(url, { headers: { Authorization: `Bearer ${token}` } as any } as any);
      } catch {
        return await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      }
    };

    doFetch()
      .then((res) => {
        if (!res.ok) throw new Error("TTS failed");
        return res.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        currentAudio!.src = blobUrl;
        currentAudio!.onended = () => {
          URL.revokeObjectURL(blobUrl);
          currentAudio = null;
          resolve();
        };
        currentAudio!.onerror = () => {
          URL.revokeObjectURL(blobUrl);
          currentAudio = null;
          resolve();
        };
        currentAudio!.play();
      })
      .catch(() => resolve());
  });
}

/**
 * Stop any current TTS playback.
 */
export function stopTTS(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

/** Check if microphone permission is available */
export async function hasMicrophonePermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

// ─── Helpers ───

function selectMimeType(): string {
  const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const mt of preferred) {
    if (MediaRecorder.isTypeSupported(mt)) return mt;
  }
  return "audio/webm";
}

function getExtension(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4")) return "m4a";
  return "webm";
}
