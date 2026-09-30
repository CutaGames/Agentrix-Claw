/**
 * Digital Twin — content intake contract (`digital-twin/v1`, Task 3 facade).
 *
 * Digital Twin does not acquire, stage, scan or parse anything itself. Those
 * are Agent Portability's adapters. This contract only:
 *
 *  1. declares the source profile a Creator may bring (pasted text, documents,
 *     URLs, media) with a **rights declaration**;
 *  2. says honestly which of those the platform can serve today and which are
 *     `unavailable` until the Portability owner ships an adapter
 *     (evidence/interface-requests.md IR-01);
 *  3. turns owner-authored text into a `agentrix.generic-archive-items/2`
 *     document that goes through the ordinary import flow — scan, preview,
 *     decision, canonical writer, receipt, read-back, undo.
 *
 * `rights: 'unknown'` is quarantined: nothing is planned. Third-party material is
 * never planned as the Creator's own memory; it becomes archive-only
 * conversation excerpts until a Conversation owner writer exists.
 */
import {
  GENERIC_ARCHIVE_ITEMS_SCHEMA_V2,
  createGenericArchiveItemV2,
  defaultArchiveMetadataV2,
  type GenericArchiveItemV2,
  type GenericArchiveItemsDocumentV2,
} from './agent-portability-archive-v2';
import {
  DIGITAL_TWIN_DECODE_HELPERS_V1,
  DIGITAL_TWIN_FACETS_V1,
  DIGITAL_TWIN_SCHEMA_VERSION,
  isDigitalTwinRefV1,
  type DigitalTwinDecodeResultV1,
  type DigitalTwinFacetV1,
  type DigitalTwinRefV1,
} from './digital-twin';
import { DIGITAL_TWIN_CANDIDATE_SUBMIT_VIA, digitalTwinTextLooksSecretV1 } from './digital-twin-interview';
import { computeDigest, type DigestRef } from './trust-loop-primitives';

const { isRecord, isNonEmptyString, isIsoTimestamp, isMember, isDigestRef, unknownKeys, fail } =
  DIGITAL_TWIN_DECODE_HELPERS_V1;

export const DIGITAL_TWIN_INTAKE_NAMESPACE = 'agentrix-digital-twin' as const;
export const DIGITAL_TWIN_INTAKE_PLAN_DIGEST_DOMAIN = 'AGENTRIX_DIGITAL_TWIN_INTAKE_PLAN_V1' as const;

export const DIGITAL_TWIN_INTAKE_MAX_TEXT_CHARS = 200_000;
export const DIGITAL_TWIN_INTAKE_MAX_ITEMS = 200;
export const DIGITAL_TWIN_INTAKE_MAX_LINE_CHARS = 1000;
export const DIGITAL_TWIN_INTAKE_MAX_TITLE_CHARS = 120;
export const DIGITAL_TWIN_INTAKE_MAX_URL_CHARS = 2048;

export const DIGITAL_TWIN_INTAKE_SOURCE_KINDS_V1 = ['pasted_text', 'document', 'url', 'media'] as const;
export type DigitalTwinIntakeSourceKindV1 = (typeof DIGITAL_TWIN_INTAKE_SOURCE_KINDS_V1)[number];

export const DIGITAL_TWIN_INTAKE_DOCUMENT_FORMATS_V1 = ['markdown', 'text', 'json', 'pdf', 'pptx', 'docx'] as const;
export type DigitalTwinIntakeDocumentFormatV1 = (typeof DIGITAL_TWIN_INTAKE_DOCUMENT_FORMATS_V1)[number];

/** Formats the browser can read as text and hand over as owner-authored lines today. */
export const DIGITAL_TWIN_INTAKE_TEXT_DOCUMENT_FORMATS_V1: readonly DigitalTwinIntakeDocumentFormatV1[] = [
  'markdown',
  'text',
  'json',
];

export const DIGITAL_TWIN_INTAKE_MEDIA_KINDS_V1 = ['audio', 'video'] as const;
export type DigitalTwinIntakeMediaKindV1 = (typeof DIGITAL_TWIN_INTAKE_MEDIA_KINDS_V1)[number];

