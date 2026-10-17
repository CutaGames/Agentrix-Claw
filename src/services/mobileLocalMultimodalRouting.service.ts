import type { UploadedChatAttachment } from './api';
import type {
  MobileLocalChatContent,
  MobileLocalChatContentPart,
  MobileLocalRuntimeCapabilities,
} from './mobileLocalInference.service';
import { extractVideoFrames, isVideoFrameExtractionAvailable } from './videoFrameExtraction.service';
import { LocalImagePreprocessService } from './localImagePreprocess.service';



export type LocalTurnBlockReason =
  | 'runtime-unavailable'
  | 'text-generation-unavailable'
  | 'attachment-not-local'
  | 'projector-required'
  | 'audio-input-unavailable'
  | 'audio-format-unsupported'
  | 'attachment-unsupported'
  | 'complex-turn';

export type LocalTurnExecutionDecision =
  | {
      mode: 'local';
    }
  | {
      mode: 'blocked';
      reason: LocalTurnBlockReason;
      attachment?: UploadedChatAttachment;
    };

function isImageAttachment(attachment: UploadedChatAttachment): boolean {
  return attachment.kind === 'image' || attachment.isImage || attachment.mimetype?.startsWith('image/');
}

function isAudioAttachment(attachment: UploadedChatAttachment): boolean {
  return attachment.kind === 'audio' || attachment.isAudio || attachment.mimetype?.startsWith('audio/');
}

function isVideoAttachment(attachment: UploadedChatAttachment): boolean {
  return attachment.kind === 'video' || attachment.isVideo || attachment.mimetype?.startsWith('video/');
}

function describeAttachmentFallback(attachment: UploadedChatAttachment, index: number): string {
  if (attachment.kind === 'video' || attachment.isVideo || attachment.mimetype?.startsWith('video/')) {
    return `[Video Attachment ${index + 1}: ${attachment.originalName}] URL: ${attachment.publicUrl}`;
  }

  if (attachment.mimetype?.startsWith('audio/') || attachment.originalName.match(/\.(mp3|wav|m4a|ogg)$/i)) {
    return `[Audio Attachment ${index + 1}: ${attachment.originalName}] URL: ${attachment.publicUrl}`;
  }

  return `[Attachment ${index + 1}: ${attachment.originalName}] URL: ${attachment.publicUrl}`;
}

export function resolveSupportedLocalAudioFormat(
  attachment: UploadedChatAttachment,
): 'wav' | 'mp3' | null {
  const mimeType = attachment.mimetype?.toLowerCase() || '';
  const fileName = attachment.originalName.toLowerCase();

  if (mimeType.includes('wav') || fileName.endsWith('.wav')) {
    return 'wav';
  }

  if (mimeType.includes('mpeg') || mimeType.includes('mp3') || fileName.endsWith('.mp3')) {
    return 'mp3';
  }

  return null;
}

export function hasUsableLocalUri(attachment: UploadedChatAttachment): boolean {
  return !!attachment.localUri && (
    attachment.localUri.startsWith('file://')
    || attachment.localUri.startsWith('content://')
    || attachment.localUri.startsWith('data:')
  );
}

export function canAttachmentRunLocally(
  attachment: UploadedChatAttachment,
  runtimeCapabilities: MobileLocalRuntimeCapabilities,
): boolean {
  if (!hasUsableLocalUri(attachment)) {
    return false;
  }

  if (isImageAttachment(attachment)) {
    return runtimeCapabilities.supportsVisionInput;
  }

  if (isVideoAttachment(attachment)) {
    return runtimeCapabilities.supportsVisionInput && isVideoFrameExtractionAvailable();
  }

  if (isAudioAttachment(attachment)) {
    return runtimeCapabilities.supportsAudioInput && resolveSupportedLocalAudioFormat(attachment) !== null;
  }

  return false;
}

export function resolveLocalTurnExecution(
  text: string,
  attachments: UploadedChatAttachment[],
  runtimeCapabilities: MobileLocalRuntimeCapabilities,
): LocalTurnExecutionDecision {
  if (!runtimeCapabilities.available) {
    return { mode: 'blocked', reason: 'runtime-unavailable' };
  }

  if (!runtimeCapabilities.supportsTextGeneration) {
    return { mode: 'blocked', reason: 'text-generation-unavailable' };
  }

  for (const attachment of attachments) {
    if (isImageAttachment(attachment)) {
      if (!hasUsableLocalUri(attachment)) {
        return { mode: 'blocked', reason: 'attachment-not-local', attachment };
      }

      if (!runtimeCapabilities.supportsVisionInput) {
        return { mode: 'blocked', reason: 'projector-required', attachment };
      }

      continue;
    }

    if (isAudioAttachment(attachment)) {
      if (!hasUsableLocalUri(attachment)) {
        return { mode: 'blocked', reason: 'attachment-not-local', attachment };
      }

      // Non-wav/mp3 audio (e.g. m4a/aac/ogg from Android recorders) is
      // acceptable IF the whisper-base on-device STT encoder is available:
      // we transcribe to text in `buildLocalUserContent` and feed that to the
      // local text model. This keeps voice notes working on-device even
      // though llama.rn only accepts wav/mp3 as `input_audio`.
      if (resolveSupportedLocalAudioFormat(attachment) === null) {
        if (!runtimeCapabilities.supportsAudioInput) {
          // Still OK — `buildLocalUserContent` will transcribe via whisper
          // if the audio encoder is present; the runtime doesn't need the
          // full multimodal projector for this path.
        }
        continue;
      }

      if (!runtimeCapabilities.supportsAudioInput) {
        return { mode: 'blocked', reason: 'audio-input-unavailable', attachment };
      }

      continue;
    }

    if (isVideoAttachment(attachment)) {
      if (!hasUsableLocalUri(attachment)) {
        return { mode: 'blocked', reason: 'attachment-not-local', attachment };
      }

      if (!runtimeCapabilities.supportsVisionInput) {
        return { mode: 'blocked', reason: 'projector-required', attachment };
      }

      if (!isVideoFrameExtractionAvailable()) {
        return { mode: 'blocked', reason: 'attachment-unsupported', attachment };
      }

      continue;
    }

    return { mode: 'blocked', reason: 'attachment-unsupported', attachment };
  }

  return { mode: 'local' };
}

