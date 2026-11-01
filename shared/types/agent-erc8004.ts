/**
 * L8-6 ERC-8004 identity v1 (testnet only, `ERC8004_REGISTRATION_V1_ENABLED`, default off): the registration the
 * Agent's own account makes in the official IdentityRegistry, signed by the owner's wallet passkey (design I1-I4).
 * Contract shared by the backend, the wallet origin and the public verify page.
 *
 * - The registry address is pinned; `ERC8004_IDENTITY_REGISTRY_<chainId>` may only repeat it (design I1).
 * - The registration file follows EIP-8004 `registration-v1` with a field allow-list; control characters and U+007F are
 *   refused so that the canonical digest (sorted keys, compact, UTF-8, without `registrations`) is the same in JS and jq.
 * - Decoders refuse unknown fields and answer `{ ok: false, reasonCode, field }`; read results as `x.ok === false`.
 */
export const ERC8004_REGISTRY_TESTNET_V1 = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
export const ERC8004_REGISTRY_VERSION_V1 = '2.0.0';
export const ERC8004_REGISTRY_IMPLEMENTATION_V1 = '0x7274e874ca62410a93bd8bf61c69d8045e399c02';
/** Where a revoked registration's NFT is transferred to (one-way). */
export const ERC8004_REVOKED_HOLDER_V1 = '0x000000000000000000000000000000000000dEaD';
export const ERC8004_REGISTRATION_TYPE_V1 = 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';
export const ERC8004_METADATA_KEYS_V1 = { fileDigest: 'agentrix.fileDigest', ownerVault: 'agentrix.ownerVault' } as const;
/** I4: the metadata the revocation batch sets (the backend's `ERC8004_STATUS_METADATA_KEY_V1` / `…_REVOKED_STATUS_VALUE_V1`). */
export const ERC8004_STATUS_METADATA_V1 = { key: 'agentrix.status', revoked: 'revoked' } as const;

/**
 * S8c / S10: the platform's EAS certificate of a confirmed registration, as the backend issues it
 * (`erc8004/eas-certificate.ts`) and the public verify page reads it. Only chains listed here have one: 84532 (the
 * OP-stack predeploy); 97 has no EAS and shows no certificate line at all (E137). The UID is
 * `keccak256(abi.encodePacked(schema, address(0), true))` (EAS SchemaRegistry rule).
 */
export const ERC8004_EAS_CERTIFICATE_SCHEMA_V1 = 'uint256 chainId,address registry,uint256 agentId,address account,bytes32 fileDigest';
export const ERC8004_EAS_CERTIFICATE_SCHEMA_UID_V1 = '0x7831b81d8f045b2ebd207785c34f2a8677532555124937e666f886494ea5de32';
export const ERC8004_EAS_DEPLOYMENTS_V1: Readonly<Record<number, { eas: string; schemaRegistry: string }>> = {
  84532: { eas: '0x4200000000000000000000000000000000000021', schemaRegistry: '0x4200000000000000000000000000000000000020' },
};

export const ERC8004_REGISTRATION_STATUSES_V1 = ['preparing', 'submitted', 'confirmed', 'revoked', 'transferred', 'failed'] as const;
export type Erc8004RegistrationStatusV1 = (typeof ERC8004_REGISTRATION_STATUSES_V1)[number];

/** `eip155:<chainId>:<registry>` as the registration file and the verify page write it. */
export function erc8004AgentRegistryIdV1(chainId: number, registry: string = ERC8004_REGISTRY_TESTNET_V1): string {
  return `eip155:${chainId}:${registry}`;
}

/**
 * An Agent's on-chain identity as the backend gives it while `AGENT_OWN_WALLET_V1_ENABLED=1` (design 7.1 R-h 2, 2a-2c):
 * the card's `onchain.identity`, `/economic-status`, `onchain-status`. Only the 2163 registration and its last on-chain
 * check count; the old relayer / platform EAS fields are only `legacyRegistration` (appendix C item 11).
 * - `none`: no registration on chain (a request that waits for the owner's signature is still `none`);
 * - `pending`: the registration UserOp was relayed and is not confirmed yet;
 * - `confirmed`: confirmed, the registry holder is the Agent's account and not in the platform address set P;
 * - `unverifiable`: confirmed in 2163 but the holder check did not pass or P could not be read ("cannot check now");
 * - `revoke_pending`: the owner started revocation, the chain does not show `0x…dEaD` yet (appendix C item 18);
 * - `revoked`: the token is at `0x…dEaD`; `failed`: the newest registration failed; `unavailable`: could not be read.
 */