export const DIGITAL_TWIN_INTAKE_RIGHTS_V1 = ['self_authored', 'licensed', 'contains_third_party', 'unknown'] as const;
export type DigitalTwinIntakeRightsV1 = (typeof DIGITAL_TWIN_INTAKE_RIGHTS_V1)[number];

export const DIGITAL_TWIN_INTAKE_DISPOSITIONS_V1 = ['ready', 'quarantined', 'unavailable'] as const;
export type DigitalTwinIntakeDispositionV1 = (typeof DIGITAL_TWIN_INTAKE_DISPOSITIONS_V1)[number];

/** Blockers for the parts Digital Twin cannot serve until the Portability owner ships an adapter. */
export const DIGITAL_TWIN_INTAKE_BLOCKERS_V1 = {
  url: 'interface-request:IR-01-url-adapter',
  media: 'interface-request:IR-01-media-transcript-adapter',
  binaryDocument: 'interface-request:IR-01-document-parser-adapter',
} as const;

export interface DigitalTwinIntakePlanCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  sourceKind: DigitalTwinIntakeSourceKindV1;
  rights: DigitalTwinIntakeRightsV1;
  facet?: DigitalTwinFacetV1;
  title?: string;
  /** Owner-authored or owner-read text for `pasted_text` / text documents. */
  text?: string;
  documentFormat?: DigitalTwinIntakeDocumentFormatV1;
  url?: string;
  mediaKind?: DigitalTwinIntakeMediaKindV1;
  /**
   * Raw file bytes as standard base64 (no data-URL prefix). Accepted only for
   * `document` (pdf/pptx/docx) and `media`. Never persisted; the plan keeps a
   * digest only. Decoder rejects anything over the media byte ceiling.
   */
  bytesBase64?: string;
}

export interface DigitalTwinIntakePlanItemV1 {
  /** Equals `document.items[i].sourceRef.id`. */
  sourceId: string;
  lineIndex: number;
  itemType: 'memory' | 'conversation';
}

/** Closed reasons a URL acquisition fails closed with (IR-01a conditions). */
export const DIGITAL_TWIN_URL_ACQUIRE_FAILURES_V1 = [
  'invalid_url',
  'scheme_not_allowed',
  'credentials_in_url',
  'private_address',
  'dns_failed',
  'too_many_redirects',
  'timeout',
  'too_large',
  'unsupported_media_type',
  'robots_disallow',
  'login_or_paywall',
  'http_error',
  'empty_content',
  'rate_limited',
  'kill_switch',
  'transport_error',
] as const;
export type DigitalTwinUrlAcquireFailureV1 = (typeof DIGITAL_TWIN_URL_ACQUIRE_FAILURES_V1)[number];

/** Bounds the acquisition step must enforce (IR-01a approval conditions). */
export const DIGITAL_TWIN_URL_ACQUIRE_LIMITS_V1 = {
  maxRedirects: 3,
  maxBodyBytes: 2 * 1024 * 1024,
  timeoutMs: 20_000,
  allowedMediaTypes: ['text/html', 'application/xhtml+xml', 'text/plain', 'text/markdown'],
  /** Per owner, sliding window. */
  rateLimit: { max: 10, windowMs: 10 * 60_000 },
} as const;

/** Bounds the IR-01b document parser must enforce. */
export const DIGITAL_TWIN_DOCUMENT_PARSE_LIMITS_V1 = {
  maxBytes: 2 * 1024 * 1024,
  timeoutMs: 15_000,
  maxPages: 50,
  maxSlides: 50,
  maxZipEntries: 200,
  maxUncompressedBytes: 12 * 1024 * 1024,
  maxChars: DIGITAL_TWIN_INTAKE_MAX_TEXT_CHARS,
  rateLimit: { max: 10, windowMs: 10 * 60_000 },
} as const;

