import React, { useEffect, useState } from 'react';
import { browserWebAuthnPortV1, walletOriginBaseV1, walletOriginClientV1, walletOriginRandomV1, walletOriginReaderV1 } from '../../browser-deps';
import { RecoverView, type OwnWalletRecoverViewDepsV1 } from '../../views/RecoverView';

/** L8-6 wallet origin `/wallet/recover/`: the owner's new device after the wallet passkey was lost (5.4). */
export default function RecoverPage() {
  const [deps, setDeps] = useState<OwnWalletRecoverViewDepsV1 | null>(null);
  useEffect(() => {
    const base = walletOriginBaseV1();
    setDeps({
      ...base,
      client: walletOriginClientV1(base.config),
      webauthn: browserWebAuthnPortV1(),
      reader: walletOriginReaderV1(base.config),
      random: walletOriginRandomV1,
      now: () => new Date(),
    });
  }, []);
  return deps ? <RecoverView deps={deps} /> : null;
}
