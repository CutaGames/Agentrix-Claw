/**
 * L8-6 chain activity v1 (`AGENT_CHAIN_ACTIVITY_V1_ENABLED`, default off): the on-chain rows of an Agent's own accounts
 * (`GET /api/agent-own-wallet/activity?agentId=`), each one re-checked against its receipt by the indexer. The card's
 * "ledger" block shows only these rows (R-d, A26). Shared by the backend, web and mobile.
 * Decoders refuse unknown fields and answer `{ ok: false, reasonCode, field }`; read results as `x.ok === false`.
 */
export const CHAIN_ACTIVITY_KINDS_V1 = ['userop', 'erc20_in', 'erc20_out', 'native_in', 'registry'] as const;
export type ChainActivityKindV1 = (typeof CHAIN_ACTIVITY_KINDS_V1)[number];

/**
 * The indexer's cursors: one `agent_chain_cursors` row per chain and source (S9). The list answers `stale: true` when
 * a chain the Agent has an account on is missing one of these cursors, or the oldest of them was last touched more
 * than `CHAIN_ACTIVITY_STALE_AFTER_MS_V1` ago (the indexer touches every cursor on each round, even with no new block).
 */
export const CHAIN_ACTIVITY_SOURCES_V1 = ['entrypoint', 'erc20', 'registry'] as const;
export type ChainActivitySourceV1 = (typeof CHAIN_ACTIVITY_SOURCES_V1)[number];
export const CHAIN_ACTIVITY_STALE_AFTER_MS_V1 = 10 * 60 * 1000;
/** Most rows one list answers with (the decoder accepts up to 200). */
export const CHAIN_ACTIVITY_LIST_LIMIT_V1 = 100;

export interface ChainActivityRowV1 {
  chainId: number;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  /** ISO time of the block. */
  blockTime: string;
  kind: ChainActivityKindV1;
  counterparty: string | null;
  token: string | null;
  /** Decimal string in the token's smallest unit; null for rows without an amount. */
  amount: string | null;
  success: boolean;
  userOpHash: string | null;
}

export interface ChainActivityListV1 {
  rows: ChainActivityRowV1[];
  /** The indexer is behind the chain head by more than its window: rows may be missing. */
  stale: boolean;
}

export type ChainActivityDecodeReasonV1 = 'invalid_type' | 'unknown_field' | 'missing_field' | 'invalid_value';
export type ChainActivityDecodeResultV1<T> = { ok: true; value: T } | { ok: false; reasonCode: ChainActivityDecodeReasonV1; field: string };

const ROW_KEYS = ['chainId', 'txHash', 'logIndex', 'blockNumber', 'blockTime', 'kind', 'counterparty', 'token', 'amount', 'success', 'userOpHash'];
const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const AMOUNT = /^(0|[1-9][0-9]{0,77})$/;
const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const no = (reasonCode: ChainActivityDecodeReasonV1, field: string): { ok: false; reasonCode: ChainActivityDecodeReasonV1; field: string } => ({ ok: false, reasonCode, field });
const nat = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

export function decodeChainActivityRowV1(value: unknown, field = '$'): ChainActivityDecodeResultV1<ChainActivityRowV1> {
  if (!obj(value)) return no('invalid_type', field);
  for (const key of Object.keys(value)) if (!ROW_KEYS.includes(key)) return no('unknown_field', `${field}.${key}`);
  for (const key of ROW_KEYS) if (!(key in value)) return no('missing_field', `${field}.${key}`);
  const { chainId, txHash, logIndex, blockNumber, blockTime, kind, counterparty, token, amount, success, userOpHash } = value;
  if (chainId !== 97 && chainId !== 84532) return no('invalid_value', `${field}.chainId`);
  if (typeof txHash !== 'string' || !HASH.test(txHash)) return no('invalid_value', `${field}.txHash`);
  if (!nat(logIndex)) return no('invalid_value', `${field}.logIndex`);
  if (!nat(blockNumber)) return no('invalid_value', `${field}.blockNumber`);
  if (typeof blockTime !== 'string' || Number.isNaN(Date.parse(blockTime))) return no('invalid_value', `${field}.blockTime`);
  if (typeof kind !== 'string' || !(CHAIN_ACTIVITY_KINDS_V1 as readonly string[]).includes(kind)) return no('invalid_value', `${field}.kind`);
  if (!nullableMatch(counterparty, ADDRESS)) return no('invalid_value', `${field}.counterparty`);
  if (!nullableMatch(token, ADDRESS)) return no('invalid_value', `${field}.token`);
  if (!nullableMatch(amount, AMOUNT)) return no('invalid_value', `${field}.amount`);
  if (typeof success !== 'boolean') return no('invalid_type', `${field}.success`);
  if (!nullableMatch(userOpHash, HASH)) return no('invalid_value', `${field}.userOpHash`);
  return {
    ok: true,
    value: {
      chainId: chainId === 97 ? 97 : 84532,
      txHash,
      logIndex,
      blockNumber,
      blockTime,
      kind: kind as ChainActivityKindV1,
      counterparty: counterparty === null ? null : String(counterparty),
      token: token === null ? null : String(token),
      amount: amount === null ? null : String(amount),
      success,
      userOpHash: userOpHash === null ? null : String(userOpHash),
    },
  };
}

function nullableMatch(value: unknown, pattern: RegExp): boolean {
  return value === null || (typeof value === 'string' && pattern.test(value));
}

/** At most 200 rows per response. */
export function decodeChainActivityListV1(value: unknown): ChainActivityDecodeResultV1<ChainActivityListV1> {
  if (!obj(value)) return no('invalid_type', '$');
  for (const key of Object.keys(value)) if (key !== 'rows' && key !== 'stale') return no('unknown_field', key);
  if (!('rows' in value)) return no('missing_field', 'rows');
  if (!('stale' in value)) return no('missing_field', 'stale');
  const stale = value.stale;
  const list = value.rows;
  if (typeof stale !== 'boolean') return no('invalid_type', 'stale');
  if (!Array.isArray(list) || list.length > 200) return no('invalid_type', 'rows');
  const rows: ChainActivityRowV1[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const row = decodeChainActivityRowV1(list[i], `rows[${i}]`);
    if (row.ok === false) return row;
    rows.push(row.value);
  }
  return { ok: true, value: { rows, stale } };
}
