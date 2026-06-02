/**
 * NFC Service — Sprint 4 Task 4.2
 *
 * Handles NFC tag reading and token extraction for blind box redemption.
 *
 * Flow:
 * 1. Start NFC scan session
 * 2. Read NDEF URI record (format: agentrix://nfc/<token>)
 * 3. Extract token
 * 4. Call backend POST /api/v1/clawcore/nfc/redeem { token }
 * 5. Return redeemed item (skin/soul/item)
 */
import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';
import { apiFetch } from './api';

// ── Types ──────────────────────────────────────────────────────────────────

export interface NfcRedeemItem {
  type: 'skin' | 'soul' | 'item';
  id: string;
  name: string;
  thumbnailUrl?: string;
}

export interface NfcRedeemResponse {
  success: boolean;
  item?: NfcRedeemItem;
  error?: 'already_redeemed' | 'invalid_token' | 'expired';
}

export type NfcStatus = 'supported' | 'not_supported' | 'disabled';

export class NfcError extends Error {
  code: 'not_supported' | 'disabled' | 'scan_cancelled' | 'no_ndef' | 'invalid_uri' | 'already_redeemed' | 'invalid_token' | 'expired' | 'unknown';

  constructor(code: NfcError['code'], message?: string) {
    super(message || code);
    this.code = code;
    this.name = 'NfcError';
  }
}

// ── NFC URI prefix ─────────────────────────────────────────────────────────

const NFC_URI_PREFIX = 'agentrix://nfc/';

// ── Service Functions ──────────────────────────────────────────────────────

/**
 * Check if NFC is supported and enabled on this device.
 */
export async function initNfc(): Promise<NfcStatus> {
  try {
    const supported = await NfcManager.isSupported();
    if (!supported) {
      return 'not_supported';
    }

    await NfcManager.start();

    const enabled = await NfcManager.isEnabled();
    if (!enabled) {
      return 'disabled';
    }

    return 'supported';
  } catch {
    return 'not_supported';
  }
}

/**
 * Start listening for NFC tags. Returns a Promise that resolves with the
 * extracted token from the NDEF URI record.
 *
 * The expected NDEF URI format is: agentrix://nfc/<token>
 */
export async function startNfcScan(): Promise<string> {
  try {
    // Request NFC technology
    await NfcManager.requestTechnology(NfcTech.Ndef);

    // Read the tag
    const tag = await NfcManager.getTag();

    if (!tag?.ndefMessage || tag.ndefMessage.length === 0) {
      throw new NfcError('no_ndef', 'No NDEF message found on this tag.');
    }

    // Parse the first NDEF record as a URI
    const record = tag.ndefMessage[0];
    let uri: string | null = null;

    // The NDEF library expects Uint8Array; coerce in case the native module
    // hands us a plain number[] / array-like buffer.
    const payload = record.payload instanceof Uint8Array
      ? record.payload
      : new Uint8Array(record.payload as unknown as number[]);

    try {
      uri = Ndef.uri.decodePayload(payload);
    } catch {
      // Fallback: try text decode
      try {
        uri = Ndef.text.decodePayload(payload);
      } catch {
        throw new NfcError('invalid_uri', 'Could not decode NDEF record.');
      }
    }

    if (!uri || !uri.startsWith(NFC_URI_PREFIX)) {
      throw new NfcError('invalid_uri', `Invalid NFC URI: ${uri || '(empty)'}`);
    }

    // Extract token from URI
    const token = uri.slice(NFC_URI_PREFIX.length).trim();
    if (!token) {
      throw new NfcError('invalid_uri', 'Empty token in NFC URI.');
    }

    return token;
  } catch (error: any) {
    if (error instanceof NfcError) throw error;

    // User cancelled the scan
    if (error?.message?.includes('cancelled') || error?.message?.includes('canceled')) {
      throw new NfcError('scan_cancelled', 'NFC scan was cancelled.');
    }

    throw new NfcError('unknown', error?.message || 'Unknown NFC error');
  } finally {
    // Always clean up the NFC session
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Cancel the current NFC scan session.
 */
export async function stopNfcScan(): Promise<void> {
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch {
    // Ignore — session may already be closed
  }
}

/**
 * Call the backend to redeem an NFC token.
 * POST /api/v1/clawcore/nfc/redeem { token }
 */
export async function redeemNfcToken(token: string): Promise<NfcRedeemResponse> {
  try {
    const response = await apiFetch<NfcRedeemResponse>('/api/v1/clawcore/nfc/redeem', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    return response;
  } catch (error: any) {
    // Parse known error codes from backend
    const message = error?.message || '';
    if (message.includes('already_redeemed')) {
      throw new NfcError('already_redeemed', 'This NFC token has already been redeemed.');
    }
    if (message.includes('invalid_token')) {
      throw new NfcError('invalid_token', 'Invalid NFC token.');
    }
    if (message.includes('expired')) {
      throw new NfcError('expired', 'This NFC token has expired.');
    }
    throw new NfcError('unknown', message || 'Failed to redeem NFC token.');
  }
}
