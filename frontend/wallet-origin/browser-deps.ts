/**
 * L8-6 wallet origin: the browser implementations of the page ports. Called only from `useEffect` (the static export
 * renders the pages at build time, where there is no window). Every request goes out without cookies and referrer.
 */
import { createWalletOriginClientV1 } from '../lib/own-wallet/client';
import { ownWalletBuildConfigV1, type OwnWalletBuildConfigV1 } from '../lib/own-wallet/config';
import { injectedEthereumV1, type OwnWalletEip1193ProviderV1 } from '../lib/own-wallet/guardian-sign';
import { createIndexedDbLocalStoreV1, type OwnWalletLocalStorePortV1 } from '../lib/own-wallet/local-store';
import { createPublicChainReaderV1, type OwnWalletPublicChainReaderV1 } from '../lib/own-wallet/public-chain-reader';
import { webCryptoP256VerifierV1 } from '../lib/own-wallet/verify-device';
import { browserWebAuthnPortV1 } from '../lib/own-wallet/webauthn';

export interface WalletOriginBrowserBaseV1 {
  config: OwnWalletBuildConfigV1;
  locationOrigin: string;
  hash: string;
  store: OwnWalletLocalStorePortV1;
}

export function walletOriginBaseV1(): WalletOriginBrowserBaseV1 {
  return { config: ownWalletBuildConfigV1(), locationOrigin: window.location.origin, hash: window.location.hash, store: createIndexedDbLocalStoreV1() };
}

export function walletOriginReaderV1(config: OwnWalletBuildConfigV1): OwnWalletPublicChainReaderV1 | null {
  if (config.chainId === null) return null;
  try {
    return createPublicChainReaderV1({ chainId: config.chainId, rpcUrl: config.publicRpc[config.chainId] });
  } catch {
    return null;
  }
}

export function walletOriginClientV1(config: OwnWalletBuildConfigV1) {
  return createWalletOriginClientV1({ apiOrigin: config.apiOrigin });
}

export function walletOriginRandomV1(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);
  return bytes;
}

export async function walletOriginFetchTextV1(url: string): Promise<string> {
  const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  if (!res.ok) throw new Error('registration_file_unavailable');
  return res.text();
}

/** S6: the injected EIP-1193 wallet of the guardian page (`window.ethereum`), or `null`. */
export function walletOriginEthereumV1(): OwnWalletEip1193ProviderV1 | null {
  return injectedEthereumV1(window);
}

export { browserWebAuthnPortV1, webCryptoP256VerifierV1 };
