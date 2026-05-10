import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { T, cardStyle } from '../../../lib/console.theme';

const MOCK_PRODUCTS = [
  { id: 'p1', name: 'Smart Checkout Skill', type: 'skill', price: 9.99, sales: 42, status: 'active' },
  { id: 'p2', name: 'Cyber Dragon Skin', type: 'skin', price: 14.99, sales: 18, status: 'active' },
  { id: 'p3', name: 'Translation Service', type: 'task', price: 5.00, sales: 7, status: 'active' },
  { id: 'p4', name: 'Neon Cat Skin Pack', type: 'skin', price: 24.99, sales: 3, status: 'draft' },
  { id: 'p5', name: 'Weekly Report Workflow', type: 'workflow', price: 2.99, sales: 0, status: 'review' },
];

export default function MerchantProducts(): React.ReactElement {
  const { t } = useLocalization();

  return (
    <ConsoleLayout title={t({ zh: '商品管理', en: 'Products' })}>
      <p style={{ color: T.text.secondary, marginBottom: 24, fontSize: 14 }}>
        {t({ zh: '管理你上架的技能、皮肤、任务和工作流商品。', en: 'Manage your listed skills, skins, tasks and workflow products.' })}
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['all', 'skill', 'skin', 'task'].map((f) => (
            <button key={f} style={{ padding: '6px 14px', borderRadius: 16, fontSize: 12, fontWeight: 600, background: f === 'all' ? '#6366f1' : '#1f242d', color: f === 'all' ? 'white' : T.text.secondary, border: 'none', cursor: 'pointer' }}>
              {f === 'all' ? t({ zh: '全部', en: 'All' }) : f}
            </button>
          ))}
        </div>
        <button style={{ padding: '8px 16px', borderRadius: 8, background: '#6366f1', color: 'white', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          + {t({ zh: '新建商品', en: 'New Product' })}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {MOCK_PRODUCTS.map((p) => (
          <div key={p.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: T.text.muted, marginTop: 4 }}>
                {p.type} · ${p.price} · {t({ zh: `${p.sales} 笔销售`, en: `${p.sales} sales` })}
              </div>
            </div>
            <span style={{
              padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
              background: p.status === 'active' ? 'rgba(74,222,128,0.15)' : p.status === 'draft' ? 'rgba(156,163,175,0.15)' : 'rgba(251,191,36,0.15)',
              color: p.status === 'active' ? '#4ade80' : p.status === 'draft' ? '#9ca3af' : '#fbbf24',
            }}>
              {p.status}
            </span>
          </div>
        ))}
      </div>
    </ConsoleLayout>
  );
}
