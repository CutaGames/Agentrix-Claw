import React from 'react';
import { ConsoleLayout } from '../../components/console/ConsoleLayout';

export default function ConsolePresence() {
  return (
    <ConsoleLayout title="Presence">
      <p style={{ color: '#9aa3b2' }}>
        Cross-device presence, handoffs, approvals. Backed by{' '}
        <code>/api/v1/handoff/*</code> and <code>/api/v1/approval/*</code>{' '}
        (live in P0-W2).
      </p>
    </ConsoleLayout>
  );
}
