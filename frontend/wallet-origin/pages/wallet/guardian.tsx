import React, { useEffect, useState } from 'react';
import { walletOriginBaseV1, walletOriginClientV1, walletOriginEthereumV1, walletOriginReaderV1 } from '../../browser-deps';
import { GuardianView, type OwnWalletGuardianViewDepsV1 } from '../../views/GuardianView';

/** L8-6 wallet origin `/wallet/guardian/`: a guardian signs a recovery with an injected wallet (5.4 step 5). */
export default function GuardianPage() {
  const [deps, setDeps] = useState<OwnWalletGuardianViewDepsV1 | null>(null);
  useEffect(() => {
    const base = walletOriginBaseV1();
    setDeps({ config: base.config, locationOrigin: base.locationOrigin, hash: base.hash, client: walletOriginClientV1(base.config), reader: walletOriginReaderV1(base.config), ethereum: walletOriginEthereumV1() });
  }, []);
  return deps ? <GuardianView deps={deps} /> : null;
}
