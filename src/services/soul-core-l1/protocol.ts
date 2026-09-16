/**
 * Soul Core L1 development-card APDU protocol.
 *
 * This module mirrors the applet currently verified on J3R180 hardware. It is
 * deliberately transport-agnostic so Android IsoDep, PC/SC and simulator
 * adapters can share exactly the same encoding and status-word handling.
 *
 * Evidence boundary: this is the v1 development-card protocol, not the v1.1
 * Test-CA/production attestation envelope. GET_ATTESTATION returns raw card
 * evidence and must not be presented as production assurance.
 */

export const SOUL_CORE_APPLET_AID_HEX = '4147545249580101';
export const SOUL_CORE_CLA = 0x80;

export const SoulCoreInstruction = {
  OPEN_SECURE_CHANNEL: 0x10,
  GET_PUBKEY: 0x30,
  SIGN_TX: 0x50,
  GET_STATE: 0x60,
  GET_ATTESTATION: 0x80,
} as const;

export type SoulCoreInstructionCode =
  (typeof SoulCoreInstruction)[keyof typeof SoulCoreInstruction];

export type SoulCoreStatusCode =
  | 'secure_channel_required'
  | 'owner_auth_required'
  | 'pin_locked'
  | 'replay_detected'
  | 'request_conflict'
  | 'invalid_transaction'
  | 'single_limit_exceeded'
  | 'total_limit_exceeded'
  | 'recipient_not_allowed'
  | 'not_personalized'
  | 'wrong_length'
  | 'unsupported_instruction'
  | 'unsupported_class'
  | 'unknown_status';

const STATUS_CODE_BY_SW: Record<number, SoulCoreStatusCode> = {
  0x6982: 'secure_channel_required',
  0x6983: 'pin_locked',
  0x6985: 'owner_auth_required',
  0x6988: 'replay_detected',
  0x6989: 'request_conflict',
  0x6a80: 'invalid_transaction',
  0x6a84: 'single_limit_exceeded',
  0x6a85: 'total_limit_exceeded',
  0x6a86: 'recipient_not_allowed',
  0x6a88: 'not_personalized',
  0x6700: 'wrong_length',
  0x6d00: 'unsupported_instruction',
  0x6e00: 'unsupported_class',
};

export class SoulCoreCardError extends Error {
  constructor(
    public readonly code: SoulCoreStatusCode,
    public readonly statusWord: number,
    message?: string,
  ) {
    super(message ?? `Soul Core card rejected APDU: ${code} (SW=${statusWord.toString(16).padStart(4, '0')})`);
    this.name = 'SoulCoreCardError';
  }
}

export interface SoulCoreApduResponse {
  data: Uint8Array;
  statusWord: number;
}

export interface SoulCoreApduTransport {
  transceive(command: Uint8Array): Promise<Uint8Array>;
}

export type SoulCoreInteger = bigint | number | string;

export interface SoulCoreMerkleProofNode {
  /** Position of the sibling relative to the current hash. */
  siblingPosition: 'left' | 'right';
  sibling: Uint8Array | string;
}

export interface SoulCoreEip1559SignRequest {
  requestId: Uint8Array | string;
  chainId: SoulCoreInteger;
  nonce: SoulCoreInteger;
  maxPriorityFeePerGas: SoulCoreInteger;
  maxFeePerGas: SoulCoreInteger;
  gasLimit: SoulCoreInteger;
  to: Uint8Array | string;
  value: SoulCoreInteger;
  data?: Uint8Array | string;
  merkleProof?: SoulCoreMerkleProofNode[];
}

export interface SoulCoreCardState {
  personalized: boolean;
  pinTriesRemaining: number;
  rollingCounter: number;
  singleLimit: bigint;
  totalLimit: bigint;
  usedTotal: bigint;
  whitelistRootHex: string;
  raw: Uint8Array;
}

export interface SoulCoreDevelopmentAttestation {
  evidenceLevel: 'development_card';
  fundingPublicKeyHex: string;
  attestationPublicKeyHex: string;
  verifierNonceHex: string;
  rollingCounter: number;
  singleLimit: bigint;
  totalLimit: bigint;
  usedTotal: bigint;
  whitelistRootHex: string;
  signatureDerHex: string;
  /** Exact bytes signed by the card: fundingPub(65) || state(60) || verifierNonce. */
  signedMessageHex: string;
  rawResponseHex: string;
}

export interface SoulCoreSignResult {
  fundingPublicKeyHex: string;
  signatureDerHex: string;
  requestIdHex: string;
}

export function hexToBytes(value: string, expectedLength?: number): Uint8Array {
  const normalized = value.trim().replace(/^0x/i, '');
  if (!/^[0-9a-f]*$/i.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error('Expected an even-length hexadecimal string.');
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new Error(`Expected ${expectedLength} bytes, received ${bytes.length}.`);
  }
  return bytes;
}

