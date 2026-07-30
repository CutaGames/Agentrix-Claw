import type { EnforcementLayer } from './authority';

export const SOUL_CORE_L1_PROTOCOL_VERSION = 1 as const;

export type SoulCoreL1InstructionV1 =
  | 'SELECT'
  | 'OPEN_SECURE_CHANNEL'
  | 'MUTUAL_AUTH'
  | 'INIT_PERSONALIZE'
  | 'GET_PUBKEY'
  | 'VERIFY_PIN'
  | 'SIGN_TX'
  | 'GET_STATE'
  | 'SET_LIMITS'
  | 'SET_WHITELIST_ROOT'
  | 'GET_ATTESTATION'
  | 'ROTATE_SIGNER';

export type SoulCoreL1ErrorCodeV1 =
  | 'ok'
  | 'card-absent'
  | 'wrong-card'
  | 'secure-channel-required'
  | 'owner-auth-required'
  | 'pin-locked'
  | 'replay-detected'
  | 'request-conflict'
  | 'invalid-transaction'
  | 'single-limit-exceeded'
  | 'total-limit-exceeded'
  | 'recipient-not-allowed'
  | 'attestation-challenge-required'
  | 'signer-rotation-failed'
  | 'unsupported'
  | 'internal-failure';

export interface SoulCoreL1StructuredTransactionV1 {
  chainId: string;
  to: string;
  valueMinor: string;
  nonce: string;
  gasLimit?: string;
  maxFeePerGas?: string;
  dataHash?: string;
}

export interface SoulCoreL1SignRequestV1 {
  protocolVersion: typeof SOUL_CORE_L1_PROTOCOL_VERSION;
  requestId: string;
  sessionNonce: string;
  expectedCardId: string;
  transaction: SoulCoreL1StructuredTransactionV1;
  whitelistProof: string[];
  hostComputedHash?: string;
}

export interface SoulCoreL1SignReceiptV1 {
  protocolVersion: typeof SOUL_CORE_L1_PROTOCOL_VERSION;
  requestId: string;
  status: SoulCoreL1ErrorCodeV1;
  rollingCounter: string;
  usedTotalMinor: string;
  signature?: string;
  replayed?: boolean;
  enforcementLayers: EnforcementLayer[];
  signatureKind: 'secp256k1-card' | 'deterministic-simulator-not-cryptographic';
}

export interface SoulCoreL1AttestationRequestV1 {
  protocolVersion: typeof SOUL_CORE_L1_PROTOCOL_VERSION;
  expectedCardId: string;
  verifierNonce: string;
}

export interface SoulCoreL1AttestationV1 {
  protocolVersion: typeof SOUL_CORE_L1_PROTOCOL_VERSION;
  cardId: string;
  appletVersion: string;
  fundingPublicKey: string;
  attestationPublicKey: string;
  rollingCounter: string;
  singleLimitMinor: string;
  totalLimitMinor: string;
  usedTotalMinor: string;
  whitelistRoot: string;
  verifierNonce: string;
  signature: string;
  attestationKind: 'self-signed-poc' | 'vendor-certificate-chain';
}

export interface SoulCoreL1StateV1 {
  protocolVersion: typeof SOUL_CORE_L1_PROTOCOL_VERSION;
  cardId: string;
  appletVersion: string;
  present: boolean;
  secureChannelOpen: boolean;
  rollingCounter: string;
  singleLimitMinor: string;
  totalLimitMinor: string;
  usedTotalMinor: string;
  whitelistRoot: string;
}

/** Host boundary shared by Android NFC, PC/SC and deterministic simulator adapters. */
export interface SoulCoreL1HostV1 {
  openSecureChannel(expectedCardId: string): Promise<SoulCoreL1ErrorCodeV1>;
  signTransaction(request: SoulCoreL1SignRequestV1): Promise<SoulCoreL1SignReceiptV1>;
  getAttestation(request: SoulCoreL1AttestationRequestV1): Promise<SoulCoreL1AttestationV1>;
  getState(expectedCardId: string): Promise<SoulCoreL1StateV1>;
  rotateSigner(input: {
    soulCoreId: string;
    account: string;
    oldSigner: string;
    newSigner: string;
    ownerAuthorizationRef: string;
    idempotencyKey: string;
  }): Promise<{ status: SoulCoreL1ErrorCodeV1; transactionRef?: string }>;
}
