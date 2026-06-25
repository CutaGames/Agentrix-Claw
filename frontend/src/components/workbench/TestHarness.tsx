import React, { useState } from 'react';
import { Skill } from '../../types/skill.types';
import { Play, RotateCcw, ShieldCheck, Terminal, Zap } from 'lucide-react';

export const TestHarness: React.FC<{ selectedSkill?: Skill }> = ({ selectedSkill }) => {
  const [params, setParams] = useState<string>('{}');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleTest = async () => {
    if (!selectedSkill) return;
    setLoading(true);
    // In a real app, this would call a mock execution endpoint
    setTimeout(() => {
      setResult({
        success: true,
        data: { message: "Successfully executed " + selectedSkill.name, timestamp: new Date().toISOString() },
        receipt_id: "rcpt_" + Math.random().toString(36).slice(2, 10)
      });
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-white/10 overflow-hidden">
      <div className="p-6 border-b border-white/5">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Terminal className="text-emerald-400" size={24} />
          Test Harness
        </h2>
        <p className="text-xs text-slate-400">Run E2E simulations and verify skill logic</p>
      </div>

      <div className="p-6 grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Input Parameters (JSON)</label>
            <textarea
              value={params}
              onChange={e => setParams(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-lg p-3 text-blue-300 font-mono text-xs h-48 mt-2"
              placeholder='{"query": "test"}'
            />
          </div>
          <button
            onClick={handleTest}
            disabled={!selectedSkill || loading}
            className="w-full py-3 bg-emerald-600 text-white rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-lg shadow-emerald-600/20"
          >
            <Play size={18} />
            {loading ? 'Executing...' : 'Run Simulation'}
          </button>
        </div>

        <div className="space-y-4">
          <label className="text-xs font-bold text-slate-500 uppercase">Execution Result</label>
          <div className="bg-slate-950 rounded-lg border border-white/10 h-48 overflow-auto p-4 mt-2">
            {result ? (
              <pre className="text-[10px] text-emerald-400 font-mono">
                {JSON.stringify(result, null, 2)}
              </pre>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-700">
                <p className="text-xs">No execution history</p>
              </div>
            )}
          </div>
          {result?.receipt_id && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-blue-400" />
                <span className="text-[10px] text-blue-400 font-bold uppercase">Audit Proof Generated</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">{result.receipt_id}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
