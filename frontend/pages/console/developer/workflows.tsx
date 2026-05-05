import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';

export default function ConsoleDeveloperWorkflows(): React.ReactElement {
  return (
    <ConsoleLayout title="Workflow Templates">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 24 }}>
        Compose Skill graphs with the Skill Canvas (Desktop). Web editor for{' '}
        <code>/api/v1/workflow/templates</code> lands in W22.
      </p>
      <div style={{ padding: 40, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, color: '#9aa3b2' }}>
        Workflow template editor coming in W22.
      </div>
    </ConsoleLayout>
  );
}
