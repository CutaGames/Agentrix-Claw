/**
 * L8-6 wallet origin `/wallet/recover/` (design 5.4 steps 1-5): the owner's new device. Creates a new wallet passkey,
 * posts only its public key, checks the recovery UserOp the server assembled (`recovery-flow.ts`), writes L, then shows
 * the new key's fingerprint, the guardian link to send and "已有 k / N 位签名". The recovery code is typed and signed
 * here; it stays in this component's memory, is cleared after signing and only its signature is posted.
 */
import React, { useEffect, useState } from 'react';
import type { OwnWalletOriginClientV1 } from '../../lib/own-wallet/client';
import { walletOriginProblemV1, type OwnWalletBuildConfigV1 } from '../../lib/own-wallet/config';
import { OWN_WALLET_PAGE_COPY_ZH_V1 as COPY } from '../../lib/own-wallet/copy';
import { guardianProgressTextV1 } from '../../lib/own-wallet/guardian-sign';
import { readRecoverLinkV1, walletGuardianUrlV1, type OwnWalletCreateLinkV1 } from '../../lib/own-wallet/links';
import type { OwnWalletLocalStorePortV1 } from '../../lib/own-wallet/local-store';
import type { OwnWalletPublicChainReaderV1 } from '../../lib/own-wallet/public-chain-reader';
import { postRecoveryCodeSignatureV1, startRecoveryOnNewDeviceV1, type OwnWalletRecoveryViewStateV1 } from '../../lib/own-wallet/recovery-flow';
import type { OwnWalletWebAuthnPortV1 } from '../../lib/own-wallet/webauthn';

export interface OwnWalletRecoverViewDepsV1 {
  config: OwnWalletBuildConfigV1;
  locationOrigin: string;
  hash: string;
  client: OwnWalletOriginClientV1;
  webauthn: OwnWalletWebAuthnPortV1 | null;
  store: OwnWalletLocalStorePortV1;
  reader: OwnWalletPublicChainReaderV1 | null;
  random: (length: number) => Uint8Array;
  now: () => Date;
}

type View =
  | { step: 'loading' }
  | { step: 'ready' | 'creating'; link: OwnWalletCreateLinkV1 }
  | { step: 'started'; state: OwnWalletRecoveryViewStateV1; collected: number; requestState: string; problem?: string; busy?: boolean }
  | { step: 'refused'; reasonCode: string; message?: string };

export function recoveryRefusalLineV1(reasonCode: string): string {
  if (reasonCode === 'request_expired') return COPY.requestExpired;
  if (reasonCode === 'network_unavailable' || reasonCode === 'rpc_unavailable') return COPY.networkUnavailable;
  if (reasonCode === 'wallet_key_belongs_to_other_owner') return COPY.walletKeyOtherOwner;
  if (reasonCode === 'recovery_code_not_this_wallet') return COPY.recoveryCodeNotThisWallet;
  return COPY.nothingSigned;
}

export function RecoverView({ deps }: { deps: OwnWalletRecoverViewDepsV1 }) {
  const [view, setView] = useState<View>({ step: 'loading' });
  const [phrase, setPhrase] = useState('');

  useEffect(() => {
    const problem = walletOriginProblemV1(deps.config, deps.locationOrigin);
    if (problem) return setView({ step: 'refused', reasonCode: problem });
    const link = readRecoverLinkV1(deps.hash);
    if (link.ok === false) return setView({ step: 'refused', reasonCode: link.reasonCode });
    return setView({ step: 'ready', link: link.value });
  }, [deps]);

  const start = async (link: OwnWalletCreateLinkV1) => {
    setView({ step: 'creating', link });
    const result = await startRecoveryOnNewDeviceV1(link, {
      chainId: deps.config.chainId,
      rpId: deps.config.walletRpId,
      client: deps.client,
      webauthn: deps.webauthn,
      store: deps.store,
      reader: deps.reader,
      random: deps.random,
      now: deps.now,
    });
    if (result.ok === false) return setView({ step: 'refused', reasonCode: result.reasonCode, ...(result.message ? { message: result.message } : {}) });
    return setView({ step: 'started', state: result.state, collected: 0, requestState: 'pending' });
  };

  const signWithCode = async (current: Extract<View, { step: 'started' }>) => {
    setView({ ...current, busy: true, problem: undefined });
    const typed = phrase;
    setPhrase('');
    const result = await postRecoveryCodeSignatureV1(deps.client, current.state, typed);
    if (result.ok === false) return setView({ ...current, busy: false, problem: result.reasonCode });
    return setView({ ...current, busy: false, problem: undefined, collected: result.value.collected, requestState: result.value.state });
  };

  const guardianLink = view.step === 'started' ? walletGuardianUrlV1(deps.config.walletOrigin, view.state.requestRef, view.state.walletToken) : null;

  return (
    <section className="ow-card" data-testid="own-wallet-recover">
      <p className="ow-header">{COPY.pageHeader}</p>
      {view.step === 'ready' || view.step === 'creating' ? (
        <div>
          {view.link.agentName ? <p className="ow-title">{view.link.agentName}</p> : null}
          <button type="button" className="ow-button" disabled={view.step === 'creating'} onClick={() => void start(view.link)} data-testid="own-wallet-recover-create">
            {COPY.recoverCreateButton}
          </button>
        </div>
      ) : null}
      {view.step === 'started' ? (
        <div data-testid="own-wallet-recover-started" data-state={view.requestState}>
          <p className="ow-mono" data-testid="own-wallet-recover-fingerprint">{view.state.fingerprint}</p>
          <p className="ow-line" data-testid="own-wallet-recover-progress">{guardianProgressTextV1(view.collected, view.state.threshold)}</p>
          {guardianLink ? <p className="ow-mono ow-muted" data-testid="own-wallet-recover-guardian-link">{guardianLink}</p> : null}
          {view.requestState === 'pending' ? (
            <div>
              <textarea className="ow-input" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" spellCheck={false} data-testid="own-wallet-recover-code" />
              <button type="button" className="ow-button" disabled={view.busy === true || phrase.trim().length === 0} onClick={() => void signWithCode(view)} data-testid="own-wallet-recover-with-code">
                {COPY.recoverWithCodeButton}
              </button>
            </div>
          ) : null}
          {view.problem ? (
            <p className="ow-red" role="alert" data-reason={view.problem}>
              {recoveryRefusalLineV1(view.problem)}
            </p>
          ) : null}
        </div>
      ) : null}
      {view.step === 'refused' ? (
        <div data-testid="own-wallet-recover-refused" data-reason={view.reasonCode}>
          {view.message ? <p className="ow-red" role="alert">{view.message}</p> : null}
          <p className="ow-line">{recoveryRefusalLineV1(view.reasonCode)}</p>
          <p className="ow-mono ow-muted">{view.reasonCode}</p>
        </div>
      ) : null}
    </section>
  );
}

export default RecoverView;
