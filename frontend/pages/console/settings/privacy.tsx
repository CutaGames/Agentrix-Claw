import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';

export default function ConsoleSettingsPrivacy(): React.ReactElement {
  return (
    <ConsoleLayout title="Privacy Fence">
      <p style={{ color: '#9aa3b2', fontSize: 14 }}>
        4 sensitive memory categories — financial / health / relationship / location — with
        TTL grants and revocation. Backed by <code>/api/v1/privacy/*</code>.
      </p>
      <div style={{ padding: 40, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, color: '#9aa3b2', marginTop: 16 }}>
        Privacy fence grants UI coming in W24.
      </div>
    </ConsoleLayout>
  );
}