export const ONCHAIN_IDENTITY_STATUSES_V1 = ['none', 'pending', 'confirmed', 'unverifiable', 'revoke_pending', 'revoked', 'failed', 'unavailable'] as const;
export type OnchainIdentityStatusV1 = (typeof ONCHAIN_IDENTITY_STATUSES_V1)[number];

/**
 * Design I4 (b) / A32: what `POST /agent-accounts/:id/did/revoke` adds as `data.onchainRevocation` while the main switch
 * and `ERC8004_REGISTRATION_V1_ENABLED` are on. The DID revocation itself is written either way (one way, as today).
 * - `pending_owner_signature`: a registration is on chain (or relayed) and still held by the Agent's account; the owner
 *   signs `revoke_registration` with the wallet passkey, starting at `walletUrl`; until the chain shows `0x…dEaD` the
 *   identity is `revoke_pending` (appendix C item 18);
 * - `revoked_onchain`: the account no longer holds the registration (at `0x…dEaD`, or moved); nothing left to sign;
 * - `not_registered`: nothing on chain.
 */
export const ONCHAIN_REVOCATION_STATUSES_V1 = ['pending_owner_signature', 'revoked_onchain', 'not_registered'] as const;
export type OnchainRevocationStatusV1 = (typeof ONCHAIN_REVOCATION_STATUSES_V1)[number];
export type OnchainRevocationV1 = { status: 'pending_owner_signature'; walletUrl: string } | { status: 'revoked_onchain' | 'not_registered' };

/** The old relayer `createSession` / platform EAS record (signed by the platform, not by the owner). */
export interface OnchainIdentityLegacyRegistrationV1 {
  status?: string;
  txHash?: string;
  chain?: string;
  erc8004SessionId?: string;
  easAttestationUid?: string;
  sessionExpiry?: string;
}

export interface OnchainIdentityViewV1 {
  status: OnchainIdentityStatusV1;
  /** The registration's chain; without one, the chain of the Agent's own account; absent when neither exists. */
  chainId?: number;
  registry?: string;
  /** Registry token id (decimal string), known once confirmed. */
  agentId?: string;
  /** The registration transaction (`register_tx`). */
  txHash?: string;
  /** `confirmed_at`, only while `status` is `confirmed`. */
  registeredAt?: string;
  /** The public verify page `/verify/agent/<chainId>/<agentId>` on the main site, once the token id is known. */
  verifyUrl?: string;
  legacyRegistration?: OnchainIdentityLegacyRegistrationV1;
}

export interface Erc8004ServiceV1 {
  name: 'web' | 'A2A' | 'DID';
  endpoint: string;
  version?: string;
}

export interface Erc8004RegistrationEntryV1 {
  agentId: number;
  agentRegistry: string;
}

export interface Erc8004RegistrationFileV1 {
  type: typeof ERC8004_REGISTRATION_TYPE_V1;
  name: string;
  description: string;
  image?: string;
  services: Erc8004ServiceV1[];
  active: boolean;
  registrations?: Erc8004RegistrationEntryV1[];
}

export type Erc8004DecodeReasonV1 = 'invalid_type' | 'unknown_field' | 'missing_field' | 'invalid_value' | 'control_character';
export type Erc8004DecodeResultV1<T> = { ok: true; value: T } | { ok: false; reasonCode: Erc8004DecodeReasonV1; field: string };

const FILE_KEYS = ['type', 'name', 'description', 'image', 'services', 'active', 'registrations'];
const SERVICE_KEYS = ['name', 'endpoint', 'version'];
const SERVICE_NAMES = ['web', 'A2A', 'DID'];
const CONTROL = /[\u0000-\u001f\u007f]/;
const REGISTRY_ID = /^eip155:[1-9][0-9]{0,9}:0x[0-9a-fA-F]{40}$/;
const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const no = (reasonCode: Erc8004DecodeReasonV1, field: string): { ok: false; reasonCode: Erc8004DecodeReasonV1; field: string } => ({ ok: false, reasonCode, field });

