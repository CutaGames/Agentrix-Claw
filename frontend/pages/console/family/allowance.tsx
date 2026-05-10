import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { T, cardStyle } from '../../../lib/console.theme';

const MOCK_MEMBERS = [
  { id: '1', name: 'Tommy (child)', role: 'child', monthlyLimit: 5.00, spent: 3.20, llmBudget: 0.50 },
  { id: '2', name: 'Sarah (teen)', role: 'member', monthlyLimit: 15.00, spent: 8.40, llmBudget: 2.00 },
  { id: '3', name: 'Grandma', role: 'member', monthlyLimit: 10.00, spent: 1.50, llmBudget: 1.00 },
];

export default function FamilyAllowance(): React.ReactElement {
  const { t } = useLocalization();

  return (
    <ConsoleLayout title={t({ zh: '家庭额度', en: 'Family Allowance' })}>
      <p style={{ color: T.text.secondary, marginBottom: 24, fontSize: 14 }}>
        {t({ zh: '为家庭成员设置每月消费上限和 LLM 预算。子账号超额时自动暂停。', en: 'Set monthly spending limits and LLM budgets for family members. Child accounts auto-pause on overage.' })}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {MOCK_MEMBERS.map((m) => {
          const pct = Math.round((m.spent / m.monthlyLimit) * 100);
          return (
            <div key={m.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</div>
                <div style={{ fontSize: 12, color: T.text.muted, marginTop: 4 }}>
                  {t({ zh: `角色: ${m.role} · LLM 预算: $${m.llmBudget}/月`, en: `Role: ${m.role} · LLM budget: $${m.llmBudget}/mo` })}
                </div>
                {/* Progress bar */}
                <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: '#1f242d', width: '100%', maxWidth: 200 }}>
                  <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(pct, 100)}%`, background: pct > 80 ? '#f87171' : pct > 50 ? '#fbbf24' : '#4ade80' }} />
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>${m.spent.toFixed(2)} / ${m.monthlyLimit.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: T.text.muted }}>{pct}% {t({ zh: '已用', en: 'used' })}</div>
              </div>
            </div>
          );
        })}
      </div>

      <button style={{
        marginTop: 20, padding: '10px 20px', borderRadius: 8, background: '#6366f1',
        color: 'white', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
      }}>
        + {t({ zh: '添加成员额度', en: 'Add Member Allowance' })}
      </button>
    </ConsoleLayout>
  );
}
