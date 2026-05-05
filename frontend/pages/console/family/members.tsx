import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';

export default function ConsoleFamilyMembers(): React.ReactElement {
  return (
    <ConsoleLayout title="Family Members">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 24 }}>
        Invite family members (admin / member / child role) and manage their permissions.
        Backed by <code>/api/v1/family/:id/invite</code>.
      </p>
      <div style={{ padding: 40, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, color: '#9aa3b2' }}>
        Member roster + invite UI coming in W24 (R4-4).
      </div>
    </ConsoleLayout>
  );
}
