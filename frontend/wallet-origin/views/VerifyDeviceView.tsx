/**
 * L8-6 wallet origin `/wallet/verify-device/` (design 5.2, 6a, R2-M3, R3-L7): "本设备核对".
 *
 * L already has the account, or another account of a key L holds gives it: checked without a prompt. Otherwise one
 * click asks the authenticator over a local random challenge and checks the signature under the account's on-chain
 * keys (`verifyNewDeviceV1`). When the phone opened the page with a `state`, the page navigates to
 * `agentrix://wallet-verified?state=…&account=…&chainId=…` only after the check passed. The `state` is never sent to
 * any API: the only requests this page makes are the chain reads, which carry the account address alone.
 */
import React, { useEffect, useState } from 'react';
import { walletOriginProblemV1, type OwnWalletBuildConfigV1 } from '../../lib/own-wallet/config';
import { OWN_WALLET_PAGE_COPY_ZH_V1 as COPY } from '../../lib/own-wallet/copy';
import { readAccountLinkV1, type OwnWalletAccountLinkV1 } from '../../lib/own-wallet/links';
import type { OwnWalletLocalStorePortV1 } from '../../lib/own-wallet/local-store';
import type { OwnWalletPublicChainReaderV1 } from '../../lib/own-wallet/public-chain-reader';
import {
  verifiedDeepLinkV1,
  verifyNewDeviceV1,
  verifyWithoutPromptV1,
  type OwnWalletP256VerifierV1,
  type OwnWalletVerifyDeviceResultV1,
} from '../../lib/own-wallet/verify-device';
import type { OwnWalletWebAuthnPortV1 } from '../../lib/own-wallet/webauthn';

export interface OwnWalletVerifyDeviceViewDepsV1 {
  config: OwnWalletBuildConfigV1;
  locationOrigin: string;
  hash: string;
  store: OwnWalletLocalStorePortV1;
  webauthn: OwnWalletWebAuthnPortV1 | null;
  reader: OwnWalletPublicChainReaderV1 | null;
  verifier: OwnWalletP256VerifierV1 | null;
  random: (length: number) => Uint8Array;
  now: () => Date;
  /** `window.location.assign`, for the phone's deep link. */
  navigate: (url: string) => void;
}

type View =
  | { step: 'loading' }
  | { step: 'need_prompt'; link: OwnWalletAccountLinkV1 }
  | { step: 'checking'; link: OwnWalletAccountLinkV1 }
  | { step: 'verified'; how: 'already' | 'same_key' | 'new_device' }
  | { step: 'refused'; reasonCode: string; message?: string; link?: OwnWalletAccountLinkV1 };

export function VerifyDeviceView({ deps }: { deps: OwnWalletVerifyDeviceViewDepsV1 }) {
  const [view, setView] = useState<View>({ step: 'loading' });

  const finish = (link: OwnWalletAccountLinkV1, result: OwnWalletVerifyDeviceResultV1, show: (v: View) => void) => {
    if (result.ok === false) return show({ step: 'refused', reasonCode: result.reasonCode, link, ...(result.message ? { message: result.message } : {}) });
    show({ step: 'verified', how: result.how });
    // Only now, and only the phone's own state, goes back into the deep link.
    if (link.state !== undefined) deps.navigate(verifiedDeepLinkV1(link.state, link.account, link.chainId));
  };

  useEffect(() => {
    let live = true;
    const show = (v: View) => {
      if (live) setView(v);
    };
    (async () => {
      const problem = walletOriginProblemV1(deps.config, deps.locationOrigin);
      if (problem) return show({ step: 'refused', reasonCode: problem });
      const link = readAccountLinkV1(deps.hash, 'verify-device');
      if (link.ok === false) return show({ step: 'refused', reasonCode: link.reasonCode });
      const result = await verifyWithoutPromptV1(link.value, { configuredChainId: deps.config.chainId, store: deps.store, now: deps.now });
      if (result === null) return show({ step: 'need_prompt', link: link.value });
      return finish(link.value, result, show);
    })().catch(() => show({ step: 'refused', reasonCode: 'store_unavailable' }));
    return () => {
      live = false;
    };
    // `finish` only reads deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps]);

  const check = async (link: OwnWalletAccountLinkV1) => {
    setView({ step: 'checking', link });
    const result = await verifyNewDeviceV1(link, {
      configuredChainId: deps.config.chainId,
      store: deps.store,
      now: deps.now,
      reader: deps.reader,
      webauthn: deps.webauthn,
      verifier: deps.verifier,
      rpId: deps.config.walletRpId,
      walletOrigin: deps.config.walletOrigin,
      random: deps.random,
    });
    finish(link, result, setView);
  };

  return (
    <section className="ow-card" data-testid="own-wallet-verify-device">
      <p className="ow-header">{COPY.pageHeader}</p>
      {view.step === 'need_prompt' || view.step === 'checking' ? (
        <div>
          <p className="ow-line">{COPY.badgeNotChecked}</p>
          <button type="button" className="ow-button" disabled={view.step === 'checking'} onClick={() => void check(view.link)} data-testid="own-wallet-verify">
            {COPY.verifyButton}
          </button>
        </div>
      ) : null}
      {view.step === 'verified' ? (
        <p className="ow-title" data-testid="own-wallet-verified" data-how={view.how}>
          {view.how === 'already' ? COPY.verified : COPY.newDeviceReady}
        </p>
      ) : null}
      {view.step === 'refused' ? (
        <div data-testid="own-wallet-verify-refused" data-reason={view.reasonCode}>
          {view.message ? <p className="ow-red" role="alert">{view.message}</p> : null}
          <p className="ow-line">{COPY.badgeNotChecked}</p>
          <p className="ow-mono ow-muted">{view.reasonCode}</p>
        </div>
      ) : null}
    </section>
  );
}

export default VerifyDeviceView;
