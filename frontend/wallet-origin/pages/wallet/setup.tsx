import React, { useEffect, useState } from 'react';
import { walletOriginBaseV1, walletOriginRandomV1 } from '../../browser-deps';
import { SetupView, type OwnWalletSetupViewDepsV1 } from '../../views/SetupView';

/** L8-6 wallet origin `/wallet/setup/`: choose the recovery means, then go back to Agentrix to sign. */
export default function SetupPage() {
  const [deps, setDeps] = useState<OwnWalletSetupViewDepsV1 | null>(null);
  useEffect(() => {
    const base = walletOriginBaseV1();
    setDeps({ ...base, random: walletOriginRandomV1, navigate: (url) => window.location.assign(url) });
  }, []);
  return deps ? <SetupView deps={deps} /> : null;
}
