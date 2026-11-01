import React, { useEffect, useState } from 'react';
import { OwnWalletApprovalCard, type OwnWalletApprovalDepsV1 } from '../../../components/own-wallet/OwnWalletApprovalCard';
import { browserWebAuthnPortV1, walletOriginBaseV1, walletOriginClientV1, walletOriginFetchTextV1, walletOriginReaderV1 } from '../../browser-deps';

/** L8-6 wallet origin `/wallet/approve/`: see every W2.5 / W2.6 check before the wallet passkey signs. */
export default function ApprovePage() {
  const [deps, setDeps] = useState<OwnWalletApprovalDepsV1 | null>(null);
  useEffect(() => {
    const base = walletOriginBaseV1();
    setDeps({ ...base, client: walletOriginClientV1(base.config), webauthn: browserWebAuthnPortV1(), reader: walletOriginReaderV1(base.config), fetchText: walletOriginFetchTextV1 });
  }, []);
  return deps ? <OwnWalletApprovalCard deps={deps} /> : null;
}
