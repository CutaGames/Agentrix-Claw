import React, { useEffect, useState } from 'react';
import { walletOriginBaseV1 } from '../../browser-deps';
import { ReceiveView, type OwnWalletReceiveDepsV1 } from '../../views/ReceiveView';

/** L8-6 wallet origin `/wallet/receive/`: the only page with the full address, the copy button and the QR code. */
export default function ReceivePage() {
  const [deps, setDeps] = useState<OwnWalletReceiveDepsV1 | null>(null);
  useEffect(() => {
    setDeps({ ...walletOriginBaseV1(), clipboard: navigator.clipboard ? navigator.clipboard : null });
  }, []);
  return deps ? <ReceiveView deps={deps} /> : null;
}
