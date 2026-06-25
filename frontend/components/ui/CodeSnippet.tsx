import { useState } from 'react';
import { GlassCard } from './GlassCard';
import { AIButton } from './AIButton';

interface CodeSnippetProps {
  code: string;
  language?: 'typescript' | 'javascript' | 'python' | 'curl';
  title?: string;
}

/**
 * 代码片段组件（Agentrix V3.0设计规范）
 * 支持语法高亮和代码复制
 */
export function CodeSnippet({ code, language = 'typescript', title }: CodeSnippetProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('复制失败:', error);
    }
  };

  return (
    <GlassCard>
      {title && (
        <div className="text-sm font-semibold text-neutral-100 mb-3 flex items-center justify-between">
          <span>{title}</span>
          <span className="text-xs text-neutral-400 px-2 py-1 glass rounded">
            {language}
          </span>
        </div>
      )}
      
      <div className="relative">
        <pre className="p-4 glass rounded-lg bg-neutral-900/50 overflow-x-auto">
          <code className="text-xs text-neutral-300 font-mono">{code}</code>
        </pre>
        
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 p-2 glass rounded hover:bg-white/10 transition-colors"
          title="复制代码"
        >
          {copied ? (
            <span className="text-accent-green text-xs">✓ 已复制</span>
          ) : (
            <svg className="w-4 h-4 text-primary-neon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>

      <div className="flex gap-2 mt-3">
        <AIButton variant="outline" className="flex-1 text-xs py-2" onClick={handleCopy}>
          {copied ? '已复制' : '复制代码'}
        </AIButton>
        <AIButton className="flex-1 text-xs py-2">
          运行示例
        </AIButton>
      </div>
    </GlassCard>
  );
}

