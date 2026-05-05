import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';

const STUB = (key: string, hint: string) =>
  function Stub(): React.ReactElement {
    return (
      <ConsoleLayout title={key}>
        <p style={{ color: '#9aa3b2', fontSize: 14 }}>{hint}</p>
        <div style={{ padding: 40, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, color: '#9aa3b2', marginTop: 16 }}>
          UI coming in W24 (R4-5).
        </div>
      </ConsoleLayout>
    );
  };

export default STUB('Profile', 'Display name, avatar, locale, default form (compact / pro).');
