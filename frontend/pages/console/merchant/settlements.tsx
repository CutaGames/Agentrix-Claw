import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { T, cardStyle } from '../../../lib/console.theme';

const MOCK_SETTLEMENTS = [
  { id: 'stl-1', period: '2026-05 W1', amount: 42.50, method: 'Stripe → Bank', status: 'paid', paidAt: '2026-05-08' },
  { id: 'stl-2', period: '2026-04 W4', amount: 38.20, method: 'USDC → Wallet', status: 'paid', paidAt: '2026-05-01' },
  { id: 'stl-3', period: '2026-04 W3', amount: 55.00, method: 'Stripe → Bank', status: 'paid', paidAt: '2026-04-24' },
  { id: 'stl-4', period: '2026-05 W2', amount: 28.70, method: 'Pending', status: 'pending', paidAt: '' },
];

export default function MerchantSettlements(): React.ReactElement {
  const { t } = useLocalization();
  const totalPaid = MOCK_SETTLEMENTS.filter((s) => s.status === 'paid').reduce((sum, s) => sum + s.amount, 0);

  return (
    <ConsoleLayout title={t({ zh: '结算', en: 'Settlements' })}>
      <p style={{ color: T.text.secondary, marginBottom: 24, fontSize: 14 }}>
        {t({ zh: '查看结算周期、已付款和待结算金额。支持 Stripe 银行转账和 USDC 链上结算。', en: 'View settlement periods, paid and pending amounts. Supports Stripe bank transfer and USDC on-chain settlement.' })}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: T.text.muted, textTransform: 'uppercase' }}>{t({ zh: '累计已结算', en: 'Total Settled' })}</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: '#4ade80' }}>${totalPaid.toFixed(2)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: T.text.muted, textTransform: 'uppercase' }}>{t({ zh: '待结算', en: 'Pending' })}</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: '#fbbf24' }}>$28.70</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: T.text.muted, textTransform: 'uppercase' }}>{t({ zh: '结算周期', en: 'Cycle' })}</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>{t({ zh: '每周', en: 'Weekly' })}</div>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1f242d', background: '#11141a' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', color: T.text.muted }}>{t({ zh: '周期', en: 'Period' })}</th>
              <th style={{ padding: '10px 14px', textAlign: 'right', color: T.text.muted }}>{t({ zh: '金额', en: 'Amount' })}</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', color: T.text.muted }}>{t({ zh: '方式', en: 'Method' })}</th>
              <th style={{ padding: '10px 14px', textAlign: 'center', color: T.text.muted }}>{t({ zh: '状态', en: 'Status' })}</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_SETTLEMENTS.map((s) => (
              <tr key={s.id} style={{ borderBottom: '1px solid #1f242d' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600 }}>{s.period}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>${s.amount.toFixed(2)}</td>
                <td style={{ padding: '10px 14px', color: T.text.secondary }}>{s.method}</td>
                <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: s.status === 'paid' ? '#4ade80' : '#fbbf24', background: s.status === 'paid' ? 'rgba(74,222,128,0.15)' : 'rgba(251,191,36,0.15)' }}>
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ConsoleLayout>
  );
}
