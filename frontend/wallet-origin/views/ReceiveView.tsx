/**
 * L8-6 wallet origin `/wallet/receive/` (design W1.2, R3-M5): the only page that shows an own account's full address,
 * a copy button and a QR code. The address is the one L computes on this device; the fragment's account is only
 * compared with it. When L does not have the account, its Agent differs, or the computed address differs, the page
 * shows no address at all and links to the verify page.
 */
import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { walletOriginProblemV1, type OwnWalletBuildConfigV1 } from '../../lib/own-wallet/config';
import { OWN_WALLET_PAGE_COPY_ZH_V1 as COPY } from '../../lib/own-wallet/copy';
import { deviceCheckedAccountV1 } from '../../lib/own-wallet/device-check';
import { readAccountLinkV1, walletAccountUrlV1 } from '../../lib/own-wallet/links';
import { readLocalRecordsV1, type OwnWalletLocalStorePortV1 } from '../../lib/own-wallet/local-store';
import { OWN_WALLET_CHAIN_NAMES_V1 } from '../../lib/own-wallet/purpose-checks';

export interface OwnWalletReceiveDepsV1 {
  config: OwnWalletBuildConfigV1;
  locationOrigin: string;
  hash: string;
  store: OwnWalletLocalStorePortV1;
  clipboard: { writeText(text: string): Promise<void> } | null;
}

type View = { step: 'loading' } | { step: 'refused'; reasonCode: string; verifyUrl?: string } | { step: 'ok'; address: string; chainName: string };

export function ReceiveView({ deps }: { deps: OwnWalletReceiveDepsV1 }) {
  const [view, setView] = useState<View>({ step: 'loading' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    const show = (v: View) => {
      if (live) setView(v);
    };
    (async () => {
      const problem = walletOriginProblemV1(deps.config, deps.locationOrigin);
      if (problem) return show({ step: 'refused', reasonCode: problem });
      const link = readAccountLinkV1(deps.hash, 'receive');
      if (link.ok === false) return show({ step: 'refused', reasonCode: link.reasonCode });
      const records = await readLocalRecordsV1(deps.store);
      const check = deviceCheckedAccountV1(records, link.value, deps.config.chainId);
      if (check.ok === false) {
        const verifyUrl = walletAccountUrlV1(deps.config.walletOrigin, 'verify-device', link.value);
        return show({ step: 'refused', reasonCode: check.reasonCode, ...(verifyUrl ? { verifyUrl } : {}) });
      }
      return show({ step: 'ok', address: check.address, chainName: OWN_WALLET_CHAIN_NAMES_V1[link.value.chainId] });
    })().catch(() => show({ step: 'refused', reasonCode: 'store_unavailable' }));
    return () => {
      live = false;
    };
  }, [deps]);

  const copy = async (address: string) => {
    if (!deps.clipboard) return;
    try {
      await deps.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="ow-card" data-testid="own-wallet-receive-page">
      <p className="ow-header">{COPY.pageHeader}</p>
      <p className="ow-title">{COPY.receiveHeader}</p>
      {view.step === 'refused' ? (
        <div data-testid="own-wallet-receive-refused" data-reason={view.reasonCode}>
          <p className="ow-line">{COPY.receiveNotChecked}</p>
          <p className="ow-mono ow-muted">{view.reasonCode}</p>
          {view.verifyUrl ? (
            <a className="ow-button" href={view.verifyUrl}>
              {COPY.verifyButton}
            </a>
          ) : null}
        </div>
      ) : null}
      {view.step === 'ok' ? (
        <div data-testid="own-wallet-receive-address">
          <p className="ow-line">{view.chainName}</p>
          <p className="ow-mono ow-address">{view.address}</p>
          <div className="ow-qr">
            <QRCodeSVG value={view.address} size={192} />
          </div>
          <button type="button" className="ow-button" onClick={() => void copy(view.address)} data-testid="own-wallet-copy">
            {copied ? COPY.copied : COPY.copyAddress}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default ReceiveView;
