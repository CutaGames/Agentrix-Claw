'use client';

import React, { useState, useEffect } from 'react';
import { Brain, CheckCircle2, Loader2 } from 'lucide-react';

interface DeepThinkIndicatorProps {
  isActive: boolean;
  targetModel?: string;
  summary?: string;
  onDismiss?: () => void;
}

/**
 * DeepThinkIndicator — Shows when a voice query has been routed to the ultra-tier
 * (Opus 4.6 / GPT-5.4) for deep analysis.
 *
 * States:
 *   1. Thinking: animated brain icon + "正在深度分析..."
 *   2. Done: check icon + brief summary
 */
export function DeepThinkIndicator({
  isActive,
  targetModel,
  summary,
  onDismiss,
}: DeepThinkIndicatorProps) {
  const [visible, setVisible] = useState(false);
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (isActive) {
      setVisible(true);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive || summary) return;

    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);

    return () => clearInterval(interval);
  }, [isActive, summary]);

  // Auto-dismiss after summary displayed for 8s
  useEffect(() => {
    if (!summary) return;
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, 8000);
    return () => clearTimeout(timer);
  }, [summary, onDismiss]);

  if (!visible) return null;

  const modelLabel = targetModel === 'anthropic.claude-opus-4.6'
    ? 'Claude Opus'
    : targetModel === 'gpt-5.4'
    ? 'GPT-5.4'
    : targetModel || '高级分析';

  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-sm">
      {isActive && !summary ? (
        <>
          <Brain className="w-5 h-5 text-indigo-400 animate-pulse mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-indigo-300">
              深度分析中{dots}
            </div>
            <div className="text-xs text-indigo-400/70 mt-0.5">
              已交由 {modelLabel} 处理，请稍候
            </div>
          </div>
          <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
        </>
      ) : (
        <>
          <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-emerald-300">
              分析完成
            </div>
            {summary && (
              <div className="text-xs text-slate-400 mt-1 line-clamp-3">
                {summary}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setVisible(false); onDismiss?.(); }}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            关闭
          </button>
        </>
      )}
    </div>
  );
}
