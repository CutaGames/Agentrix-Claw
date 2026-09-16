import {
  PUSH_NOTIFICATION_TYPES,
  PUSH_TYPE_TO_CHANNEL,
  RETIRED_PUSH_NOTIFICATION_TYPES,
  pushDestinationErrorPath,
  resolvePushDestination,
} from '../pushDestination';

describe('MTR-R04.2/.3 — push destination resolution', () => {
  it('routes every current notification type to a channel', () => {
    expect(Object.keys(PUSH_TYPE_TO_CHANNEL).sort()).toEqual([...PUSH_NOTIFICATION_TYPES].sort());
    expect(Object.values(PUSH_TYPE_TO_CHANNEL).sort()).toEqual([
      'agenda',
      'approvals',
      'calls',
      'handoff',
      'twin_critical',
      'twin_review',
    ]);
  });

  it('resolves incoming_call to the ringing surface', () => {
    expect(
      resolvePushDestination({
        type: 'incoming_call',
        callSessionRef: 'call_01H',
        expiresAt: '2026-09-15T12:00:00.000Z',
      }),
    ).toEqual({
      ok: true,
      type: 'incoming_call',
      surface: 'call_ringing',
      params: { callSessionRef: 'call_01H', expiresAt: '2026-09-15T12:00:00.000Z' },
    });
  });

  it('resolves approval_required and keeps risk/expiry', () => {
    expect(
      resolvePushDestination({
        type: 'approval_required',
        approvalRef: 'apr_42',
        risk: 'high',
        expiresAt: '2026-09-15T12:00:00.000Z',
      }),
    ).toEqual({
      ok: true,
      type: 'approval_required',
      surface: 'work_inbox_approval',
      params: { approvalRef: 'apr_42', risk: 'high', expiresAt: '2026-09-15T12:00:00.000Z' },
    });
  });

  it('downgrades an unrecognised risk to unknown rather than guessing', () => {
    const result = resolvePushDestination({
      type: 'approval_required',
      approvalRef: 'apr_42',
      risk: 'critical',
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.params.risk).toBe('unknown');
  });

  it('ignores an unparseable expiry instead of inventing one', () => {
    const result = resolvePushDestination({
      type: 'approval_required',
      approvalRef: 'apr_42',
      expiresAt: 'soon',
    });
    expect(result.ok && result.params.expiresAt).toBeUndefined();
  });

  it.each([
    ['twin_critical', { twinProfileRef: 'twin_1', reasonCode: 'provider_revoke_failed' }, 'twin_status_card'],
    ['twin_review_required', { reviewBatchRef: 'batch_9', count: 3 }, 'work_inbox_twin_review'],
    ['agenda_reminder', { scheduleItemRef: 'sch_7' }, 'work_agenda_today'],
    ['handoff_ready', { handoffRef: 'ho_3' }, 'work_handoff'],
  ])('resolves %s to %s', (type, payload, surface) => {
    const result = resolvePushDestination({ type, ...(payload as object) });
    expect(result.ok).toBe(true);
    expect(result.ok && result.surface).toBe(surface);
  });

  it.each([...PUSH_NOTIFICATION_TYPES])('fails closed when %s has no opaque ref', (type) => {
    expect(resolvePushDestination({ type })).toEqual({
      ok: false,
      reason: 'missing_required_ref',
      type,
    });
  });

  it.each([
    'file:///etc/passwd',
    '../../destination-error',
    'ref with space',
    '',
  ])('rejects unsafe ref %p', (approvalRef) => {
    expect(resolvePushDestination({ type: 'approval_required', approvalRef })).toEqual({
      ok: false,
      reason: 'missing_required_ref',
      type: 'approval_required',
    });
  });

  it('falls back to unknown_notification_type', () => {
    expect(resolvePushDestination({ type: 'something_new' })).toEqual({
      ok: false,
      reason: 'unknown_notification_type',
      type: 'something_new',
    });
    expect(resolvePushDestination({})).toEqual({
      ok: false,
      reason: 'unknown_notification_type',
    });
  });

  it.each([null, undefined, 42, 'approval_required', []])(
    'rejects a non-object payload %p',
    (payload) => {
      expect(resolvePushDestination(payload)).toEqual({ ok: false, reason: 'invalid_payload' });
    },
  );

  describe('retired dead-module types (design §6)', () => {
    it('retires the airdrop family', () => {
      for (const type of ['airdrop_available', 'airdrop_claimed']) {
        expect(resolvePushDestination({ type })).toEqual({
          ok: false,
          reason: 'legacy_route_retired',
          type,
        });
      }
    });

    it.each([
      ['earning_received', 'economy_orders'],
      ['payment_received', 'economy_orders'],
      ['payment_sent', 'economy_orders'],
      ['settlement_ready', 'economy_orders'],
      ['task_assigned', 'work_inbox_approval'],
      ['task_completed', 'work_inbox_approval'],
      ['milestone_approved', 'work_receipt'],
    ])('migrates %s to %s', (type, surface) => {
      const result = resolvePushDestination({ type });
      expect(result.ok).toBe(true);
      expect(result.ok && result.surface).toBe(surface);
      expect(result.ok && result.type).toBe(type);
    });

    it('covers every retired type exactly once', () => {
      const covered = RETIRED_PUSH_NOTIFICATION_TYPES.map((type) =>
        resolvePushDestination({ type }));
      expect(covered).toHaveLength(9);
      expect(covered.every((entry) => (
        entry.ok === true ? true : entry.reason === 'legacy_route_retired'
      ))).toBe(true);
    });
  });

  it('serialises destination-error to the shared path contract', () => {
    expect(pushDestinationErrorPath('unknown_notification_type'))
      .toBe('/destination-error?reason=unknown_notification_type');
  });
});
