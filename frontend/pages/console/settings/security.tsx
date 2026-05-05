import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';

export default function ConsoleSettingsSecurity(): React.ReactElement {
  return (
    <ConsoleLayout title="Security & Co-sign">
      <p style={{ color: '#9aa3b2', fontSize: 14 }}>
        Configure L2 / L3 multi-surface co-sign policy and biometric requirements. Backed by{' '}
        <code>/api/v1/cosign/*</code>.
      </p>
      <div style={{ padding: 40, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, color: '#9aa3b2', marginTop: 16 }}>
        Co-sign policy UI coming in W24 (R4-5).
      </div>
    </ConsoleLayout>
  );
}
