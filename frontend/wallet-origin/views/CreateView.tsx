/**
 * L8-6 wallet origin `/wallet/create/` (design 5.1 steps 1-2): makes the wallet passkey on this device, hands its
 * public key to the backend with the one-time token from the fragment, recomputes the server's answer, writes L, and
 * only then shows the address, the key fingerprint and whether the passkey is synced (BS flag).
 */
import React, { useEffect, useState } from 'react';
import type { OwnWalletOriginClientV1 } from '../../lib/own-wallet/client';
import { walletOriginProblemV1, type OwnWalletBuildConfigV1 } from '../../lib/own-wallet/config';
import { OWN_WALLET_PAGE_COPY_ZH_V1 as COPY } from '../../lib/own-wallet/copy';
import { createOwnAccountV1 } from '../../lib/own-wallet/create-account';
import { readCreateLinkV1, type OwnWalletCreateLinkV1 } from '../../lib/own-wallet/links';
import type { OwnWalletLocalRecordV1, OwnWalletLocalStorePortV1 } from '../../lib/own-wallet/local-store';
import type { OwnWalletWebAuthnPortV1 } from '../../lib/own-wallet/webauthn';

export interface OwnWalletCreateViewDepsV1 {
  config: OwnWalletBuildConfigV1;
  locationOrigin: string;
  hash: string;
  client: OwnWalletOriginClientV1;
  webauthn: OwnWalletWebAuthnPortV1 | null;
  store: OwnWalletLocalStorePortV1;
  random: (length: number) => Uint8Array;
  now: () => Date;
}

type View =
  | { step: 'loading' }
  | { step: 'ready' | 'creating'; link: OwnWalletCreateLinkV1 }
  | { step: 'created'; record: OwnWalletLocalRecordV1; fingerprint: string; backedUp: boolean | null }
  | { step: 'refused'; reasonCode: string; message?: string };

function refusalLine(reasonCode: string): string {
  if (reasonCode === 'wallet_key_belongs_to_other_owner') return COPY.walletKeyOtherOwner;
  if (reasonCode === 'request_expired') return COPY.requestExpired;
  if (reasonCode === 'network_unavailable') return COPY.networkUnavailable;
  return COPY.nothingSigned;
}

export function CreateView({ deps }: { deps: OwnWalletCreateViewDepsV1 }) {
  const [view, setView] = useState<View>({ step: 'loading' });

  useEffect(() => {
    const problem = walletOriginProblemV1(deps.config, deps.locationOrigin);
    if (problem) return setView({ step: 'refused', reasonCode: problem });
    const link = readCreateLinkV1(deps.hash);
    if (link.ok === false) return setView({ step: 'refused', reasonCode: link.reasonCode });
    return setView({ step: 'ready', link: link.value });
  }, [deps]);

  const create = async (link: OwnWalletCreateLinkV1) => {
    setView({ step: 'creating', link });
    const result = await createOwnAccountV1(link, {
      chainId: deps.config.chainId,
      rpId: deps.config.walletRpId,
      client: deps.client,
      webauthn: deps.webauthn,
      store: deps.store,
      random: deps.random,
      now: deps.now,
    });
    if (result.ok === false) return setView({ step: 'refused', reasonCode: result.reasonCode, ...(result.message ? { message: result.message } : {}) });
    return setView({ step: 'created', record: result.record, fingerprint: result.fingerprint, backedUp: result.backedUp });
  };

  return (
    <section className="ow-card" data-testid="own-wallet-create">
      <p className="ow-header">{COPY.pageHeader}</p>
      {view.step === 'ready' || view.step === 'creating' ? (
        <div>
          {view.link.agentName ? <p className="ow-title">{view.link.agentName}</p> : null}
          <button type="button" className="ow-button" disabled={view.step === 'creating'} onClick={() => void create(view.link)} data-testid="own-wallet-create-button">
            {COPY.createButton}
          </button>
        </div>
      ) : null}
      {view.step === 'created' ? (
        <div data-testid="own-wallet-created">
          <p className="ow-mono ow-address">{view.record.accountAddress}</p>
          <p className="ow-mono">{view.fingerprint}</p>
          {view.backedUp === null ? null : <p className="ow-line">{view.backedUp ? COPY.passkeySynced : COPY.passkeyDeviceOnly}</p>}
        </div>
      ) : null}
      {view.step === 'refused' ? (
        <div data-testid="own-wallet-create-refused" data-reason={view.reasonCode}>
          {view.message ? <p className="ow-red" role="alert">{view.message}</p> : null}
          <p className="ow-line">{refusalLine(view.reasonCode)}</p>
          <p className="ow-mono ow-muted">{view.reasonCode}</p>
        </div>
      ) : null}
    </section>
  );
}

export default CreateView;
