import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { ConsoleStub } from '../../../components/console/ConsoleStub';

export default function ConsoleCheckout(): React.ReactElement {
  return (
    <ConsoleLayout title="Checkout">
      <ConsoleStub
        description="Unified checkout: fiat (Stripe) + crypto (USDC / SOL / EVM / x402). Selector lands in W23 (R3-2)."
        eta="W23 (R3-2)"
        legacyHref="/pay/checkout"
        legacyLabel="Open legacy /pay/checkout"
      />
    </ConsoleLayout>
  );
}
