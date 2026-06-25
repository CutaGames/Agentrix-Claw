/**
 * 协议调试器组件 (Protocol Debugger)
 * 
 * Workbench 侧边栏工具
 * - MCP 模式：查看工具调用
 * - UCP 模式：查看支付 session
 * - X402 模式：查看链上交易
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { AIButton } from '../ui/AIButton';

export type ProtocolMode = 'mcp' | 'ucp' | 'x402';

export interface MCPDebugEntry {
  id: string;
  timestamp: Date;
  type: 'tool_call' | 'tool_result' | 'error';
  toolName?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  error?: string;
  latencyMs?: number;
}

export interface UCPDebugEntry {
  id: string;
  timestamp: Date;
  type: 'session_create' | 'session_update' | 'payment_request' | 'payment_complete' | 'error';
  sessionId?: string;
  productId?: string;
  amount?: number;
  currency?: string;
  status?: string;
  error?: string;
}

export interface X402DebugEntry {
  id: string;
  timestamp: Date;
  type: 'tx_prepare' | 'tx_sign' | 'tx_broadcast' | 'tx_confirm' | 'error';
  txHash?: string;
  from?: string;
  to?: string;
  amount?: number;
  token?: string;
  gasUsed?: number;
  blockNumber?: number;
  status?: 'pending' | 'confirmed' | 'failed';
  error?: string;
}

type DebugEntry = MCPDebugEntry | UCPDebugEntry | X402DebugEntry;

interface ProtocolDebuggerProps {
  initialMode?: ProtocolMode;
  onModeChange?: (mode: ProtocolMode) => void;
  // 外部注入的调试数据
  mcpEntries?: MCPDebugEntry[];
  ucpEntries?: UCPDebugEntry[];
  x402Entries?: X402DebugEntry[];
  // 清除回调
  onClear?: (mode: ProtocolMode) => void;
}

const MODE_CONFIG: Record<ProtocolMode, { label: string; icon: string; color: string }> = {
  mcp: { label: 'MCP', icon: '🔌', color: 'text-purple-400 border-purple-400' },
  ucp: { label: 'UCP', icon: '🛒', color: 'text-amber-400 border-amber-400' },
  x402: { label: 'X402', icon: '⛓️', color: 'text-green-400 border-green-400' },
};

export function ProtocolDebugger({
  initialMode = 'mcp',
  onModeChange,
  mcpEntries = [],
  ucpEntries = [],
  x402Entries = [],
  onClear,
}: ProtocolDebuggerProps) {
  const [mode, setMode] = useState<ProtocolMode>(initialMode);
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<DebugEntry | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const handleModeChange = useCallback((newMode: ProtocolMode) => {
    setMode(newMode);
    setSelectedEntry(null);
    onModeChange?.(newMode);
  }, [onModeChange]);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [mcpEntries, ucpEntries, x402Entries, autoScroll, mode]);

  // 获取当前模式的条目
  const currentEntries = mode === 'mcp' ? mcpEntries : mode === 'ucp' ? ucpEntries : x402Entries;

  // 格式化时间
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  };

  // 渲染 MCP 条目
  const renderMCPEntry = (entry: MCPDebugEntry) => (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          entry.type === 'tool_call' ? 'bg-purple-500/20 text-purple-400' :
          entry.type === 'tool_result' ? 'bg-green-500/20 text-green-400' :
          'bg-red-500/20 text-red-400'
        }`}>
          {entry.type === 'tool_call' ? '调用' : entry.type === 'tool_result' ? '结果' : '错误'}
        </span>
        {entry.toolName && (
          <span className="text-sm font-mono text-neutral-200">{entry.toolName}</span>
        )}
        {entry.latencyMs !== undefined && (
          <span className="text-xs text-neutral-500">{entry.latencyMs}ms</span>
        )}
      </div>
      {entry.input && (
        <pre className="text-xs text-neutral-400 overflow-hidden text-ellipsis">
          {JSON.stringify(entry.input, null, 2).slice(0, 100)}...
        </pre>
      )}
      {entry.error && (
        <p className="text-xs text-red-400">{entry.error}</p>
      )}
    </div>
  );

  // 渲染 UCP 条目
  const renderUCPEntry = (entry: UCPDebugEntry) => (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          entry.type === 'session_create' ? 'bg-blue-500/20 text-blue-400' :
          entry.type === 'payment_complete' ? 'bg-green-500/20 text-green-400' :
          entry.type === 'error' ? 'bg-red-500/20 text-red-400' :
          'bg-amber-500/20 text-amber-400'
        }`}>
          {entry.type.replace('_', ' ')}
        </span>
        {entry.sessionId && (
          <span className="text-xs font-mono text-neutral-400">
            {entry.sessionId.slice(0, 8)}...
          </span>
        )}
      </div>
      {entry.amount !== undefined && (
        <p className="text-sm text-primary-neon">
          ${entry.amount.toFixed(2)} {entry.currency}
        </p>
      )}
      {entry.status && (
        <p className="text-xs text-neutral-400">状态: {entry.status}</p>
      )}
      {entry.error && (
        <p className="text-xs text-red-400">{entry.error}</p>
      )}
    </div>
  );

  // 渲染 X402 条目
  const renderX402Entry = (entry: X402DebugEntry) => (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          entry.type === 'tx_confirm' ? 'bg-green-500/20 text-green-400' :
          entry.type === 'tx_broadcast' ? 'bg-blue-500/20 text-blue-400' :
          entry.type === 'error' ? 'bg-red-500/20 text-red-400' :
          'bg-neutral-500/20 text-neutral-400'
        }`}>
          {entry.type.replace('tx_', '')}
        </span>
        {entry.status && (
          <span className={`text-xs ${
            entry.status === 'confirmed' ? 'text-green-400' :
            entry.status === 'pending' ? 'text-amber-400' :
            'text-red-400'
          }`}>
            {entry.status}
          </span>
        )}
      </div>
      {entry.txHash && (
        <a 
          href={`https://etherscan.io/tx/${entry.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-mono text-primary-cyan hover:underline"
        >
          {entry.txHash.slice(0, 10)}...{entry.txHash.slice(-8)}
        </a>
      )}
      {entry.amount !== undefined && (
        <p className="text-sm text-primary-neon">
          {entry.amount} {entry.token}
        </p>
      )}
      {entry.gasUsed !== undefined && (
        <p className="text-xs text-neutral-500">Gas: {entry.gasUsed.toLocaleString()}</p>
      )}
      {entry.error && (
        <p className="text-xs text-red-400">{entry.error}</p>
      )}
    </div>
  );

  // 渲染条目
  const renderEntry = (entry: DebugEntry) => {
    if (mode === 'mcp') return renderMCPEntry(entry as MCPDebugEntry);
    if (mode === 'ucp') return renderUCPEntry(entry as UCPDebugEntry);
    return renderX402Entry(entry as X402DebugEntry);
  };

  return (
    <GlassCard className="h-full flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔍</span>
          <h3 className="font-semibold text-neutral-100">协议调试器</h3>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          {isExpanded ? '▼' : '▲'}
        </button>
      </div>

      {isExpanded && (
        <>
          {/* 模式切换 */}
          <div className="flex gap-2 mb-4">
            {(Object.keys(MODE_CONFIG) as ProtocolMode[]).map((m) => {
              const config = MODE_CONFIG[m];
              return (
                <button
                  key={m}
                  onClick={() => handleModeChange(m)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border transition-all ${
                    mode === m
                      ? `${config.color} bg-white/5`
                      : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
                  }`}
                >
                  <span>{config.icon}</span>
                  <span className="text-sm font-medium">{config.label}</span>
                </button>
              );
            })}
          </div>

          {/* 工具栏 */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5 text-neutral-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded bg-neutral-700 border-neutral-600 w-3 h-3"
                />
                自动滚动
              </label>
              <span className="text-neutral-600">|</span>
              <span className="text-neutral-500">
                {currentEntries.length} 条记录
              </span>
            </div>
            {onClear && (
              <button
                onClick={() => onClear(mode)}
                className="text-xs text-neutral-500 hover:text-neutral-300"
              >
                清除
              </button>
            )}
          </div>

          {/* 调试日志列表 */}
          <div 
            ref={listRef}
            className="flex-1 overflow-y-auto space-y-2 min-h-0 custom-scrollbar"
          >
            {currentEntries.length === 0 ? (
              <div className="text-center py-8 text-neutral-500">
                <p className="text-2xl mb-2">{MODE_CONFIG[mode].icon}</p>
                <p className="text-sm">等待 {MODE_CONFIG[mode].label} 事件...</p>
              </div>
            ) : (
              currentEntries.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    selectedEntry?.id === entry.id
                      ? 'bg-primary-blue/20 border border-primary-blue/30'
                      : 'bg-neutral-800/30 border border-transparent hover:bg-neutral-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-neutral-500">
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                  {renderEntry(entry)}
                </div>
              ))
            )}
          </div>

          {/* 详情面板 */}
          {selectedEntry && (
            <div className="mt-4 pt-4 border-t border-neutral-700/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-neutral-300">详细信息</span>
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="text-neutral-500 hover:text-neutral-300 text-xs"
                >
                  关闭
                </button>
              </div>
              <pre className="text-xs text-neutral-400 bg-neutral-900/50 p-3 rounded-lg overflow-auto max-h-40">
                {JSON.stringify(selectedEntry, null, 2)}
              </pre>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </GlassCard>
  );
}

export default ProtocolDebugger;
