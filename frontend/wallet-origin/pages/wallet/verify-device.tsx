import React, { useEffect, useState } from 'react';
import { browserWebAuthnPortV1, walletOriginBaseV1, walletOriginRandomV1, walletOriginReaderV1, webCryptoP256VerifierV1 } from '../../browser-deps';
import { VerifyDeviceView, type OwnWalletVerifyDeviceViewDepsV1 } from '../../views/VerifyDeviceView';

/** L8-6 wallet origin `/wallet/verify-device/`: "本设备核对". */
export default function VerifyDevicePage() {
  const [deps, setDeps] = useState<OwnWalletVerifyDeviceViewDepsV1 | null>(null);
  useEffect(() => {
    const base = walletOriginBaseV1();
    setDeps({
      ...base,
      webauthn: browserWebAuthnPortV1(),
      reader: walletOriginReaderV1(base.config),
      verifier: webCryptoP256VerifierV1(),
      random: walletOriginRandomV1,
      now: () => new Date(),
      navigate: (url) => window.location.assign(url),
    });
  }, []);
  return deps ? <VerifyDeviceView deps={deps} /> : null;
}
