import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { ConsoleStub } from '../../../components/console/ConsoleStub';

export default function ConsoleMerchantProducts(): React.ReactElement {
  return (
    <ConsoleLayout title="Products">
      <ConsoleStub
        description="Manage your product catalog. Backed by backend `merchant` module catalog endpoints."
        eta="W24 (R4-1)"
        legacyHref="/admin/products"
        legacyLabel="Open legacy admin product catalog (admin role required)"
      />
    </ConsoleLayout>
  );
}
