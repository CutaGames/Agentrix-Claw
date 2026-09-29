import React, { useEffect, useState } from 'react';
import { apiFetch, API_BASE } from '../services/store';

interface ContextBreakdown {
  systemPrompt: number;
  history: number;
  memories: number;
  toolSchemas: number;
  plan: number;
}

interface ContextUsage {
  messageCount: number;
  estimatedTokens: number;
  contextWindowSize: number;
  usagePercent: number;
  needsCompaction: boolean;
  breakdown: ContextBreakdown;
  recommendations: string[];
}

interface ContextVisualizerProps {
  sessionId: string;
  token: string;
  instanceId?: string;
}

export const ContextVisualizer: React.FC<ContextVisualizerProps> = ({ sessionId, token, instanceId }) => {
  const [usage, setUsage] = useState<ContextUsage | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!sessionId || !token) return;
    const fetchUsage = async () => {
      try {
        const url = `${API_BASE}/agent-intelligence/sessions/${encodeURIComponent(sessionId)}/context-usage${instanceId ? `?instanceId=${instanceId}` : ''}`;
        const res = await apiFetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setUsage(await res.json());
        }
      } catch {
        // Silent fail — context viz is non-critical
      }
    };
    fetchUsage();
    const interval = setInterval(fetchUsage, 30000);
    return () => clearInterval(interval);
  }, [sessionId, token, instanceId]);

  if (!usage) return null;

  const barColor = usage.usagePercent > 75 ? '#ef4444' : usage.usagePercent > 50 ? '#f59e0b' : '#22c55e';

  return (
    <div style={styles.container} onClick={() => setExpanded(!expanded)}>
      {/* Compact bar */}
      <div style={styles.compactRow}>
        <span style={styles.label}>Context</span>
        <div style={styles.barOuter}>
          <div style={{ ...styles.barInner, width: `${Math.min(usage.usagePercent, 100)}%`, backgroundColor: barColor }} />
        </div>
        <span style={styles.percent}>{usage.usagePercent}%</span>
        <span style={styles.tokenCount}>{formatTokens(usage.estimatedTokens)} / {formatTokens(usage.contextWindowSize)}</span>
      </div>

      {/* Expanded breakdown */}
      {expanded && (
        <div style={styles.expanded}>
          <div style={styles.breakdownTitle}>Token Breakdown</div>
          {Object.entries(usage.breakdown).map(([key, value]) => (
            <div key={key} style={styles.breakdownRow}>
              <span style={styles.breakdownLabel}>{formatLabel(key)}</span>
              <div style={styles.miniBarOuter}>
                <div style={{
                  ...styles.miniBarInner,
                  width: `${Math.min((value / usage.contextWindowSize) * 100, 100)}%`,
                }} />
              </div>
              <span style={styles.breakdownValue}>{formatTokens(value)}</span>
            </div>
          ))}
          {usage.recommendations.length > 0 && (
            <div style={styles.recommendations}>
              {usage.recommendations.map((r, i) => (
                <div key={i} style={styles.recommendation}>💡 {r}</div>
              ))}
            </div>
          )}
          <div style={styles.msgCount}>{usage.messageCount} messages in history</div>
        </div>
      )}
    </div>
  );
};

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatLabel(key: string): string {
  const labels: Record<string, string> = {
    systemPrompt: 'System Prompt',
    history: 'Chat History',
    memories: 'Memories',
    toolSchemas: 'Tool Schemas',
    plan: 'Active Plan',
  };
  return labels[key] || key;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '6px 12px',
    borderRadius: 8,
    background: 'var(--bg-overlay-light)',
    cursor: 'pointer',
    fontSize: 12,
    userSelect: 'none',
  },
  compactRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: '#888',
    fontWeight: 500,
    minWidth: 50,
  },
  barOuter: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    background: 'var(--bg-overlay-light)',
    overflow: 'hidden',
  },
  barInner: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.3s ease',
  },
  percent: {
    color: '#aaa',
    fontWeight: 600,
    minWidth: 32,
    textAlign: 'right' as const,
  },
  tokenCount: {
    color: '#666',
    fontSize: 11,
    minWidth: 80,
    textAlign: 'right' as const,
  },
  expanded: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid rgba(255,255,255,0.1)',
  },
  breakdownTitle: {
    color: '#aaa',
    fontWeight: 600,
    marginBottom: 6,
  },
  breakdownRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  breakdownLabel: {
    color: '#888',
    minWidth: 90,
  },
  miniBarOuter: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    background: 'var(--bg-overlay-light)',
    overflow: 'hidden',
  },
  miniBarInner: {
    height: '100%',
    borderRadius: 2,
    background: '#6366f1',
  },
  breakdownValue: {
    color: '#999',
    minWidth: 50,
    textAlign: 'right' as const,
    fontSize: 11,
  },
  recommendations: {
    marginTop: 8,
    padding: '6px 8px',
    borderRadius: 6,
    background: 'rgba(245,158,11,0.1)',
  },
  recommendation: {
    color: '#f59e0b',
    fontSize: 11,
    marginBottom: 2,
  },
  msgCount: {
    color: '#666',
    marginTop: 6,
    fontSize: 11,
    textAlign: 'center' as const,
  },
};

export default ContextVisualizer;