export const DIGITAL_TWIN_DOCUMENT_PARSE_FAILURES_V1 = [
  'flag_off',
  'kill_switch',
  'unsupported_format',
  'too_large',
  'timeout',
  'parser_bomb',
  'corrupt',
  'empty_content',
  'missing_bytes',
  'rate_limited',
] as const;
export type DigitalTwinDocumentParseFailureV1 = (typeof DIGITAL_TWIN_DOCUMENT_PARSE_FAILURES_V1)[number];

export const DIGITAL_TWIN_DOCUMENT_LOCATION_KINDS_V1 = ['page', 'slide', 'paragraph'] as const;
export type DigitalTwinDocumentLocationKindV1 = (typeof DIGITAL_TWIN_DOCUMENT_LOCATION_KINDS_V1)[number];

export interface DigitalTwinDocumentLocationV1 {
  kind: DigitalTwinDocumentLocationKindV1;
  /** 1-based page, slide or paragraph number. */
  index: number;
  lineIndex: number;
}

export interface DigitalTwinDocumentParseV1 {
  format: 'pdf' | 'pptx' | 'docx';
  bytes: number;
  snapshotDigest: DigestRef;
  title?: string;
  text: string;
  locations: DigitalTwinDocumentLocationV1[];
  parsedAt: string;
}

export type DigitalTwinDocumentParseSummaryV1 = Omit<DigitalTwinDocumentParseV1, 'text' | 'locations'> & {
  units: number;
};

/** Bounds the IR-01c media transcript adapter must enforce. */
export const DIGITAL_TWIN_MEDIA_TRANSCRIPT_LIMITS_V1 = {
  maxBytes: 6 * 1024 * 1024,
  timeoutMs: 30_000,
  maxDurationSeconds: 180,
  allowedMediaTypes: ['audio/wav', 'audio/wave', 'audio/x-wav'] as const,
  rateLimit: { max: 5, windowMs: 10 * 60_000 },
} as const;

export const DIGITAL_TWIN_MEDIA_TRANSCRIPT_FAILURES_V1 = [
  'flag_off',
  'kill_switch',
  'unsupported_media_type',
  'too_large',
  'too_long',
  'timeout',
  'corrupt',
  'empty_content',
  'missing_bytes',
  'provider_unconfigured',
  'provider_error',
  'rate_limited',
] as const;
export type DigitalTwinMediaTranscriptFailureV1 = (typeof DIGITAL_TWIN_MEDIA_TRANSCRIPT_FAILURES_V1)[number];

export interface DigitalTwinTranscriptSegmentV1 {
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number;
}

export interface DigitalTwinMediaTranscriptV1 {
  mediaKind: DigitalTwinIntakeMediaKindV1;
  mediaType: string;
  bytes: number;
  durationMs: number;
  snapshotDigest: DigestRef;
  lossiness: 'transformed';
  segments: DigitalTwinTranscriptSegmentV1[];
  text: string;
  transcribedAt: string;
  provider: string;
}

export type DigitalTwinMediaTranscriptSummaryV1 = Omit<DigitalTwinMediaTranscriptV1, 'text' | 'segments'> & {
  segmentCount: number;
};

export const DIGITAL_TWIN_INTAKE_MAX_BYTES_BASE64_CHARS = Math.ceil((DIGITAL_TWIN_MEDIA_TRANSCRIPT_LIMITS_V1.maxBytes * 4) / 3) + 8;

/**
 * What the server learned while acquiring a URL. The extracted text travels to
 * the planner and on to the client as candidates; Digital Twin stores none of it.
 * Only the snapshot digest and the fetch facts survive on the plan.
 */
export interface DigitalTwinUrlAcquisitionV1 {
  requestedUrl: string;
  finalUrl: string;
  contentType: string;
  bytes: number;
  redirects: number;
  robots: 'allowed' | 'no_robots_file';
  /** sha-256 over the raw response body. */
  snapshotDigest: DigestRef;
  title?: string;
  text: string;
  fetchedAt: string;
}

export type DigitalTwinUrlAcquisitionSummaryV1 = Omit<DigitalTwinUrlAcquisitionV1, 'text'>;

