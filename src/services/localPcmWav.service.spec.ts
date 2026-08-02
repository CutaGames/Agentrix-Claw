import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Buffer } from 'buffer';

import {
  concatPcmChunks,
  convertFloat32ToPcm16,
  encodeFloat32ToWav,
  encodePcm16ToWav,
  estimatePcmDurationMs,
  LOCAL_PCM_SAMPLE_RATE,
} from './localPcmWav.service';

describe('localPcmWav', () => {
  it('concatenates PCM chunks in order', () => {
    const left = Int16Array.from([1, 2]);
    const right = Int16Array.from([3, 4]);
    const result = concatPcmChunks([left.buffer, right.buffer]);

    assert.deepEqual(Array.from(new Int16Array(result.buffer, result.byteOffset, result.byteLength / 2)), [1, 2, 3, 4]);
  });

  it('encodes PCM into a valid mono WAV header', () => {
    const pcm = Buffer.from(Int16Array.from([0, 1000, -1000, 2000]).buffer);
    const wav = encodePcm16ToWav(pcm);

    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt32LE(24), LOCAL_PCM_SAMPLE_RATE);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(40), pcm.length);
    assert.deepEqual(wav.subarray(44), pcm);
  });

  it('estimates PCM duration in milliseconds', () => {
    const oneSecondOfMono16Bit = LOCAL_PCM_SAMPLE_RATE * 2;
    assert.equal(Math.round(estimatePcmDurationMs(oneSecondOfMono16Bit)), 1000);
  });

  it('converts float32 samples into signed PCM16', () => {
    const pcm = convertFloat32ToPcm16([-1, -0.5, 0, 0.5, 1]);
    assert.deepEqual(
      Array.from(new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2)),
      [-32768, -16384, 0, 16384, 32767],
    );
  });

  it('encodes float32 audio into a mono WAV payload', () => {
    const wav = encodeFloat32ToWav(Float32Array.from([0, 0.25, -0.25, 1]));

    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt32LE(24), LOCAL_PCM_SAMPLE_RATE);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(40), 8);
  });
});