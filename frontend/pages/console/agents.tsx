import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../components/console/ConsoleLayout';

/**
 * Console Agents — bridge page that surfaces every existing agent surface
 * (Studio, Builder, Marketplace) until the unified agent table (R1) ships.
 */
export default function ConsoleAgents(): React.ReactElement {
  const cards = [
    { title: 'Agent Team Studio', desc: '11-role team orchestration with approval levels.', href: '/agent-team-studio' },
    { title: 'Agent Builder', desc: 'No-code agent assembler with skill picker.', href: '/agent-builder' },
    { title: 'Agent Marketplace', desc: 'Browse and clone published agents.', href: '/marketplace' },
    { title: 'Agent Account', desc: 'Per-agent ledger, quotas, and credentials.', href: '/agent-account' },
    { title: 'Agent Standalone Apps', desc: 'Standalone deployable agent shells.', href: '/agent-standalone' },
    { title: 'Cross-device Presence', desc: 'See where agents are running right now.', href: '/console/presence' },
  ];
  return (
    <ConsoleLayout title="Agents">
      <p style={{ color: '#9aa3b2', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        Quick entries to every agent surface in the platform. Unified agent
        registry view will replace this in R1.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {cards.map((c) => {
          const inner = (
            <div style={{ padding: 20, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{c.title}</div>
              <div style={{ color: '#9aa3b2', fontSize: 13, flex: 1, lineHeight: 1.6 }}>{c.desc}</div>
              <div style={{ color: '#22D3FF', fontSize: 13, fontWeight: 600 }}>Open →</div>
            </div>
          );
          return c.href.startsWith('/console') ? (
            <Link key={c.href} href={c.href} style={{ textDecoration: 'none' }}>{inner}</Link>
          ) : (
            <a key={c.href} href={c.href} style={{ textDecoration: 'none' }}>{inner}</a>
          );
        })}
      </div>
    </ConsoleLayout>
  );
}
