import React, { useEffect, useState } from 'react';
import { walletOriginBaseV1 } from '../../browser-deps';
import { BadgeView, type OwnWalletBadgeDepsV1 } from '../../views/BadgeView';

/** L8-6 wallet origin `/wallet/badge/`: framed by the main site only (frame-ancestors). */
export default function BadgePage() {
  const [deps, setDeps] = useState<OwnWalletBadgeDepsV1 | null>(null);
  useEffect(() => {
    setDeps({ ...walletOriginBaseV1(), parent: window.parent === window ? null : window.parent });
  }, []);
  return deps ? <BadgeView deps={deps} /> : null;
}
