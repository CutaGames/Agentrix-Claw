/**
 * L8-6 own wallet, web side: switch and build-time constants (design 2.0 "wallet origin", 7.1 environment variables).
 *
 * - `NEXT_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED` is on only when it is exactly '1'. With it off nothing on the main site
 *   calls this library (S5a adds the library only; S5b/S11a wire it).
 * - The wallet origin, its RP ID, the main origin, the API origin, the registration file base, the chain id and the
 *   public RPC nodes are build-time constants (Next inlines `process.env.NEXT_PUBLIC_*` when it is read literally). The
 *   wallet origin never reads any of them from a server at run time; WebAuthn calls use `walletRpId` only.
 * - Contract addresses, codehashes, gas caps and paymaster pins are not configuration: they are pinned per chain in
 *   `shared/types/agent-own-wallet.ts`.
 */
import { ownWalletChainAllowedV1, type OwnWalletChainIdV1 } from '../../../shared/types/agent-own-wallet';

export function ownWalletWebEnabledV1(): boolean {
  return process.env.NEXT_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED === '1';
}

/** Public nodes the browser reads the chain through (no key). 97 first (E137); the same defaults as the backend registry. */
export const OWN_WALLET_DEFAULT_PUBLIC_RPC_V1: Readonly<Record<OwnWalletChainIdV1, string>> = {
  97: 'https://data-seed-prebsc-1-s1.binance.org:8545',
  84532: 'https://sepolia.base.org',
};

export interface OwnWalletBuildConfigV1 {
  /** e.g. https://wallet.agentrix.top; '' when not configured. */
  walletOrigin: string;
  /** e.g. wallet.agentrix.top; '' when not configured. */
  walletRpId: string;
  /** e.g. https://agentrix.top: the badge's postMessage target and the card URL prefix. */
  mainOrigin: string;
  /** e.g. https://api.agentrix.top: the only API the wallet origin talks to. */
  apiOrigin: string;
  /** Base of the ERC-8004 registration file URI (W2.6 `register`). */
  fileBaseUrl: string;
  /** `NEXT_PUBLIC_AGENT_OWN_WALLET_CHAIN_ID`; null when missing or not an allowed testnet. */
  chainId: OwnWalletChainIdV1 | null;
  publicRpc: Readonly<Record<OwnWalletChainIdV1, string>>;
}

const trimmed = (value: string | undefined): string => (typeof value === 'string' ? value.trim() : '');

function chainIdOf(raw: string): OwnWalletChainIdV1 | null {
  if (!/^[1-9][0-9]{0,9}$/.test(raw)) return null;
  const n = Number(raw);
  return ownWalletChainAllowedV1(n) ? n : null;
}

/** Reads the constants. Every `process.env.NEXT_PUBLIC_*` access is literal so that the build inlines it. */
export function ownWalletBuildConfigV1(): OwnWalletBuildConfigV1 {
  const rpc97 = trimmed(process.env.NEXT_PUBLIC_AGENT_OWN_WALLET_PUBLIC_RPC_URL_97);
  const rpc84532 = trimmed(process.env.NEXT_PUBLIC_AGENT_OWN_WALLET_PUBLIC_RPC_URL_84532);
  return {
    walletOrigin: trimmed(process.env.NEXT_PUBLIC_AGENT_WALLET_ORIGIN),
    walletRpId: trimmed(process.env.NEXT_PUBLIC_AGENT_WALLET_RP_ID),
    mainOrigin: trimmed(process.env.NEXT_PUBLIC_AGENT_MAIN_ORIGIN),
    apiOrigin: trimmed(process.env.NEXT_PUBLIC_AGENT_OWN_WALLET_API_ORIGIN),
    fileBaseUrl: trimmed(process.env.NEXT_PUBLIC_AGENT_ERC8004_FILE_BASE_URL),
    chainId: chainIdOf(trimmed(process.env.NEXT_PUBLIC_AGENT_OWN_WALLET_CHAIN_ID)),
    publicRpc: {
      97: /^https:\/\//.test(rpc97) ? rpc97 : OWN_WALLET_DEFAULT_PUBLIC_RPC_V1[97],
      84532: /^https:\/\//.test(rpc84532) ? rpc84532 : OWN_WALLET_DEFAULT_PUBLIC_RPC_V1[84532],
    },
  };
}

export type OwnWalletOriginProblemV1 = 'wallet_origin_not_configured' | 'wallet_rp_id_not_configured' | 'wrong_origin' | 'same_as_main_origin' | 'rp_id_not_origin_host';

const ORIGIN = /^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?$/;

function hostOf(origin: string): string {
  return origin.replace(/^https:\/\//, '').replace(/:[0-9]+$/, '');
}

/**
 * Wallet origin pages refuse to run unless they are served from the configured wallet origin, that origin is not the
 * main origin, and the RP ID is exactly the wallet origin's host (no parent domain such as agentrix.top).
 */
export function walletOriginProblemV1(config: OwnWalletBuildConfigV1, locationOrigin: string): OwnWalletOriginProblemV1 | null {
  if (!ORIGIN.test(config.walletOrigin)) return 'wallet_origin_not_configured';
  if (!/^[a-z0-9.-]+$/.test(config.walletRpId)) return 'wallet_rp_id_not_configured';
  if (locationOrigin !== config.walletOrigin) return 'wrong_origin';
  if (config.walletOrigin === config.mainOrigin) return 'same_as_main_origin';
  if (config.walletRpId !== hostOf(config.walletOrigin)) return 'rp_id_not_origin_host';
  return null;
}
