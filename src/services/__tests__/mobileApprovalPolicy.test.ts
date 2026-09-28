/**
 * M0-d (2026-09-27) — negative tests: the phone cannot approve what it must
 * not approve, and every decision echoes the backend request digest.
 * M3-a (2026-09-28) — tightened to mirror the backend's response policy:
 * L2 is reject-only (approve needs receipt refs), L3 / unknown risk and
 * expired approvals offer nothing on the phone.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const apiFetch = jest.fn() as jest.MockedFunction<
  (path: string, options?: RequestInit) => Promise<any>
>;
jest.mock('../api', () => ({
  apiFetch: (p: string, options?: RequestInit) => apiFetch(p, options),
}));

import {
  MOBILE_APPROVAL_BLOCKED,
  buildMobileApprovalResponse,
  mobileApprovalCapabilities,
} from '../mobileApprovalPolicy';
import { respondToDesktopApproval, type MobileDesktopApproval } from '../desktopSync';

const NOW = Date.parse('2026-09-27T12:00:00Z');
const FUTURE = '2026-09-27T12:05:00Z';
const PAST = '2026-09-27T11:59:00Z';

function approval(overrides: Partial<MobileDesktopApproval> = {}): MobileDesktopApproval {
  return {
    approvalId: 'appr-1',
    deviceId: 'desk-1',
    taskId: 'task-1',
    title: 'Run tests',
    description: 'npm test',
    riskLevel: 'L1',
    status: 'pending',
    requestedAt: '2026-09-27T11:58:00Z',
    requestDigest: 'a'.repeat(64),
    expiresAt: FUTURE,
    ...overrides,
  };
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ ok: true });
});

describe('mobileApprovalCapabilities', () => {
  it.each(['L0', 'L1'])('%s pending and unexpired: approve and reject', (riskLevel) => {
    expect(mobileApprovalCapabilities(approval({ riskLevel: riskLevel as any }), NOW)).toEqual({ canApprove: true, canReject: true });
  });

  it('L2 is reject-only: approving needs receipt refs the phone cannot produce', () => {
    expect(mobileApprovalCapabilities(approval({ riskLevel: 'L2' }), NOW)).toEqual({
      canApprove: false,
      canReject: true,
      approveBlockedReason: 'requires_receipt_refs',
    });
  });

  it.each(['L3', 'L4', '', 'l1', undefined])('risk %p offers nothing on the phone (computer decides)', (riskLevel) => {
    expect(mobileApprovalCapabilities(approval({ riskLevel: riskLevel as any }), NOW)).toEqual({
      canApprove: false,
      canReject: false,
      approveBlockedReason: 'requires_local_confirmation',
      rejectBlockedReason: 'requires_local_confirmation',
    });
  });

  it.each([PAST, 'not-a-date'])('expired / unparsable expiry %p offers nothing', (expiresAt) => {
    expect(mobileApprovalCapabilities(approval({ expiresAt }), NOW)).toMatchObject({
      canApprove: false,
      canReject: false,
      approveBlockedReason: 'expired',
      rejectBlockedReason: 'expired',
    });
  });

  it.each(['approved', 'rejected', 'cancelled'])('status %s allows nothing', (status) => {
    expect(mobileApprovalCapabilities(approval({ status: status as any }), NOW)).toMatchObject({ canApprove: false, canReject: false });
  });

  it('missing id allows nothing', () => {
    expect(mobileApprovalCapabilities(approval({ approvalId: '  ' }), NOW)).toMatchObject({ canApprove: false, canReject: false });
    expect(mobileApprovalCapabilities(null, NOW)).toMatchObject({ canApprove: false, canReject: false });
  });
});

describe('buildMobileApprovalResponse', () => {
  it('echoes requestDigest and never sends rememberForSession', () => {
    const body = buildMobileApprovalResponse(approval(), 'approved', NOW);
    expect(body).toEqual({ decision: 'approved', requestDigest: 'a'.repeat(64) });
    expect(body).not.toHaveProperty('rememberForSession');
  });

  it('allows rejecting an L2 approval with the digest', () => {
    expect(buildMobileApprovalResponse(approval({ riskLevel: 'L2' }), 'rejected', NOW)).toEqual({
      decision: 'rejected',
      requestDigest: 'a'.repeat(64),
    });
  });

  it.each([
    [approval({ riskLevel: 'L3' }), 'requires_local_confirmation'],
    [approval({ riskLevel: 'L2' }), 'requires_receipt_refs'],
    [approval({ expiresAt: PAST }), 'expired'],
    [approval({ status: 'approved' }), 'not_pending'],
  ])('refuses to approve %#', (input, reason) => {
    expect(() => buildMobileApprovalResponse(input, 'approved', NOW)).toThrow(MOBILE_APPROVAL_BLOCKED);
    try {
      buildMobileApprovalResponse(input, 'approved', NOW);
    } catch (error) {
      expect((error as { reason: string }).reason).toBe(reason);
    }
  });

  it.each([
    [approval({ riskLevel: 'L3' }), 'requires_local_confirmation'],
    [approval({ riskLevel: 'unknown' as any }), 'requires_local_confirmation'],
    [approval({ expiresAt: PAST }), 'expired'],
    [approval({ status: 'rejected' }), 'not_pending'],
  ])('refuses to reject %#', (input, reason) => {
    expect(() => buildMobileApprovalResponse(input, 'rejected', NOW)).toThrow(MOBILE_APPROVAL_BLOCKED);
    try {
      buildMobileApprovalResponse(input, 'rejected', NOW);
    } catch (error) {
      expect((error as { reason: string }).reason).toBe(reason);
    }
  });
});

describe('respondToDesktopApproval', () => {
  it('refuses an L3 approve before any network call', async () => {
    await expect(respondToDesktopApproval(approval({ riskLevel: 'L3', expiresAt: undefined }), 'approved')).rejects.toMatchObject({
      code: MOBILE_APPROVAL_BLOCKED,
    });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('refuses an L3 reject and an L2 approve before any network call', async () => {
    await expect(respondToDesktopApproval(approval({ riskLevel: 'L3', expiresAt: undefined }), 'rejected')).rejects.toMatchObject({
      code: MOBILE_APPROVAL_BLOCKED,
      reason: 'requires_local_confirmation',
    });
    await expect(respondToDesktopApproval(approval({ riskLevel: 'L2', expiresAt: undefined }), 'approved')).rejects.toMatchObject({
      code: MOBILE_APPROVAL_BLOCKED,
      reason: 'requires_receipt_refs',
    });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('sends reject for L2 with the digest', async () => {
    await respondToDesktopApproval(approval({ riskLevel: 'L2', expiresAt: undefined }), 'rejected');
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [p, options] = apiFetch.mock.calls[0];
    expect(p).toBe('/desktop-sync/approvals/appr-1/respond');
    expect(JSON.parse(String(options?.body))).toEqual({ decision: 'rejected', requestDigest: 'a'.repeat(64) });
  });

  it('sends approve for L1 without rememberForSession', async () => {
    await respondToDesktopApproval(approval({ expiresAt: undefined }), 'approved');
    const body = JSON.parse(String(apiFetch.mock.calls[0][1]?.body));
    expect(body).toEqual({ decision: 'approved', requestDigest: 'a'.repeat(64) });
  });
});

describe('DesktopControlScreen (source guard)', () => {
  const screen = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'agent', 'DesktopControlScreen.tsx'), 'utf8');

  it('gates the approve button on mobileApprovalCapabilities', () => {
    expect(screen).toMatch(/mobileApprovalCapabilities\(approval\)/);
    expect(screen).toMatch(/\{caps\.canApprove \? \(/);
    expect(screen).not.toMatch(/rememberForSession/);
  });
});
