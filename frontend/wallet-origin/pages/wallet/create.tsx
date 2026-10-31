import React, { useEffect, useState } from 'react';
import { browserWebAuthnPortV1, walletOriginBaseV1, walletOriginClientV1, walletOriginRandomV1 } from '../../browser-deps';
import { CreateView, type OwnWalletCreateViewDepsV1 } from '../../views/CreateView';

/** L8-6 wallet origin `/wallet/create/`: make the wallet passkey on this device. */
export default function CreatePage() {
  const [deps, setDeps] = useState<OwnWalletCreateViewDepsV1 | null>(null);
  useEffect(() => {
    const base = walletOriginBaseV1();
    setDeps({ ...base, client: walletOriginClientV1(base.config), webauthn: browserWebAuthnPortV1(), random: walletOriginRandomV1, now: () => new Date() });
  }, []);
  return deps ? <CreateView deps={deps} /> : null;
}
