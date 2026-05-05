import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';

export default function ConsoleDeveloperEarnings(): React.ReactElement {
  return (
    <ConsoleLayout title="Developer Earnings">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 24 }}>
        Skill invoke revenue (80% dev / 20% platform split). Backed by{' '}
        <code>/api/v1/skill-listings/me/earnings</code>. Dashboard widget lands in W23 (R3 / P2-6).
      </p>
      <div style={{ padding: 40, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, color: '#9aa3b2' }}>
        Earnings dashboard coming in W23.
      </div>
    </ConsoleLayout>
  );
}
