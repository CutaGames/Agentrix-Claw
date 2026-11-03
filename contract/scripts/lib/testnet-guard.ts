/**
 * L8 D6: scripts for the smart account contracts only ever touch the two testnets. An allow-list, not a deny-list: any
 * chain id that is not listed here, mainnets included, is refused before anything is read from the environment or sent.
 * Mirrors `SMART_ACCOUNT_TESTNET_CHAINS_V1` in shared/types/smart-account.ts (a test pins that the two agree).
 */
export const SMART_ACCOUNT_TESTNET_CHAIN_IDS = [97, 84532] as const;

export function assertSmartAccountTestnet(chainId: number | bigint | string | undefined | null): number {
  const text = typeof chainId === "bigint" ? chainId.toString() : typeof chainId === "number" ? String(chainId) : chainId;
  if (typeof text !== "string" || !/^[1-9][0-9]{0,9}$/.test(text)) {
    throw new Error(`refusing to run: chain id ${String(chainId)} is not a plain integer`);
  }
  const id = Number(text);
  if (!(SMART_ACCOUNT_TESTNET_CHAIN_IDS as readonly number[]).includes(id)) {
    throw new Error(`refusing to run: chain id ${id} is not an allowed testnet (${SMART_ACCOUNT_TESTNET_CHAIN_IDS.join(", ")})`);
  }
  return id;
}
