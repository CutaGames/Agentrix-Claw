import { Buffer } from 'buffer';

export const LOCAL_PCM_SAMPLE_RATE = 16000;
export const LOCAL_PCM_CHANNELS = 1;
export const LOCAL_PCM_BITS_PER_SAMPLE = 16;

export interface LocalPcmWavOptions {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
}

export function concatPcmChunks(chunks: ArrayBuffer[]): Buffer {
  if (chunks.length === 0) {
    return Buffer.alloc(0);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

export function estimatePcmDurationMs(
  pcmByteLength: number,
  options?: LocalPcmWavOptions,
): number {
  const sampleRate = options?.sampleRate ?? LOCAL_PCM_SAMPLE_RATE;
  const channels = options?.channels ?? LOCAL_PCM_CHANNELS;
  const bitsPerSample = options?.bitsPerSample ?? LOCAL_PCM_BITS_PER_SAMPLE;
  const bytesPerSampleFrame = channels * (bitsPerSample / 8);
  if (pcmByteLength <= 0 || bytesPerSampleFrame <= 0 || sampleRate <= 0) {
    return 0;
  }

  return (pcmByteLength / bytesPerSampleFrame / sampleRate) * 1000;
}

export function encodePcm16ToWav(
  pcmBuffer: Buffer,
  options?: LocalPcmWavOptions,
): Buffer {
  const sampleRate = options?.sampleRate ?? LOCAL_PCM_SAMPLE_RATE;
  const channels = options?.channels ?? LOCAL_PCM_CHANNELS;
  const bitsPerSample = options?.bitsPerSample ?? LOCAL_PCM_BITS_PER_SAMPLE;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
}

export function convertFloat32ToPcm16(samples: ArrayLike<number>): Buffer {
  const pcm = Buffer.alloc(samples.length * 2);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Number(samples[index] ?? 0);
    const clamped = Math.max(-1, Math.min(1, Number.isFinite(sample) ? sample : 0));
    const encoded = clamped < 0
      ? Math.round(clamped * 0x8000)
      : Math.round(clamped * 0x7fff);
    pcm.writeInt16LE(encoded, index * 2);
  }

  return pcm;
}

export function encodeFloat32ToWav(
  samples: ArrayLike<number>,
  options?: LocalPcmWavOptions,
): Buffer {
  return encodePcm16ToWav(convertFloat32ToPcm16(samples), {
    ...options,
    channels: options?.channels ?? 1,
    bitsPerSample: 16,
  });
}