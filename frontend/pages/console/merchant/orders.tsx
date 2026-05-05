import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { ConsoleStub } from '../../../components/console/ConsoleStub';

export default function ConsoleMerchantOrders(): React.ReactElement {
  return (
    <ConsoleLayout title="Orders">
      <ConsoleStub
        description="Order fulfillment & shipping. Backed by backend `merchant` module orders endpoints."
        eta="W24 (R4-1)"
        legacyHref="/merchants/dashboard"
        legacyLabel="Open legacy merchant dashboard"
      />
    </ConsoleLayout>
  );
}