export function bytesToHex(bytes: ArrayLike<number>): string {
  let value = '';
  for (let i = 0; i < bytes.length; i += 1) {
    value += (bytes[i] & 0xff).toString(16).padStart(2, '0');
  }
  return value;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function asBytes(value: Uint8Array | string, expectedLength?: number): Uint8Array {
  const bytes = typeof value === 'string' ? hexToBytes(value) : new Uint8Array(value);
  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new Error(`Expected ${expectedLength} bytes, received ${bytes.length}.`);
  }
  return bytes;
}

function parseInteger(value: SoulCoreInteger): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error('Numeric transaction fields must be safe integers; use bigint or string for larger values.');
    }
    return BigInt(value);
  }
  const normalized = value.trim();
  if (!/^(0x[0-9a-f]+|[0-9]+)$/i.test(normalized)) {
    throw new Error(`Invalid unsigned integer: ${value}`);
  }
  return BigInt(normalized);
}

function integerToMinimalBytes(value: SoulCoreInteger): Uint8Array {
  let integer = parseInteger(value);
  if (integer < 0n) throw new Error('Transaction fields must be unsigned.');
  if (integer === 0n) return new Uint8Array(0);
  const reversed: number[] = [];
  while (integer > 0n) {
    reversed.push(Number(integer & 0xffn));
    integer >>= 8n;
  }
  reversed.reverse();
  return Uint8Array.from(reversed);
}

function encodeLv(value: Uint8Array): Uint8Array {
  if (value.length > 255) throw new Error('One-byte LV field exceeds 255 bytes.');
  return concatBytes(Uint8Array.of(value.length), value);
}

