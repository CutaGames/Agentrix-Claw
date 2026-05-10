import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { T, cardStyle } from '../../../lib/console.theme';

const MOCK_ORDERS = [
  { id: 'ORD-001', customer: '@alice', product: 'Smart Checkout Skill', amount: 9.99, status: 'completed', date: '2026-05-10' },
  { id: 'ORD-002', customer: '@bob', product: 'Cyber Dragon Skin', amount: 14.99, status: 'completed', date: '2026-05-09' },
  { id: 'ORD-003', customer: '@charlie', product: 'Translation Task', amount: 5.00, status: 'in_progress', date: '2026-05-09' },
  { id: 'ORD-004', customer: '@diana', product: 'Neon Cat Skin (Remix)', amount: 7.50, status: 'pending', date: '2026-05-08' },
  { id: 'ORD-005', customer: '@eve', product: 'Data Analysis Skill', amount: 19.99, status: 'refunded', date: '2026-05-07' },
];

const STATUS_COLORS: Record<string, string> = {
  completed: '#4ade80', in_progress: '#22D3FF', pending: '#fbbf24', refunded: '#f87171',
};

export default function MerchantOrders(): React.ReactElement {
  const { t } = useLocalization();

  return (
    <ConsoleLayout title={t({ zh: '订单管理', en: 'Orders' })}>
      <p style={{ color: T.text.secondary, marginBottom: 24, fontSize: 14 }}>
        {t({ zh: '查看和管理你的商品/技能/任务订单。', en: 'View and manage your product / skill / task orders.' })}
      </p>

      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1f242d', background: '#11141a' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', color: T.text.muted }}>{t({ zh: '订单号', en: 'Order ID' })}</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', color: T.text.muted }}>{t({ zh: '客户', en: 'Customer' })}</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', color: T.text.muted }}>{t({ zh: '商品', en: 'Product' })}</th>
              <th style={{ padding: '10px 14px', textAlign: 'right', color: T.text.muted }}>{t({ zh: '金额', en: 'Amount' })}</th>
              <th style={{ padding: '10px 14px', textAlign: 'center', color: T.text.muted }}>{t({ zh: '状态', en: 'Status' })}</th>
              <th style={{ padding: '10px 14px', textAlign: 'right', color: T.text.muted }}>{t({ zh: '日期', en: 'Date' })}</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_ORDERS.map((o) => (
              <tr key={o.id} style={{ borderBottom: '1px solid #1f242d' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600 }}>{o.id}</td>
                <td style={{ padding: '10px 14px', color: '#22D3FF' }}>{o.customer}</td>
                <td style={{ padding: '10px 14px' }}>{o.product}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>${o.amount.toFixed(2)}</td>
                <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: STATUS_COLORS[o.status] || T.text.muted, background: `${STATUS_COLORS[o.status] || '#666'}20` }}>
                    {o.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: T.text.muted }}>{o.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ConsoleLayout>
  );
}
