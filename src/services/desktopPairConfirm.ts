/**
 * Reading a refused `POST /auth/desktop-pair/confirm` (REQ-backend-049).
 *
 * Since `b5ff2c2d` the backend confirms a desktop / web pairing only for the owner's own
 * sign-in token; anything else (an MCP / OAuth client token, a guest token) gets 403
 * `{ code: 'sign_in_required' }` and nothing is signed. That is not "the QR code expired":
 * retrying cannot help, the owner has to sign in again on the phone and scan again.
 *
 * Pure, so it is testable without the Expo modules `auth.ts` pulls in.
 */
export const DESKTOP_PAIR_SIGN_IN_REQUIRED_CODE = 'sign_in_required' as const;

/** The pairing needs a fresh sign-in on the phone; never retried. */
export class DesktopPairSignInRequiredError extends Error {
  readonly code = DESKTOP_PAIR_SIGN_IN_REQUIRED_CODE;
  constructor() {
    super('Sign in again on this phone, then scan the code again.');
    this.name = 'DesktopPairSignInRequiredError';
  }
}

export function isDesktopPairSignInRequiredError(error: unknown): error is DesktopPairSignInRequiredError {
  return error instanceof DesktopPairSignInRequiredError || (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === DESKTOP_PAIR_SIGN_IN_REQUIRED_CODE && (error as { name?: unknown }).name === 'DesktopPairSignInRequiredError');
}

/** The error to throw for a non-2xx confirm response. */
export function desktopPairConfirmError(status: number, bodyText: string): Error {
  let body: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(bodyText);
    body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  const nested = body && typeof body.message === 'object' && body.message !== null ? (body.message as Record<string, unknown>) : null;
  const code = typeof body?.code === 'string' ? body.code : typeof nested?.code === 'string' ? nested.code : null;
  if (status === 403 && code === DESKTOP_PAIR_SIGN_IN_REQUIRED_CODE) return new DesktopPairSignInRequiredError();
  const message = typeof body?.message === 'string' ? body.message : typeof body?.error === 'string' ? body.error : bodyText || `Request failed: ${status}`;
  return new Error(message);
}
