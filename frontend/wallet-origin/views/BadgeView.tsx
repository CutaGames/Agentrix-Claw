/**
 * L8-6 wallet origin `/wallet/badge/` (design 2.0 "徽章页", 6a condition 3): framed by the main site only
 * (`frame-ancestors` = the main origin). It reads this origin's own L and reports to its parent with
 * `postMessage(msg, MAIN_ORIGIN)` (the build-time main origin, never `'*'`). It writes nothing and calls no API.
 */
import React, { useEffect, useState } from 'react';
import { badgeMessageV1, postBadgeMessageV1, type OwnWalletMessageTargetV1 } from '../../lib/own-wallet/badge';
import { walletOriginProblemV1, type OwnWalletBuildConfigV1 } from '../../lib/own-wallet/config';
import { OWN_WALLET_PAGE_COPY_ZH_V1 as COPY } from '../../lib/own-wallet/copy';
import { deviceCheckedAccountV1 } from '../../lib/own-wallet/device-check';
import { readAccountLinkV1 } from '../../lib/own-wallet/links';
import { readLocalRecordsV1, type OwnWalletLocalRecordV1, type OwnWalletLocalStorePortV1 } from '../../lib/own-wallet/local-store';

export interface OwnWalletBadgeDepsV1 {
  config: OwnWalletBuildConfigV1;
  locationOrigin: string;
  hash: string;
  store: OwnWalletLocalStorePortV1;
  /** `window.parent`. */
  parent: OwnWalletMessageTargetV1 | null;
}

export function BadgeView({ deps }: { deps: OwnWalletBadgeDepsV1 }) {
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      if (walletOriginProblemV1(deps.config, deps.locationOrigin)) return;
      const link = readAccountLinkV1(deps.hash, 'badge');
      if (link.ok === false) return;
      let records: OwnWalletLocalRecordV1[] = [];
      try {
        records = await readLocalRecordsV1(deps.store);
      } catch {
        records = [];
      }
      const check = deviceCheckedAccountV1(records, link.value, deps.config.chainId);
      postBadgeMessageV1(deps.parent, deps.config.mainOrigin, badgeMessageV1(link.value, check));
      if (live) setVerified(check.ok === true);
    })().catch((): void => undefined);
    return () => {
      live = false;
    };
  }, [deps]);

  return (
    <p className={verified ? 'ow-badge ow-badge-ok' : 'ow-badge'} data-testid="own-wallet-badge" data-verified={verified === null ? 'unknown' : verified ? 'yes' : 'no'}>
      {verified ? COPY.verified : COPY.badgeNotChecked}
    </p>
  );
}

export default BadgeView;
