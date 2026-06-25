import Head from 'next/head';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, GitBranch, Monitor, RefreshCw, ShieldCheck } from 'lucide-react';

interface OperationsOverview {
  generatedAt: string;
  status: string;
  counts: {
    laneJobs: number;
    repairJobs: number;
    onlineDevices: number;
    pendingApprovals: number;
    runningLaneJobs: number;
    runningTasks: number;
    failedSignals: number;
  };
  toolPolicy: {
    status: string;
    summary: {
      totalTools: number;
      duplicateNameCount: number;
      invalidNameCount: number;
      highRiskToolCount: number;
    };
    riskBands: Record<string, number>;
    recommendations: string[];
  };
}

interface OperationsContinuity {
  generatedAt: string;
  devices: Array<{ deviceId: string; platform: string; isOnline: boolean; lastSeenAt: string }>;
  sessions: Array<{ sessionId: string; title: string; messageCount: number; deviceType: string; activeTaskCount: number; pendingApprovalCount: number; updatedAt: string }>;
  wearableSummary: { pendingApprovalCount: number; runningTaskCount: number; onlineDeviceCount: number; topItems: Array<Record<string, unknown>> };
}

const emptyOverview: OperationsOverview = {
  generatedAt: '',
  status: 'loading',
  counts: { laneJobs: 0, repairJobs: 0, onlineDevices: 0, pendingApprovals: 0, runningLaneJobs: 0, runningTasks: 0, failedSignals: 0 },
  toolPolicy: { status: 'loading', summary: { totalTools: 0, duplicateNameCount: 0, invalidNameCount: 0, highRiskToolCount: 0 }, riskBands: {}, recommendations: [] },
};

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('access_token') || localStorage.getItem('token') || '';
}

async function apiGet<T>(path: string): Promise<T> {
  const token = getToken();
  const response = await fetch(`/api/admin-proxy${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

export default function OperationsPage() {
  const [overview, setOverview] = useState<OperationsOverview>(emptyOverview);
  const [continuity, setContinuity] = useState<OperationsContinuity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextOverview, nextContinuity] = await Promise.all([
        apiGet<OperationsOverview>('/operations/overview'),
        apiGet<OperationsContinuity>('/operations/continuity'),
      ]);
      setOverview(nextOverview);
      setContinuity(nextContinuity);
    } catch (err: any) {
      setError(err?.message || 'Failed to load operations control plane.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusTone = useMemo(() => {
    if (overview.status === 'pass') return 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10';
    if (overview.status === 'warn' || overview.status === 'active') return 'text-amber-200 border-amber-400/30 bg-amber-400/10';
    return 'text-rose-200 border-rose-400/30 bg-rose-400/10';
  }, [overview.status]);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <Head>
        <title>Agentrix Operations Control Plane</title>
      </Head>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">Agentrix Runtime</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-white">Operations Control Plane</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">统一查看 Parallel Lanes、自动修复、工具策略、桌面/移动/可穿戴连续任务状态。</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 px-4 text-sm font-medium text-white hover:bg-white/10"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </header>

        {error && (
          <section className="flex items-center gap-3 rounded-md border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100" role="alert">
            <AlertTriangle className="h-5 w-5 flex-none" />
            {error}
          </section>
        )}

        <section className="grid gap-3 md:grid-cols-4" data-testid="web-operations-summary">
          <Metric icon={<Activity className="h-4 w-4" />} label="Runtime" value={overview.status} tone={statusTone} />
          <Metric icon={<GitBranch className="h-4 w-4" />} label="Lane Jobs" value={overview.counts.laneJobs} />
          <Metric icon={<Monitor className="h-4 w-4" />} label="Online Devices" value={overview.counts.onlineDevices} />
          <Metric icon={<ShieldCheck className="h-4 w-4" />} label="Tool Policy" value={overview.toolPolicy.status} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-white">Tool Governance</h2>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-300">{overview.toolPolicy.summary.totalTools} tools</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <SmallStat label="Collisions" value={overview.toolPolicy.summary.duplicateNameCount} />
              <SmallStat label="Invalid Names" value={overview.toolPolicy.summary.invalidNameCount} />
              <SmallStat label="High Risk" value={overview.toolPolicy.summary.highRiskToolCount} />
            </div>
            <div className="mt-4 rounded-md border border-white/10 bg-neutral-900 p-4 text-sm leading-6 text-neutral-300">
              {overview.toolPolicy.recommendations[0] || '工具命名、风险分层和 PTC 默认策略已通过当前检查。'}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-base font-semibold text-white">Cross-Device Continuity</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <SmallStat label="Running" value={continuity?.wearableSummary.runningTaskCount ?? overview.counts.runningTasks} />
              <SmallStat label="Approvals" value={continuity?.wearableSummary.pendingApprovalCount ?? overview.counts.pendingApprovals} />
              <SmallStat label="Wearable Queue" value={continuity?.wearableSummary.topItems.length ?? 0} />
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-base font-semibold text-white">Recent Sessions</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(continuity?.sessions || []).slice(0, 6).map((session) => (
              <article key={session.sessionId} className="rounded-md border border-white/10 bg-neutral-900 p-4">
                <h3 className="truncate text-sm font-semibold text-white">{session.title}</h3>
                <p className="mt-2 text-xs text-neutral-400">{session.messageCount} messages · {session.deviceType}</p>
                <p className="mt-2 text-xs text-neutral-300">{session.activeTaskCount} active · {session.pendingApprovalCount} approvals</p>
              </article>
            ))}
            {!continuity?.sessions?.length && <p className="text-sm text-neutral-400">暂无同步会话。</p>}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string | number; tone?: string }) {
  return (
    <div className={`rounded-lg border p-4 ${tone || 'border-white/10 bg-white/[0.03] text-neutral-100'}`}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide opacity-80">{icon}{label}</div>
      <div className="mt-3 text-2xl font-semibold capitalize tracking-normal">{value}</div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-white/10 bg-neutral-900 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}