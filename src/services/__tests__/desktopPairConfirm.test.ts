/**
 * REQ-backend-049 (2026-09-29): the backend confirms a desktop / web pairing only for a sign-in
 * token and answers anything else with 403 `sign_in_required`. The phone must say "sign in again",
 * not "the QR code expired", and must not retry.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import {
  DesktopPairSignInRequiredError,
  desktopPairConfirmError,
  isDesktopPairSignInRequiredError,
} from '../desktopPairConfirm';

describe('desktopPairConfirmError', () => {
  it('403 sign_in_required becomes the sign-in error (Nest body, or nested once more)', () => {
    const flat = desktopPairConfirmError(403, JSON.stringify({ code: 'sign_in_required', message: 'confirm the pairing from a signed-in app' }));
    expect(flat).toBeInstanceOf(DesktopPairSignInRequiredError);
    expect(isDesktopPairSignInRequiredError(flat)).toBe(true);
    const nested = desktopPairConfirmError(403, JSON.stringify({ statusCode: 403, message: { code: 'sign_in_required' } }));
    expect(isDesktopPairSignInRequiredError(nested)).toBe(true);
  });

  it('anything else keeps the server message and is not the sign-in error', () => {
    const cases: Array<[number, string, string]> = [
      [404, JSON.stringify({ message: 'Pairing session not found' }), 'Pairing session not found'],
      [403, JSON.stringify({ code: 'forbidden', message: 'no' }), 'no'],
      [401, JSON.stringify({ error: 'Unauthorized' }), 'Unauthorized'],
      [502, '<html>bad gateway</html>', '<html>bad gateway</html>'],
      [500, '', 'Request failed: 500'],
      // The code alone on another status is not enough.
      [400, JSON.stringify({ code: 'sign_in_required', message: 'odd' }), 'odd'],
    ];
    for (const [status, body, message] of cases) {
      const error = desktopPairConfirmError(status, body);
      expect([status, isDesktopPairSignInRequiredError(error), error.message]).toEqual([status, false, message]);
    }
    expect(isDesktopPairSignInRequiredError(new Error('sign_in_required'))).toBe(false);
    expect(isDesktopPairSignInRequiredError(null)).toBe(false);
  });
});

describe('the scan screens stop retrying and ask for a sign-in', () => {
  const read = (...parts: string[]) => fs.readFileSync(path.resolve(__dirname, '..', '..', ...parts), 'utf8');
  it.each([
    ['screens/me/ScanScreen.tsx'],
    ['screens/onboarding/LocalDeployScreen.tsx'],
  ])('%s', (file) => {
    const source = read(...file.split('/'));
    expect(source).toMatch(/if \(isDesktopPairSignInRequiredError\((e|error)\)\) break;/);
    expect(source).toMatch(/if \(lastErr && isDesktopPairSignInRequiredError\(lastErr\)\) \{/);
    expect(source).toContain('请重新登录后再扫码。');
  });

  it('auth.ts reads the status for both confirm paths', () => {
    const auth = read('services', 'auth.ts');
    expect(auth).toMatch(/throw desktopPairConfirmError\(res\.status, /);
    expect(auth).toMatch(/return confirmDesktopPairWithApiBase\(sessionId\);/);
    expect(auth).not.toMatch(/apiFetch<\{ success: boolean \}>\('\/auth\/desktop-pair\/confirm'/);
  });
});
