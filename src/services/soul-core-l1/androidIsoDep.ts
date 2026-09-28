import { Platform } from 'react-native';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';
import {
  SoulCoreCardClient,
  SoulCoreCardError,
  type SoulCoreApduTransport,
  type SoulCoreCardState,
  type SoulCoreDevelopmentAttestation,
  type SoulCoreEip1559SignRequest,
  type SoulCoreSignResult,
} from './protocol';

export type SoulCoreNfcErrorCode =
  | 'unsupported_platform'
  | 'nfc_not_supported'
  | 'nfc_disabled'
  | 'session_busy'
  | 'scan_cancelled'
  | 'tag_connection_lost'
  | 'nfc_transport_error';

export class SoulCoreNfcError extends Error {
  constructor(
    public readonly code: SoulCoreNfcErrorCode,
    message?: string,
    public readonly cause?: unknown,
  ) {
    super(message ?? code);
    this.name = 'SoulCoreNfcError';
  }
}

export type SoulCoreTapStage =
  | 'checking_nfc'
  | 'waiting_for_card'
  | 'card_connected'
  | 'applet_selected'
  | 'signing'
  | 'reading_attestation'
  | 'done';

export type SoulCoreTapProgress = (stage: SoulCoreTapStage) => void;

export interface SoulCoreTapOptions {
  onProgress?: SoulCoreTapProgress;
  /** J3R180 software keccak can take tens of seconds for multi-block payloads. */
  transceiveTimeoutMs?: number;
}

export interface SoulCoreCardSnapshot {
  fundingPublicKeyHex: string;
  state: SoulCoreCardState;
}

export interface SoulCoreSignAndAttestResult {
  signing: SoulCoreSignResult;
  attestation: SoulCoreDevelopmentAttestation;
}

class AndroidIsoDepTransport implements SoulCoreApduTransport {
  async transceive(command: Uint8Array): Promise<Uint8Array> {
    const response = await NfcManager.isoDepHandler.transceive(Array.from(command));
    return Uint8Array.from(response);
  }
}

let activeSession = false;

function mapNfcError(error: unknown): Error {
  if (error instanceof SoulCoreNfcError || error instanceof SoulCoreCardError) return error;
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown NFC error');
  const normalized = message.toLowerCase();
  if (normalized.includes('cancel')) {
    return new SoulCoreNfcError('scan_cancelled', 'NFC scan was cancelled.', error);
  }
  if (
    normalized.includes('tag connection lost') ||
    normalized.includes('tag was lost') ||
    normalized.includes('tagnotconnected')
  ) {
    return new SoulCoreNfcError(
      'tag_connection_lost',
      'Soul Core card connection was lost. Keep the card against the phone until completion.',
      error,
    );
  }
  return new SoulCoreNfcError('nfc_transport_error', message, error);
}

export async function checkSoulCoreNfcSupport(): Promise<'ready' | 'not_supported' | 'disabled'> {
  if (Platform.OS !== 'android') return 'not_supported';
  try {
    if (!(await NfcManager.isSupported())) return 'not_supported';
    await NfcManager.start();
    return (await NfcManager.isEnabled()) ? 'ready' : 'disabled';
  } catch {
    return 'not_supported';
  }
}

