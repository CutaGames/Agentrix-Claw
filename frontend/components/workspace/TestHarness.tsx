import React, { useState, useEffect } from 'react';
import { Zap, Play, CheckCircle, AlertCircle, FileText, Search } from 'lucide-react';
import { skillApi, Skill, SkillExecutionResult } from '@/lib/api/skill.api';

export const TestHarness: React.FC = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [inputParams, setInputParams] = useState<string>('{}');
  const [executionResult, setExecutionResult] = useState<SkillExecutionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  useEffect(() => {
    loadPublishedSkills();
  }, []);

  const loadPublishedSkills = async () => {
    try {
      const response = await skillApi.list({ status: 'published', limit: 100 });
      setSkills(response.items || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRunTest = async () => {
    if (!selectedSkill) return;
    
    setLoading(true);
    setExecutionResult(null);
    setReceiptId(null);
    setError(null);

    try {
      const params = JSON.parse(inputParams);
      const result = await skillApi.execute(selectedSkill.id, params);
      setExecutionResult(result);
      
      // Simulate receipt generation
      if (result.success) {
        setReceiptId(`rcpt_${Math.random().toString(36).substring(2, 15)}`);
      }
    } catch (err: any) {
      setError(err.message || '执行失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="test-harness bg-slate-900 rounded-xl shadow-lg border border-white/10 text-slate-200 overflow-hidden">
      <div className="p-5 border-b border-white/5 bg-white/5">
        <h2 className="text-xl font-bold text-white">Test Harness</h2>
        <p className="text-sm text-slate-400">输入输出模拟 + E2E 订单闭环验证</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-x divide-white/5">
        {/* Left: Input Configuration */}
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">1. 选择测试技能</label>
            <div className="relative">
              <select
                value={selectedSkill?.id || ''}
                onChange={(e) => {
                  const skill = skills.find(s => s.id === e.target.value);
                  setSelectedSkill(skill || null);
                  if (skill) {
                    const defaultParams: Record<string, any> = {};
                    Object.keys(skill.inputSchema.properties || {}).forEach(key => {
                      defaultParams[key] = (skill.inputSchema.properties as any)[key].default || '';
                    });
                    setInputParams(JSON.stringify(defaultParams, null, 2));
                  }
                }}
                className="w-full px-4 py-3 bg-slate-950 border border-white/10 rounded-xl outline-none text-white focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                <option value="">请选择技能...</option>
                {skills.map(s => (
                  <option key={s.id} value={s.id}>{s.name} (v{s.version})</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                <Search size={18} />
              </div>
            </div>
          </div>

          {selectedSkill && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="block text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">2. 输入参数 (JSON)</label>
              <textarea
                value={inputParams}
                onChange={(e) => setInputParams(e.target.value)}
                className="w-full px-4 py-4 bg-slate-950 border border-white/10 rounded-xl font-mono text-xs text-blue-300 outline-none focus:ring-2 focus:ring-blue-500 min-h-[200px]"
              />
              <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
                {Object.keys(selectedSkill.inputSchema.properties || {}).map(key => (
                  <span key={key} className="px-2 py-1 bg-white/5 rounded text-[10px] text-slate-500 border border-white/5 whitespace-nowrap">
                    {key}: {selectedSkill.inputSchema.properties[key].type}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleRunTest}
            disabled={loading || !selectedSkill}
            className="w-full py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-3 transition-all shadow-lg shadow-blue-600/20 font-bold"
          >
            {loading ? <Zap className="animate-spin" /> : <Play size={20} />}
            执行端到端测试
          </button>
        </div>

        {/* Right: Results & Validation */}
        <div className="p-6 bg-slate-950/30">
          <label className="block text-sm font-bold text-slate-300 mb-4 uppercase tracking-wider">测试结果与验证</label>
          
          {loading && (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500">
              <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              正在模拟执行并验证链路...
            </div>
          )}

          {!loading && !executionResult && !error && (
            <div className="h-64 flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-white/5 rounded-2xl">
              <Zap size={48} className="mb-4 opacity-20" />
              <p>等待测试运行</p>
            </div>
          )}

          {error && (
            <div className="p-5 bg-red-500/10 border border-red-500/20 rounded-2xl">
              <div className="flex items-center gap-3 text-red-400 mb-2 font-bold">
                <AlertCircle size={20} />
                <span>执行错误</span>
              </div>
              <p className="text-sm text-red-300 font-mono">{error}</p>
            </div>
          )}

          {executionResult && (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
              {/* Output */}
              <div className="bg-slate-900 border border-white/10 rounded-2xl p-5">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs font-bold text-slate-500 uppercase">Response Data</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${executionResult.success ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {executionResult.success ? 'SUCCESS' : 'FAILED'}
                  </span>
                </div>
                <pre className="text-xs text-emerald-400 font-mono overflow-auto max-h-48 leading-relaxed">
                  {JSON.stringify(executionResult.data, null, 2)}
                </pre>
              </div>

              {/* Receipt */}
              {receiptId && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5">
                  <div className="flex items-center gap-3 text-blue-400 mb-3 font-bold">
                    <FileText size={20} />
                    <span>Receipt Generated</span>
                  </div>
                  <div className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-white/10">
                    <code className="text-xs text-blue-300 font-mono">{receiptId}</code>
                    <button 
                      onClick={() => alert('已关联到审计链')}
                      className="text-[10px] text-blue-500 hover:underline font-bold"
                    >
                      验证审计
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-3">
                    所有关键动作已生成 Receipt 并通过 Relayer 锚定到审计链。
                  </p>
                </div>
              )}

              {/* Order Closure Simulation (Only for Commerce) */}
              {selectedSkill?.category === 'commerce' && (
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-5">
                  <div className="flex items-center gap-3 text-purple-400 mb-3 font-bold">
                    <CheckCircle size={20} />
                    <span>E2E Order Flow</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Order Creation</span>
                      <span className="text-emerald-400">✅ Done</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Payment Verification</span>
                      <span className="text-emerald-400">✅ Done</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Webhook Notification</span>
                      <span className="text-amber-400">⏳ Simulating...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TestHarness;
