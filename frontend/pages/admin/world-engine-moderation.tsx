/**
 * Admin Moderation Dashboard — World Engine
 *
 * P1 task 18.4: Manual review queue for World Asset moderation decisions.
 *
 * Reviews:
 *  - pre_listing decisions (24h SLA)
 *  - post_publish_report decisions (48h SLA)
 *  - automated rejections (audit trail)
 *
 * Requirements: 12.5, 12.6, 12.7, 12.8
 */

import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';

// ─── Types ─────────────────────────────────────────────────────────────

interface ModerationItem {
  id: string;
  worldAssetId: string;
  stage:
    | 'pre_upload_face'
    | 'pre_upload_copyright'
    | 'post_gen_words'
    | 'pre_listing'
    | 'post_publish_report';
  decision: 'approved' | 'rejected' | 'pending';
  reason: string | null;
  reviewerId: string | null;
  automatedScore: number | null;
  createdAt: string;
  asset?: {
    id: string;
    name: string;
    category: string;
    ownerId: string;
    styledMeshUrl?: string;
  };
}

type StageFilter = 'all' | ModerationItem['stage'];
type DecisionFilter = 'all' | 'pending' | 'approved' | 'rejected';

// ─── Constants ─────────────────────────────────────────────────────────

const STAGE_LABELS: Record<ModerationItem['stage'], string> = {
  pre_upload_face: '人脸检测',
  pre_upload_copyright: '版权检查',
  post_gen_words: '违禁词',
  pre_listing: '上架审核',
  post_publish_report: '用户举报',
};

const STAGE_BADGE_COLORS: Record<ModerationItem['stage'], string> = {
  pre_upload_face: '#FF9800',
  pre_upload_copyright: '#E91E63',
  post_gen_words: '#9C27B0',
  pre_listing: '#2196F3',
  post_publish_report: '#F44336',
};

const DECISION_BADGE_COLORS: Record<ModerationItem['decision'], string> = {
  pending: '#FF9800',
  approved: '#4CAF50',
  rejected: '#F44336',
};

const API_BASE =
  typeof window !== 'undefined'
    ? (window as any).__AGENTRIX_API_BASE__ || ''
    : '';

// ─── Component ─────────────────────────────────────────────────────────

