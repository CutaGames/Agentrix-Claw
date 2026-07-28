/**
 * P1-05 · Shared Client Platform — cross-platform entry.
 *
 * Web / Mobile / Desktop import from here and inject only their own
 * {@link HttpTransportV1}. Error vocabulary, schema-version negotiation,
 * fallback and typed clients are shared (no per-platform duplication).
 */
export * from './errors';
export * from './transport';
export * from './soul-core-client';
export * from './agent-economy-client';
export * from './agent-economy-receipt-client';
