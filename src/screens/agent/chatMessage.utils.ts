/**
 * Chat message utilities — A5 minimal extraction (Sprint D, 2026-05-10).
 *
 * Pure string-processing helpers lifted out of AgentChatScreen.tsx. No
 * React / RN imports — 100% portable. These functions power message
 * bubble rendering (extract images/audio/video/file URLs, build display
 * text with markdown stripped, get copyable text).
 *
 * Why a separate file: AgentChatScreen.tsx is 4097 lines; moving these
 * 5 pure functions out trims the main file ~75 lines without touching
 * any runtime-critical path (SSE / local model / voice / tool calling).
 * The full A5 decomposition (MessageBubble, useStreamChunkBuffer, etc.)
 * stays deferred pending Maestro device regression coverage — see
 * docs/MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05.zh-CN.md §9.1 A5.
 */

export interface ChatAttachmentLike {
  originalName: string;
  publicUrl?: string;
  localUri?: string;
}

export interface ChatMessageLike {
  content: string;
  attachments?: ChatAttachmentLike[] | null;
}

export function dedupeUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

export function extractUrlsFromMessage(content: string) {
  const markdownImageUrls = Array.from(
    content.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g),
  ).map((match) => match[1]);
  const plainUrls = Array.from(content.matchAll(/https?:\/\/[^\s)]+/g)).map((match) =>
    match[0].replace(/[),.;]+$/, ''),
  );
  const allUrls = dedupeUrls([...markdownImageUrls, ...plainUrls]);
  const imageUrls = allUrls.filter((url) =>
    /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(url),
  );
  const audioUrls = allUrls.filter((url) =>
    /\.(mp3|wav|m4a|ogg|aac|flac|opus|wma)(\?.*)?$/i.test(url),
  );
  const videoUrls = allUrls.filter((url) =>
    /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url),
  );
  const fileUrls = allUrls.filter(
    (url) =>
      !imageUrls.includes(url) &&
      !audioUrls.includes(url) &&
      !videoUrls.includes(url) &&
      // `/api/uploads/…` is a platform uploads namespace — treat any URL
      // under that path as a file attachment regardless of extension.
      // Otherwise, only well-known document extensions qualify as files.
      (/\/api\/uploads\//.test(url) ||
        /\.(pdf|txt|md|csv|json|docx?|xlsx?|pptx?)(\?.*)?$/i.test(url)),
  );
  return { imageUrls, audioUrls, videoUrls, fileUrls };
}

export function getCopyableMessageText(message: ChatMessageLike): string {
  const attachmentLines = (message.attachments || []).map(
    (attachment) =>
      `${attachment.originalName}: ${attachment.publicUrl || attachment.localUri || ''}`,
  );
  return [message.content.trim(), ...attachmentLines].filter(Boolean).join('\n');
}

/** Strip basic markdown: **bold** → bold, *italic* → italic, `code` → code. */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1');
}

export function buildDisplayMessageText(content: string): string {
  if (!content) return '';
  const { imageUrls, audioUrls, videoUrls, fileUrls } = extractUrlsFromMessage(content);
  let display = content
    .replace(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g, '')
    .replace(/\[User Attachments\][\s\S]*$/g, '')
    .trim();

  for (const url of [...imageUrls, ...audioUrls, ...videoUrls, ...fileUrls]) {
    display = display.replace(
      new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      '',
    );
  }

  return stripInlineMarkdown(display)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
