import React, { useState } from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { T, cardStyle } from '../../../lib/console.theme';

const METHODS = [
  { id: 'stripe', label: '💳 Stripe (Visa / Mastercard)', enabled: true },
  { id: 'usdc', label: '🪙 USDC (ERC-20 / Solana)', enabled: true },
  { id: 'sol', label: '◎ SOL', enabled: true },
  { id: 'x402', label: '⚡ X402 Micropay', enabled: true },
  { id: 'axp', label: '💎 AXP Redeem (≤20%)', enabled: true },
];

export default function ConsoleCheckout(): React.ReactElement {
  const { t } = useLocalization();
  const [selected, setSelected] = useState('stripe');
  const [amount, setAmount] = useState('14.99');

  return (
    <ConsoleLayout title={t({ zh: '结账', en: 'Checkout' })}>
      <p style={{ color: T.text.secondary, marginBottom: 24, fontSize: 14 }}>
        {t({ zh: '统一结账：支持法币（Stripe）+ 加密货币（USDC / SOL / X402）+ AXP 抵扣。', en: 'Unified checkout: Fiat (Stripe) + Crypto (USDC / SOL / X402) + AXP redeem.' })}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Payment method selection */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            {t({ zh: '选择支付方式', en: 'Payment Method' })}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {METHODS.map((m) => (
              <label
                key={m.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 8,
                  border: `1px solid ${selected === m.id ? '#22D3FF' : '#1f242d'}`,
                  background: selected === m.id ? 'rgba(34,211,255,0.05)' : 'transparent',
                  cursor: 'pointer', fontSize: 13,
                }}
              >
                <input
                  type="radio" name="method" value={m.id}
                  checked={selected === m.id}
                  onChange={() => setSelected(m.id)}
                  style={{ accentColor: '#22D3FF' }}
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>

        {/* Order summary */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            {t({ zh: '订单摘要', en: 'Order Summary' })}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.text.secondary }}>
              <span>{t({ zh: '订阅升级 Plus', en: 'Upgrade to Plus' })}</span>
              <span style={{ fontWeight: 600, color: T.text.primary }}>${amount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.text.secondary }}>
              <span>{t({ zh: 'AXP 抵扣', en: 'AXP Redeem' })}</span>
              <span style={{ color: '#22D3FF' }}>-$0.00</span>
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid #1f242d' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}>
              <span>{t({ zh: '合计', en: 'Total' })}</span>
              <span>${amount}</span>
            </div>
            <button style={{
              marginTop: 12, padding: '12px 20px', borderRadius: 8,
              background: '#FACC15', color: '#0a0c10', fontWeight: 700,
              fontSize: 14, border: 'none', cursor: 'pointer',
            }}>
              {t({ zh: '确认支付', en: 'Confirm Payment' })}
            </button>
          </div>
        </div>
      </div>
    </ConsoleLayout>
  );
}
