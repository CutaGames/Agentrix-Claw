/**
 * Co-Raising Activity — view who fed my pet, when, and cumulative AXP earned.
 *
 * Per docs/WEB_REFACTOR_PLAN_2026-05 §6 + docs/MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 §6.1
 */
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../../contexts/LocalizationContext';
import { Card, CardBody, Stat, Skeleton, Badge } from '../../../../components/ui/ax';
import { coRaisingApi, CoRaisingInviteView } from '../../../../lib/api/coraising.api';
import { ArrowLeft, Sprout, Users, TrendingUp, Coins, AlertCircle } from 'lucide-react';

export default function CoRaisingActivityPage(): React.ReactElement {
  const { t } = useLocalization();
  const [invites, setInvites] = useState<CoRaisingInviteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await coRaisingApi.listMyInvites(50);
      setInvites(data.items ?? []);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404 || status === 501) {
        setInvites([]);
      } else {
        setError(err?.response?.data?.message ?? err?.message ?? 'Load failed');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Aggregate
  const totalFeeders = invites.reduce((s, i) => s + i.feeders_count, 0);
  const totalFeeds = invites.reduce((s, i) => s + i.total_feeds, 0);
  // Mock AXP awarded since backend aggregation not yet exposed
  const estimatedAxpShared = totalFeeds * 5;

  return (
    <ConsoleLayout title={t({ zh: '🌱 共养活动', en: '🌱 Co-Raising Activity' })}>
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/console/promote/co-raising"
          className="inline-flex items-center gap-1 text-sm text-agentrix-electric hover:underline"
        >
          <ArrowLeft size={14} />
          {t({ zh: '返回管理', en: 'Back to manage' })}
        </Link>
      </div>

      <p className="mb-6 text-sm text-agentrix-fog">
        {t({
          zh: '追踪所有邀请链接的喂养活动、喂养者总数、累计赠出 AXP。',
          en: 'Track feeding activity across all invite links, total feeders, and cumulative AXP shared.',
        })}
      </p>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat
          label={t({ zh: '喂养者总数', en: 'Total Feeders' })}
          value={String(totalFeeders)}
          icon={<Users size={16} />}
          accent="accent"
        />
        <Stat
          label={t({ zh: '累计喂养次数', en: 'Total Feeds' })}
          value={String(totalFeeds)}
          icon={<TrendingUp size={16} />}
          accent="success"
        />
        <Stat
          label={t({ zh: '赠出 AXP（估算）', en: 'AXP Shared (est.)' })}
          value={estimatedAxpShared.toLocaleString()}
          icon={<Coins size={16} />}
          accent="warm"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton height={120} />
          <Skeleton height={120} />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
          <AlertCircle size={16} className="inline mr-2" />
          {error}
        </div>
      ) : invites.length === 0 ? (
        <div className="rounded-xl border border-dashed border-agentrix-inkLine bg-agentrix-inkSoft/50 p-10 text-center">
          <Sprout size={48} className="mx-auto text-agentrix-electric/60" />
          <h3 className="mt-4 text-base font-bold">
            {t({ zh: '还没有活动', en: 'No activity yet' })}
          </h3>
          <p className="mt-2 text-xs text-agentrix-mist">
            {t({
              zh: '创建邀请链接后，好友的每次喂养都会显示在这里。',
              en: 'After creating invites, friends\' feeding activity will appear here.',
            })}
          </p>
          <Link
            href="/console/promote/co-raising"
            className="mt-4 inline-block rounded-full bg-agentrix-solar px-4 py-1.5 text-xs font-bold text-agentrix-ink"
          >
            {t({ zh: '去创建邀请', en: 'Create invite' })}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {invites.map((invite) => (
            <ActivityRow key={invite.id} invite={invite} />
          ))}
        </div>
      )}
    </ConsoleLayout>
  );
}

function ActivityRow({ invite }: { invite: CoRaisingInviteView }): React.ReactElement {
  const { t } = useLocalization();
  const splitPct = (invite.split_bps / 100).toFixed(invite.split_bps % 100 === 0 ? 0 : 2);
  const statusVariant =
    invite.status === 'active' ? 'success' : invite.status === 'paused' ? 'warning' : 'subtle';
  const createdDate = new Date(invite.created_at).toLocaleDateString();
  const feedsPerFeeder = invite.feeders_count > 0
    ? (invite.total_feeds / invite.feeders_count).toFixed(1)
    : '0';

  return (
    <Card hover>
      <CardBody>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <code className="text-sm font-bold text-white font-mono">
                {invite.token.slice(0, 10)}…
              </code>
              <Badge variant={statusVariant as any}>{invite.status}</Badge>
              <span className="text-xs text-agentrix-mist">{createdDate}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-agentrix-mist">
                  {t({ zh: '喂养者', en: 'Feeders' })}
                </p>
                <p className="mt-0.5 text-lg font-bold text-white">{invite.feeders_count}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-agentrix-mist">
                  {t({ zh: '总喂养', en: 'Total Feeds' })}
                </p>
                <p className="mt-0.5 text-lg font-bold text-white">{invite.total_feeds}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-agentrix-mist">
                  {t({ zh: '人均喂养', en: 'Avg / Feeder' })}
                </p>
                <p className="mt-0.5 text-lg font-bold text-agentrix-electric">{feedsPerFeeder}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-agentrix-mist">
                  {t({ zh: '分成', en: 'Split' })}
                </p>
                <p className="mt-0.5 text-lg font-bold text-agentrix-solar">{splitPct}%</p>
              </div>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
