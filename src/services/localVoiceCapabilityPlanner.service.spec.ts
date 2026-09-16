import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { MobileLocalRuntimeCapabilities } from './mobileLocalInference.service';
import { planLocalVoiceCapabilitySplit } from './localVoiceCapabilityPlanner.service';

const baseCapabilities: MobileLocalRuntimeCapabilities = {
  available: true,
  runtimeSource: 'global',
  supportsTextGeneration: true,
  supportsStreaming: true,
  supportsVisionInput: false,
  supportsAudioInput: false,
  supportsAudioOutput: false,
};

describe('localVoiceCapabilityPlanner', () => {
  it('keeps local-model voice off the realtime channel and reports missing local gaps', () => {
    assert.deepEqual(planLocalVoiceCapabilitySplit({
      localModelSelected: true,
      preferOnDeviceVoice: false,
      selectedVoiceId: 'alloy',
      runtimeCapabilities: baseCapabilities,
    }), {
      useRealtimeVoiceChannel: false,
      preferLocalSpeechRecognition: true,
      preferLocalTextToSpeech: true,
      relayCameraFramesToRealtime: false,
      localAudioInputReady: false,
      localMultimodalReady: false,
      missingOnDeviceCapabilities: ['vision-input', 'audio-input', 'audio-output'],
    });
  });

  it('keeps cloud-model voice on the realtime channel while respecting local voice preferences', () => {
    assert.deepEqual(planLocalVoiceCapabilitySplit({
      localModelSelected: false,
      preferOnDeviceVoice: true,
      selectedVoiceId: null,
      runtimeCapabilities: {
        ...baseCapabilities,
        supportsVisionInput: true,
      },
    }), {
      useRealtimeVoiceChannel: true,
      preferLocalSpeechRecognition: true,
      preferLocalTextToSpeech: true,
      relayCameraFramesToRealtime: true,
      localAudioInputReady: false,
      localMultimodalReady: false,
      missingOnDeviceCapabilities: ['audio-input', 'audio-output'],
    });
  });
});