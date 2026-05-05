import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';

export default function ConsoleFamilyPet(): React.ReactElement {
  return (
    <ConsoleLayout title="Family Pet">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 24 }}>
        Shared family pet — every household member sees the same emotion in
        real-time. Backed by Family Pet entity inside <code>/api/v1/family/:id</code>.
      </p>
      <div style={{ padding: 40, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, color: '#9aa3b2' }}>
        Family Pet config + interaction UI coming in W24.
      </div>
    </ConsoleLayout>
  );
}
