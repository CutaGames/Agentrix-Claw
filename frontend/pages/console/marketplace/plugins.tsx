import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { T, cardStyle } from '../../../lib/console.theme';

const MOCK_PLUGINS = [
  { id: 'p1', name: 'Web Search', desc: 'Search the web via Brave/Google', author: 'Agentrix', installed: true, category: 'tool' },
  { id: 'p2', name: 'Code Interpreter', desc: 'Execute Python/JS in sandbox', author: 'Agentrix', installed: true, category: 'tool' },
  { id: 'p3', name: 'Image Generator', desc: 'DALL-E / Stable Diffusion', author: 'Agentrix', installed: false, category: 'creative' },
  { id: 'p4', name: 'Calendar Sync', desc: 'Google Calendar / Outlook', author: 'community', installed: false, category: 'productivity' },
  { id: 'p5', name: 'Crypto Tracker', desc: 'Real-time price alerts', author: 'community', installed: true, category: 'finance' },
  { id: 'p6', name: 'Email Assistant', desc: 'Draft & send emails', author: 'Agentrix', installed: false, category: 'productivity' },
];

export default function MarketplacePlugins(): React.ReactElement {
  const { t } = useLocalization();

  return (
    <ConsoleLayout title={t({ zh: '插件市场', en: 'Plugin Marketplace' })}>
      <p style={{ color: T.text.secondary, marginBottom: 24, fontSize: 14 }}>
        {t({ zh: '为你的宠物 Agent 安装插件，扩展能力。MCP 协议原生支持。', en: 'Install plugins for your pet agent to extend capabilities. Native MCP protocol support.' })}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {MOCK_PLUGINS.map((p) => (
          <div key={p.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: T.text.muted, marginTop: 4 }}>{p.desc}</div>
                <div style={{ fontSize: 11, color: T.text.muted, marginTop: 6 }}>
                  by {p.author} · {p.category}
                </div>
              </div>
              <button style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: p.installed ? 'rgba(74,222,128,0.15)' : '#6366f1',
                color: p.installed ? '#4ade80' : 'white',
              }}>
                {p.installed ? t({ zh: '已安装', en: 'Installed' }) : t({ zh: '安装', en: 'Install' })}
              </button>
            </div>
          </div>
        ))}
      </div>
    </ConsoleLayout>
  );
}
