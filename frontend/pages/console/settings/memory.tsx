import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';

export default function ConsoleSettingsMemory(): React.ReactElement {
  return (
    <ConsoleLayout title="Memory Tiers">
      <p style={{ color: '#9aa3b2', fontSize: 14 }}>
        4-tier memory store — working (30min TTL) / episodic / semantic /
        procedural. Backed by <code>/api/v1/memory/*</code>.
      </p>
      <div style={{ padding: 40, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, color: '#9aa3b2', marginTop: 16 }}>
        Memory inspector UI coming in W24.
      </div>
    </ConsoleLayout>
  );
}
