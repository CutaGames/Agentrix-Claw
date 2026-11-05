/**
 * L8-6 own wallet: in-memory implementation of the device record port, for tests and the rehearsal harness. Same
 * semantics as the IndexedDB one: one record per `(chainId, accountAddress)`, copies in and out.
 */
import type { OwnWalletLocalRecordV1, OwnWalletLocalStorePortV1 } from './local-store';

export interface OwnWalletMemoryLocalStoreV1 extends OwnWalletLocalStorePortV1 {
  /** How many `put` calls reached the store (tests assert "nothing was written"). */
  readonly writes: number;
}

export function createMemoryLocalStoreV1(initial: readonly OwnWalletLocalRecordV1[] = []): OwnWalletMemoryLocalStoreV1 {
  const rows = new Map<string, OwnWalletLocalRecordV1>();
  const keyOf = (r: OwnWalletLocalRecordV1) => `${r.chainId}:${r.accountAddress}`;
  for (const r of initial) rows.set(keyOf(r), { ...r });
  let writes = 0;
  return {
    get writes() {
      return writes;
    },
    async list() {
      return Array.from(rows.values()).map((r) => ({ ...r }));
    },
    async put(record) {
      writes += 1;
      rows.set(keyOf(record), { ...record });
    },
  };
}