function text(value: unknown, field: string, max: number): Erc8004DecodeResultV1<string> {
  if (typeof value !== 'string') return no('invalid_type', field);
  if (CONTROL.test(value)) return no('control_character', field);
  if (value.length === 0 || value.length > max) return no('invalid_value', field);
  return { ok: true, value };
}

/** Strict decoder for a registration file (allow-listed fields only). */
export function decodeErc8004RegistrationFileV1(value: unknown): Erc8004DecodeResultV1<Erc8004RegistrationFileV1> {
  if (!obj(value)) return no('invalid_type', '$');
  for (const key of Object.keys(value)) if (!FILE_KEYS.includes(key)) return no('unknown_field', key);
  for (const key of ['type', 'name', 'description', 'services', 'active']) if (!(key in value)) return no('missing_field', key);
  if (value.type !== ERC8004_REGISTRATION_TYPE_V1) return no('invalid_value', 'type');
  const name = text(value.name, 'name', 80);
  if (name.ok === false) return name;
  const description = text(value.description, 'description', 1000);
  if (description.ok === false) return description;
  let image: string | undefined;
  if ('image' in value) {
    const img = text(value.image, 'image', 2048);
    if (img.ok === false) return img;
    if (!/^https:\/\//.test(img.value)) return no('invalid_value', 'image');
    image = img.value;
  }
  const active = value.active;
  if (typeof active !== 'boolean') return no('invalid_type', 'active');
  const serviceList = value.services;
  if (!Array.isArray(serviceList) || serviceList.length === 0 || serviceList.length > 8) return no('invalid_type', 'services');
  const services: Erc8004ServiceV1[] = [];
  for (let i = 0; i < serviceList.length; i += 1) {
    const s: unknown = serviceList[i];
    const at = `services[${i}]`;
    if (!obj(s)) return no('invalid_type', at);
    for (const key of Object.keys(s)) if (!SERVICE_KEYS.includes(key)) return no('unknown_field', `${at}.${key}`);
    const serviceName = s.name;
    if (typeof serviceName !== 'string' || !SERVICE_NAMES.includes(serviceName)) return no('invalid_value', `${at}.name`);
    const endpoint = text(s.endpoint, `${at}.endpoint`, 2048);
    if (endpoint.ok === false) return endpoint;
    const service: Erc8004ServiceV1 = { name: serviceName as Erc8004ServiceV1['name'], endpoint: endpoint.value };
    if ('version' in s) {
      const version = text(s.version, `${at}.version`, 32);
      if (version.ok === false) return version;
      service.version = version.value;
    }
    services.push(service);
  }
  const file: Erc8004RegistrationFileV1 = { type: ERC8004_REGISTRATION_TYPE_V1, name: name.value, description: description.value, services, active };
  if (image !== undefined) file.image = image;
  if ('registrations' in value) {
    const list = value.registrations;
    if (!Array.isArray(list) || list.length > 8) return no('invalid_type', 'registrations');
    const registrations: Erc8004RegistrationEntryV1[] = [];
    for (let i = 0; i < list.length; i += 1) {
      const r: unknown = list[i];
      const at = `registrations[${i}]`;
      if (!obj(r)) return no('invalid_type', at);
      for (const key of Object.keys(r)) if (key !== 'agentId' && key !== 'agentRegistry') return no('unknown_field', `${at}.${key}`);
      const agentId = r.agentId;
      const agentRegistry = r.agentRegistry;
      if (typeof agentId !== 'number' || !Number.isSafeInteger(agentId) || agentId < 0) return no('invalid_value', `${at}.agentId`);
      if (typeof agentRegistry !== 'string' || !REGISTRY_ID.test(agentRegistry)) return no('invalid_value', `${at}.agentRegistry`);
      registrations.push({ agentId, agentRegistry });
    }
    file.registrations = registrations;
  }
  return { ok: true, value: file };
}
