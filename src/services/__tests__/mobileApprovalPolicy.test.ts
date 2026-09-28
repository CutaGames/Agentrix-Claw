/**
 * M0-d (2026-09-27) — negative tests: the phone cannot approve what it must
 * not approve, and every decision echoes the backend request digest.
 * Since 09-28 on the approval-card contract v1 (REQ-backend-019): reject any
 * level (also expired) with the digest only; approve L0 / L1 only.
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
import { approvalActionAvailableV1 } from '../../../shared/types/approval-card';
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

describe('mobileApprovalCapabilities (approval-card contract v1)', () => {
  it.each(['L0', 'L1'])('%s pending and unexpired: approve and reject', (riskLevel) => {
    expect(mobileApprovalCapabilities(approval({ riskLevel: riskLevel as any }), NOW)).toEqual({ canApprove: true, canReject: true });
  });

  it.each(['L2', 'L3', 'L4', '', 'l1', undefined])('risk %p: reject here, approve on the computer that asked', (riskLevel) => {
    expect(mobileApprovalCapabilities(approval({ riskLevel: riskLevel as any }), NOW)).toEqual({
      canApprove: false,
      canReject: true,
      approveBlockedReason: 'requires_local_confirmation',
    });
  });

  it.each([PAST, 'not-a-date'])('expired / unparsable expiry %p: reject only', (expiresAt) => {
    expect(mobileApprovalCapabilities(approval({ expiresAt }), NOW)).toEqual({ canApprove: false, canReject: true, approveBlockedReason: 'expired' });
    expect(mobileApprovalCapabilities(approval({ expiresAt, riskLevel: 'L3' }), NOW)).toMatchObject({ canApprove: false, canReject: true });
  });

  it("the backend's expired projection is honoured even with a future expiry", () => {
    expect(mobileApprovalCapabilities(approval({ status: 'expired' as any }), NOW)).toMatchObject({ canApprove: false, canReject: true, approveBlockedReason: 'expired' });
  });

  it.each(['approved', 'rejected', 'cancelled'])('status %s allows nothing', (status) => {
    expect(mobileApprovalCapabilities(approval({ status: status as any }), NOW)).toMatchObject({ canApprove: false, canReject: false });
  });

  it('missing id or request digest allows nothing', () => {
    expect(mobileApprovalCapabilities(approval({ approvalId: '  ' }), NOW)).toMatchObject({ canApprove: false, canReject: false });
    expect(mobileApprovalCapabilities(null, NOW)).toMatchObject({ canApprove: false, canReject: false });
    for (const requestDigest of [undefined, '', 'abc', 'A'.repeat(64)]) {
      expect(mobileApprovalCapabilities(approval({ requestDigest }), NOW)).toEqual({
        canApprove: false,
        canReject: false,
        approveBlockedReason: 'missing_request_digest',
        rejectBlockedReason: 'missing_request_digest',
      });
    }
  });

  it('matches the contract helper for every level and status on a surface that cannot sign', () => {
    for (const riskLevel of ['L0', 'L1', 'L2', 'L3', 'X']) {
      for (const status of ['pending', 'expired', 'approved', 'rejected'] as const) {
        const caps = mobileApprovalCapabilities(approval({ riskLevel: riskLevel as any, status: status as any }), NOW);
        const input = { riskLevel, status, onRequestingDevice: false, canSignLocally: false };
        expect([riskLevel, status, caps.canApprove, caps.canReject]).toEqual([
          riskLevel,
          status,
          approvalActionAvailableV1({ ...input, decision: 'approved' }),
          approvalActionAvailableV1({ ...input, decision: 'rejected' }),
        ]);
      }
    }
  });
});

describe('buildMobileApprovalResponse', () => {
  it('sends only decision + requestDigest, never rememberForSession', () => {
    const body = buildMobileApprovalResponse(approval(), 'approved', NOW);
    expect(body).toEqual({ decision: 'approved', requestDigest: 'a'.repeat(64) });
    expect(body).not.toHaveProperty('rememberForSession');
  });

  it.each(['L2', 'L3', 'unknown'])('rejecting %s needs only the digest', (riskLevel) => {
    expect(buildMobileApprovalResponse(approval({ riskLevel: riskLevel as any }), 'rejected', NOW)).toEqual({
      decision: 'rejected',
      requestDigest: 'a'.repeat(64),
    });
  });

  it('rejecting an expired approval is allowed', () => {
    expect(buildMobileApprovalResponse(approval({ expiresAt: PAST, riskLevel: 'L3' }), 'rejected', NOW)).toEqual({ decision: 'rejected', requestDigest: 'a'.repeat(64) });
  });

  it.each([
    [approval({ riskLevel: 'L3' }), 'requires_local_confirmation'],
    [approval({ riskLevel: 'L2' }), 'requires_local_confirmation'],
    [approval({ expiresAt: PAST }), 'expired'],
    [approval({ status: 'approved' }), 'not_pending'],
    [approval({ requestDigest: undefined }), 'missing_request_digest'],
  ])('refuses to approve %#', (input, reason) => {
    expect(() => buildMobileApprovalResponse(input, 'approved', NOW)).toThrow(MOBILE_APPROVAL_BLOCKED);
    try {
      buildMobileApprovalResponse(input, 'approved', NOW);
    } catch (error) {
      expect((error as { reason: string }).reason).toBe(reason);
    }
  });

  it.each([
    [approval({ status: 'rejected' }), 'not_pending'],
    [approval({ requestDigest: 'short' }), 'missing_request_digest'],
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
  it('refuses an L2 / L3 approve before any network call', async () => {
    for (const riskLevel of ['L2', 'L3'] as const) {
      await expect(respondToDesktopApproval(approval({ riskLevel, expiresAt: undefined }), 'approved')).rejects.toMatchObject({
        code: MOBILE_APPROVAL_BLOCKED,
        reason: 'requires_local_confirmation',
      });
    }
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('sends reject for L3 with the digest only', async () => {
    await respondToDesktopApproval(approval({ riskLevel: 'L3', expiresAt: undefined }), 'rejected');
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
