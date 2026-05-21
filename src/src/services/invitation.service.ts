import { apiFetch } from './api';

/**
 * Validate an invitation code (no auth required).
 */
export async function validateInvitationCode(
  code: string,
): Promise<{ valid: boolean; code: string; message: string }> {
  return apiFetch('/invitation/validate', {
    method: 'POST',
    body: JSON.stringify({ code: code.trim().toUpperCase() }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Redeem an invitation code (must be authenticated).
 */
export async function redeemInvitationCode(
  code: string,
): Promise<{ success: boolean; message: string }> {
  return apiFetch('/invitation/redeem', {
    method: 'POST',
    body: JSON.stringify({ code: code.trim().toUpperCase() }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Check if current user has a valid invitation.
 */
export async function checkInvitationStatus(): Promise<{ hasInvitation: boolean }> {
  return apiFetch('/invitation/status');
}
