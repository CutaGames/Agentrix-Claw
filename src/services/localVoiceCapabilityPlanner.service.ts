import type { MobileLocalRuntimeCapabilities } from './mobileLocalInference.service';

export type LocalVoiceCapabilityGap = 'vision-input' | 'audio-input' | 'audio-output';

export interface LocalVoiceCapabilityPlannerInput {
  localModelSelected: boolean;
  preferOnDeviceVoice: boolean;
  selectedVoiceId?: string | null;
  runtimeCapabilities: MobileLocalRuntimeCapabilities;
}

export interface LocalVoiceCapabilityPlan {
  useRealtimeVoiceChannel: boolean;
  preferLocalSpeechRecognition: boolean;
  preferLocalTextToSpeech: boolean;
  relayCameraFramesToRealtime: boolean;
  localAudioInputReady: boolean;
  localMultimodalReady: boolean;
  missingOnDeviceCapabilities: LocalVoiceCapabilityGap[];
}

export function planLocalVoiceCapabilitySplit(
  input: LocalVoiceCapabilityPlannerInput,
): LocalVoiceCapabilityPlan {
  const missingOnDeviceCapabilities: LocalVoiceCapabilityGap[] = [];
  const { localModelSelected, preferOnDeviceVoice, runtimeCapabilities, selectedVoiceId } = input;

  if (!runtimeCapabilities.supportsVisionInput) {
    missingOnDeviceCapabilities.push('vision-input');
  }
  if (!runtimeCapabilities.supportsAudioInput) {
    missingOnDeviceCapabilities.push('audio-input');
  }
  if (!runtimeCapabilities.supportsAudioOutput) {
    missingOnDeviceCapabilities.push('audio-output');
  }

  const localMultimodalReady = runtimeCapabilities.supportsVisionInput
    && runtimeCapabilities.supportsAudioInput
    && runtimeCapabilities.supportsAudioOutput;

  return {
    useRealtimeVoiceChannel: !localModelSelected,
    preferLocalSpeechRecognition: localModelSelected || preferOnDeviceVoice,
    preferLocalTextToSpeech: localModelSelected || (preferOnDeviceVoice && !selectedVoiceId),
    relayCameraFramesToRealtime: !localModelSelected,
    localAudioInputReady: runtimeCapabilities.supportsAudioInput,
    localMultimodalReady,
    missingOnDeviceCapabilities,
  };
}
