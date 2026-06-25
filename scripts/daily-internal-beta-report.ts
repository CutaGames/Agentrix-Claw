/**
 * Daily Internal Beta Report (Sprint G-3 / US-G3-8 / Task 15).
 *
 * Pulls aggregated metrics from /api/v1/admin/desktop/dashboard, writes a
 * markdown report under tests/reports/, and (optionally) posts to Telegram
 * via TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID env vars.
 *
 * Usage:
 *   ts-node scripts/daily-internal-beta-report.ts
 *
 * Environment:
 *   API_BASE_URL          (required)  e.g. https://api.agentrix.top/api
 *   ADMIN_BEARER_TOKEN    (required)  admin JWT for the dashboard endpoint
 *   REPORT_OUT_DIR        (optional)  default: tests/reports
 *   TELEGRAM_BOT_TOKEN    (optional)  if set, posts a digest to TG group
 *   TELEGRAM_CHAT_ID      (optional)
 *
 * Cron suggestion:
 *   0 9 * * *   cd /home/ubuntu/Agentrix && pnpm ts-node scripts/daily-internal-beta-report.ts
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const API_BASE_URL = process.env.API_BASE_URL || 'https://api.agentrix.top/api';
const ADMIN_TOKEN = process.env.ADMIN_BEARER_TOKEN || '';
const OUT_DIR = process.env.REPORT_OUT_DIR || 'tests/reports';
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || '';

interface Dashboard {
  generatedAt: string;
  windowDays: number;
  versionDistribution: Array<{ version: string; deviceCount: number }>;
  crashStats: {
    totalCrashes: number;
    uniqueDevices: number;
    crashRate: number;
    topFingerprints: Array<{ fingerprint: string; type: string; sampleMessage: string; count: number }>;
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

async function main() {
  if (!ADMIN_TOKEN) {
    console.error('ADMIN_BEARER_TOKEN is required');
    process.exit(2);
  }

  const data = await fetchDashboard();
  const md = renderMarkdown(data);

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const outDir = path.resolve(OUT_DIR);
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `INTERNAL_BETA_DAILY_${today}.md`);
  await fs.writeFile(outPath, md, 'utf-8');
  console.log(`✓ Wrote ${outPath}`);

  if (TG_TOKEN && TG_CHAT) {
    const digest = renderDigest(data);
    await postToTelegram(digest);
    console.log('✓ Sent digest to Telegram');
  }

  // Exit 1 if any critical alert is firing — useful for cron alerting
  const hasCrit = data.alerts.some((a) => a.severity === 'crit');
  process.exit(hasCrit ? 1 : 0);
}

async function fetchDashboard(): Promise<Dashboard> {
  const url = `${API_BASE_URL}/admin/desktop/dashboard?days=7`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  if (!r.ok) {
    throw new Error(`dashboard fetch failed: ${r.status} ${r.statusText}`);
  }
  return (await r.json()) as Dashboard;
}

function renderMarkdown(d: Dashboard): string {
  const date = new Date(d.generatedAt).toLocaleString('zh-CN');
  const crashPct = (d.crashStats.crashRate * 100).toFixed(2);
  const updateRate = d.updateStats.available > 0 ? (d.updateStats.successRate * 100).toFixed(1) : '—';
  const alertSection = d.alerts.length === 0
    ? '✅ 无告警'
    : d.alerts.map((a) => `- **[${a.severity.toUpperCase()}]** ${a.message}`).join('\n');

  const versionRows =
    d.versionDistribution.length === 0
      ? '_无数据_'
      : d.versionDistribution.map((v) => `- \`${v.version}\` — ${v.deviceCount.toLocaleString()} 设备`).join('\n');

  const topCrashRows =
    d.crashStats.topFingerprints.length === 0
      ? '_无崩溃记录_'
      : d.crashStats.topFingerprints
          .map((c, i) => `${i + 1}. \`${c.fingerprint.slice(0, 12)}\` (${c.type}) × ${c.count} — ${c.sampleMessage.slice(0, 80)}`)
          .join('\n');

  const updateFailures =
    d.updateStats.failuresByReason.length === 0
      ? ''
      : '\n失败原因 Top 5：\n' +
        d.updateStats.failuresByReason.map((f) => `- ${f.reason} × ${f.count}`).join('\n');

  const downloadRows =
    d.downloads.bySource.length === 0
      ? '_无下载数据_'
      : d.downloads.bySource.map((s) => `- ${s.source}: ${s.count.toLocaleString()}`).join('\n');

  return `# Internal Beta Daily Report — ${date}

> 窗口：过去 ${d.windowDays} 天
> Sprint G-3 / US-G3-8

## 关键指标（GA Gate）

| 指标 | 当前值 | 目标 | 状态 |
|------|--------:|-------:|:------:|
| 崩溃率 | ${crashPct}% | < 0.5% | ${d.crashStats.crashRate < 0.005 ? '✅' : '❌'} |
| 自动更新成功率 | ${updateRate}% | > 95% | ${d.updateStats.available === 0 ? '⚪' : d.updateStats.successRate >= 0.95 ? '✅' : '❌'} |
| DAU | ${d.dau.current.toLocaleString()} | ≥ 100 | ${d.dau.current >= 100 ? '✅' : '⚠️'} |
| login 转化 | ${(d.funnel.loginRate * 100).toFixed(1)}% | > 60% | ${d.funnel.loginRate > 0.6 ? '✅' : '⚠️'} |
| first_chat 转化 | ${(d.funnel.firstChatRate * 100).toFixed(1)}% | > 70% | ${d.funnel.firstChatRate > 0.7 ? '✅' : '⚠️'} |

## 告警

${alertSection}

## 漏斗

\`\`\`
launch:           ${d.funnel.launches.toLocaleString()}
   ↓  ${(d.funnel.loginRate * 100).toFixed(1)}%
login:            ${d.funnel.logins.toLocaleString()}
   ↓  ${(d.funnel.onboardingRate * 100).toFixed(1)}%
onboarding done:  ${d.funnel.onboardingsComplete.toLocaleString()}
   ↓  ${(d.funnel.firstChatRate * 100).toFixed(1)}%
first chat:       ${d.funnel.firstChats.toLocaleString()}
\`\`\`

## 版本分布

${versionRows}

## Top 崩溃指纹

${topCrashRows}

## 自动更新

- 收到通知：${d.updateStats.available.toLocaleString()}
- 安装成功：${d.updateStats.installed.toLocaleString()}
- 安装失败：${d.updateStats.failed.toLocaleString()}
${updateFailures}

## 下载来源

${downloadRows}

---

*自动生成于 ${date}。源数据：\`agentrix_desktop\` schema。聚合：\`/api/v1/admin/desktop/dashboard\`.*
`;
}

function renderDigest(d: Dashboard): string {
  const crashPct = (d.crashStats.crashRate * 100).toFixed(2);
  const updateRate = d.updateStats.available > 0 ? `${(d.updateStats.successRate * 100).toFixed(1)}%` : 'N/A';
  const critCount = d.alerts.filter((a) => a.severity === 'crit').length;
  const warnCount = d.alerts.filter((a) => a.severity === 'warn').length;

  let lines = [
    `📊 *Agentrix 桌面端日报*`,
    ``,
    `🦊 DAU: \`${d.dau.current}\` (Δ ${d.dau.delta7dPercent.toFixed(1)}%)`,
    `💥 崩溃率: \`${crashPct}%\``,
    `⬆️ 自动更新成功率: \`${updateRate}\``,
    `📥 下载: \`${d.downloads.current.toLocaleString()}\``,
    ``,
    `🚥 漏斗:`,
    `  launch ${d.funnel.launches} → login ${d.funnel.logins} (${(d.funnel.loginRate * 100).toFixed(0)}%)`,
    `  → onboarding ${d.funnel.onboardingsComplete} → chat ${d.funnel.firstChats}`,
  ];

  if (critCount > 0 || warnCount > 0) {
    lines.push('');
    lines.push(`⚠️ 告警: ${critCount} crit / ${warnCount} warn`);
    d.alerts.slice(0, 3).forEach((a) => {
      lines.push(`  • ${a.severity.toUpperCase()}: ${a.message}`);
    });
  }

  return lines.join('\n');
}

async function postToTelegram(text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TG_CHAT,
      text,
      parse_mode: 'Markdown',
    }),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
