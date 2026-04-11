import type { UploadedChatAttachment } from './api';
import type {
  MobileLocalChatContent,
  MobileLocalChatContentPart,
  MobileLocalRuntimeCapabilities,
} from './mobileLocalInference.service';

const MOBILE_HYBRID_TASK_PATTERN = /([a-z]:\\|\\|\/|\.tsx?\b|\.jsx?\b|\.json\b|\.md\b|package\.json|readme|src\/|backend\/|desktop\/|```|\n)|\b(search|find|install|run|execute|debug|fix|edit|write|read|open|grep|list|analy[sz]e|inspect|deploy|build|test|git|ssh|workspace|file|folder|directory|project|repo|code|patch|benchmark|profile|trace|continue|resume|tool|skill|agent|plan|orchestrat)\b|搜索|查找|安装|运行|执行|修复|修改|查看|列出|分析|排查|部署|构建|测试|工作区|文件|目录|项目|仓库|代码|工具|技能|继续|恢复|计划|编排/i;

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
  return !!attachment.localUri && (attachment.localUri.startsWith('file://') || attachment.localUri.startsWith('data:'));
}

export function canAttachmentRunLocally(
  attachment: UploadedChatAttachment,
  runtimeCapabilities: MobileLocalRuntimeCapabilities,
): boolean {
  if (!hasUsableLocalUri(attachment)) {
    return false;
  }

  if (attachment.kind === 'image' || attachment.isImage || attachment.mimetype?.startsWith('image/')) {
    return runtimeCapabilities.supportsVisionInput;
  }

  if (attachment.kind === 'audio' || attachment.isAudio || attachment.mimetype?.startsWith('audio/')) {
    return runtimeCapabilities.supportsAudioInput && resolveSupportedLocalAudioFormat(attachment) !== null;
  }

  return false;
}

export function shouldEscalateLocalTurnToCloud(
  text: string,
  attachments: UploadedChatAttachment[],
  runtimeCapabilities: MobileLocalRuntimeCapabilities,
): boolean {
  if (attachments.length > 0 && attachments.some((attachment) => !canAttachmentRunLocally(attachment, runtimeCapabilities))) {
    return true;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.length >= 240 || trimmed.includes('\n')) {
    return true;
  }

  return MOBILE_HYBRID_TASK_PATTERN.test(trimmed);
}

export function buildLocalUserContent(
  text: string,
  attachments: UploadedChatAttachment[],
): MobileLocalChatContent {
  const trimmed = text.trim();
  if (attachments.length === 0) {
    return trimmed;
  }

  const content: MobileLocalChatContentPart[] = [];
  if (trimmed) {
    content.push({ type: 'text', text: trimmed });
  }

  attachments.forEach((attachment, index) => {
    if (hasUsableLocalUri(attachment) && (attachment.kind === 'image' || attachment.isImage || attachment.mimetype?.startsWith('image/'))) {
      content.push({
        type: 'image_url',
        image_url: { url: attachment.localUri },
      });
      return;
    }

    const audioFormat = resolveSupportedLocalAudioFormat(attachment);
    if (hasUsableLocalUri(attachment) && audioFormat) {
      content.push({
        type: 'input_audio',
        input_audio: {
          url: attachment.localUri,
          format: audioFormat,
        },
      });
      return;
    }

    content.push({
      type: 'text',
      text: describeAttachmentFallback(attachment, index),
    });
  });

  return content.length === 1 && content[0].type === 'text'
    ? content[0].text
    : content;
}