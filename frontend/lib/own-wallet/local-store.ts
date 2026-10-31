/**
 * L8-6 own wallet, web side: the device record L (design 2.0 "本地记录 L", W1.1, R2-M11, R4-L5).
 *
 * - One record per account the wallet origin created on this device, written only by wallet origin pages, kept in the
 *   wallet origin's IndexedDB. Tests inject `createMemoryLocalStoreV1` (memory-local-store.ts); the IndexedDB
 *   implementation is checked by hand in browsers (S5b, `impl.md`).
 * - Before writing, the page recomputes the address from its own key and index and refuses a duplicate: the same
 *   address, or the same `(chainId, kind, saltIndex)`, already recorded for ANOTHER Agent (a hostile server handing out
 *   an index already used). Then L is not written, no address is shown, `deploy_setup` is refused and the page shows
 *   appendix C item 31.
 * - `agentName` and `credentialLabel` are display-only additions to the design's record (appendix C item 31 names the
 *   other Agent; W2.6 shows "this device's passkey ({name})").
 */
import { OWN_WALLET_ACCOUNT_KINDS_V1, ownWalletChainAllowedV1, OWN_WALLET_SALT_INDEX_MAX_V1, type OwnWalletAccountKindV1, type OwnWalletChainIdV1 } from '../../../shared/types/agent-own-wallet';
import { addressBelongsToOtherAgentTextV1 } from './copy';
import { localAccountOfV1 } from './kernel-address';

export interface OwnWalletLocalRecordV1 {
  chainId: OwnWalletChainIdV1;
  kind: OwnWalletAccountKindV1;
  accountAddress: string;
  saltIndex: number;
  agentId?: string;
  agentName?: string;
  /** The wallet passkey's WebAuthn credential id, base64url. */
  credentialId: string;
  pubKeyX: string;
  pubKeyY: string;
  credentialLabel?: string;
  /** The address of the recovery code made on this device for this account (S6). */
  recoveryCodeAddress?: string;
  /**
   * S6 (5.4 step 2): set when this device's key was added by a recovery and is not the account's root key. The address
   * is then computed from this root key (found on chain by its index), the record's own key is the one that signs.
   */
  rootPubKeyX?: string;
  rootPubKeyY?: string;
  createdAt: string;
}

/** The key the record's address is computed from: the root key of a recovered record, else the record's own key. */
export function ownWalletAddressKeyOfV1(record: Pick<OwnWalletLocalRecordV1, 'pubKeyX' | 'pubKeyY' | 'rootPubKeyX' | 'rootPubKeyY'>): { pubKeyX: string; pubKeyY: string } {
  return record.rootPubKeyX && record.rootPubKeyY ? { pubKeyX: record.rootPubKeyX, pubKeyY: record.rootPubKeyY } : { pubKeyX: record.pubKeyX, pubKeyY: record.pubKeyY };
}

