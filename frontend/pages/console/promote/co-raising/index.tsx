/**
 * Co-Raising Manager — web console page for pet owners to create and
 * manage co-raising invite links. Mirrors the mobile CoRaisingInviteScreen.
 *
 * Per docs/WEB_REFACTOR_PLAN_2026-05 §6 + docs/MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 §6.1
 */
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../../contexts/LocalizationContext';
import { useToast } from '../../../../contexts/ToastContext';
import { Button, Badge, Card, CardHeader, CardBody, Stat, Skeleton } from '../../../../components/ui/ax';
import { coRaisingApi, CoRaisingInviteView } from '../../../../lib/api/coraising.api';
import {
  Share2,
  Copy,
  Ban,
  Users,
  Sprout,
  Link as LinkIcon,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';

export default function CoRaisingManagePage(): React.ReactElement {
  const { t } = useLocalization();
  const { showToast } = useToast();
  const [invites, setInvites] = useState<CoRaisingInviteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [agentId, setAgentId] = useState('');
  const [splitBps, setSplitBps] = useState('500');
  const [maxFeeders, setMaxFeeders] = useState('0');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await coRaisingApi.listMyInvites(20);
      setInvites(data.items ?? []);
    } catch (err: any) {
      // Graceful fallback: backend not ready yet
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

  const handleCreate = useCallback(async () => {
    if (!agentId.trim()) {
      showToast(
        t({ zh: '请填写主宠 Agent ID', en: 'Please enter your pet agent ID' }),
        'warning',
      );
      return;
    }
    setCreating(true);
    try {
      await coRaisingApi.createInvite({
        agent_account_id: agentId.trim(),
        split_bps: Number(splitBps) || 500,
        max_feeders: Number(maxFeeders) || 0,
      });
      showToast(t({ zh: '邀请链接已生成', en: 'Invite link created' }), 'success');
      setAgentId('');
      await refresh();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Create failed';
      showToast(msg, 'error');
    } finally {
      setCreating(false);
    }
  }, [agentId, splitBps, maxFeeders, refresh, showToast, t]);

  const handleCopy = useCallback(
    async (invite: CoRaisingInviteView) => {
      try {
        await navigator.clipboard.writeText(invite.share_url);
        showToast(t({ zh: '链接已复制', en: 'Link copied' }), 'success');
      } catch {
        showToast(t({ zh: '复制失败', en: 'Copy failed' }), 'error');
      }
    },
    [showToast, t],
  );

  const handleShare = useCallback(
    async (invite: CoRaisingInviteView) => {
      const text = t({
        en: `Help raise my pet 🐾 ${invite.share_url}`,
        zh: `来帮我一起养宠物 🐾 ${invite.share_url}`,
      });
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Agentrix Co-Raising', text, url: invite.share_url });
        } catch {
          /* user cancelled */
        }
      } else {
        void handleCopy(invite);
      }
    },
    [handleCopy, t],
  );

  const handleCancel = useCallback(
    async (invite: CoRaisingInviteView) => {
      if (!confirm(t({ zh: '取消邀请？链接将停止接受新喂养者。', en: 'Cancel invite? Link will stop accepting new feeders.' }))) {
        return;
      }
      try {
        await coRaisingApi.cancelInvite(invite.id);
        showToast(t({ zh: '已取消', en: 'Cancelled' }), 'success');
        await refresh();
      } catch (err: any) {
        showToast(err?.response?.data?.message ?? err?.message ?? 'Cancel failed', 'error');
      }
    },
    [refresh, showToast, t],
  );

  // Stats
  const totalInvites = invites.length;
  const activeInvites = invites.filter((i) => i.status === 'active').length;
  const totalFeeders = invites.reduce((s, i) => s + i.feeders_count, 0);
  const totalFeeds = invites.reduce((s, i) => s + i.total_feeds, 0);

  return (
    <ConsoleLayout title={t({ zh: '🌱 共养邀请', en: '🌱 Co-Raising' })}>
      <p className="mb-6 text-sm text-agentrix-fog">
        {t({
          zh: '邀请好友帮喂你的主宠 → 宠物成长更快 → 未来任务收益按比例分给好友。蚂蚁森林式的轻互动。',
          en: 'Friends feed your pet → it levels up faster → they share future task revenue. Ant-Forest-style lightweight interaction.',
        })}
      </p>

      {/* Stats row */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat
          label={t({ zh: '总邀请', en: 'Total Invites' })}
          value={String(totalInvites)}
          icon={<LinkIcon size={16} />}
        />
        <Stat
          label={t({ zh: '活跃中', en: 'Active' })}
          value={String(activeInvites)}
          icon={<Sprout size={16} />}
          accent="success"
        />
        <Stat
          label={t({ zh: '总喂养者', en: 'Feeders' })}
          value={String(totalFeeders)}
          icon={<Users size={16} />}
        />
        <Stat
          label={t({ zh: '累计喂养', en: 'Total Feeds' })}
          value={String(totalFeeds)}
          icon={<TrendingUp size={16} />}
          accent="accent"
        />
      </div>

      {/* Create form */}
      <Card className="mb-6">
        <CardHeader
          icon={<Sprout size={18} className="text-agentrix-electric" />}
          title={t({ zh: '创建新邀请', en: 'New Invite' })}
        />
        <CardBody>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-agentrix-mist">
                {t({ zh: '主宠 Agent ID', en: 'Pet Agent ID' })}
              </label>
              <input
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="agent_xxx"
                className="w-full rounded-lg border border-agentrix-inkLine bg-agentrix-inkSoft px-3 py-2 text-sm text-white placeholder:text-agentrix-mist focus:border-agentrix-electric focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-agentrix-mist">
                {t({ zh: '分成（基点，500 = 5%）', en: 'Split (bps, 500 = 5%)' })}
              </label>
              <input
                value={splitBps}
                onChange={(e) => setSplitBps(e.target.value)}
                type="number"
                className="w-full rounded-lg border border-agentrix-inkLine bg-agentrix-inkSoft px-3 py-2 text-sm text-white focus:border-agentrix-electric focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-agentrix-mist">
                {t({ zh: '最大喂养者（0 = 不限）', en: 'Max feeders (0 = unlimited)' })}
              </label>
              <input
                value={maxFeeders}
                onChange={(e) => setMaxFeeders(e.target.value)}
                type="number"
                className="w-full rounded-lg border border-agentrix-inkLine bg-agentrix-inkSoft px-3 py-2 text-sm text-white focus:border-agentrix-electric focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-agentrix-mist">
              {t({
                zh: '提示：每只宠物 = 一个 AgentAccount。在移动端或 /console/agents 可以查到 Agent ID。',
                en: 'Tip: each pet = one AgentAccount. Find the Agent ID in mobile app or /console/agents.',
              })}
            </p>
            <Button onClick={handleCreate} loading={creating} variant="primary">
              {t({ zh: '生成邀请链接', en: 'Create invite' })}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Invites list */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-agentrix-mist">
          {t({ zh: '我的邀请', en: 'My Invites' })}
        </h2>
        <Link
          href="/console/promote/co-raising/activity"
          className="text-xs font-medium text-agentrix-electric hover:underline"
        >
          {t({ zh: '查看喂养活动 →', en: 'View feeding activity →' })}
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
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
            {t({ zh: '还没有邀请', en: 'No invites yet' })}
          </h3>
          <p className="mt-2 text-xs text-agentrix-mist">
            {t({
              zh: '在上方创建你的第一个邀请，分享给朋友。他们帮你喂宠，双方都能赚 AXP！',
              en: 'Create your first invite above and share with friends. They feed your pet, you both earn AXP!',
            })}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {invites.map((invite) => (
            <InviteRow
              key={invite.id}
              invite={invite}
              onShare={() => handleShare(invite)}
              onCopy={() => handleCopy(invite)}
              onCancel={() => handleCancel(invite)}
            />
          ))}
        </div>
      )}
    </ConsoleLayout>
  );
}

