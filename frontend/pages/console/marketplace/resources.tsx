import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';

const RESOURCES = [
  { title: 'Datasets', href: '/marketplace', desc: 'Curated public + private datasets for fine-tuning.' },
  { title: 'Models / LoRAs', href: '/marketplace', desc: 'Foundation models, adapters, and inference endpoints.' },
  { title: 'Compute Credits', href: '/pricing', desc: 'GPU / CPU credits priced per token & per hour.' },
  { title: 'MCP Servers', href: '/console/marketplace/plugins', desc: 'Model Context Protocol tool servers.' },
  { title: 'Prompt Templates', href: '/marketplace', desc: 'Battle-tested prompt packs by use-case.' },
  { title: 'Knowledge Bases', href: '/marketplace', desc: 'Pre-indexed RAG corpora.' },
];

export default function ConsoleMarketplaceResources(): React.ReactElement {
  return (
    <ConsoleLayout title="Resource Marketplace">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 24 }}>
        Datasets, models, compute credits, MCP servers, and other building blocks
        for your Agent. Powered by the unified marketplace backend.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {RESOURCES.map((r) => {
          const inner = (
            <div style={{ padding: 20, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{r.title}</div>
              <div style={{ color: '#9aa3b2', fontSize: 13, flex: 1, lineHeight: 1.6 }}>{r.desc}</div>
              <div style={{ color: '#22D3FF', fontSize: 13, fontWeight: 600 }}>Browse →</div>
            </div>
          );
          return r.href.startsWith('/console') ? (
            <Link key={r.title} href={r.href} style={{ textDecoration: 'none' }}>{inner}</Link>
          ) : (
            <a key={r.title} href={r.href} style={{ textDecoration: 'none' }}>{inner}</a>
          );
        })}
      </div>
    </ConsoleLayout>
  );
}
