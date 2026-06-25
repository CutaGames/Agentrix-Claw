import React, { useState, useEffect, useCallback } from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { T, cardStyle } from '../../../lib/console.theme';

interface Workflow {
  id: string;
  name: string;
  description?: string;
  triggerType: 'cron' | 'webhook' | 'manual';
  cronExpression?: string;
  webhookToken?: string;
  prompt: string;
  enabled: boolean;
  lastRunAt?: string;
  lastRunStatus?: string;
  runCount: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('agentrix_token');
}

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function DeveloperWorkflows(): React.ReactElement {
  const { t } = useLocalization();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState('');
  const [formTrigger, setFormTrigger] = useState<'cron' | 'webhook' | 'manual'>('cron');
  const [formCron, setFormCron] = useState('0 8 * * *');
  const [formPrompt, setFormPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadWorkflows = useCallback(async () => {
    try {
      const data = await apiFetch('/workflows');
      setWorkflows(Array.isArray(data) ? data : []);
    } catch {
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadWorkflows(); }, [loadWorkflows]);

  const handleCreate = async () => {
    if (!formName.trim() || !formPrompt.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch('/workflows', {
        method: 'POST',
        body: JSON.stringify({
          name: formName,
          triggerType: formTrigger,
          cronExpression: formTrigger === 'cron' ? formCron : undefined,
          prompt: formPrompt,
          enabled: true,
        }),
      });
      setShowCreate(false);
      setFormName('');
      setFormPrompt('');
      loadWorkflows();
    } catch (err: any) {
      alert(err?.message || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await apiFetch(`/workflows/${id}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ enabled: !enabled }),
      });
      loadWorkflows();
    } catch {}
  };

  const handleRun = async (id: string) => {
    try {
      await apiFetch(`/workflows/${id}/run`, { method: 'POST' });
      alert('工作流已触发执行');
      setTimeout(loadWorkflows, 2000);
    } catch (err: any) {
      alert(err?.message || '执行失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此工作流？')) return;
    try {
      await apiFetch(`/workflows/${id}`, { method: 'DELETE' });
      loadWorkflows();
    } catch {}
  };

  const triggerLabel = (wf: Workflow) => {
    if (wf.triggerType === 'cron') return `⏰ ${wf.cronExpression || 'cron'}`;
    if (wf.triggerType === 'webhook') return '🔗 Webhook';
    return '▶️ 手动';
  };

  return (
    <ConsoleLayout title={t({ zh: '工作流', en: 'Workflows' })}>
      <p style={{ color: T.text.secondary, marginBottom: 24, fontSize: 14 }}>
        {t({ zh: '创建自动化工作流：定时任务、Webhook 触发、手动执行。Agent 自动执行你的 prompt。', en: 'Create automated workflows: cron jobs, webhook triggers, manual runs. Your agent executes the prompt automatically.' })}
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>{t({ zh: '我的工作流', en: 'My Workflows' })} ({workflows.length})</h3>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            padding: '8px 16px', borderRadius: 8, background: '#6366f1',
            color: 'white', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
          }}
        >
          + {t({ zh: '新建工作流', en: 'New Workflow' })}
        </button>
      </div>

      {/* Create form modal */}
      {showCreate && (
        <div style={{ ...cardStyle, marginBottom: 20, padding: 20 }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>新建工作流</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="工作流名称（如：每日 BTC 简报）"
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #333', background: '#1a1a2e', color: '#fff', fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              {(['cron', 'webhook', 'manual'] as const).map((tr) => (
                <button
                  key={tr}
                  onClick={() => setFormTrigger(tr)}
                  style={{
                    flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    background: formTrigger === tr ? 'rgba(99,102,241,0.2)' : 'transparent',
                    border: formTrigger === tr ? '1px solid #6366f1' : '1px solid #333',
                    color: formTrigger === tr ? '#a5b4fc' : '#94a3b8',
                  }}
                >
                  {tr === 'cron' ? '⏰ 定时' : tr === 'webhook' ? '🔗 Webhook' : '▶️ 手动'}
                </button>
              ))}
            </div>
            {formTrigger === 'cron' && (
              <input
                value={formCron}
                onChange={(e) => setFormCron(e.target.value)}
                placeholder="Cron 表达式（如：0 8 * * * = 每天8点）"
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #333', background: '#1a1a2e', color: '#fff', fontSize: 13 }}
              />
            )}
            <textarea
              value={formPrompt}
              onChange={(e) => setFormPrompt(e.target.value)}
              placeholder="Agent 执行的 Prompt（如：查询 BTC 当前价格，生成简报发送给我）"
              rows={3}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #333', background: '#1a1a2e', color: '#fff', fontSize: 13, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #333', background: 'transparent', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
                取消
              </button>
              <button onClick={handleCreate} disabled={submitting} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: submitting ? 0.5 : 1 }}>
                {submitting ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workflow list */}
      {loading ? (
        <div style={{ textAlign: 'center', color: T.text.muted, padding: 40 }}>加载中...</div>
      ) : workflows.length === 0 ? (
        <div style={{ textAlign: 'center', color: T.text.muted, padding: 40 }}>
          暂无工作流，点击"新建工作流"开始创建
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {workflows.map((wf) => (
            <div key={wf.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{wf.name}</div>
                <div style={{ fontSize: 12, color: T.text.muted, marginTop: 4 }}>
                  {triggerLabel(wf)} · {t({ zh: `已运行 ${wf.runCount || 0} 次`, en: `${wf.runCount || 0} runs` })}
                  {wf.lastRunAt && ` · 上次: ${new Date(wf.lastRunAt).toLocaleString()}`}
                </div>
                <div style={{ fontSize: 11, color: T.text.muted, marginTop: 2, opacity: 0.7 }}>
                  {wf.prompt.slice(0, 80)}{wf.prompt.length > 80 ? '...' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                  background: wf.lastRunStatus === 'success' ? 'rgba(74,222,128,0.15)' : wf.lastRunStatus === 'error' ? 'rgba(248,113,113,0.15)' : 'rgba(148,163,184,0.1)',
                  color: wf.lastRunStatus === 'success' ? '#4ade80' : wf.lastRunStatus === 'error' ? '#f87171' : '#94a3b8',
                }}>
                  {wf.lastRunStatus || 'idle'}
                </span>
                <button onClick={() => handleRun(wf.id)} title="手动执行" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>▶️</button>
                <button onClick={() => handleToggle(wf.id, wf.enabled)} title={wf.enabled ? '暂停' : '启用'} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>
                  {wf.enabled ? '⏸' : '▶'}
                </button>
                <button onClick={() => handleDelete(wf.id)} title="删除" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#f87171' }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </ConsoleLayout>
  );
}
