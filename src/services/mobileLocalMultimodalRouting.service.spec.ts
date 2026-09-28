import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { UploadedChatAttachment } from './api';
import type { MobileLocalRuntimeCapabilities } from './mobileLocalInference.service';
import {
  buildLocalUserContent,
  resolveLocalTurnExecution,
  resolveSupportedLocalAudioFormat,
  shouldEscalateLocalTurnToCloud,
} from './mobileLocalMultimodalRouting.service';

const baseCapabilities: MobileLocalRuntimeCapabilities = {
  available: true,
  runtimeSource: 'global',
  supportsTextGeneration: true,
  supportsStreaming: true,
  supportsVisionInput: true,
  supportsAudioInput: true,
  supportsAudioOutput: false,
};

function createAttachment(overrides: Partial<UploadedChatAttachment>): UploadedChatAttachment {
  return {
    url: '/api/uploads/example',
    publicUrl: 'https://cdn.agentrix.test/example',
    localUri: 'file:///tmp/example',
    fileName: 'example',
    originalName: 'example',
    mimetype: 'application/octet-stream',
    size: 512,
    kind: 'file',
    isImage: false,
    isAudio: false,
    isVideo: false,
    ...overrides,
  };
}

describe('mobileLocalMultimodalRouting', () => {
  it('blocks local turns when the runtime is unavailable', () => {
    const decision = resolveLocalTurnExecution('Hello there', [], {
      ...baseCapabilities,
      available: false,
    });

    assert.deepEqual(decision, { mode: 'blocked', reason: 'runtime-unavailable' });
    assert.equal(shouldEscalateLocalTurnToCloud('Hello there', [], {
      ...baseCapabilities,
      available: false,
    }), true);
  });

  it('keeps simple image turns on-device when vision input is available', () => {
    const attachment = createAttachment({
      kind: 'image',
      isImage: true,
      originalName: 'photo.jpg',
      fileName: 'photo.jpg',
      mimetype: 'image/jpeg',
      localUri: 'file:///tmp/photo.jpg',
    });

    assert.equal(shouldEscalateLocalTurnToCloud('Describe this image', [attachment], baseCapabilities), false);
  });

  it('requires the projector package before local image turns are allowed', () => {
    const attachment = createAttachment({
      kind: 'image',
      isImage: true,
      originalName: 'photo.jpg',
      fileName: 'photo.jpg',
      mimetype: 'image/jpeg',
      localUri: 'file:///tmp/photo.jpg',
    });

    const decision = resolveLocalTurnExecution('Describe this image', [attachment], {
      ...baseCapabilities,
      supportsVisionInput: false,
    });

    assert.equal(decision.mode, 'blocked');
    if (decision.mode !== 'blocked') {
      throw new Error('Expected local image turn to be blocked without a projector.');
    }
    assert.equal(decision.reason, 'projector-required');
  });

  it('escalates attachments without a device-local URI', () => {
    const attachment = createAttachment({
      kind: 'image',
      isImage: true,
      originalName: 'remote.jpg',
      fileName: 'remote.jpg',
      mimetype: 'image/jpeg',
      localUri: undefined,
    });

    assert.equal(shouldEscalateLocalTurnToCloud('Describe this image', [attachment], baseCapabilities), true);
  });

  it('accepts Android content URIs as device-local attachments', () => {
    const attachment = createAttachment({
      kind: 'image',
      isImage: true,
      originalName: 'remote.jpg',
      fileName: 'remote.jpg',
      mimetype: 'image/jpeg',
      localUri: 'content://media/external/images/media/42',
    });

    assert.equal(shouldEscalateLocalTurnToCloud('Describe this image', [attachment], baseCapabilities), false);
  });

  it('rejects unsupported local audio formats', () => {
    const attachment = createAttachment({
      kind: 'audio',
      isAudio: true,
      originalName: 'clip.m4a',
      fileName: 'clip.m4a',
      mimetype: 'audio/mp4',
      localUri: 'file:///tmp/clip.m4a',
    });

    assert.equal(resolveSupportedLocalAudioFormat(attachment), null);
    assert.equal(shouldEscalateLocalTurnToCloud('Transcribe this clip', [attachment], baseCapabilities), true);
  });

  it('blocks audio turns when the runtime does not expose audio input', () => {
    const attachment = createAttachment({
      kind: 'audio',
      isAudio: true,
      originalName: 'clip.mp3',
      fileName: 'clip.mp3',
      mimetype: 'audio/mpeg',
      localUri: 'file:///tmp/clip.mp3',
    });

    const decision = resolveLocalTurnExecution('Transcribe this clip', [attachment], {
      ...baseCapabilities,
      supportsAudioInput: false,
    });

    assert.equal(decision.mode, 'blocked');
    if (decision.mode !== 'blocked') {
      throw new Error('Expected local audio turn to be blocked without audio-input support.');
    }
    assert.equal(decision.reason, 'audio-input-unavailable');
  });

  it('blocks complex text turns instead of silently escalating them', () => {
    assert.deepEqual(resolveLocalTurnExecution('Please inspect src/App.tsx and patch the build error.\nReturn the diff.', [], baseCapabilities), {
      mode: 'blocked',
      reason: 'complex-turn',
    });
  });

  it('builds llama.rn-compatible multimodal user content', () => {
    const image = createAttachment({
      kind: 'image',
      isImage: true,
      originalName: 'photo.jpg',
      fileName: 'photo.jpg',
      mimetype: 'image/jpeg',
      localUri: 'file:///tmp/photo.jpg',
    });
    const audio = createAttachment({
      kind: 'audio',
      isAudio: true,
      originalName: 'clip.mp3',
      fileName: 'clip.mp3',
      mimetype: 'audio/mpeg',
      localUri: 'file:///tmp/clip.mp3',
    });

    assert.deepEqual(await buildLocalUserContent('Inspect these inputs', [image, audio]), [
      { type: 'text', text: 'Inspect these inputs' },
      { type: 'image_url', image_url: { url: 'file:///tmp/photo.jpg' } },
      { type: 'input_audio', input_audio: { url: 'file:///tmp/clip.mp3', format: 'mp3' } },
    ]);
  });

  it('uses the data field for data-url audio attachments', () => {
    const audio = createAttachment({
      kind: 'audio',
      isAudio: true,
      originalName: 'clip.wav',
      fileName: 'clip.wav',
      mimetype: 'audio/wav',
      localUri: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10',
    });

    assert.deepEqual(await buildLocalUserContent('', [audio]), [
      {
        type: 'input_audio',
        input_audio: {
          data: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10',
          format: 'wav',
        },
      },
    ]);
  });

  it('degrades unsupported historical audio attachments to text fallback', () => {
    const audio = createAttachment({
      kind: 'audio',
      isAudio: true,
      originalName: 'clip.mp3',
      fileName: 'clip.mp3',
      mimetype: 'audio/mpeg',
      localUri: 'file:///tmp/clip.mp3',
    });

    assert.deepEqual(await buildLocalUserContent('Keep this in context', [audio], {
      ...baseCapabilities,
      supportsAudioInput: false,
    }), [
      { type: 'text', text: 'Keep this in context' },
      { type: 'text', text: '[Audio Attachment 1: clip.mp3] URL: https://cdn.agentrix.test/example' },
    ]);
  });
});