async function withSoulCoreCard<T>(
  operation: (client: SoulCoreCardClient) => Promise<T>,
  options: SoulCoreTapOptions = {},
): Promise<T> {
  if (Platform.OS !== 'android') {
    throw new SoulCoreNfcError(
      'unsupported_platform',
      'This Soul Core development-card flow currently supports Android IsoDep only.',
    );
  }
  if (activeSession) {
    throw new SoulCoreNfcError('session_busy', 'Another Soul Core NFC session is already active.');
  }

  activeSession = true;
  let previousTimeout: number | undefined;
  try {
    options.onProgress?.('checking_nfc');
    const supported = await NfcManager.isSupported();
    if (!supported) throw new SoulCoreNfcError('nfc_not_supported', 'This Android device does not support NFC.');
    await NfcManager.start();
    if (!(await NfcManager.isEnabled())) {
      throw new SoulCoreNfcError('nfc_disabled', 'Enable NFC in Android settings and try again.');
    }

    options.onProgress?.('waiting_for_card');
    await NfcManager.requestTechnology(NfcTech.IsoDep, {
      alertMessage: 'Hold your Soul Core card against the phone and keep it still.',
    });
    options.onProgress?.('card_connected');

    try {
      const current = await NfcManager.getTimeout();
      previousTimeout = typeof current === 'number' ? current : undefined;
      await NfcManager.setTimeout(options.transceiveTimeoutMs ?? 60_000);
    } catch {
      // Some Android NFC stacks do not expose timeout control. Continue with
      // the platform default rather than converting capability variance into
      // a false card rejection.
    }

    const client = new SoulCoreCardClient(new AndroidIsoDepTransport());
    await client.selectApplet();
    options.onProgress?.('applet_selected');
    const result = await operation(client);
    options.onProgress?.('done');
    return result;
  } catch (error) {
    throw mapNfcError(error);
  } finally {
    if (previousTimeout !== undefined) {
      try {
        await NfcManager.setTimeout(previousTimeout);
      } catch {
        // Session teardown below is authoritative.
      }
    }
    try {
      await NfcManager.cancelTechnologyRequest({ throwOnError: false, delayMsAndroid: 0 });
    } catch {
      // Ignore teardown errors; preserve the operation result/error.
    }
    activeSession = false;
  }
}

/** Select the applet and read non-secret public/state data in one tap. */
export async function tapReadSoulCoreCard(
  options?: SoulCoreTapOptions,
): Promise<SoulCoreCardSnapshot> {
  return withSoulCoreCard(async (client) => {
    const fundingPublicKey = await client.getFundingPublicKey();
    const state = await client.getState();
    return {
      fundingPublicKeyHex: Array.from(fundingPublicKey)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(''),
      state,
    };
  }, options);
}

/** OPEN_SECURE_CHANNEL (one-time nonce) followed by structured SIGN_TX. */
export async function tapSignSoulCoreTransaction(
  request: SoulCoreEip1559SignRequest,
  options: SoulCoreTapOptions = {},
): Promise<SoulCoreSignResult> {
  return withSoulCoreCard(async (client) => {
    options.onProgress?.('signing');
    return client.signEip1559(request);
  }, options);
}

/** Read raw development-card attestation evidence bound to the caller nonce. */
export async function tapReadSoulCoreAttestation(
  verifierNonce: Uint8Array | string,
  options: SoulCoreTapOptions = {},
): Promise<SoulCoreDevelopmentAttestation> {
  return withSoulCoreCard(async (client) => {
    options.onProgress?.('reading_attestation');
    return client.getDevelopmentAttestation(verifierNonce);
  }, options);
}

/**
 * Complete the T11 card leg in a single NFC presence session. The result is
 * intentionally not uploaded: the backend still lacks a challenge/submit API
 * matching this development-card attestation format.
 */
export async function tapSignAndReadSoulCoreAttestation(
  request: SoulCoreEip1559SignRequest,
  verifierNonce: Uint8Array | string,
  options: SoulCoreTapOptions = {},
): Promise<SoulCoreSignAndAttestResult> {
  return withSoulCoreCard(async (client) => {
    options.onProgress?.('signing');
    const signing = await client.signEip1559(request);
    options.onProgress?.('reading_attestation');
    const attestation = await client.getDevelopmentAttestation(verifierNonce);
    return { signing, attestation };
  }, options);
}

export async function cancelSoulCoreTap(): Promise<void> {
  try {
    await NfcManager.cancelTechnologyRequest({ throwOnError: false, delayMsAndroid: 0 });
  } catch {
    // Cancellation is idempotent from the UI's perspective.
  }
}