export default function WorldEngineModerationPage() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('pending');
  const [selectedItem, setSelectedItem] = useState<ModerationItem | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const [slaBreaches, setSlaBreaches] = useState<number>(0);

  // ─── API ─────────────────────────────────────────────────────────────

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ includeAsset: 'true', limit: '100' });
      if (stageFilter !== 'all') params.set('stage', stageFilter);
      if (decisionFilter !== 'all') params.set('decision', decisionFilter);

      const token = typeof window !== 'undefined' ? localStorage.getItem('jwt') || '' : '';
      const res = await fetch(
        `${API_BASE}/api/admin/world-engine/moderation/queue?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch (err: any) {
      console.error('Failed to fetch moderation queue:', err);
      alert(`Failed to load queue: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [stageFilter, decisionFilter]);

  const fetchSlaBreaches = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('jwt') || '' : '';
      const res = await fetch(
        `${API_BASE}/api/admin/world-engine/moderation/sla/breaches`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setSlaBreaches(data.total || 0);
      }
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    fetchSlaBreaches();
  }, [fetchQueue, fetchSlaBreaches]);

  // ─── Actions ─────────────────────────────────────────────────────────

  const handleAction = async (
    item: ModerationItem,
    action: 'approve' | 'reject' | 'escalate',
  ) => {
    setActionInProgress(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('jwt') || '' : '';
      const res = await fetch(
        `${API_BASE}/api/admin/world-engine/moderation/${item.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action, reason: reasonText || undefined }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Refetch
      setSelectedItem(null);
      setReasonText('');
      await fetchQueue();
      await fetchSlaBreaches();
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setActionInProgress(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <>
      <Head>
        <title>World Engine Moderation — Agentrix Admin</title>
      </Head>

      <div style={styles.container}>
        <header style={styles.header}>
          <h1 style={styles.title}>🛡️ World Engine 内容审核</h1>
          {slaBreaches > 0 && (
            <div style={styles.slaBadge}>
              ⚠️ {slaBreaches} 项已超 SLA
            </div>
          )}
        </header>

        {/* Filters */}
        <section style={styles.filters}>
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>阶段：</label>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as StageFilter)}
              style={styles.select}
            >
              <option value="all">全部</option>
              {Object.entries(STAGE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>状态：</label>
            <select
              value={decisionFilter}
              onChange={(e) =>
                setDecisionFilter(e.target.value as DecisionFilter)
              }
              style={styles.select}
            >
              <option value="all">全部</option>
              <option value="pending">待审核</option>
              <option value="approved">已批准</option>
              <option value="rejected">已拒绝</option>
            </select>
          </div>
          <button onClick={fetchQueue} style={styles.refreshBtn}>
            ↻ 刷新
          </button>
        </section>

        {/* Queue */}
        {loading ? (
          <div style={styles.empty}>加载中...</div>
        ) : items.length === 0 ? (
          <div style={styles.empty}>队列为空 ✨</div>
        ) : (
          <div style={styles.queue}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  ...styles.item,
                  borderLeftColor: STAGE_BADGE_COLORS[item.stage],
                }}
                onClick={() => setSelectedItem(item)}
              >
                <div style={styles.itemHeader}>
                  <span
                    style={{
                      ...styles.stageBadge,
                      background: STAGE_BADGE_COLORS[item.stage],
                    }}
                  >
                    {STAGE_LABELS[item.stage]}
                  </span>
                  <span
                    style={{
                      ...styles.decisionBadge,
                      background: DECISION_BADGE_COLORS[item.decision],
                    }}
                  >
                    {item.decision}
                  </span>
                  {item.automatedScore != null && (
                    <span style={styles.scoreBadge}>
                      AI: {(item.automatedScore * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <div style={styles.itemTitle}>
                  {item.asset?.name || `Asset ${item.worldAssetId.substring(0, 8)}`}
                  {item.asset?.category && (
                    <span style={styles.itemCategory}> · {item.asset.category}</span>
                  )}
                </div>
                <div style={styles.itemReason}>
                  {item.reason || '(no reason recorded)'}
                </div>
                <div style={styles.itemMeta}>
                  {new Date(item.createdAt).toLocaleString('zh-CN')}
                  {item.reviewerId && ` · 审核人: ${item.reviewerId.substring(0, 8)}`}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Detail Modal */}
        {selectedItem && (
          <div style={styles.modalBackdrop} onClick={() => setSelectedItem(null)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h2 style={styles.modalTitle}>
                {selectedItem.asset?.name || 'Unknown Asset'}
              </h2>
              <div style={styles.modalSection}>
                <strong>阶段：</strong> {STAGE_LABELS[selectedItem.stage]}
              </div>
              <div style={styles.modalSection}>
                <strong>当前状态：</strong>{' '}
                <span
                  style={{
                    ...styles.decisionBadge,
                    background: DECISION_BADGE_COLORS[selectedItem.decision],
                  }}
                >
                  {selectedItem.decision}
                </span>
              </div>
              {selectedItem.automatedScore != null && (
                <div style={styles.modalSection}>
                  <strong>AI 置信度：</strong>{' '}
                  {(selectedItem.automatedScore * 100).toFixed(1)}%
                </div>
              )}
              <div style={styles.modalSection}>
                <strong>记录原因：</strong>
                <div style={styles.modalReason}>
                  {selectedItem.reason || '(empty)'}
                </div>
              </div>
              <div style={styles.modalSection}>
                <strong>资产 ID：</strong> <code>{selectedItem.worldAssetId}</code>
              </div>
              <div style={styles.modalSection}>
                <strong>创建时间：</strong>{' '}
                {new Date(selectedItem.createdAt).toLocaleString('zh-CN')}
              </div>

              {/* Action Form (only show for pending) */}
              {selectedItem.decision === 'pending' && (
                <>
                  <div style={styles.modalSection}>
                    <label htmlFor="reason" style={styles.filterLabel}>
                      <strong>审核备注：</strong>
                    </label>
                    <textarea
                      id="reason"
                      value={reasonText}
                      onChange={(e) => setReasonText(e.target.value)}
                      placeholder="可选：添加审核备注..."
                      style={styles.textarea}
                      rows={3}
                    />
                  </div>
                  <div style={styles.modalActions}>
                    <button
                      onClick={() => setSelectedItem(null)}
                      style={styles.btnCancel}
                      disabled={actionInProgress}
                    >
                      取消
                    </button>
                    <button
                      onClick={() => handleAction(selectedItem, 'escalate')}
                      style={styles.btnEscalate}
                      disabled={actionInProgress}
                    >
                      ⏫ 升级
                    </button>
                    <button
                      onClick={() => handleAction(selectedItem, 'reject')}
                      style={styles.btnReject}
                      disabled={actionInProgress}
                    >
                      ❌ 拒绝
                    </button>
                    <button
                      onClick={() => handleAction(selectedItem, 'approve')}
                      style={styles.btnApprove}
                      disabled={actionInProgress}
                    >
                      ✅ 批准
                    </button>
                  </div>
                </>
              )}

              {selectedItem.decision !== 'pending' && (
                <div style={styles.modalActions}>
                  <button
                    onClick={() => setSelectedItem(null)}
                    style={styles.btnCancel}
                  >
                    关闭
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────

const styles: { [k: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    background: '#0a0a0a',
    color: '#fff',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif',
    padding: 24,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    margin: 0,
  },
  slaBadge: {
    background: '#F44336',
    color: '#fff',
    padding: '6px 14px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 600,
  },
  filters: {
    display: 'flex',
    gap: 16,
    alignItems: 'center',
    background: '#1a1a2e',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  filterLabel: {
    fontSize: 13,
    color: '#aaa',
  },
  select: {
    background: '#0a0a0a',
    color: '#fff',
    border: '1px solid #333',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 13,
  },
  refreshBtn: {
    marginLeft: 'auto',
    background: '#6c5ce7',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  empty: {
    textAlign: 'center',
    padding: 40,
    color: '#666',
    fontSize: 14,
  },
  queue: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  item: {
    background: '#1a1a2e',
    borderLeft: '4px solid #6c5ce7',
    borderRadius: 8,
    padding: 14,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  itemHeader: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    marginBottom: 6,
  },
  stageBadge: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 10,
    fontWeight: 600,
    color: '#fff',
  },
  decisionBadge: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 10,
    fontWeight: 600,
    color: '#fff',
    textTransform: 'uppercase',
  },
  scoreBadge: {
    fontSize: 11,
    color: '#666',
    marginLeft: 'auto',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: 600,
    marginBottom: 4,
  },
  itemCategory: {
    color: '#888',
    fontWeight: 400,
  },
  itemReason: {
    fontSize: 13,
    color: '#aaa',
    marginBottom: 6,
  },
  itemMeta: {
    fontSize: 11,
    color: '#666',
  },
  // Modal
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 999,
  },
  modal: {
    background: '#1a1a2e',
    borderRadius: 12,
    padding: 24,
    maxWidth: 600,
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 700,
    margin: '0 0 16px',
  },
  modalSection: {
    marginBottom: 12,
    fontSize: 14,
  },
  modalReason: {
    marginTop: 6,
    padding: 10,
    background: '#0a0a0a',
    borderRadius: 6,
    fontSize: 13,
    color: '#bbb',
    whiteSpace: 'pre-wrap',
  },
  textarea: {
    width: '100%',
    background: '#0a0a0a',
    color: '#fff',
    border: '1px solid #333',
    borderRadius: 6,
    padding: 10,
    fontSize: 13,
    fontFamily: 'inherit',
    resize: 'vertical',
    marginTop: 6,
  },
  modalActions: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  btnCancel: {
    background: '#333',
    color: '#aaa',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 13,
    cursor: 'pointer',
  },
  btnApprove: {
    background: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnReject: {
    background: '#F44336',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnEscalate: {
    background: '#FF9800',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
