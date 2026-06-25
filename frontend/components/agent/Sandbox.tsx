import { useState, useEffect } from 'react';
import { CodeExample } from '../../lib/api/agent.api';
import { sandboxApi } from '../../lib/api/sandbox.api';
import { GlassCard } from '../ui/GlassCard';
import { AIButton } from '../ui/AIButton';

interface SandboxProps {
  codeExample?: CodeExample;
}

export function Sandbox({ codeExample }: SandboxProps) {
  const [code, setCode] = useState(codeExample?.code || '');
  const [output, setOutput] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (codeExample) {
      setCode(codeExample.code);
    }
  }, [codeExample]);

  const handleRun = async () => {
    setIsRunning(true);
    setError('');
    setOutput('');

    try {
      // 调用后端沙箱API执行代码
      const result = await sandboxApi.execute({
        code,
        language: 'typescript', // 可以根据代码自动检测
      });

      if (result.success) {
        setOutput(JSON.stringify(result.output, null, 2));
      } else {
        setError(result.error || '执行失败');
      }
    } catch (err: any) {
      setError(err.message || '执行失败');
    } finally {
      setIsRunning(false);
    }
  };

  const handleClear = () => {
    setCode('');
    setOutput('');
    setError('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-100 flex items-center gap-2">
          <span>🧪</span>
          <span>沙箱测试环境</span>
        </h3>
        <div className="flex space-x-2">
          <AIButton
            onClick={handleRun}
            disabled={isRunning || !code.trim()}
            className="px-4 py-2"
          >
            {isRunning ? (
              <span className="flex items-center gap-2">
                <span className="thinking-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
                运行中...
              </span>
            ) : (
              '▶ 运行'
            )}
          </AIButton>
          <AIButton
            variant="outline"
            onClick={handleClear}
            className="px-4 py-2"
          >
            清空
          </AIButton>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 代码编辑器 */}
        <GlassCard>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-neutral-100">代码编辑器</span>
            <span className="text-xs text-neutral-400 px-2 py-1 glass rounded">TypeScript</span>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full h-96 p-4 font-mono text-sm bg-neutral-900/50 text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-neon rounded-lg resize-none border border-neutral-700/50"
            placeholder="在此输入或粘贴代码..."
          />
        </GlassCard>

        {/* 输出区域 */}
        <GlassCard>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-neutral-100">执行结果</span>
            {output && (
              <span className="text-xs text-accent-green flex items-center gap-1">
                <span>✓</span>
                <span>执行成功</span>
              </span>
            )}
          </div>
          <div className="h-96 p-4 bg-neutral-900/50 text-neutral-100 font-mono text-sm overflow-auto rounded-lg border border-neutral-700/50">
            {error ? (
              <div className="text-accent-red">
                <div className="font-bold mb-2 flex items-center gap-2">
                  <span>❌</span>
                  <span>执行错误:</span>
                </div>
                <pre className="whitespace-pre-wrap">{error}</pre>
              </div>
            ) : output ? (
              <pre className="whitespace-pre-wrap text-neutral-100">{output}</pre>
            ) : (
              <div className="text-neutral-500 flex items-center justify-center h-full">
                运行代码查看结果...
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      <GlassCard>
        <div className="flex items-start space-x-3">
          <span className="text-primary-neon text-xl">ℹ️</span>
          <div className="text-sm text-neutral-300">
            <p className="font-medium mb-2 text-neutral-100">沙箱测试说明：</p>
            <ul className="list-disc list-inside space-y-1 text-neutral-400">
              <li>这是模拟测试环境，不会产生真实交易</li>
              <li>实际使用时需要配置API密钥</li>
              <li>支持TypeScript、JavaScript、Python代码</li>
              <li>可以测试支付、订单、商品搜索等功能</li>
            </ul>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

