import React from 'react';
import { ConsoleLayout } from '../../components/console/ConsoleLayout';

export default function ConsoleAgents() {
  return (
    <ConsoleLayout title="Agents">
      <p style={{ color: '#9aa3b2' }}>
        Manage agent instances, permissions, and deployments. Will pull from
        existing <code>/agent-team-studio</code>, <code>/agent-builder</code>, and{' '}
        <code>/marketplace</code> modules in P0-W3.
      </p>
    </ConsoleLayout>
  );
}
