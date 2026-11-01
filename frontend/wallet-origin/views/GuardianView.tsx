/**
 * L8-6 wallet origin `/wallet/guardian/` (design 5.4 step 5, R4-L10): a guardian's page. The new key's fingerprint is
 * decoded on this page from the recovery UserOp (never a server text); the guardians come from the chain through the
 * public node. Signing goes only through an injected EIP-1193 wallet (`guardian-sign.ts`); a signer that is not a
 * guardian is refused before anything is posted (appendix C item 36); no wallet: item 35.
 */
import React, { useEffect, useState } from 'react';
import type { OwnWalletOriginClientV1 } from '../../lib/own-wallet/client';
import { walletOriginProblemV1, type OwnWalletBuildConfigV1 } from '../../lib/own-wallet/config';
import { OWN_WALLET_PAGE_COPY_ZH_V1 as COPY } from '../../lib/own-wallet/copy';
import { guardianProgressTextV1, guardianSignRecoveryV1, type OwnWalletEip1193ProviderV1 } from '../../lib/own-wallet/guardian-sign';
import { readGuardianLinkV1 } from '../../lib/own-wallet/links';
import type { OwnWalletPublicChainReaderV1 } from '../../lib/own-wallet/public-chain-reader';
import { loadGuardianRequestV1, type OwnWalletRecoveryViewStateV1 } from '../../lib/own-wallet/recovery-flow';
import { recoveryRefusalLineV1 } from './RecoverView';

export interface OwnWalletGuardianViewDepsV1 {
  config: OwnWalletBuildConfigV1;
  locationOrigin: string;
  hash: string;
  client: OwnWalletOriginClientV1;
  reader: OwnWalletPublicChainReaderV1 | null;
  /** `window.ethereum` (injected wallets only), or `null`. */
  ethereum: OwnWalletEip1193ProviderV1 | null;
}

type View =
  | { step: 'loading' }
  | { step: 'ready'; state: OwnWalletRecoveryViewStateV1; busy?: boolean; problem?: { reasonCode: string; message?: string }; posted?: { collected: number; required: number; state: string } }
  | { step: 'refused'; reasonCode: string; message?: string };

export function GuardianView({ deps }: { deps: OwnWalletGuardianViewDepsV1 }) {
  const [view, setView] = useState<View>({ step: 'loading' });

  useEffect(() => {
    let live = true;
    const show = (v: View) => {
      if (live) setView(v);
    };
    (async () => {
      const problem = walletOriginProblemV1(deps.config, deps.locationOrigin);
      if (problem) return show({ step: 'refused', reasonCode: problem });
      const link = readGuardianLinkV1(deps.hash);
      if (link.ok === false) return show({ step: 'refused', reasonCode: link.reasonCode });
      const loaded = await loadGuardianRequestV1(link.value, { chainId: deps.config.chainId, client: deps.client, reader: deps.reader });
      if (loaded.ok === false) return show({ step: 'refused', reasonCode: loaded.reasonCode, ...(loaded.message ? { message: loaded.message } : {}) });
      return show({ step: 'ready', state: loaded.state });
    })().catch(() => show({ step: 'refused', reasonCode: 'check_failed' }));
    return () => {
      live = false;
    };
  }, [deps]);

  const sign = async (current: Extract<View, { step: 'ready' }>) => {
    setView({ ...current, busy: true, problem: undefined });
    const signed = await guardianSignRecoveryV1(deps.ethereum, { userOpHash: current.state.userOpHash, guardians: current.state.guardians });
    if (signed.ok === false) return setView({ ...current, busy: false, problem: { reasonCode: signed.reasonCode, ...(signed.message ? { message: signed.message } : {}) } });
    const posted = await deps.client.postEcdsaSignatures(current.state.requestRef, current.state.walletToken, [signed.signature]);
    if (posted.ok === false) return setView({ ...current, busy: false, problem: { reasonCode: posted.code } });
    return setView({ ...current, busy: false, problem: undefined, posted: { collected: posted.value.collected, required: posted.value.required, state: posted.value.state } });
  };

  return (
    <section className="ow-card" data-testid="own-wallet-guardian">
      <p className="ow-header">{COPY.pageHeader}</p>
      {view.step === 'ready' ? (
        <div data-testid="own-wallet-guardian-ready">
          <p className="ow-mono ow-address">{view.state.account}</p>
          <p className="ow-mono" data-testid="own-wallet-guardian-fingerprint">{view.state.fingerprint}</p>
          <p className="ow-line">{COPY.guardianFingerprintNote}</p>
          <p className="ow-line">{COPY.recoveryVotes.replace('{N}', String(view.state.threshold))}</p>
          {deps.ethereum === null ? (
            <p className="ow-red" role="alert" data-testid="own-wallet-guardian-no-wallet">
              {COPY.guardianNoWallet}
            </p>
          ) : view.posted ? (
            <p className="ow-line" data-testid="own-wallet-guardian-progress" data-state={view.posted.state}>
              {guardianProgressTextV1(view.posted.collected, view.posted.required)}
            </p>
          ) : (
            <button type="button" className="ow-button" disabled={view.busy === true} onClick={() => void sign(view)} data-testid="own-wallet-guardian-sign">
              {COPY.signButton}
            </button>
          )}
          {view.problem ? (
            <p className="ow-red" role="alert" data-testid="own-wallet-guardian-problem" data-reason={view.problem.reasonCode}>
              {view.problem.message ?? recoveryRefusalLineV1(view.problem.reasonCode)}
            </p>
          ) : null}
        </div>
      ) : null}
      {view.step === 'refused' ? (
        <div data-testid="own-wallet-guardian-refused" data-reason={view.reasonCode}>
          {view.message ? <p className="ow-red" role="alert">{view.message}</p> : null}
          <p className="ow-line">{recoveryRefusalLineV1(view.reasonCode)}</p>
          <p className="ow-mono ow-muted">{view.reasonCode}</p>
        </div>
      ) : null}
    </section>
  );
}

export default GuardianView;