export interface DigitalTwinIntakePlanV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  planRef: DigitalTwinRefV1;
  profileRef: DigitalTwinRefV1;
  sourceKind: DigitalTwinIntakeSourceKindV1;
  rights: DigitalTwinIntakeRightsV1;
  facet: DigitalTwinFacetV1;
  disposition: DigitalTwinIntakeDispositionV1;
  /** Present for `unavailable`. */
  blockedBy?: string;
  /** Present for `quarantined`. */
  quarantineReason?: 'rights_unknown';
  canonical?: {
    document: GenericArchiveItemsDocumentV2;
    items: DigitalTwinIntakePlanItemV1[];
    submitVia: typeof DIGITAL_TWIN_CANDIDATE_SUBMIT_VIA;
    writesCanonicalState: false;
  };
  /** Present for `url` sources that were acquired; never carries page text. */
  acquisition?: DigitalTwinUrlAcquisitionSummaryV1;
  /** Present for parsed binary documents; never carries extracted text. */
  document?: DigitalTwinDocumentParseSummaryV1;
  /** Present for transcribed media; never carries segment text. */
  transcript?: DigitalTwinMediaTranscriptSummaryV1;
  stats: {
    linesSeen: number;
    itemsPlanned: number;
    skippedSecrets: number;
    skippedEmpty: number;
    truncated: boolean;
  };
  planDigest: DigestRef;
  createdAt: string;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export function decodeDigitalTwinIntakePlanCommandV1(
  input: unknown,
): DigitalTwinDecodeResultV1<DigitalTwinIntakePlanCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['command must be an object']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) {
    return fail('unknown_schema_version', [`schemaVersion=${String(input.schemaVersion)}`]);
  }
  const extra = unknownKeys(input, [
    'schemaVersion',
    'sourceKind',
    'rights',
    'facet',
    'title',
    'text',
    'documentFormat',
    'url',
    'mediaKind',
    'bytesBase64',
  ]);
  if (extra.length > 0) return fail('unknown_field', extra);
  const { sourceKind, rights, title, url } = input;
  if (!isMember(DIGITAL_TWIN_INTAKE_SOURCE_KINDS_V1, sourceKind)) return fail('invalid_enum', ['sourceKind']);
  if (!isMember(DIGITAL_TWIN_INTAKE_RIGHTS_V1, rights)) return fail('invalid_enum', ['rights']);
  let facet: DigitalTwinFacetV1 | undefined;
  if (input.facet !== undefined) {
    if (!isMember(DIGITAL_TWIN_FACETS_V1, input.facet)) return fail('invalid_enum', ['facet']);
    facet = input.facet;
  }
  if (title !== undefined && (typeof title !== 'string' || title.length > DIGITAL_TWIN_INTAKE_MAX_TITLE_CHARS)) {
    return fail('invalid_shape', ['title']);
  }
  let documentFormat: DigitalTwinIntakeDocumentFormatV1 | undefined;
  if (input.documentFormat !== undefined) {
    if (!isMember(DIGITAL_TWIN_INTAKE_DOCUMENT_FORMATS_V1, input.documentFormat)) return fail('invalid_enum', ['documentFormat']);
    documentFormat = input.documentFormat;
  }
  let mediaKind: DigitalTwinIntakeMediaKindV1 | undefined;
  if (input.mediaKind !== undefined) {
    if (!isMember(DIGITAL_TWIN_INTAKE_MEDIA_KINDS_V1, input.mediaKind)) return fail('invalid_enum', ['mediaKind']);
    mediaKind = input.mediaKind;
  }
  if (url !== undefined && (typeof url !== 'string' || url.length > DIGITAL_TWIN_INTAKE_MAX_URL_CHARS)) {
    return fail('invalid_shape', ['url']);
  }
  let text: string | undefined;
  if (input.text !== undefined) {
    if (typeof input.text !== 'string') return fail('invalid_shape', ['text']);
    if (input.text.length > DIGITAL_TWIN_INTAKE_MAX_TEXT_CHARS) return fail('invalid_shape', ['text exceeds max length']);
    text = normalizeText(input.text);
  }
  let bytesBase64: string | undefined;
  if (input.bytesBase64 !== undefined) {
    if (typeof input.bytesBase64 !== 'string' || input.bytesBase64.length > DIGITAL_TWIN_INTAKE_MAX_BYTES_BASE64_CHARS) {
      return fail('invalid_shape', ['bytesBase64']);
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.bytesBase64) || input.bytesBase64.length % 4 !== 0) {
      return fail('invalid_shape', ['bytesBase64']);
    }
    bytesBase64 = input.bytesBase64;
  }
  switch (sourceKind) {
    case 'pasted_text':
      if (!isNonEmptyString(text)) return fail('invalid_shape', ['pasted_text requires text']);
      break;
    case 'document':
      if (documentFormat === undefined) return fail('invalid_shape', ['document requires documentFormat']);
      if (DIGITAL_TWIN_INTAKE_TEXT_DOCUMENT_FORMATS_V1.includes(documentFormat) && !isNonEmptyString(text)) {
        return fail('invalid_shape', ['text document requires text']);
      }
      break;
    case 'url':
      if (!isNonEmptyString(url)) return fail('invalid_shape', ['url requires url']);
      break;
    case 'media':
      if (mediaKind === undefined) return fail('invalid_shape', ['media requires mediaKind']);
      break;
    default:
      break;
  }
  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  return {
    ok: true,
    value: {
      schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
      sourceKind,
      rights,
      ...(facet !== undefined ? { facet } : {}),
      ...(trimmedTitle ? { title: trimmedTitle } : {}),
      ...(text !== undefined ? { text } : {}),
      ...(documentFormat !== undefined ? { documentFormat } : {}),
      ...(typeof url === 'string' ? { url: url.trim() } : {}),
      ...(mediaKind !== undefined ? { mediaKind } : {}),
      ...(bytesBase64 !== undefined ? { bytesBase64 } : {}),
    },
  };
}

