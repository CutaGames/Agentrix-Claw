import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { apiClient } from '../../../lib/api/client';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { L } from '../../../lib/console.i18n';
import { T, cardStyle, btnPrimaryStyle } from '../../../lib/console.theme';

interface ReferralStats {
  total_referrals?: number;
  totalReferrals?: number;
  active_referrals?: number;
  totalEarned?: number;
  totalEarnedCents?: number;
  pending?: number;
}
interface ReferralLink { code?: string; url?: string; shortUrl?: string }

export default function ConsoleWalletReferral(): React.ReactElement {
  const { t } = useLocalization();
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
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const fullUrl = link?.url || link?.shortUrl ||
    (link?.code && typeof window !== 'undefined' ? `${window.location.origin}/?ref=${link.code}` : '');

  const copyLink = async (): Promise<void> => {
    if (!fullUrl) return;
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const total = stats?.totalReferrals ?? stats?.total_referrals ?? 0;
  const earned = (stats?.totalEarnedCents ?? (stats?.totalEarned ? stats.totalEarned * 100 : 0)) / 100;

  return (
    <ConsoleLayout title={t(L.wallet.referralTitle)}>
      <p style={{ color: T.text.secondary, fontSize: T.font.sizeBody, marginBottom: 16 }}>{t(L.wallet.referralDesc)}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Stat label={t(L.wallet.totalReferrals)} value={String(total)} />
        <Stat label={t(L.wallet.activeReferrals)} value={String(stats?.active_referrals ?? 0)} />
        <Stat label={t(L.wallet.pendingReferrals)} value={String(stats?.pending ?? 0)} />
        <Stat label={t(L.wallet.totalEarned)} value={`$${earned.toFixed(2)}`} accent />
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: T.font.sizeSmall, color: T.text.secondary, marginBottom: 10 }}>{t(L.wallet.yourLink)}</div>
        {loading ? (
          <div style={{ fontSize: T.font.sizeSmall, color: T.text.muted }}>{t(L.common.loading)}</div>
        ) : fullUrl ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, padding: 12, background: T.bg.input, border: `1px solid ${T.border.subtle}`, borderRadius: T.radius.sm, fontSize: T.font.sizeCaption, color: T.text.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullUrl}</code>
            <button onClick={copyLink} style={btnPrimaryStyle}>{copied ? `✓ ${t(L.common.copied)}` : t(L.common.copy)}</button>
          </div>
        ) : (
          <div style={{ fontSize: T.font.sizeSmall, color: T.text.muted }}>{t({ zh: '尚未生成邀请链接。', en: 'No referral link generated yet.' })}</div>
        )}
      </div>
    </ConsoleLayout>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }): React.ReactElement {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: accent ? T.text.accent : T.text.primary }}>{value}</div>
    </div>
  );
}
