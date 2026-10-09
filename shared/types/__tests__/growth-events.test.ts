import {
  CLIENT_REPORTABLE_FUNNEL_EVENTS,
  FUNNEL_EVENT_NAMES,
  FUNNEL_EVENT_PROP_KEYS,
  REAL_ACTION_EVENTS,
  allowedFunnelMetadataKeys,
  isClientReportableFunnelEvent,
  isFunnelEventName,
  isRealActionEvent,
  resolveAttributionRef,
  sanitizeFunnelMetadata,
} from '../growth-events';

describe('growth-events contract (T4-04 / MGA-1.1)', () => {
  it('freezes the 15 stored events and keeps first_real_action derived', () => {
    expect(FUNNEL_EVENT_NAMES).toHaveLength(15);
    expect(new Set(FUNNEL_EVENT_NAMES).size).toBe(15);
    expect((FUNNEL_EVENT_NAMES as readonly string[]).includes('first_real_action')).toBe(false);
    // every stored event fits the existing varchar(24) column
    for (const name of FUNNEL_EVENT_NAMES) expect(name.length).toBeLessThanOrEqual(24);
    // every event has a prop-key row
    for (const name of FUNNEL_EVENT_NAMES) expect(FUNNEL_EVENT_PROP_KEYS[name]).toBeDefined();
  });

  it('real-action and client-reportable sets are subsets of the stored events', () => {
    for (const e of REAL_ACTION_EVENTS) expect(isFunnelEventName(e)).toBe(true);
    for (const e of CLIENT_REPORTABLE_FUNNEL_EVENTS) expect(isFunnelEventName(e)).toBe(true);
    expect(isRealActionEvent('remote_task_approved')).toBe(true);
    expect(isRealActionEvent('signup')).toBe(false);
    expect(isClientReportableFunnelEvent('visit')).toBe(true);
    // server-only events must never be client reportable
    expect(isClientReportableFunnelEvent('signup')).toBe(false);
    expect(isClientReportableFunnelEvent('paid')).toBe(false);
    expect(isClientReportableFunnelEvent('first_economy_settlement')).toBe(false);
  });

  it('whitelists metadata keys per event (common ∪ event-specific)', () => {
    const keys = allowedFunnelMetadataKeys('paid');
    expect(keys.has('utm_source')).toBe(true);
    expect(keys.has('plan')).toBe(true);
    expect(keys.has('provider')).toBe(false); // byo_connected only
    const r = sanitizeFunnelMetadata('paid', { plan: 'pro', cycle: 'monthly', provider: 'openai' });
    expect(r.ok).toBe(false);
    expect(r.metadata).toEqual({ plan: 'pro', cycle: 'monthly' });
    expect(r.rejected).toEqual([{ key: 'provider', reason: 'unknown_key' }]);
  });

  it('rejects PII-looking values and free text, keeps short slugs / numbers / booleans', () => {
    const r = sanitizeFunnelMetadata('signup', {
      method: 'oauth_google',
      invited: true,
      utm_source: 'someone@example.com',
      utm_content: '13812345678',
      src: 'this is a long free text sentence about the user',
      utm_campaign: 'x'.repeat(65),
      lang: 'zh',
      agent_id: 42,
    });
    expect(r.metadata).toEqual({ method: 'oauth_google', invited: true, lang: 'zh', agent_id: 42 });
    const reasons = Object.fromEntries(r.rejected.map((x) => [x.key, x.reason]));
    expect(reasons).toEqual({
      utm_source: 'pii_like',
      utm_content: 'pii_like',
      src: 'pii_like',
      utm_campaign: 'too_long',
    });
  });

  it('never throws on null / non-object input', () => {
    expect(sanitizeFunnelMetadata('visit', null)).toEqual({ ok: true, metadata: {}, rejected: [] });
    expect(sanitizeFunnelMetadata('visit', undefined).ok).toBe(true);
    expect(sanitizeFunnelMetadata('visit', 'nope' as any).metadata).toEqual({});
  });

  it('resolves attributionRef with ref > kol > src > utm_source precedence', () => {
    expect(resolveAttributionRef({ ref: 'ABC', kol: 'k', src: 's', utm_source: 'x' })).toBe('ABC');
    expect(resolveAttributionRef({ kol: ' k1 ', src: 's' })).toBe('k1');
    expect(resolveAttributionRef({ src: 'cursor' })).toBe('cursor');
    expect(resolveAttributionRef({ utm_source: 'x' })).toBe('x');
    expect(resolveAttributionRef({ ref: '', kol: undefined })).toBeNull();
    expect(resolveAttributionRef({})).toBeNull();
  });
});
