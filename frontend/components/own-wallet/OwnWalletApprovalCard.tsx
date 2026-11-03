/**
 * L8-6 own wallet: the signing card of the wallet origin's approve page (design W2.5, W2.6, H2, H3).
 *
 * Order, each step refusing before the next: the page runs only on the wallet origin; the link is read from the URL
 * fragment only; the request comes from `GET /wallet-requests/:ref` (one-time token); the chain facts and the
 * registration file are read by the page itself; `checkWalletRequestV1` runs every W2.5 / W2.6 check; only when it
 * passes is the sign button shown, and only a click on it calls `navigator.credentials.get` with the LOCAL hash as the
 * challenge, the build-time RP ID and L's credential. Server `challenge` / `rpId` / `allowCredentials` are never read.
 * A refusal still shows what the page decoded (the "forged link with a matching intent" case, W2.6).
 *
 * Used only on the wallet origin (static export, no inline style: the CSP has no 'unsafe-inline'). Imports only React,
 * ethers and the own-wallet library.
 */
import React, { useEffect, useState } from 'react';
import { formatUnits } from 'ethers';
import { approvalInputsV1 } from '../../lib/own-wallet/approval-inputs';
import type { OwnWalletOriginClientV1 } from '../../lib/own-wallet/client';
import { walletOriginProblemV1, type OwnWalletBuildConfigV1 } from '../../lib/own-wallet/config';
import { OWN_WALLET_PAGE_COPY_ZH_V1 as COPY, ownWalletPurposeTitleV1 } from '../../lib/own-wallet/copy';
import { readWalletLinkV1 } from '../../lib/own-wallet/intent';
import { walletAccountUrlV1 } from '../../lib/own-wallet/links';
import { findLocalAccountV1, readLocalRecordsV1, type OwnWalletLocalRecordV1, type OwnWalletLocalStorePortV1 } from '../../lib/own-wallet/local-store';
import type { OwnWalletPublicChainReaderV1 } from '../../lib/own-wallet/public-chain-reader';
import { checkWalletRequestV1, type OwnWalletDisplayV1, type OwnWalletGrantAllowanceV1 } from '../../lib/own-wallet/purpose-checks';
import { signUserOpHashV1, type OwnWalletWebAuthnPortV1 } from '../../lib/own-wallet/webauthn';

export interface OwnWalletApprovalDepsV1 {
  config: OwnWalletBuildConfigV1;
  /** `window.location.origin`. */
  locationOrigin: string;
  /** `window.location.hash`: the only place the link (and the intent) is read from. */
  hash: string;
  client: OwnWalletOriginClientV1;
  webauthn: OwnWalletWebAuthnPortV1 | null;
  store: OwnWalletLocalStorePortV1;
  reader: OwnWalletPublicChainReaderV1 | null;
  fetchText: (url: string) => Promise<string>;
}

type View =
  | { step: 'loading' }
  | { step: 'refused'; reasonCode: string; message?: string; display?: OwnWalletDisplayV1; verifyUrl?: string }
  | { step: 'ready' | 'signing'; display: OwnWalletDisplayV1; userOpHash: string; credentialId: string; requestRef: string; walletToken: string }
  | { step: 'done'; state: string; userOpHash: string; txHash?: string };

function refusalText(reasonCode: string): string {
  if (reasonCode === 'request_expired') return COPY.requestExpired;
  if (reasonCode === 'network_unavailable') return COPY.networkUnavailable;
  // S7 (c): the honest sentence, never "try again later".
  if (reasonCode === 'session_module_installed') return COPY.sessionModuleInstalled;
  if (reasonCode === 'recovery_required') return COPY.recoveryRequired;
  return COPY.nothingSigned;
}

