import React from 'react';
import { ConsoleLayout } from '../../components/console/ConsoleLayout';

export default function ConsoleWallet() {
  return (
    <ConsoleLayout title="Wallet">
      <p style={{ color: '#9aa3b2' }}>
        Balances, transactions, top-ups. Backed by <code>/api/v1/wallet/projection</code>{' '}
        (live in P0-W2).
      </p>
    </ConsoleLayout>
  );
}
