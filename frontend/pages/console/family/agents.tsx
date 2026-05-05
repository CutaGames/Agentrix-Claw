import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';

export default function ConsoleFamilyAgents(): React.ReactElement {
  return (
    <ConsoleLayout title="Household Agents">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 24 }}>
        Shared household agents (Butler / Tutor / Concierge…) with{' '}
        <code>visible_to_roles</code> RBAC across owner / admin / member / child.
      </p>
      <div style={{ padding: 40, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, color: '#9aa3b2' }}>
        Household agent provisioning UI coming in W24.
      </div>
    </ConsoleLayout>
  );
}
