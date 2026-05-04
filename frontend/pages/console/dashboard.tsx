import React from 'react';
import { ConsoleLayout } from '../../components/console/ConsoleLayout';

export default function ConsoleDashboard() {
  return (
    <ConsoleLayout title="Dashboard">
      <p style={{ color: '#9aa3b2', marginBottom: 24 }}>
        Real-time overview of your Agentrix workspace. Wired to <code>/api/v1/wallet/projection</code>{' '}
        and <code>/api/v1/pet/state</code> in P0-W3.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {[
          { label: 'Active Agents', value: '—' },
          { label: 'Pending Approvals', value: '—' },
          { label: 'Wallet Balance', value: '—' },
          { label: 'Open Sessions', value: '—' },
        ].map((kpi) => (
          <div key={kpi.label} style={{
            padding: 20,
            background: '#11141a',
            border: '1px solid #1f242d',
            borderRadius: 12,
          }}>
            <div style={{ fontSize: 12, color: '#6c7689', textTransform: 'uppercase' }}>{kpi.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{kpi.value}</div>
          </div>
        ))}
      </div>
    </ConsoleLayout>
  );
}