/** Storage port; the page never touches IndexedDB directly. */
export interface OwnWalletLocalStorePortV1 {
  list(): Promise<OwnWalletLocalRecordV1[]>;
  /** Inserts or replaces the record with the same `(chainId, accountAddress)`. */
  put(record: OwnWalletLocalRecordV1): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const WORD = /^0x[0-9a-f]{64}$/;
const B64URL = /^[A-Za-z0-9_-]{1,1366}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const KEYS = ['chainId', 'kind', 'accountAddress', 'saltIndex', 'agentId', 'agentName', 'credentialId', 'pubKeyX', 'pubKeyY', 'credentialLabel', 'recoveryCodeAddress', 'rootPubKeyX', 'rootPubKeyY', 'createdAt'];

const text = (v: unknown, max: number): boolean => typeof v === 'string' && v.length > 0 && v.length <= max && !CONTROL.test(v);

/** `null` when valid; else the first bad field. Records read back from storage go through this too. */
export function localRecordProblemV1(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return '$';
  const r = value as Record<string, unknown>;
  for (const key of Object.keys(r)) if (!KEYS.includes(key)) return key;
  if (!ownWalletChainAllowedV1(r.chainId)) return 'chainId';
  if (typeof r.kind !== 'string' || !(OWN_WALLET_ACCOUNT_KINDS_V1 as readonly string[]).includes(r.kind)) return 'kind';
  if (typeof r.accountAddress !== 'string' || !ADDRESS.test(r.accountAddress)) return 'accountAddress';
  if (typeof r.saltIndex !== 'number' || !Number.isInteger(r.saltIndex) || r.saltIndex < 0 || r.saltIndex > OWN_WALLET_SALT_INDEX_MAX_V1) return 'saltIndex';
  if (r.kind === 'agent' ? typeof r.agentId !== 'string' || !UUID.test(r.agentId) : r.agentId !== undefined) return 'agentId';
  if (r.agentName !== undefined && !text(r.agentName, 60)) return 'agentName';
  if (typeof r.credentialId !== 'string' || !B64URL.test(r.credentialId)) return 'credentialId';
  if (typeof r.pubKeyX !== 'string' || !WORD.test(r.pubKeyX)) return 'pubKeyX';
  if (typeof r.pubKeyY !== 'string' || !WORD.test(r.pubKeyY)) return 'pubKeyY';
  if (r.credentialLabel !== undefined && !text(r.credentialLabel, 60)) return 'credentialLabel';
  if (r.recoveryCodeAddress !== undefined && (typeof r.recoveryCodeAddress !== 'string' || !ADDRESS.test(r.recoveryCodeAddress))) return 'recoveryCodeAddress';
  if ((r.rootPubKeyX === undefined) !== (r.rootPubKeyY === undefined)) return 'rootPubKeyX';
  if (r.rootPubKeyX !== undefined && (typeof r.rootPubKeyX !== 'string' || !WORD.test(r.rootPubKeyX))) return 'rootPubKeyX';
  if (r.rootPubKeyY !== undefined && (typeof r.rootPubKeyY !== 'string' || !WORD.test(r.rootPubKeyY))) return 'rootPubKeyY';
  if (typeof r.createdAt !== 'string' || Number.isNaN(Date.parse(r.createdAt))) return 'createdAt';
  return null;
}

export interface OwnWalletLocalDuplicateV1 {
  reasonCode: 'address_belongs_to_other_agent' | 'salt_index_belongs_to_other_agent';
  other: OwnWalletLocalRecordV1;
  /** Appendix C item 31 with the other Agent's name. */
  message: string;
}

/**
 * R4-L5: the candidate's address, or its `(chainId, kind, saltIndex)`, is already recorded for another Agent. Records
 * for the same Agent (or the same vault) are not duplicates.
 */
export function localDuplicateOfV1(records: readonly OwnWalletLocalRecordV1[], candidate: Pick<OwnWalletLocalRecordV1, 'chainId' | 'kind' | 'accountAddress' | 'saltIndex' | 'agentId'>): OwnWalletLocalDuplicateV1 | null {
  const address = candidate.accountAddress.toLowerCase();
  for (const r of records) {
    if (r.chainId !== candidate.chainId) continue;
    const otherAgent = r.agentId !== candidate.agentId || r.kind !== candidate.kind;
    if (!otherAgent) continue;
    if (r.accountAddress === address) return { reasonCode: 'address_belongs_to_other_agent', other: r, message: addressBelongsToOtherAgentTextV1(r.agentName) };
    if (r.kind === candidate.kind && r.saltIndex === candidate.saltIndex) return { reasonCode: 'salt_index_belongs_to_other_agent', other: r, message: addressBelongsToOtherAgentTextV1(r.agentName) };
  }
  return null;
}

export type OwnWalletRecordResultV1 =
  | { ok: true; record: OwnWalletLocalRecordV1 }
  | { ok: false; reasonCode: 'record_invalid' | 'address_mismatch' | 'store_unavailable'; field: string }
  | ({ ok: false; field: string } & OwnWalletLocalDuplicateV1);

/**
 * Writes L for an account this page just created or checked. The address is recomputed from the record's own key,
 * kind and index; a different address, an invalid record or a duplicate (R4-L5) is refused and nothing is written.
 */
export async function recordLocalAccountV1(store: OwnWalletLocalStorePortV1, candidate: OwnWalletLocalRecordV1): Promise<OwnWalletRecordResultV1> {
  const problem = localRecordProblemV1(candidate);
  if (problem) return { ok: false, reasonCode: 'record_invalid', field: problem };
  const mine = localAccountOfV1({ kind: candidate.kind, saltIndex: candidate.saltIndex, ...ownWalletAddressKeyOfV1(candidate) });
  if (!mine || mine.accountAddress !== candidate.accountAddress) return { ok: false, reasonCode: 'address_mismatch', field: 'accountAddress' };
  let records: OwnWalletLocalRecordV1[];
  try {
    records = await readLocalRecordsV1(store);
  } catch {
    return { ok: false, reasonCode: 'store_unavailable', field: 'store' };
  }
  const duplicate = localDuplicateOfV1(records, candidate);
  if (duplicate) return { ok: false, field: 'accountAddress', ...duplicate };
  try {
    await store.put({ ...candidate });
  } catch {
    return { ok: false, reasonCode: 'store_unavailable', field: 'store' };
  }
  return { ok: true, record: { ...candidate } };
}

/** All valid records; invalid ones read back from storage are skipped, never trusted. */
export async function readLocalRecordsV1(store: OwnWalletLocalStorePortV1): Promise<OwnWalletLocalRecordV1[]> {
  const all = await store.list();
  return (Array.isArray(all) ? all : []).filter((r) => localRecordProblemV1(r) === null);
}

export function findLocalAccountV1(records: readonly OwnWalletLocalRecordV1[], chainId: number, accountAddress: string): OwnWalletLocalRecordV1 | undefined {
  const address = String(accountAddress).toLowerCase();
  return records.find((r) => r.chainId === chainId && r.accountAddress === address);
}

/** The owner's vault on this chain as this device recorded it (W2.6 `register`: `ownerVault` must equal it). */
export function findLocalVaultV1(records: readonly OwnWalletLocalRecordV1[], chainId: number): OwnWalletLocalRecordV1 | undefined {
  return records.find((r) => r.chainId === chainId && r.kind === 'owner_vault');
}

const DB_NAME = 'agentrix-own-wallet';
const DB_VERSION = 1;
const STORE = 'accounts';

function requestDone<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** IndexedDB implementation (wallet origin only). Keyed by `[chainId, accountAddress]`. */
export function createIndexedDbLocalStoreV1(factory: IDBFactory = typeof indexedDB === 'undefined' ? undefined : indexedDB): OwnWalletLocalStorePortV1 {
  let db: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    if (!factory) return Promise.reject(new Error('indexeddb_unavailable'));
    if (!db) {
      db = new Promise((resolve, reject) => {
        const request = factory.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: ['chainId', 'accountAddress'] });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.catch(() => {
        db = null;
      });
    }
    return db;
  };
  return {
    async list() {
      const d = await open();
      return requestDone(d.transaction(STORE, 'readonly').objectStore(STORE).getAll()) as Promise<OwnWalletLocalRecordV1[]>;
    },
    async put(record) {
      const d = await open();
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    },
  };
}
