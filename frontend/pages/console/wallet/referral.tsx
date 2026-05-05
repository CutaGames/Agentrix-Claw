import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { apiClient } from '../../../lib/api/client';

interface ReferralStats {
  total_referrals?: number;
  totalReferrals?: number;
  active_referrals?: number;
  totalEarned?: number;
  totalEarnedCents?: number;
  pending?: number;
}

interface ReferralLink {
  code?: string;
  url?: string;
  shortUrl?: string;
}

export default function ConsoleWalletReferral(): React.ReactElement {
  const [stats, setStats] = React.useState<ReferralStats | null>(null);
  const [link, setLink] = React.useState<ReferralLink | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [s, l] = await Promise.all([
          apiClient.get<ReferralStats>('/referral/stats').catch((): null => null),
          apiClient.get<ReferralLink>('/referral/link').catch((): null => null),
        ]);
        if (!alive) return;
        setStats(s);
        setLink(l);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const fullUrl = link?.url || link?.shortUrl ||
    (link?.code && typeof window !== 'undefined'
      ? `${window.location.origin}/?ref=${link.code}`
      : '');

  const copyLink = async (): Promise<void> => {
    if (!fullUrl) return;
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const total = stats?.totalReferrals ?? stats?.total_referrals ?? 0;
  const earned = (stats?.totalEarnedCents ?? (stats?.totalEarned ? stats.totalEarned * 100 : 0)) / 100;

  return (
    <ConsoleLayout title="Referral & Affiliate">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 16 }}>
        Earn commission when people you invite top up or buy on Agentrix.
        Backed by <code>/referral/*</code>.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Stat label="Total Referrals" value={String(total)} />
        <Stat label="Active" value={String(stats?.active_referrals ?? 0)} />
        <Stat label="Pending" value={String(stats?.pending ?? 0)} />
        <Stat label="Total Earned" value={`$${earned.toFixed(2)}`} accent />
      </div>

      <div style={{ padding: 20, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12 }}>
        <div style={{ fontSize: 13, color: '#9aa3b2', marginBottom: 8 }}>Your invite link</div>
        {loading ? (
          <div style={{ fontSize: 13, color: '#6c7689' }}>Loading…</div>
        ) : fullUrl ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, padding: 10, background: '#0a0c11', border: '1px solid #1f242d', borderRadius: 6, fontSize: 12, color: '#22D3FF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fullUrl}
            </code>
            <button onClick={copyLink} style={{ padding: '10px 16px', background: '#22D3FF', color: '#07080B', border: 0, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#6c7689' }}>No referral link generated yet.</div>
        )}
      </div>
    </ConsoleLayout>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }): React.ReactElement {
  return (
    <div style={{ padding: 16, background: '#11141a', border: '1px solid #1f242d', borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: '#6c7689', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: accent ? '#22D3FF' : '#E2E8F0' }}>{value}</div>
    </div>
  );
}
