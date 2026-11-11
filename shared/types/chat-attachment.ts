/**
 * L8 1a A1: chat attachments have an owner and are read through short-lived signed links.
 *
 * A new upload (switch `CHAT_ATTACHMENT_OWNER_V1_ENABLED`) is stored under `uploads/.private/chat/`, recorded in
 * `chat_attachments` with its owner, and answered with a link that carries `?e=<unix seconds>&s=<signature>`.
 * Clients treat `url` as an opaque string (that is why installed apps keep working); `attachmentId` and
 * `expiresAt` are additive. Files uploaded before the switch stay where they were and stay readable by link.
 */

/** Public path every chat attachment link lives under (relative to the API origin). */
export const CHAT_ATTACHMENT_URL_PATH_V1 = '/api/uploads/chat/';
/** Query parameter names of a signed link. */
export const CHAT_ATTACHMENT_EXPIRES_PARAM_V1 = 'e';
export const CHAT_ATTACHMENT_SIGNATURE_PARAM_V1 = 's';
/** `<uuid>.<ext>`: the only file names the read route serves. */
export const CHAT_ATTACHMENT_FILE_NAME_PATTERN_V1 = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.[A-Za-z0-9]{1,8}$/;

export const CHAT_ATTACHMENT_KINDS_V1 = ['image', 'video', 'audio', 'file'] as const;
export type ChatAttachmentKindV1 = (typeof CHAT_ATTACHMENT_KINDS_V1)[number];

/** Error codes the read route and the library routes answer with. */
export const CHAT_ATTACHMENT_ERROR_CODES_V1 = [
  'attachment_not_found',
  'attachment_url_invalid',
  'attachment_url_expired',
  'attachment_signature_required',
  'attachment_unavailable',
  'attachment_read_failed',
  'attachment_invalid_request',
] as const;
export type ChatAttachmentErrorCodeV1 = (typeof CHAT_ATTACHMENT_ERROR_CODES_V1)[number];

/** Extra fields on the `POST /upload/chat-attachment` response when the switch is on. */
export interface ChatAttachmentUploadExtrasV1 {
  attachmentId: string;
  /** ISO time the signed `url` stops working. */
  expiresAt: string;
}

/** One item of `GET /chat-attachments` and `POST /chat-attachments/refresh`. */
export interface ChatAttachmentItemV1 {
  id: string;
  fileName: string;
  originalName?: string;
  mimetype?: string;
  kind?: ChatAttachmentKindV1;
  size?: number;
  createdAt?: string;
  url: string;
  expiresAt: string;
}

export interface ChatAttachmentRefreshRequestV1 {
  ids?: string[];
  names?: string[];
}

export interface ChatAttachmentRefreshResponseV1 {
  items: ChatAttachmentItemV1[];
}

export const CHAT_ATTACHMENT_REFRESH_MAX_V1 = 20;
export const CHAT_ATTACHMENT_LIST_MAX_V1 = 100;
