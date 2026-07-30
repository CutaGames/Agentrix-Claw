export const MOBILE_V6_TELEMETRY_EVENTS = [
  'mobile_boot_started',
  'mobile_boot_completed',
  'mobile_boot_failed',
  'mobile_auth_restore_result',
  'mobile_inbound_received',
  'mobile_inbound_resolved',
  'mobile_inbound_queued',
  'mobile_inbound_consumed',
  'mobile_inbound_rejected',
  'mobile_inbound_expired',
  'mobile_route_legacy_resolved',
  'mobile_trust_section_loaded',
  'mobile_trust_section_degraded',
  'mobile_assurance_downgraded',
  'mobile_hardware_gate_result',
  'mobile_nfc_state_changed',
  'mobile_nfc_failed',
  'mobile_nfc_cancelled',
  'mobile_nfc_completed',
  'mobile_flag_evaluated',
] as const;

export type MobileV6TelemetryEventName = (typeof MOBILE_V6_TELEMETRY_EVENTS)[number];
export type MobileV6TelemetryPrimitive = string | number | boolean | null;

export interface MobileV6TelemetryEvent {
  eventName: MobileV6TelemetryEventName;
  occurredAt: number;
  props: Readonly<Record<string, MobileV6TelemetryPrimitive>>;
}

export type MobileV6TelemetrySink = (
  event: MobileV6TelemetryEvent,
) => void | Promise<void>;

const EVENT_NAMES: ReadonlySet<string> = new Set(MOBILE_V6_TELEMETRY_EVENTS);
const ALLOWED_PROP_KEYS: ReadonlySet<string> = new Set([
  'correlationId',
  'requestId',
  'routeId',
  'source',
  'result',
  'reasonCode',
  'legacyRouteId',
  'canonicalRouteId',
  'flagName',
  'enabled',
  'readKind',
  'capability',
  'evidenceLevel',
  'adapter',
  'state',
  'platform',
  'schemaVersion',
  'durationMs',
  'soulCoreIdHash',
  'actionIdHash',
  'taskIdHash',
  'intentIdHash',
  'dedupeKeyHash',
]);
const HASH_KEYS: ReadonlySet<string> = new Set([
  'soulCoreIdHash',
  'actionIdHash',
  'taskIdHash',
  'intentIdHash',
  'dedupeKeyHash',
]);
const SAFE_HASH = /^[A-Za-z0-9_-]{8,128}$/;
const MAX_STRING_LENGTH = 160;

let sink: MobileV6TelemetrySink | null = null;

export function isMobileV6TelemetryEventName(value: unknown): value is MobileV6TelemetryEventName {
  return typeof value === 'string' && EVENT_NAMES.has(value);
}

export function sanitizeMobileV6TelemetryProps(
  props?: Record<string, unknown>,
): Readonly<Record<string, MobileV6TelemetryPrimitive>> {
  if (!props) return Object.freeze({});

  const sanitized: Record<string, MobileV6TelemetryPrimitive> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!ALLOWED_PROP_KEYS.has(key)) continue;
    if (value === null) {
      sanitized[key] = null;
      continue;
    }
    if (typeof value === 'boolean') {
      sanitized[key] = value;
      continue;
    }
    if (typeof value === 'number') {
      if (Number.isFinite(value)) sanitized[key] = value;
      continue;
    }
    if (typeof value !== 'string') continue;
    if (HASH_KEYS.has(key) && !SAFE_HASH.test(value)) continue;
    sanitized[key] = value.slice(0, MAX_STRING_LENGTH);
  }

  return Object.freeze(sanitized);
}

export function createMobileV6TelemetryEvent(
  eventName: MobileV6TelemetryEventName,
  props?: Record<string, unknown>,
  occurredAt = Date.now(),
): MobileV6TelemetryEvent {
  if (!isMobileV6TelemetryEventName(eventName)) {
    throw new Error('Unsupported Mobile V6 telemetry event');
  }
  return Object.freeze({
    eventName,
    occurredAt,
    props: sanitizeMobileV6TelemetryProps(props),
  });
}

/**
 * Configure an opt-in-aware sink. The default is intentionally no-op; bootstrap
 * must only provide a sink after the existing analytics privacy gate allows it.
 */
export function configureMobileV6TelemetrySink(
  nextSink: MobileV6TelemetrySink | null,
): () => void {
  sink = nextSink;
  return () => {
    if (sink === nextSink) sink = null;
  };
}

export function resetMobileV6TelemetrySink(): void {
  sink = null;
}

/** Telemetry must never break navigation, auth, trust rendering, or NFC flows. */
export function emitMobileV6Telemetry(
  eventName: MobileV6TelemetryEventName,
  props?: Record<string, unknown>,
): MobileV6TelemetryEvent {
  const event = createMobileV6TelemetryEvent(eventName, props);
  if (!sink) return event;

  try {
    const result = sink(event);
    if (result && typeof (result as Promise<void>).catch === 'function') {
      void (result as Promise<void>).catch(() => undefined);
    }
  } catch {
    // Deliberately swallowed: telemetry is never a product control path.
  }
  return event;
}