function InviteRow({
  invite,
  onShare,
  onCopy,
  onCancel,
}: {
  invite: CoRaisingInviteView;
  onShare: () => void;
  onCopy: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const { t } = useLocalization();
  const splitPct = (invite.split_bps / 100).toFixed(invite.split_bps % 100 === 0 ? 0 : 2);
  const statusVariant =
    invite.status === 'active' ? 'success' : invite.status === 'paused' ? 'warning' : 'subtle';

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <code className="text-sm font-bold text-white font-mono">
                {invite.token.slice(0, 12)}…
              </code>
              <Badge variant={statusVariant as any}>{invite.status}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-agentrix-mist">
              <span>
                {t({ zh: '喂养者', en: 'Feeders' })}:{' '}
                <span className="text-white font-medium">
                  {invite.feeders_count}
                  {invite.max_feeders > 0 ? ` / ${invite.max_feeders}` : ''}
                </span>
              </span>
              <span>
                {t({ zh: '喂养次数', en: 'Feeds' })}:{' '}
                <span className="text-white font-medium">{invite.total_feeds}</span>
              </span>
              <span>
                {t({ zh: '分成', en: 'Split' })}:{' '}
                <span className="text-agentrix-solar font-medium">{splitPct}%</span>
              </span>
            </div>
            <p className="mt-2 text-xs text-agentrix-mist truncate">
              <LinkIcon size={11} className="inline mr-1" />
              {invite.share_url}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="sm" onClick={onShare} leftIcon={<Share2 size={14} />}>
              {t({ zh: '分享', en: 'Share' })}
            </Button>
            <Button variant="ghost" size="sm" onClick={onCopy} leftIcon={<Copy size={14} />}>
              {t({ zh: '复制', en: 'Copy' })}
            </Button>
            {invite.status === 'active' && (
              <Button variant="danger" size="sm" onClick={onCancel} leftIcon={<Ban size={14} />}>
                {t({ zh: '取消', en: 'Cancel' })}
              </Button>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
