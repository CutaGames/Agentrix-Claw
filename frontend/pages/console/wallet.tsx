import React from 'react';
import { ConsoleLayout } from '../../components/console/ConsoleLayout';
import { v1Api, type WalletProjection } from '../../lib/api/v1.api';
import { useLocalization } from '../../contexts/LocalizationContext';
import { L } from '../../lib/console.i18n';
import { T, cardStyle } from '../../lib/console.theme';

function fmt(cents?: number): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ConsoleWallet(): React.ReactElement {
  const { t } = useLocalization();
  const [w, setW] = React.useState<WalletProjection | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      const r = await v1Api.wallet.getProjection().catch((): null => null);
      if (!alive) return;
      setW(r);
      setLoading(false);
    };
    void load();
    const id = window.setInterval(load, 10_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  return (
    <ConsoleLayout title={t(L.wallet.title)}>
      <p style={{ color: T.text.secondary, marginBottom: 24 }}>{t(L.wallet.desc)}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
        <Stat label={t(L.wallet.totalBalance)} value={fmt(w?.total_balance_cents)} accent />
        <Stat label={t(L.wallet.available)} value={fmt(w?.available_balance_cents)} />
        <Stat label={t(L.wallet.pending)} value={fmt(w?.pending_balance_cents)} />
      </div>

      {w?.fiat && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <h3 style={H3}>{t(L.wallet.fiat)}</h3>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.text.accent }}>
            {w.fiat.currency} {fmt(w.fiat.balance_cents)}
          </div>
        </div>
      )}

      {w?.crypto && w.crypto.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <h3 style={H3}>{t(L.wallet.crypto)}</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: T.font.sizeSmall }}>
            <thead><tr><Th>{t({ zh: '币种', en: 'Symbol' })}</Th><Th>{t({ zh: '链', en: 'Chain' })}</Th><Th>{t({ zh: '余额', en: 'Balance' })}</Th><Th>USD</Th></tr></thead>
            <tbody>
              {w.crypto.map((c) => (
                <tr key={`${c.chain}-${c.symbol}`} style={{ borderTop: `1px solid ${T.border.subtle}` }}>
                  <Td><strong>{c.symbol}</strong></Td>
                  <Td style={{ color: T.text.muted }}>{c.chain}</Td>
                  <Td>{c.balance}</Td>
                  <Td style={{ color: T.text.accent }}>${c.usd_value.toFixed(2)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {w?.recent_txs && w.recent_txs.length > 0 ? (
        <div style={cardStyle}>
          <h3 style={H3}>{t(L.wallet.recentTxs)}</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: T.font.sizeSmall }}>
            <thead><tr><Th>{t(L.common.type)}</Th><Th>{t({ zh: '金额', en: 'Amount' })}</Th><Th>{t(L.common.status)}</Th><Th>{t(L.common.createdAt)}</Th></tr></thead>
            <tbody>
              {w.recent_txs.slice(0, 20).map((tx) => (
                <tr key={tx.id} style={{ borderTop: `1px solid ${T.border.subtle}` }}>
                  <Td>{tx.kind}</Td>
                  <Td style={{ color: T.text.accent, fontWeight: 600 }}>{fmt(tx.amount_cents)}</Td>
                  <Td>{tx.status}</Td>
                  <Td style={{ color: T.text.muted, fontSize: T.font.sizeTiny }}>{new Date(tx.created_at).toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !loading && <div style={{ color: T.text.muted, fontSize: T.font.sizeSmall }}>{t({ zh: '暂无交易', en: 'No transactions yet.' })}</div>
      )}
    </ConsoleLayout>
  );
}

const H3: React.CSSProperties = { fontSize: T.font.sizeH2, fontWeight: T.font.weightSemibold, marginBottom: 12, color: T.text.primary };

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }): React.ReactElement {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8, color: accent ? T.text.accent : T.text.primary }}>{value}</div>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }): React.ReactElement {
  return <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: T.font.sizeTiny, color: T.text.muted, textTransform: 'uppercase', fontWeight: 600 }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }): React.ReactElement {
  return <td style={{ padding: '10px 8px', color: T.text.primary, ...style }}>{children}</td>;
}
