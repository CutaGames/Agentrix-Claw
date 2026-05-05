import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';

export default function ConsoleDeveloperSkills(): React.ReactElement {
  return (
    <ConsoleLayout title="My Skill Listings">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 24 }}>
        Manage skill listings you have published to the marketplace. Backed by{' '}
        <code>/api/v1/skill-listings/me/*</code>. Editor / publish UI lands in W22 (R2-1).
      </p>
      <div style={{ padding: 40, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, color: '#9aa3b2' }}>
        Skill submission editor coming in W22. For now, use the API or visit{' '}
        <Link href="/developers/console" style={{ color: '#22D3FF' }}>
          Developer Console
        </Link>
        .
      </div>
    </ConsoleLayout>
  );
}