/** `2026-11-01 08:00 UTC` from unix seconds. */
function utcMinuteText(seconds: number): string {
  const iso = new Date(seconds * 1000).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function GrantAllowance({ allowance }: { allowance: OwnWalletGrantAllowanceV1 }) {
  const amount = (value: string) => `${formatUnits(BigInt(value), allowance.decimals)} ${allowance.symbol}`;
  return (
    <div>
      <p className="ow-line">{COPY.grantPayee}</p>
      <p className="ow-mono">{allowance.payee}</p>
      {allowance.payeeIsOwnVault ? <p className="ow-line">{COPY.ownVault}</p> : null}
      <p className="ow-line">
        {COPY.grantTotal} {amount(allowance.total)}
      </p>
      {allowance.maxCount !== undefined ? <p className="ow-line">{COPY.grantCount.replace('{N}', String(allowance.maxCount))}</p> : null}
      {allowance.perTransfer !== undefined ? (
        <p className="ow-line">
          {COPY.grantPerTransfer} {amount(allowance.perTransfer)}
        </p>
      ) : null}
      {allowance.perPaymentFromLink !== undefined ? <p className="ow-line">{COPY.grantPerPayment.replace('{数额}', amount(allowance.perPaymentFromLink))}</p> : null}
    </div>
  );
}

function Votes({ n }: { n: number }) {
  return <p className="ow-line">{COPY.recoveryVotes.replace('{N}', String(n))}</p>;
}

function AddressList({ items }: { items: string[] }) {
  return (
    <ul className="ow-list">
      {items.map((a) => (
        <li key={a} className="ow-mono">{a}</li>
      ))}
    </ul>
  );
}

/** W2.6 last column: what the owner is shown, all from the local decode. */
export function OwnWalletDisplayLinesV1({ display }: { display: OwnWalletDisplayV1 }) {
  switch (display.purpose) {
    case 'deploy_setup': {
      const title = ownWalletPurposeTitleV1('deploy_setup', display.register ? { name: display.register.name } : {});
      return (
        <div data-testid="own-wallet-display">
          <p className="ow-title">{title}</p>
          <p className="ow-mono">{display.accountAddress}</p>
          <p className="ow-line">{COPY.keyOnThisDevice.replace('{名字}', display.credentialLabel ?? display.agentName ?? '?')}</p>
          <AddressList items={display.guardians} />
          <Votes n={display.threshold} />
          {display.register ? (
            <>
              <p className="ow-line">{display.register.name}</p>
              <p className="ow-line">{display.register.description}</p>
              <p className="ow-mono">{display.register.cardUrl}</p>
              <p className="ow-mono">{display.register.registry} · {display.register.chainName}</p>
              <p className="ow-line">{COPY.registerNote}</p>
            </>
          ) : null}
        </div>
      );
    }
    case 'install_recovery':
      return (
        <div data-testid="own-wallet-display">
          <p className="ow-line">{COPY.recoveryNotSet}</p>
          <p className="ow-title">{ownWalletPurposeTitleV1('install_recovery', { votes: display.threshold })}</p>
          <p className="ow-mono">{display.accountAddress}</p>
          <AddressList items={display.guardians} />
        </div>
      );
    case 'register':
      return (
        <div data-testid="own-wallet-display">
          <p className="ow-title">{ownWalletPurposeTitleV1('register', { name: display.name })}</p>
          <p className="ow-line">{display.description}</p>
          <p className="ow-mono">{display.cardUrl}</p>
          <p className="ow-mono">{display.registry} · {display.chainName}</p>
          <p className="ow-line">{COPY.registerNote}</p>
        </div>
      );
    case 'revoke_registration':
      return (
        <div data-testid="own-wallet-display">
          <p className="ow-title">{ownWalletPurposeTitleV1('revoke_registration', { name: display.name })}</p>
          <p className="ow-mono">agentId {display.agentId}</p>
          <p className="ow-mono">sessions {display.sessionsRemoved}</p>
        </div>
      );
    case 'revoke_session':
      return (
        <div data-testid="own-wallet-display">
          <p className="ow-mono">{display.permissionId}</p>
        </div>
      );
    case 'add_credential':
      return (
        <div data-testid="own-wallet-display">
          <p className="ow-mono">{display.fingerprint}</p>
          <p className="ow-line">{COPY.addCredentialNote}</p>
        </div>
      );
    case 'remove_credential':
      return (
        <div data-testid="own-wallet-display">
          <p className="ow-line">{display.label ?? COPY.notThisDeviceKey}</p>
          <p className="ow-mono">{display.fingerprint}</p>
        </div>
      );
    case 'set_guardians':
      return (
        <div data-testid="own-wallet-display">
          <AddressList items={display.guardians} />
          <Votes n={display.threshold} />
        </div>
      );
    case 'transfer':
      return (
        <div data-testid="own-wallet-display">
          <p className="ow-title">
            转给 <span className="ow-mono">{display.to}</span> {formatUnits(BigInt(display.amount), display.decimals)} {display.symbol}
          </p>
          {display.toIsOwnVault ? <p className="ow-line">{COPY.ownVault}</p> : null}
        </div>
      );
    case 'recover':
      return (
        <div data-testid="own-wallet-display">
          <p className="ow-mono">{display.fingerprint}</p>
          {display.role === 'guardian' ? <p className="ow-line">{COPY.guardianFingerprintNote}</p> : null}
        </div>
      );
    case 'grant_session':
      // Everything here is decoded from the UserOp (the device name and the single-payment cap come from the link and
      // say so). No raw bytes are shown.
      return (
        <div data-testid="own-wallet-display">
          <p className="ow-title">{ownWalletPurposeTitleV1('grant_session', { name: display.deviceName })}</p>
          <p className="ow-mono">{display.accountAddress}</p>
          <p className="ow-line">{COPY.grantDevice.replace('{名字}', display.deviceName)}</p>
          <p className="ow-line" data-testid="own-wallet-fingerprint">{COPY.grantFingerprint.replace('{指纹}', display.fingerprint)}</p>
          <p className="ow-line">{COPY.grantExpires.replace('{时间}', utcMinuteText(display.validUntil))}</p>
          {display.native ? <GrantAllowance allowance={display.native} /> : null}
          {display.token ? <GrantAllowance allowance={display.token} /> : null}
          <p className="ow-line">{COPY.grantNote}</p>
        </div>
      );
    default:
      return null;
  }
}

export function OwnWalletApprovalCard({ deps }: { deps: OwnWalletApprovalDepsV1 }) {
  const [view, setView] = useState<View>({ step: 'loading' });

  useEffect(() => {
    let live = true;
    const show = (v: View) => {
      if (live) setView(v);
    };
    (async () => {
      const problem = walletOriginProblemV1(deps.config, deps.locationOrigin);
      if (problem) return show({ step: 'refused', reasonCode: problem });
      const link = readWalletLinkV1(deps.hash);
      if (link.ok === false) return show({ step: 'refused', reasonCode: link.reasonCode });
      const got = await deps.client.getRequest(link.value.requestRef, link.value.walletToken);
      if (got.ok === false) return show({ step: 'refused', reasonCode: got.code });
      const request = got.value;
      let records: OwnWalletLocalRecordV1[];
      try {
        records = await readLocalRecordsV1(deps.store);
      } catch {
        return show({ step: 'refused', reasonCode: 'store_unavailable' });
      }
      const inputs = await approvalInputsV1(request, { reader: deps.reader, fetchText: deps.fetchText, fileBaseUrl: deps.config.fileBaseUrl });
      const check = checkWalletRequestV1({
        request,
        configuredChainId: deps.config.chainId,
        intent: link.value.intent,
        records,
        chain: inputs.chain,
        registrationFileText: inputs.registrationFileText,
        pins: { fileBaseUrl: deps.config.fileBaseUrl, mainOrigin: deps.config.mainOrigin },
      });
      if (check.ok === false) {
        const refused: Extract<View, { step: 'refused' }> = { step: 'refused', reasonCode: check.reasonCode };
        if (check.message) refused.message = check.message;
        if (check.display) refused.display = check.display;
        if (check.reasonCode === 'local_record_missing' && link.value.intent?.agentId) {
          const url = walletAccountUrlV1(deps.config.walletOrigin, 'verify-device', { chainId: request.chainId, account: request.accountAddress.toLowerCase(), kind: 'agent', agentId: link.value.intent.agentId });
          if (url) refused.verifyUrl = url;
        }
        return show(refused);
      }
      const record = findLocalAccountV1(records, request.chainId, request.userOp.sender);
      if (!record) return show({ step: 'refused', reasonCode: 'local_record_missing' });
      return show({ step: 'ready', display: check.display, userOpHash: check.userOpHash, credentialId: record.credentialId, requestRef: link.value.requestRef, walletToken: link.value.walletToken });
    })().catch(() => show({ step: 'refused', reasonCode: 'check_failed' }));
    return () => {
      live = false;
    };
  }, [deps]);

  const sign = async () => {
    if (view.step !== 'ready') return;
    const ready = view;
    setView({ ...ready, step: 'signing' });
    const signed = await signUserOpHashV1(deps.webauthn, { userOpHash: ready.userOpHash, credentialId: ready.credentialId, rpId: deps.config.walletRpId, walletOrigin: deps.config.walletOrigin });
    if (signed.ok === false) return setView({ step: 'refused', reasonCode: signed.reasonCode, display: ready.display });
    const posted = await deps.client.postSignature(ready.requestRef, ready.walletToken, signed.value);
    if (posted.ok === false) return setView({ step: 'refused', reasonCode: posted.code, display: ready.display });
    return setView({ step: 'done', state: posted.value.state, userOpHash: posted.value.userOpHash, ...(posted.value.txHash ? { txHash: posted.value.txHash } : {}) });
  };

  return (
    <section className="ow-card" data-testid="own-wallet-approval">
      <p className="ow-header">{COPY.pageHeader}</p>
      {view.step === 'loading' ? <p className="ow-line" data-testid="own-wallet-loading">…</p> : null}
      {view.step === 'refused' ? (
        <div data-testid="own-wallet-refused" data-reason={view.reasonCode}>
          {view.message ? <p className="ow-red" role="alert">{view.message}</p> : null}
          {view.display ? <OwnWalletDisplayLinesV1 display={view.display} /> : null}
          <p className="ow-line">{refusalText(view.reasonCode)}</p>
          <p className="ow-mono ow-muted">{view.reasonCode}</p>
          {view.verifyUrl ? (
            <a className="ow-button" href={view.verifyUrl}>
              {COPY.verifyButton}
            </a>
          ) : null}
        </div>
      ) : null}
      {view.step === 'ready' || view.step === 'signing' ? (
        <div>
          <OwnWalletDisplayLinesV1 display={view.display} />
          <button type="button" className="ow-button" disabled={view.step === 'signing'} onClick={() => void sign()} data-testid="own-wallet-sign">
            {COPY.signButton}
          </button>
        </div>
      ) : null}
      {view.step === 'done' ? (
        <div data-testid="own-wallet-done" data-state={view.state}>
          <p className="ow-mono">{view.state}</p>
          <p className="ow-mono ow-muted">{view.userOpHash}</p>
          {view.txHash ? <p className="ow-mono ow-muted">{view.txHash}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

export default OwnWalletApprovalCard;