export function shouldEscalateLocalTurnToCloud(
  text: string,
  attachments: UploadedChatAttachment[],
  runtimeCapabilities: MobileLocalRuntimeCapabilities,
): boolean {
  return resolveLocalTurnExecution(text, attachments, runtimeCapabilities).mode === 'blocked';
}

export async function buildLocalUserContent(
  text: string,
  attachments: UploadedChatAttachment[],
  runtimeCapabilities?: MobileLocalRuntimeCapabilities,
  modelId?: string,
): Promise<MobileLocalChatContent> {
  const trimmed = text.trim();
  if (attachments.length === 0) {
    return trimmed;
  }

  const content: MobileLocalChatContentPart[] = [];
  if (trimmed) {
    content.push({ type: 'text', text: trimmed });
  }

  for (let index = 0; index < attachments.length; index++) {
    const attachment = attachments[index];

    if (
      hasUsableLocalUri(attachment)
      && isImageAttachment(attachment)
      && (!runtimeCapabilities || runtimeCapabilities.supportsVisionInput)
    ) {
      // Downscale before handing to mmproj. Per-model profile: Gemma stays at
      // ~768px/Q0.85; Qwen2.5-Omni and Qwen3.5-Omni-Light drop to ~512px/Q0.80
      // because their dynamic ViT + Q8 projector otherwise push first-token
      // past 240s on mid-tier Android CPUs.
      const preparedUri = await LocalImagePreprocessService.downscaleForLocalVision(
        attachment.localUri!,
        modelId,
      );
      content.push({
        type: 'image_url',
        image_url: { url: preparedUri },
      });
      continue;
    }

    if (
      hasUsableLocalUri(attachment)
      && isVideoAttachment(attachment)
      && isVideoFrameExtractionAvailable()
      && (!runtimeCapabilities || runtimeCapabilities.supportsVisionInput)
    ) {
      const frames = await extractVideoFrames(attachment.localUri);
      if (frames.length > 0) {
        content.push({
          type: 'text',
          text: `[Video: ${attachment.originalName}, ${frames.length} frames extracted at ~1fps]`,
        });
        for (const frame of frames) {
          const preparedFrameUri = await LocalImagePreprocessService.downscaleForLocalVision(frame.uri, modelId);
          content.push({
            type: 'image_url',
            image_url: { url: preparedFrameUri },
          });
        }
        continue;
      }
    }

    const audioFormat = resolveSupportedLocalAudioFormat(attachment);
    if (
      hasUsableLocalUri(attachment)
      && audioFormat
      && (!runtimeCapabilities || runtimeCapabilities.supportsAudioInput)
    ) {
      content.push({
        type: 'input_audio',
        input_audio: {
          format: audioFormat,
          ...(attachment.localUri.startsWith('data:')
            ? { data: attachment.localUri }
            : { url: attachment.localUri }),
        },
      });
      continue;
    }

    // Audio attachment in an unsupported format (m4a/aac/ogg from Android
    // recorders) OR the model has no direct `input_audio` support: try the
    // whisper-base on-device STT encoder to transcribe locally, then feed
    // the transcript as text. This keeps voice-note workflows on-device.
    if (hasUsableLocalUri(attachment) && isAudioAttachment(attachment)) {
      try {
        const { LocalWhisperService } = await import('./localWhisperService');
        // Resolve the right on-device whisper encoder for the active model
        // (gemma-4-2b / gemma-4-4b / qwen2.5-omni-3b / qwen3.5-omni-light all ship their own copy).
        // Fall back to gemma-4-2b because that's the one we ship by default.
        const candidateModelIds = Array.from(new Set([modelId, 'gemma-4-2b', 'gemma-4-4b', 'qwen3.5-omni-light', 'qwen2.5-omni-3b']
          .filter((m): m is string => typeof m === 'string' && m.length > 0)));
        const whisperModelId = candidateModelIds.find((m) => LocalWhisperService.isAvailableForModel(m));
        if (whisperModelId) {
          const transcript = await LocalWhisperService.transcribe(
            whisperModelId,
            attachment.localUri!,
          );
          if (transcript && transcript.trim()) {
            content.push({
              type: 'text',
              text: `[Voice note "${attachment.originalName}", transcribed on-device]\n${transcript.trim()}`,
            });
            continue;
          }
        }
      } catch {
        // Fall through to the generic describe fallback below.
      }
    }

    content.push({
      type: 'text',
      text: describeAttachmentFallback(attachment, index),
    });
  }

  return content.length === 1 && content[0].type === 'text'
    ? content[0].text
    : content;
}