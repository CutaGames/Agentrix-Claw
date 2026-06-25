import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { T, cardStyle } from '../../../lib/console.theme';

const MOCK_EARNINGS = [
  { id: '1', source: 'Skill: Smart Checkout', type: 'skill_revenue', amount: 12.50, date: '2026-05-10' },
  { id: '2', source: 'Skin: Cyber Dragon', type: 'skin_sale', amount: 9.99, date: '2026-05-09' },
  { id: '3', source: 'Remix royalty: Neon Cat', type: 'remix_royalty', amount: 2.30, date: '2026-05-08' },
  { id: '4', source: 'Task: Translate contract', type: 'task_completion', amount: 5.00, date: '2026-05-07' },
  { id: '5', source: 'Referral commission L1', type: 'referral', amount: 3.20, date: '2026-05-06' },
];

export default function DeveloperEarnings(): React.ReactElement {
  const { t } = useLocalization();
  const total = MOCK_EARNINGS.reduce((s, e) => s + e.amount, 0);

  return (
    <ConsoleLayout title={t({ zh: '创作者收入', en: 'Creator Earnings' })}>
      <p style={{ color: T.text.secondary, marginBottom: 24, fontSize: 14 }}>
        {t({ zh: '技能分成 · 皮肤销售 · Remix 版税 · 任务酬劳 · 推广佣金', en: 'Skill revenue · Skin sales · Remix royalties · Task rewards · Referral commissions' })}
      </p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: t({ zh: '本月总收入', en: 'This Month' }), value: `$${total.toFixed(2)}` },
          { label: t({ zh: '待结算', en: 'Pending' }), value: '$7.50' },
          { label: t({ zh: '已提现', en: 'Withdrawn' }), value: '$124.30' },
          { label: t({ zh: 'AXP 返现', en: 'AXP Cashback' }), value: '1,240 AXP' },
        ].map((s) => (
          <div key={s.label} style={cardStyle}>
            <div style={{ fontSize: 11, color: T.text.muted, textTransform: 'uppercase' }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Earnings table */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1f242d', background: '#11141a' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', color: T.text.muted, fontWeight: 600 }}>{t({ zh: '来源', en: 'Source' })}</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', color: T.text.muted, fontWeight: 600 }}>{t({ zh: '类型', en: 'Type' })}</th>
              <th style={{ padding: '10px 14px', textAlign: 'right', color: T.text.muted, fontWeight: 600 }}>{t({ zh: '金额', en: 'Amount' })}</th>
              <th style={{ padding: '10px 14px', textAlign: 'right', color: T.text.muted, fontWeight: 600 }}>{t({ zh: '日期', en: 'Date' })}</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_EARNINGS.map((e) => (
              <tr key={e.id} style={{ borderBottom: '1px solid #1f242d' }}>
                <td style={{ padding: '10px 14px' }}>{e.source}</td>
                <td style={{ padding: '10px 14px', color: T.text.secondary }}>{e.type.replace(/_/g, ' ')}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#4ade80' }}>+${e.amount.toFixed(2)}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: T.text.muted }}>{e.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ConsoleLayout>
  );
}
