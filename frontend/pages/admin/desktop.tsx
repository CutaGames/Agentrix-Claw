/**
 * /admin/desktop — Internal Beta dashboard for Sprint G-3 (US-G3-2).
 *
 * Aggregated view of:
 *   - Crash stats (rate / top fingerprints / 7d delta)
 *   - First-run funnel (launch → login → onboarding → first_chat)
 *   - Auto-update success rate + failure reasons
 *   - DAU + 7d delta
 *   - Downloads by source
 *
 * Backend: GET /api/v1/admin/desktop/dashboard?days=N
 * Cache:   60s server-side
 */
import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { RefreshCw, AlertTriangle, AlertCircle, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { API_BASE_URL } from '../../utils/api-config';

interface DashboardData {
  generatedAt: string;
  windowDays: number;
  versionDistribution: Array<{ version: string; deviceCount: number }>;
  crashStats: {
    totalCrashes: number;
    uniqueDevices: number;
    crashRate: number;
    topFingerprints: Array<{
      fingerprint: string;
      type: string;
      sampleMessage: string;
      count: number;
    }>;
    delta7dPercent: number;
  };
  funnel: {
    launches: number;
    logins: number;
    onboardingsComplete: number;
    firstChats: number;
    loginRate: number;
    onboardingRate: number;
    firstChatRate: number;
  };
  updateStats: {
    available: number;
    installed: number;
    failed: number;
    successRate: number;
    failuresByReason: Array<{ reason: string; count: number }>;
  };
  dau: { current: number; delta7dPercent: number };
  downloads: { current: number; bySource: Array<{ source: string; count: number }> };
  alerts: Array<{ severity: 'info' | 'warn' | 'crit'; message: string }>;
}

export default function DesktopAdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  const load = useCallback(async () => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      router.replace('/admin/login');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const r = await fetch(`${API_BASE_URL}/api/admin/desktop/dashboard?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) {
        localStorage.removeItem('admin_token');
        router.replace('/admin/login');
        return;
      }
      if (r.status === 403) {
        setError('需要管理员权限。请用 admin 账号登录。');
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as DashboardData;
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [router, days]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <Head>
        <title>桌面端内测看板 · Agentrix Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">桌面端内测看板</h1>
              <p className="text-sm text-gray-500">Sprint G-3 · 数据 60s 缓存</p>
            </div>
            <div className="flex gap-2 items-center">
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="px-3 py-2 border rounded text-sm"
              >
                <option value={1}>过去 24 小时</option>
                <option value={7}>过去 7 天</option>
                <option value={14}>过去 14 天</option>
                <option value={30}>过去 30 天</option>
              </select>
              <button
                onClick={load}
                disabled={loading}
                className="px-3 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {loading && !data && (
            <div className="flex justify-center py-20">
              <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
            </div>
          )}

          {data && (
            <>
              {/* Alerts banner */}
              {data.alerts.length > 0 && (
                <div className="mb-6 space-y-2">
                  {data.alerts.map((a, i) => (
                    <AlertBar key={i} severity={a.severity} message={a.message} />
                  ))}
                </div>
              )}

              {/* Top KPI row */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <KpiCard
                  label="DAU (24h)"
                  value={data.dau.current.toLocaleString()}
                  delta={data.dau.delta7dPercent}
                />
                <KpiCard
                  label="崩溃率"
                  value={`${(data.crashStats.crashRate * 100).toFixed(2)}%`}
                  highlightTone={
                    data.crashStats.crashRate >= 0.005
                      ? 'crit'
                      : data.crashStats.crashRate >= 0.003
                      ? 'warn'
                      : 'ok'
                  }
                  delta={data.crashStats.delta7dPercent}
                  deltaInverted
                />
                <KpiCard
                  label="自动更新成功率"
                  value={
                    data.updateStats.available > 0
                      ? `${(data.updateStats.successRate * 100).toFixed(1)}%`
                      : '—'
                  }
                  highlightTone={
                    data.updateStats.available > 0 && data.updateStats.successRate < 0.9
                      ? 'crit'
                      : 'ok'
                  }
                />
                <KpiCard label="下载次数" value={data.downloads.current.toLocaleString()} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Funnel */}
                <Section title="首跑漏斗">
                  <FunnelStep
                    label="启动 desktop_launch"
                    value={data.funnel.launches}
                    rate={1}
                    rateLabel="基线"
                  />
                  <FunnelStep
                    label="登录 desktop_login"
                    value={data.funnel.logins}
                    rate={data.funnel.loginRate}
                    rateLabel="登录率"
                    target={0.6}
                  />
                  <FunnelStep
                    label="完成引导 onboarding_complete"
                    value={data.funnel.onboardingsComplete}
                    rate={data.funnel.onboardingRate}
                    rateLabel="引导完成率"
                  />
                  <FunnelStep
                    label="首次对话 first_chat"
                    value={data.funnel.firstChats}
                    rate={data.funnel.firstChatRate}
                    rateLabel="首聊率"
                    target={0.7}
                  />
                </Section>

                {/* Version distribution */}
                <Section title="版本分布">
                  <div className="space-y-2">
                    {data.versionDistribution.length === 0 ? (
                      <div className="text-sm text-gray-400">无数据</div>
                    ) : (
                      data.versionDistribution.map((v, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-sm font-mono">{v.version}</span>
                          <span className="text-sm font-bold text-gray-700">
                            {v.deviceCount.toLocaleString()} 设备
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </Section>

                {/* Top crashes */}
                <Section title={`崩溃 Top ${data.crashStats.topFingerprints.length}`} fullSpan>
                  {data.crashStats.topFingerprints.length === 0 ? (
                    <div className="text-sm text-gray-400">没有崩溃记录 ✨</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr className="text-left text-gray-500">
                          <th className="py-2">指纹</th>
                          <th className="py-2">类型</th>
                          <th className="py-2">示例消息</th>
                          <th className="py-2 text-right">次数</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.crashStats.topFingerprints.map((c, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="py-2 font-mono text-xs">{c.fingerprint.slice(0, 12)}</td>
                            <td className="py-2">{c.type}</td>
                            <td className="py-2 text-gray-700 truncate max-w-md" title={c.sampleMessage}>
                              {c.sampleMessage}
                            </td>
                            <td className="py-2 text-right font-bold">{c.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Section>

                {/* Update stats */}
                <Section title="自动更新">
                  <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                    <Stat label="收到通知" value={data.updateStats.available} />
                    <Stat label="安装成功" value={data.updateStats.installed} />
                    <Stat label="安装失败" value={data.updateStats.failed} />
                  </div>
                  {data.updateStats.failuresByReason.length > 0 && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 mb-1">失败原因 Top {data.updateStats.failuresByReason.length}</div>
                      <ul className="text-sm space-y-1">
                        {data.updateStats.failuresByReason.map((f, i) => (
                          <li key={i} className="flex justify-between">
                            <span className="text-gray-700 truncate">{f.reason}</span>
                            <span className="font-bold">{f.count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Section>

                {/* Downloads by source */}
                <Section title="下载来源">
                  {data.downloads.bySource.length === 0 ? (
                    <div className="text-sm text-gray-400">无数据</div>
                  ) : (
                    <ul className="text-sm space-y-2">
                      {data.downloads.bySource.map((s, i) => (
                        <li key={i} className="flex justify-between">
                          <span className="text-gray-700">{s.source}</span>
                          <span className="font-bold">{s.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </div>

              <div className="mt-6 text-xs text-gray-400 text-center">
                生成时间 {new Date(data.generatedAt).toLocaleString('zh-CN')} · 窗口 {data.windowDays} 天
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function AlertBar({ severity, message }: { severity: 'info' | 'warn' | 'crit'; message: string }) {
  const cls =
    severity === 'crit'
      ? 'bg-red-100 border-red-300 text-red-800'
      : severity === 'warn'
      ? 'bg-yellow-100 border-yellow-300 text-yellow-800'
      : 'bg-blue-100 border-blue-300 text-blue-800';
  const Icon = severity === 'crit' ? AlertCircle : AlertTriangle;
  return (
    <div className={`p-3 border rounded text-sm flex items-center gap-2 ${cls}`}>
      <Icon className="w-4 h-4 flex-shrink-0" />
      {message}
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  deltaInverted,
  highlightTone,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaInverted?: boolean;
  highlightTone?: 'ok' | 'warn' | 'crit';
}) {
  const tone =
    highlightTone === 'crit'
      ? 'border-red-300'
      : highlightTone === 'warn'
      ? 'border-yellow-300'
      : 'border-gray-200';
  const valueColor =
    highlightTone === 'crit'
      ? 'text-red-600'
      : highlightTone === 'warn'
      ? 'text-yellow-600'
      : 'text-gray-800';

  return (
    <div className={`p-4 bg-white rounded-lg border-2 ${tone}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
      {delta !== undefined && Number.isFinite(delta) && (
        <div className="mt-1 flex items-center gap-1 text-xs">
          {(deltaInverted ? -delta : delta) > 1 ? (
            <ArrowUp className="w-3 h-3 text-green-600" />
          ) : (deltaInverted ? -delta : delta) < -1 ? (
            <ArrowDown className="w-3 h-3 text-red-600" />
          ) : (
            <Minus className="w-3 h-3 text-gray-400" />
          )}
          <span className="text-gray-600">{delta > 0 ? '+' : ''}{delta.toFixed(1)}% 7d</span>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
  fullSpan,
}: {
  title: string;
  children: React.ReactNode;
  fullSpan?: boolean;
}) {
  return (
    <div className={`p-5 bg-white rounded-lg border border-gray-200 ${fullSpan ? 'md:col-span-2' : ''}`}>
      <h2 className="text-sm font-bold text-gray-800 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-bold text-gray-800">{value.toLocaleString()}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function FunnelStep({
  label,
  value,
  rate,
  rateLabel,
  target,
}: {
  label: string;
  value: number;
  rate: number;
  rateLabel: string;
  target?: number;
}) {
  const pct = (rate * 100).toFixed(1);
  const meetsTarget = target === undefined || rate >= target;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-700">{label}</span>
        <span className="font-bold">{value.toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className={`h-2 ${meetsTarget ? 'bg-indigo-500' : 'bg-yellow-500'}`}
            style={{ width: `${Math.min(100, rate * 100)}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 w-32 text-right">
          {rateLabel} {pct}%
          {target !== undefined && (
            <span className={`ml-1 ${meetsTarget ? 'text-green-600' : 'text-yellow-600'}`}>
              ({meetsTarget ? '✓' : '↓'} {(target * 100).toFixed(0)}%)
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
