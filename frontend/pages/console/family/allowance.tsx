import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';

export default function ConsoleFamilyAllowance(): React.ReactElement {
  return (
    <ConsoleLayout title="Allowance & Budgets">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 24 }}>
        Per-child / per-member allowance pools tied to the wallet budget engine.
      </p>
      <div style={{ padding: 40, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, color: '#9aa3b2' }}>
        Allowance UI coming in W24.
      </div>
    </ConsoleLayout>
  );
}
