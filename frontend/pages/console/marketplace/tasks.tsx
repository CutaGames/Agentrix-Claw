import React from 'react';
import dynamic from 'next/dynamic';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';

// The legacy task marketplace component is heavy and pulls in chart libs;
// load it lazily inside the console shell.
const TaskMarketplace = dynamic(
  () => import('../../../components/marketplace/TaskMarketplace').then((m) => m.TaskMarketplace),
  { ssr: false, loading: () => <div style={{ color: '#6c7689', padding: 24 }}>Loading task marketplace…</div> },
);

export default function ConsoleMarketplaceTasks(): React.ReactElement {
  return (
    <ConsoleLayout title="Task Market (A2A)">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 24 }}>
        Cross-user A2A task matching. Post tasks, place bids, deliver, settle. Backed by{' '}
        <code>/api/v1/a2a/tasks</code>.
      </p>
      <TaskMarketplace />
    </ConsoleLayout>
  );
}
