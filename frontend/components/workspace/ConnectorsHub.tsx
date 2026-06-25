/**
 * Connectors Hub 组件
 * 
 * 管理与各大 AI 生态（OpenAI, Claude, Gemini）的连接状态与配置
 */

import React, { useState } from 'react';
import { 
  Link2, 
  ExternalLink, 
  Settings, 
  CheckCircle2, 
  Circle, 
  Zap, 
  Cpu, 
  ShieldCheck,
  RefreshCw,
  Info,
  ChevronRight,
  Plus
} from 'lucide-react';

interface Connector {
  id: string;
  name: string;
  type: 'openai' | 'claude' | 'gemini' | 'custom';
  status: 'connected' | 'disconnected' | 'error';
  lastSync?: string;
  config?: any;
}

export const ConnectorsHub: React.FC = () => {
  const [connectors, setConnectors] = useState<Connector[]>([
    { id: '1', name: 'OpenAI GPTs', type: 'openai', status: 'connected', lastSync: '10 mins ago' },
    { id: '2', name: 'Claude MCP Server', type: 'claude', status: 'connected', lastSync: '2 hours ago' },
    { id: '3', name: 'Google Gemini', type: 'gemini', status: 'disconnected' },
  ]);

  const [loading, setLoading] = useState(false);

  const refreshStatus = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1500);
  };

  return (
    <div className="connectors-hub space-y-6">
      {/* Header Info */}
      <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-white/10 rounded-2xl p-6">
        <div className="flex items-start justify-between">
          <div className="max-w-xl">
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-3">
              <Link2 className="text-blue-400" />
              Connectors Hub
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              在这里管理您的 AX Skill 如何与外部 AI 模型交互。我们支持 OpenAI Actions (OpenAPI 3.0) 协议与 Anthropic Claude MCP (Model Context Protocol) 协议，实现真正的跨生态能力共享。
            </p>
          </div>
          <button 
            onClick={refreshStatus}
            className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {connectors.map(conn => (
          <div key={conn.id} className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-xl hover:border-blue-500/50 transition-all group">
            <div className="flex items-start justify-between mb-6">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                conn.type === 'openai' ? 'bg-emerald-500/10 text-emerald-400' :
                conn.type === 'claude' ? 'bg-orange-500/10 text-orange-400' :
                'bg-blue-500/10 text-blue-400'
              }`}>
                {conn.type === 'openai' ? <Cpu size={24} /> : 
                 conn.type === 'claude' ? <Zap size={24} /> : <Link2 size={24} />}
              </div>
              <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                conn.status === 'connected' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
              }`}>
                {conn.status}
              </div>
            </div>

            <h3 className="font-bold text-lg text-white mb-1">{conn.name}</h3>
            <p className="text-xs text-slate-500 mb-6">
              {conn.type === 'openai' ? 'OpenAPI 3.0 Standard Integration' : 
               conn.type === 'claude' ? 'Model Context Protocol Server' : 'Custom Webhook Connector'}
            </p>

            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Last Sync</span>
                <span className="text-slate-300 font-mono">{conn.lastSync || 'Never'}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Active Skills</span>
                <span className="text-slate-300 font-mono">12</span>
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <button className="flex-1 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-slate-300 hover:bg-white/10 hover:text-white transition-all">
                Configure
              </button>
              <button className="w-10 h-10 flex items-center justify-center bg-blue-600/10 text-blue-400 border border-blue-500/20 rounded-xl hover:bg-blue-600 hover:text-white transition-all">
                <ExternalLink size={16} />
              </button>
            </div>
          </div>
        ))}

        {/* Add New Connector */}
        <div className="bg-slate-900 border border-white/10 border-dashed rounded-2xl p-6 shadow-xl flex flex-col items-center justify-center text-center group cursor-pointer hover:bg-white/[0.02] hover:border-blue-500/50 transition-all">
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-slate-600 mb-4 group-hover:bg-blue-500/10 group-hover:text-blue-400 transition-all">
            <Plus size={24} />
          </div>
          <h3 className="font-bold text-white mb-1">Add New Connector</h3>
          <p className="text-xs text-slate-500 px-4">Connect to Gemini, Grok, or custom AI endpoints</p>
        </div>
      </div>

      {/* Integration Guide Snippet */}
      <div className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-white/5 bg-white/5 flex items-center justify-between">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Info className="text-blue-400" size={18} />
            Quick Setup Guide
          </h3>
          <button className="text-xs font-bold text-blue-400 hover:underline">View Documentation</button>
        </div>
        <div className="p-6">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">For Claude (MCP)</h4>
              <div className="bg-slate-950 rounded-xl p-4 font-mono text-[11px] text-blue-300 border border-white/5 leading-relaxed">
                <p className="text-slate-500 mb-2"># Add to claude_desktop_config.json</p>
                <p>{"{"}</p>
                <p className="pl-4">{'"mcpServers": {'}</p>
                <p className="pl-8">{'"agentrix": {'}</p>
                <p className="pl-12">{'"command": "npx",'}</p>
                <p className="pl-12">{'"args": ["@agentrix/mcp-server", "--key", "YOUR_API_KEY"]'}</p>
                <p className="pl-8">{'}'}</p>
                <p className="pl-4">{'}'}</p>
                <p>{'}'}</p>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">For OpenAI (Actions)</h4>
              <div className="bg-slate-950 rounded-xl p-4 font-mono text-[11px] text-blue-300 border border-white/5 leading-relaxed">
                <p className="text-slate-500 mb-2"># Import OpenAPI Schema URL</p>
                <p className="text-white">GET https://api.agentrix.ai/v1/skills/export/openapi?key=YOUR_API_KEY</p>
                <div className="mt-4 pt-4 border-t border-white/5">
                  <p className="text-slate-500 mb-2"># Authentication</p>
                  <p>Type: API Key</p>
                  <p>Auth Type: Bearer</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