const FACET_SENSITIVITY: Readonly<Record<DigitalTwinFacetV1, GenericArchiveItemV2['sensitivity']>> = {
  public: 'public',
  work: 'owner',
  private: 'private',
};

function unavailableBlocker(
  command: DigitalTwinIntakePlanCommandV1,
  acquisition: DigitalTwinUrlAcquisitionV1 | undefined,
  documentParse: DigitalTwinDocumentParseV1 | undefined,
  transcript: DigitalTwinMediaTranscriptV1 | undefined,
): string | undefined {
  if (command.sourceKind === 'url' && !acquisition) return DIGITAL_TWIN_INTAKE_BLOCKERS_V1.url;
  if (command.sourceKind === 'media' && !transcript) return DIGITAL_TWIN_INTAKE_BLOCKERS_V1.media;
  if (
    command.sourceKind === 'document' &&
    command.documentFormat !== undefined &&
    !DIGITAL_TWIN_INTAKE_TEXT_DOCUMENT_FORMATS_V1.includes(command.documentFormat) &&
    !documentParse
  ) {
    return DIGITAL_TWIN_INTAKE_BLOCKERS_V1.binaryDocument;
  }
  return undefined;
}

/**
 * Pure planner. Rights decide the disposition before any text is looked at;
 * secret-bearing lines are dropped and counted; bounds truncate honestly.
 * `planDigest` covers everything except `planRef` and `createdAt`.
 */
