import React from 'react';
import { ConsoleLayout } from '../../components/console/ConsoleLayout';

export default function ConsoleBilling() {
  return (
    <ConsoleLayout title="Billing">
      <p style={{ color: '#9aa3b2' }}>
        Subscriptions, invoices, payment methods. Will integrate with Stripe in P0-W3.
      </p>
    </ConsoleLayout>
  );
}
