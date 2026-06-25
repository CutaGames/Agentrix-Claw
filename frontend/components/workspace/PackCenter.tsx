/**
 * Pack Center 组件
 * 
 * 提供 Skill 的一键生成 OpenAI Actions / Claude MCP 产物功能
 */

import React, { useState, useEffect, useCallback } from 'react';
import { skillApi, Skill } from '../../lib/api/skill.api';
import { 
  Package, 
  Zap, 
  Download, 
  Eye, 
  Copy, 
  Check, 
  AlertCircle, 
  Cpu, 
  Bot,
  Terminal,
  FileJson,
  RefreshCw,
  ChevronRight,
  ExternalLink
} from 'lucide-react';

interface PackCenterProps {
  onPackGenerated?: (platform: string, content: any) => void;
}

interface PackResult {
  platform: string;
  content: any;
  generatedAt: string;
}

export const PackCenter: React.FC<PackCenterProps> = ({ onPackGenerated }) => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [baseUrl, setBaseUrl] = useState('https://api.agentrix.ai');
  const [packResults, setPackResults] = useState<PackResult[]>([]);
  const [previewContent, setPreviewContent] = useState<{ platform: string; content: any } | null>(null);
  const [copied, setCopied] = useState(false);

  // 加载已发布的 Skills
  useEffect(() => {
    const loadSkills = async () => {
      setLoading(true);
      try {
        const response = await skillApi.list({ status: 'published', limit: 100 });
        setSkills(response.items || []);
      } catch (err: any) {
        setError(err.message || '加载 Skills 失败');
      } finally {
        setLoading(false);
      }
    };
    loadSkills();
  }, []);

  const toggleSkill = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    setSelectedIds(new Set(skills.map(s => s.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const generateOpenAIActions = async () => {
    if (selectedIds.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const response = await skillApi.exportOpenAPI(Array.from(selectedIds), baseUrl);
      const result = {
        platform: 'OpenAI Actions',
        content: response.openapi,
        generatedAt: new Date().toISOString()
      };
      setPackResults(prev => [result, ...prev]);
      onPackGenerated?.(result.platform, result.content);
    } catch (err: any) {
      setError(err.message || '生成 OpenAI Actions 失败');
    } finally {
      setLoading(false);
    }
  };

  const generateMCPTools = async () => {
    if (selectedIds.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const response = await skillApi.exportMCP(Array.from(selectedIds));
      const result = {
        platform: 'Claude MCP',
        content: response.tools,
        generatedAt: new Date().toISOString()
      };
      setPackResults(prev => [result, ...prev]);
      onPackGenerated?.(result.platform, result.content);
    } catch (err: any) {
      setError(err.message || '生成 Claude MCP 失败');
    } finally {
      setLoading(false);
    }
  };

  const downloadJSON = (content: any, filename: string) => {
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (content: any) => {
    navigator.clipboard.writeText(JSON.stringify(content, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="pack-center bg-slate-900 rounded-2xl shadow-2xl border border-white/10 text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/5 bg-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Bot className="text-purple-400" size={24} />
            Pack Center
          </h2>
          <p className="text-xs text-slate-400 mt-1">一键生成 OpenAI Actions / Claude MCP 产物</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Processing' : 'Ready'}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border-b border-red-500/20 flex items-center gap-3">
          <AlertCircle size={18} className="text-red-400" />
          <p className="text-red-400 text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="grid lg:grid-cols-2 divide-x divide-white/5">
        <div className="p-6 space-y-6">
          {/* Base URL Config */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">API Base URL</label>
            <div className="relative">
              <Terminal className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-white/10 rounded-xl outline-none text-white focus:border-blue-500/50 transition-all font-mono text-sm"
                placeholder="https://api.agentrix.com"
              />
            </div>
          </div>

          {/* Skills Selection */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">选择已发布的 Skills</label>
              <div className="flex gap-4">
                <button onClick={selectAll} className="text-[10px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-wider transition-colors">全选</button>
                <button onClick={clearSelection} className="text-[10px] font-bold text-slate-500 hover:text-slate-400 uppercase tracking-wider transition-colors">清除</button>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto border border-white/5 rounded-2xl bg-slate-950 divide-y divide-white/5 scrollbar-hide">
              {skills.length === 0 ? (
                <div className="p-12 text-center text-slate-600">
                  <Package size={32} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm">暂无已发布的 Skills</p>
                </div>
              ) : (
                skills.map(skill => (
                  <label
                    key={skill.id}
                    className={`flex items-center p-4 hover:bg-white/[0.02] cursor-pointer transition-colors ${selectedIds.has(skill.id) ? 'bg-white/[0.03]' : ''}`}
                  >
                    <div className="relative flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(skill.id)}
                        onChange={() => toggleSkill(skill.id)}
                        className="peer sr-only"
                      />
                      <div className="w-5 h-5 border-2 border-white/10 rounded-md peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-all flex items-center justify-center">
                        <Check size={12} className="text-white opacity-0 peer-checked:opacity-100" />
                      </div>
                    </div>
                    <div className="ml-4 flex-1 min-w-0">
                      <p className="font-bold text-sm text-white truncate">{skill.name}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 uppercase">v{skill.version} • {skill.category}</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-700" />
                  </label>
                ))
              )}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                已选择 <span className="text-blue-400">{selectedIds.size}</span> 个技能
              </p>
            </div>
          </div>

          {/* Generate Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={generateOpenAIActions}
              disabled={loading || selectedIds.size === 0}
              className="group py-4 bg-emerald-600/10 hover:bg-emerald-600 border border-emerald-500/20 hover:border-emerald-500 text-emerald-400 hover:text-white rounded-2xl transition-all flex flex-col items-center gap-2 disabled:opacity-30 disabled:pointer-events-none shadow-lg shadow-emerald-500/5"
            >
              <Cpu size={24} className="group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold uppercase tracking-wider">OpenAI Actions</span>
            </button>
            <button
              onClick={generateMCPTools}
              disabled={loading || selectedIds.size === 0}
              className="group py-4 bg-purple-600/10 hover:bg-purple-600 border border-purple-500/20 hover:border-purple-500 text-purple-400 hover:text-white rounded-2xl transition-all flex flex-col items-center gap-2 disabled:opacity-30 disabled:pointer-events-none shadow-lg shadow-purple-500/5"
            >
              <Bot size={24} className="group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold uppercase tracking-wider">Claude MCP</span>
            </button>
          </div>
        </div>

        <div className="p-6 bg-slate-950/30">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">生成历史</label>
          
          <div className="space-y-3">
            {packResults.length === 0 ? (
              <div className="p-12 text-center text-slate-700">
                <FileJson size={32} className="mx-auto mb-3 opacity-10" />
                <p className="text-sm">暂无生成记录</p>
              </div>
            ) : (
              packResults.map((result, idx) => (
                <div key={idx} className="bg-slate-900 border border-white/5 rounded-2xl p-4 group hover:border-white/10 transition-all animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="font-bold text-white text-sm">{result.platform}</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">{new Date(result.generatedAt).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPreviewContent({ platform: result.platform, content: result.content })}
                        className="w-8 h-8 flex items-center justify-center bg-white/5 text-slate-400 rounded-lg hover:text-white hover:bg-white/10 transition-all"
                        title="预览"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => downloadJSON(
                          result.content,
                          `${result.platform.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`
                        )}
                        className="w-8 h-8 flex items-center justify-center bg-blue-600/10 text-blue-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all"
                        title="下载"
                      >
                        <Download size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="bg-slate-950 rounded-lg p-3 relative">
                    <pre className="text-[10px] text-slate-400 font-mono truncate">
                      {JSON.stringify(result.content, null, 2)}
                    </pre>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewContent && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-[100] p-6 animate-in fade-in duration-300">
          <div className="bg-slate-900 rounded-3xl shadow-2xl max-w-5xl w-full max-h-[85vh] flex flex-col border border-white/10 overflow-hidden">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-3">
                  <Bot className="text-blue-400" size={24} />
                  {previewContent.platform} Schema 预览
                </h3>
                <p className="text-xs text-slate-400 mt-1">可以直接复制到各 AI 平台配置中心进行部署</p>
              </div>
              <button
                onClick={() => setPreviewContent(null)}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all border border-white/5"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-slate-950">
              <pre className="text-xs text-blue-300 font-mono leading-relaxed">
                {JSON.stringify(previewContent.content, null, 2)}
              </pre>
            </div>
            <div className="p-6 border-t border-white/5 flex justify-end gap-4 bg-white/5">
              <button
                onClick={() => copyToClipboard(previewContent.content)}
                className="px-6 py-3 bg-white/5 text-slate-300 rounded-xl hover:bg-white/10 border border-white/10 transition-all font-bold flex items-center gap-2"
              >
                {copied ? <><Check size={18} className="text-emerald-500" /> 已复制</> : <><Copy size={18} /> 复制到剪贴板</>}
              </button>
              <button
                onClick={() => setPreviewContent(null)}
                className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold shadow-lg shadow-blue-500/25"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