export function buildDigitalTwinIntakePlanV1(input: {
  profileRef: DigitalTwinRefV1;
  planId: string;
  command: DigitalTwinIntakePlanCommandV1;
  now: string;
  /** Result of the server-side URL acquisition; required for a `url` plan to be `ready`. */
  acquisition?: DigitalTwinUrlAcquisitionV1;
  /** A failed acquisition surfaces as `unavailable` with `url_acquire:<reason>`. */
  acquisitionFailure?: DigitalTwinUrlAcquireFailureV1;
  documentParse?: DigitalTwinDocumentParseV1;
  documentParseFailure?: DigitalTwinDocumentParseFailureV1;
  transcript?: DigitalTwinMediaTranscriptV1;
  transcriptFailure?: DigitalTwinMediaTranscriptFailureV1;
}): DigitalTwinIntakePlanV1 {
  const { command } = input;
  const facet = command.facet ?? 'public';
  const acquisition = command.sourceKind === 'url' ? input.acquisition : undefined;
  const documentParse = command.sourceKind === 'document' ? input.documentParse : undefined;
  const transcript = command.sourceKind === 'media' ? input.transcript : undefined;
  const base = {
    schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
    profileRef: input.profileRef,
    sourceKind: command.sourceKind,
    rights: command.rights,
    facet,
  };
  const planRef: DigitalTwinRefV1 = { kind: 'intake_plan', id: input.planId };
  const emptyStats = { linesSeen: 0, itemsPlanned: 0, skippedSecrets: 0, skippedEmpty: 0, truncated: false };
  // `planRef` and `createdAt` are outside the digest so the same input always seals to the same digest.
  const seal = (body: Omit<DigitalTwinIntakePlanV1, 'planDigest' | 'planRef' | 'createdAt'>): DigitalTwinIntakePlanV1 => ({
    ...body,
    planRef,
    createdAt: input.now,
    planDigest: computeDigest({ domain: DIGITAL_TWIN_INTAKE_PLAN_DIGEST_DOMAIN, ...body }),
  });

  if (command.rights === 'unknown') {
    return seal({ ...base, disposition: 'quarantined', quarantineReason: 'rights_unknown', stats: emptyStats });
  }
  if (command.sourceKind === 'url' && input.acquisitionFailure) {
    return seal({ ...base, disposition: 'unavailable', blockedBy: `url_acquire:${input.acquisitionFailure}`, stats: emptyStats });
  }
  if (command.sourceKind === 'document' && input.documentParseFailure) {
    return seal({ ...base, disposition: 'unavailable', blockedBy: `document_parse:${input.documentParseFailure}`, stats: emptyStats });
  }
  if (command.sourceKind === 'media' && input.transcriptFailure) {
    return seal({ ...base, disposition: 'unavailable', blockedBy: `media_transcript:${input.transcriptFailure}`, stats: emptyStats });
  }
  const blockedBy = unavailableBlocker(command, acquisition, documentParse, transcript);
  if (blockedBy) {
    return seal({ ...base, disposition: 'unavailable', blockedBy, stats: emptyStats });
  }

  const thirdParty = command.rights === 'contains_third_party';
  const itemType: DigitalTwinIntakePlanItemV1['itemType'] = thirdParty ? 'conversation' : 'memory';
  const text = transcript?.text ?? documentParse?.text ?? (acquisition ? acquisition.text : command.text ?? '');
  const title = documentParse?.title ?? acquisition?.title ?? command.title;
  const contentDigest = transcript
    ? transcript.snapshotDigest.value.slice(0, 16)
    : documentParse
      ? documentParse.snapshotDigest.value.slice(0, 16)
      : acquisition
        ? acquisition.snapshotDigest.value.slice(0, 16)
        : computeDigest({ text, rights: command.rights, sourceKind: command.sourceKind }).value.slice(0, 16);
  const objectType = `intake:${command.sourceKind}:${command.rights}`;
  const acquisitionSummary: DigitalTwinUrlAcquisitionSummaryV1 | undefined = acquisition
    ? {
        requestedUrl: acquisition.requestedUrl,
        finalUrl: acquisition.finalUrl,
        contentType: acquisition.contentType,
        bytes: acquisition.bytes,
        redirects: acquisition.redirects,
        robots: acquisition.robots,
        snapshotDigest: acquisition.snapshotDigest,
        ...(acquisition.title ? { title: acquisition.title } : {}),
        fetchedAt: acquisition.fetchedAt,
      }
    : undefined;
  const documentSummary: DigitalTwinDocumentParseSummaryV1 | undefined = documentParse
    ? {
        format: documentParse.format,
        bytes: documentParse.bytes,
        snapshotDigest: documentParse.snapshotDigest,
        ...(documentParse.title ? { title: documentParse.title } : {}),
        parsedAt: documentParse.parsedAt,
        units: new Set(documentParse.locations.map((location) => `${location.kind}:${location.index}`)).size,
      }
    : undefined;
  const transcriptSummary: DigitalTwinMediaTranscriptSummaryV1 | undefined = transcript
    ? {
        mediaKind: transcript.mediaKind,
        mediaType: transcript.mediaType,
        bytes: transcript.bytes,
        durationMs: transcript.durationMs,
        snapshotDigest: transcript.snapshotDigest,
        lossiness: 'transformed',
        transcribedAt: transcript.transcribedAt,
        provider: transcript.provider,
        segmentCount: transcript.segments.length,
      }
    : undefined;
  const items: GenericArchiveItemV2[] = [];
  const planned: DigitalTwinIntakePlanItemV1[] = [];
  const stats = { ...emptyStats };
  const lines = text.split('\n');
  stats.linesSeen = lines.length;
  for (const [lineIndex, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) {
      stats.skippedEmpty += 1;
      continue;
    }
    if (items.length >= DIGITAL_TWIN_INTAKE_MAX_ITEMS) {
      stats.truncated = true;
      break;
    }
    const bounded = line.slice(0, DIGITAL_TWIN_INTAKE_MAX_LINE_CHARS);
    if (digitalTwinTextLooksSecretV1(bounded)) {
      stats.skippedSecrets += 1;
      continue;
    }
    const location = documentParse?.locations.find((entry) => entry.lineIndex === lineIndex);
    const sourceId = location
      ? `${contentDigest}:${location.kind}:${location.index}:${lineIndex}`
      : transcript
        ? `${contentDigest}:seg:${lineIndex}`
        : `${contentDigest}:${lineIndex}`;
    const sourceRef = { namespace: DIGITAL_TWIN_INTAKE_NAMESPACE, objectType, id: sourceId };
    const metadata = {
      ...defaultArchiveMetadataV2(itemType),
      sensitivity: thirdParty ? ('restricted' as const) : FACET_SENSITIVITY[facet],
      ...(transcript ? { lossiness: 'transformed' as const } : {}),
    };
    items.push(
      thirdParty
        ? createGenericArchiveItemV2({
            itemType: 'conversation',
            sourceRef,
            payload: { excerpt: bounded, ...(title ? { title } : {}) },
            ...metadata,
          })
        : createGenericArchiveItemV2({ itemType: 'memory', sourceRef, payload: { content: bounded }, ...metadata }),
    );
    planned.push({ sourceId, lineIndex, itemType });
  }
  stats.itemsPlanned = items.length;
  if (items.length === 0 && acquisition) {
    return seal({ ...base, disposition: 'unavailable', blockedBy: 'url_acquire:empty_content', acquisition: acquisitionSummary, stats });
  }
  if (items.length === 0 && documentParse) {
    return seal({ ...base, disposition: 'unavailable', blockedBy: 'document_parse:empty_content', document: documentSummary, stats });
  }
  if (items.length === 0 && transcript) {
    return seal({ ...base, disposition: 'unavailable', blockedBy: 'media_transcript:empty_content', transcript: transcriptSummary, stats });
  }
  return seal({
    ...base,
    disposition: 'ready',
    canonical: {
      document: { schemaVersion: GENERIC_ARCHIVE_ITEMS_SCHEMA_V2, items },
      items: planned,
      submitVia: DIGITAL_TWIN_CANDIDATE_SUBMIT_VIA,
      writesCanonicalState: false,
    },
    ...(acquisitionSummary ? { acquisition: acquisitionSummary } : {}),
    ...(documentSummary ? { document: documentSummary } : {}),
    ...(transcriptSummary ? { transcript: transcriptSummary } : {}),
    stats,
  });
}

