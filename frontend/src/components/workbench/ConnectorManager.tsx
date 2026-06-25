import React from 'react';
import { Cloud, Link2, Shield } from 'lucide-react';


export const ConnectorManager: React.FC = () => {
  const connectors = [
    { name: 'OpenAI (GPT-4o)', status: 'connected', type: 'LLM' },
    { name: 'Claude (Anthropic)', status: 'connected', type: 'LLM' },
    { name: 'Gemini (Google)', status: 'pending', type: 'LLM' },
    { name: 'Shopify Store', status: 'connected', type: 'Commerce' },
    { name: 'Stripe Account', status: 'connected', type: 'Payment' },
  ];

  return (
    <div className="bg-slate-900 rounded-xl border border-white/10 overflow-hidden">
      <div className="p-6 border-b border-white/5 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Link2 className="text-blue-400" size={24} />
            Connector Manager
          </h2>
          <p className="text-xs text-slate-400">Manage external AI and SaaS integrations</p>
        </div>
      </div>

      <div className="divide-y divide-white/5">
        {connectors.map((c, i) => (
          <div key={i} className="p-4 flex items-center justify-between hover:bg-white/5 transition-all">
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                c.status === 'connected' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
              }`}>
                <Cloud size={20} />
              </div>
              <div>
                <h4 className="font-bold text-white text-sm">{c.name}</h4>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{c.type}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest ${
                c.status === 'connected' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
              }`}>
                {c.status}
              </span>
              <button className="text-slate-500 hover:text-white transition-colors">
                <Shield size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
