import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { T, cardStyle } from '../../../lib/console.theme';

const MOCK_WORKFLOWS = [
  { id: 'wf-1', name: 'Daily BTC Brief', status: 'active', triggers: 'cron: 08:00', lastRun: '2026-05-10 08:01', runs: 42 },
  { id: 'wf-2', name: 'Auto-translate PR', status: 'active', triggers: 'webhook: github', lastRun: '2026-05-09 14:30', runs: 18 },
  { id: 'wf-3', name: 'Weekly Report', status: 'paused', triggers: 'cron: Mon 09:00', lastRun: '2026-05-05 09:00', runs: 7 },
  { id: 'wf-4', name: 'Price Alert ETH', status: 'active', triggers: 'condition: ETH > $4000', lastRun: '2026-05-08 22:15', runs: 3 },
];

export default function DeveloperWorkflows(): React.ReactElement {
  const { t } = useLocalization();

  return (
    <ConsoleLayout title={t({ zh: '工作流', en: 'Workflows' })}>
      <p style={{ color: T.text.secondary, marginBottom: 24, fontSize: 14 }}>
        {t({ zh: '创建自动化工作流：定时任务、Webhook 触发、条件监控。宠物 Agent 自动执行。', en: 'Create automated workflows: cron jobs, webhook triggers, condition monitors. Your pet agent executes them.' })}
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>{t({ zh: '我的工作流', en: 'My Workflows' })}</h3>
        <button style={{
          padding: '8px 16px', borderRadius: 8, background: '#6366f1',
          color: 'white', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
        }}>
          + {t({ zh: '新建工作流', en: 'New Workflow' })}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {MOCK_WORKFLOWS.map((wf) => (
          <div key={wf.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{wf.name}</div>
              <div style={{ fontSize: 12, color: T.text.muted, marginTop: 4 }}>
                {wf.triggers} · {t({ zh: `已运行 ${wf.runs} 次`, en: `${wf.runs} runs` })}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                background: wf.status === 'active' ? 'rgba(74,222,128,0.15)' : 'rgba(251,191,36,0.15)',
                color: wf.status === 'active' ? '#4ade80' : '#fbbf24',
              }}>
                {wf.status}
              </span>
              <span style={{ fontSize: 11, color: T.text.muted }}>{wf.lastRun}</span>
            </div>
          </div>
        ))}
      </div>
    </ConsoleLayout>
  );
}
