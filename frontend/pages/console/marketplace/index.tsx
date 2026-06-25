import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';

const SECTIONS = [
  { title: 'Skill Marketplace', href: '/console/marketplace/skills', desc: 'OpenClaw / OpenHub developer skills.' },
  { title: 'Task Market (A2A)', href: '/console/marketplace/tasks', desc: 'Agent-to-Agent task matching & bidding.' },
  { title: 'Resources', href: '/console/marketplace/resources', desc: 'Datasets, models, MCP servers, compute.' },
  { title: 'Plugins / MCP', href: '/console/marketplace/plugins', desc: 'Tool servers via Model Context Protocol.' },
];

export default function ConsoleMarketplaceIndex(): React.ReactElement {
  return (
    <ConsoleLayout title="Marketplace">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 24 }}>
        Three sub-markets unified under one roof: Skills, Tasks (A2A), Resources, MCP plugins.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} style={{ textDecoration: 'none' }}>
            <div style={{ padding: 20, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{s.title}</div>
              <div style={{ color: '#9aa3b2', fontSize: 13, flex: 1, lineHeight: 1.6 }}>{s.desc}</div>
              <div style={{ color: '#22D3FF', fontSize: 13, fontWeight: 600 }}>Open →</div>
            </div>
          </Link>
        ))}
      </div>
    </ConsoleLayout>
  );
}
