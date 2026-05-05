import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { apiClient } from '../../../lib/api/client';

interface Receipt {
  id: string;
  type?: string;
  status?: string;
  amount?: number;
  amountCents?: number;
  currency?: string;
  createdAt?: string;
  description?: string;
}

export default function ConsoleWalletAudit(): React.ReactElement {
  const [receipts, setReceipts] = React.useState<Receipt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [packageId, setPackageId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await apiClient.get<Receipt[] | { items?: Receipt[] }>('/receipts', { params: { limit: 50 } });
        if (!alive) return;
        setReceipts(Array.isArray(r) ? r : r?.items ?? []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const generatePackage = async (): Promise<void> => {
    setGenerating(true);
    try {
      const r = await apiClient.post<{ id: string }>('/receipts/audit-package', {});
      if (r?.id) setPackageId(r.id);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ConsoleLayout title="Compliance Audit">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ color: '#9aa3b2', fontSize: 14, margin: 0 }}>
          Cryptographically-signed receipt trail for every settlement. Backed by <code>/receipts</code>.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={generatePackage} disabled={generating} style={btnPrimary}>
            {generating ? 'Generating…' : '+ Generate Audit Package'}
          </button>
          {packageId && (
            <a
              href={`/api/receipts/audit-packages/${packageId}/download`}
              style={btnSecondary}
              download
            >
              ↓ Download
            </a>
          )}
        </div>
      </div>

      {loading && receipts.length === 0 ? (
        <Empty msg="Loading receipts…" />
      ) : receipts.length === 0 ? (
        <Empty msg="No receipts yet — they appear after the first settlement." />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <Th>ID</Th><Th>Type</Th><Th>Amount</Th><Th>Status</Th><Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {receipts.slice(0, 50).map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #1f242d' }}>
                <Td style={{ fontFamily: 'monospace', fontSize: 11, color: '#6c7689' }}>{r.id.slice(0, 12)}…</Td>
                <Td>{r.type ?? '—'}</Td>
                <Td><strong style={{ color: '#22D3FF' }}>${((r.amountCents ?? (r.amount ? r.amount * 100 : 0)) / 100).toFixed(2)}</strong></Td>
                <Td>{r.status ?? '—'}</Td>
                <Td style={{ fontSize: 11, color: '#6c7689' }}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ConsoleLayout>
  );
}

const btnPrimary: React.CSSProperties = { padding: '8px 14px', background: '#22D3FF', color: '#07080B', border: 0, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { padding: '8px 14px', background: '#11141a', color: '#22D3FF', border: '1px solid #1f242d', borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none' };
function Empty({ msg }: { msg: string }): React.ReactElement {
  return <div style={{ padding: 32, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 10, color: '#9aa3b2', fontSize: 13 }}>{msg}</div>;
}
function Th({ children }: { children: React.ReactNode }): React.ReactElement {
  return <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: 11, color: '#6c7689', textTransform: 'uppercase', fontWeight: 600 }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }): React.ReactElement {
  return <td style={{ padding: '10px 8px', ...style }}>{children}</td>;
}
