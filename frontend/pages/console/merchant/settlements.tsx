import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { ConsoleStub } from '../../../components/console/ConsoleStub';

export default function ConsoleMerchantSettlements(): React.ReactElement {
  return (
    <ConsoleLayout title="Settlements">
      <ConsoleStub
        description="Payouts, fees, account periods. Backed by backend `merchant` module settlements endpoints."
        eta="W24 (R4-1)"
        legacyHref="/merchants/audit"
        legacyLabel="Open legacy merchant audit"
      />
    </ConsoleLayout>
  );
}