function readUnsigned(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function readCounter(bytes: Uint8Array): number {
  const value = readUnsigned(bytes);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Counter exceeds JavaScript safe integer range.');
  return Number(value);
}

export function encodeShortApdu(
  cla: number,
  ins: number,
  p1 = 0,
  p2 = 0,
  data?: Uint8Array,
  le = 256,
): Uint8Array {
  if (le < 1 || le > 256) throw new Error('Short APDU Le must be between 1 and 256.');
  const leByte = le === 256 ? 0 : le;
  if (!data || data.length === 0) return Uint8Array.of(cla, ins, p1, p2, leByte);
  if (data.length > 255) {
    throw new Error('Soul Core development-card APDU payload exceeds the tested short-APDU limit (255 bytes).');
  }
  return concatBytes(Uint8Array.of(cla, ins, p1, p2, data.length), data, Uint8Array.of(leByte));
}

export function decodeApduResponse(response: Uint8Array): SoulCoreApduResponse {
  if (response.length < 2) throw new Error('Malformed APDU response: status word is missing.');
  const statusWord = (response[response.length - 2] << 8) | response[response.length - 1];
  return { data: response.slice(0, -2), statusWord };
}

function requireSuccess(response: Uint8Array): Uint8Array {
  const decoded = decodeApduResponse(response);
  if (decoded.statusWord === 0x9000) return decoded.data;

  const pinRetryCode = (decoded.statusWord & 0xfff0) === 0x63c0;
  const code = pinRetryCode
    ? 'owner_auth_required'
    : STATUS_CODE_BY_SW[decoded.statusWord] ?? 'unknown_status';
  const tries = pinRetryCode ? `; PIN tries remaining=${decoded.statusWord & 0x0f}` : '';
  throw new SoulCoreCardError(
    code,
    decoded.statusWord,
    `Soul Core card rejected APDU: ${code} (SW=${decoded.statusWord.toString(16).padStart(4, '0')}${tries})`,
  );
}

export function buildSelectAppletApdu(): Uint8Array {
  return encodeShortApdu(0x00, 0xa4, 0x04, 0x00, hexToBytes(SOUL_CORE_APPLET_AID_HEX));
}

export function buildSignTxPayload(sessionNonce: Uint8Array, request: SoulCoreEip1559SignRequest): Uint8Array {
  if (sessionNonce.length !== 8) throw new Error('OPEN_SECURE_CHANNEL must return an 8-byte nonce.');
  const requestId = asBytes(request.requestId, 4);
  const to = asBytes(request.to, 20);
  const data = request.data ? asBytes(request.data) : new Uint8Array(0);
  if (data.length > 0xffff) throw new Error('Transaction data exceeds uint16 length.');

  const proof = request.merkleProof ?? [];
  if (proof.length > 255) throw new Error('Merkle proof exceeds 255 nodes.');
  const proofParts: Uint8Array[] = [Uint8Array.of(proof.length)];
  for (const node of proof) {
    proofParts.push(
      Uint8Array.of(node.siblingPosition === 'left' ? 0 : 1),
      asBytes(node.sibling, 32),
    );
  }

  return concatBytes(
    sessionNonce,
    requestId,
    encodeLv(integerToMinimalBytes(request.chainId)),
    encodeLv(integerToMinimalBytes(request.nonce)),
    encodeLv(integerToMinimalBytes(request.maxPriorityFeePerGas)),
    encodeLv(integerToMinimalBytes(request.maxFeePerGas)),
    encodeLv(integerToMinimalBytes(request.gasLimit)),
    to,
    encodeLv(integerToMinimalBytes(request.value)),
    Uint8Array.of((data.length >>> 8) & 0xff, data.length & 0xff),
    data,
    ...proofParts,
  );
}

export function parseSoulCoreState(data: Uint8Array): SoulCoreCardState {
  if (data.length !== 62) throw new Error(`Malformed GET_STATE response: expected 62 bytes, received ${data.length}.`);
  return {
    personalized: data[0] === 1,
    pinTriesRemaining: data[1],
    rollingCounter: readCounter(data.slice(2, 6)),
    singleLimit: readUnsigned(data.slice(6, 14)),
    totalLimit: readUnsigned(data.slice(14, 22)),
    usedTotal: readUnsigned(data.slice(22, 30)),
    whitelistRootHex: bytesToHex(data.slice(30, 62)),
    raw: data.slice(),
  };
}

export function parseDevelopmentAttestation(
  fundingPublicKey: Uint8Array,
  verifierNonce: Uint8Array,
  response: Uint8Array,
): SoulCoreDevelopmentAttestation {
  if (fundingPublicKey.length !== 65) throw new Error('GET_PUBKEY must return an uncompressed 65-byte secp256k1 key.');
  if (verifierNonce.length > 32) throw new Error('Verifier nonce must be 0..32 bytes.');
  if (response.length < 127) throw new Error('Malformed GET_ATTESTATION response.');

  const signatureLength = response[125];
  if (signatureLength === 0 || response.length !== 126 + signatureLength) {
    throw new Error('Malformed GET_ATTESTATION signature length.');
  }

  const attestationPublicKey = response.slice(0, 65);
  const state = response.slice(65, 125);
  const signature = response.slice(126);
  const signedMessage = concatBytes(fundingPublicKey, state, verifierNonce);

  return {
    evidenceLevel: 'development_card',
    fundingPublicKeyHex: bytesToHex(fundingPublicKey),
    attestationPublicKeyHex: bytesToHex(attestationPublicKey),
    verifierNonceHex: bytesToHex(verifierNonce),
    rollingCounter: readCounter(state.slice(0, 4)),
    singleLimit: readUnsigned(state.slice(4, 12)),
    totalLimit: readUnsigned(state.slice(12, 20)),
    usedTotal: readUnsigned(state.slice(20, 28)),
    whitelistRootHex: bytesToHex(state.slice(28, 60)),
    signatureDerHex: bytesToHex(signature),
    signedMessageHex: bytesToHex(signedMessage),
    rawResponseHex: bytesToHex(response),
  };
}

export class SoulCoreCardClient {
  constructor(private readonly transport: SoulCoreApduTransport) {}

  private async exchange(command: Uint8Array): Promise<Uint8Array> {
    return requireSuccess(await this.transport.transceive(command));
  }

  async selectApplet(): Promise<void> {
    await this.exchange(buildSelectAppletApdu());
  }

  async getFundingPublicKey(): Promise<Uint8Array> {
    const publicKey = await this.exchange(
      encodeShortApdu(SOUL_CORE_CLA, SoulCoreInstruction.GET_PUBKEY),
    );
    if (publicKey.length !== 65) throw new Error(`Expected a 65-byte funding public key, received ${publicKey.length}.`);
    return publicKey;
  }

  async getState(): Promise<SoulCoreCardState> {
    return parseSoulCoreState(
      await this.exchange(encodeShortApdu(SOUL_CORE_CLA, SoulCoreInstruction.GET_STATE)),
    );
  }

  async openSigningChannel(): Promise<Uint8Array> {
    const nonce = await this.exchange(
      encodeShortApdu(SOUL_CORE_CLA, SoulCoreInstruction.OPEN_SECURE_CHANNEL),
    );
    if (nonce.length !== 8) throw new Error(`Expected an 8-byte session nonce, received ${nonce.length}.`);
    return nonce;
  }

  async signEip1559(request: SoulCoreEip1559SignRequest): Promise<SoulCoreSignResult> {
    const fundingPublicKey = await this.getFundingPublicKey();
    const sessionNonce = await this.openSigningChannel();
    const payload = buildSignTxPayload(sessionNonce, request);
    const signature = await this.exchange(
      encodeShortApdu(SOUL_CORE_CLA, SoulCoreInstruction.SIGN_TX, 0, 0, payload),
    );
    return {
      fundingPublicKeyHex: bytesToHex(fundingPublicKey),
      signatureDerHex: bytesToHex(signature),
      requestIdHex: bytesToHex(asBytes(request.requestId, 4)),
    };
  }

  async getDevelopmentAttestation(
    verifierNonce: Uint8Array | string,
  ): Promise<SoulCoreDevelopmentAttestation> {
    const nonce = asBytes(verifierNonce);
    if (nonce.length > 32) throw new Error('Verifier nonce must be 0..32 bytes.');
    const fundingPublicKey = await this.getFundingPublicKey();
    const raw = await this.exchange(
      encodeShortApdu(SOUL_CORE_CLA, SoulCoreInstruction.GET_ATTESTATION, 0, 0, nonce),
    );
    return parseDevelopmentAttestation(fundingPublicKey, nonce, raw);
  }
}