export function decodeDigitalTwinIntakePlanV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinIntakePlanV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['plan must be an object']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) {
    return fail('unknown_schema_version', [`schemaVersion=${String(input.schemaVersion)}`]);
  }
  const extra = unknownKeys(input, [
    'schemaVersion',
    'planRef',
    'profileRef',
    'sourceKind',
    'rights',
    'facet',
    'disposition',
    'blockedBy',
    'quarantineReason',
    'canonical',
    'acquisition',
    'document',
    'transcript',
    'stats',
    'planDigest',
    'createdAt',
  ]);
  if (extra.length > 0) return fail('unknown_field', extra);
  if (input.acquisition !== undefined) {
    const acquisition = input.acquisition;
    if (!isRecord(acquisition) || 'text' in acquisition) return fail('invalid_shape', ['acquisition must not carry page text']);
    if (!isNonEmptyString(acquisition.finalUrl) || !isDigestRef(acquisition.snapshotDigest) || !isIsoTimestamp(acquisition.fetchedAt)) {
      return fail('invalid_shape', ['acquisition']);
    }
  }
  if (input.document !== undefined) {
    const document = input.document;
    if (!isRecord(document) || 'text' in document || 'locations' in document) return fail('invalid_shape', ['document must not carry extracted text']);
    if (!isDigestRef(document.snapshotDigest) || !isIsoTimestamp(document.parsedAt)) return fail('invalid_shape', ['document']);
  }
  if (input.transcript !== undefined) {
    const transcript = input.transcript;
    if (!isRecord(transcript) || 'text' in transcript || 'segments' in transcript) return fail('invalid_shape', ['transcript must not carry segment text']);
    if (!isDigestRef(transcript.snapshotDigest) || !isIsoTimestamp(transcript.transcribedAt)) return fail('invalid_shape', ['transcript']);
  }
  if (!isDigitalTwinRefV1(input.planRef) || input.planRef.kind !== 'intake_plan') return fail('invalid_ref', ['planRef']);
  if (!isDigitalTwinRefV1(input.profileRef) || input.profileRef.kind !== 'digital_twin_profile') return fail('invalid_ref', ['profileRef']);
  if (!isMember(DIGITAL_TWIN_INTAKE_SOURCE_KINDS_V1, input.sourceKind)) return fail('invalid_enum', ['sourceKind']);
  if (!isMember(DIGITAL_TWIN_INTAKE_RIGHTS_V1, input.rights)) return fail('invalid_enum', ['rights']);
  if (!isMember(DIGITAL_TWIN_FACETS_V1, input.facet)) return fail('invalid_enum', ['facet']);
  if (!isMember(DIGITAL_TWIN_INTAKE_DISPOSITIONS_V1, input.disposition)) return fail('invalid_enum', ['disposition']);
  if (input.disposition === 'unavailable' && !isNonEmptyString(input.blockedBy)) return fail('invalid_shape', ['blockedBy']);
  if (input.disposition === 'quarantined' && input.quarantineReason !== 'rights_unknown') return fail('invalid_shape', ['quarantineReason']);
  if (input.disposition === 'ready') {
    const canonical = input.canonical;
    if (!isRecord(canonical) || canonical.writesCanonicalState !== false || canonical.submitVia !== DIGITAL_TWIN_CANDIDATE_SUBMIT_VIA) {
      return fail('invalid_shape', ['canonical']);
    }
    if (!isRecord(canonical.document) || canonical.document.schemaVersion !== GENERIC_ARCHIVE_ITEMS_SCHEMA_V2 || !Array.isArray(canonical.document.items)) {
      return fail('invalid_shape', ['canonical.document']);
    }
    if (!Array.isArray(canonical.items) || canonical.items.length !== canonical.document.items.length) {
      return fail('invalid_shape', ['canonical.items must align with document.items']);
    }
  } else if (input.canonical !== undefined) {
    return fail('invalid_shape', ['canonical must be absent unless ready']);
  }
  if (!isRecord(input.stats)) return fail('invalid_shape', ['stats']);
  if (!isDigestRef(input.planDigest)) return fail('invalid_shape', ['planDigest']);
  if (!isIsoTimestamp(input.createdAt)) return fail('invalid_timestamp', ['createdAt']);
  return { ok: true, value: input as unknown as DigitalTwinIntakePlanV1 };
}
