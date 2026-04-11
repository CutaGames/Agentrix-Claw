import { describe, expect, it } from '@jest/globals';

import type { UploadedChatAttachment } from './api';
import type { MobileLocalRuntimeCapabilities } from './mobileLocalInference.service';
import {
  buildLocalUserContent,
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
  it('keeps simple image turns on-device when vision input is available', () => {
    const attachment = createAttachment({
      kind: 'image',
      isImage: true,
      originalName: 'photo.jpg',
      fileName: 'photo.jpg',
      mimetype: 'image/jpeg',
      localUri: 'file:///tmp/photo.jpg',
    });

    expect(shouldEscalateLocalTurnToCloud('Describe this image', [attachment], baseCapabilities)).toBe(false);
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

    expect(shouldEscalateLocalTurnToCloud('Describe this image', [attachment], baseCapabilities)).toBe(true);
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

    expect(resolveSupportedLocalAudioFormat(attachment)).toBeNull();
    expect(shouldEscalateLocalTurnToCloud('Transcribe this clip', [attachment], baseCapabilities)).toBe(true);
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

    expect(buildLocalUserContent('Inspect these inputs', [image, audio])).toEqual([
      { type: 'text', text: 'Inspect these inputs' },
      { type: 'image_url', image_url: { url: 'file:///tmp/photo.jpg' } },
      { type: 'input_audio', input_audio: { url: 'file:///tmp/clip.mp3', format: 'mp3' } },
    ]);
  });
});