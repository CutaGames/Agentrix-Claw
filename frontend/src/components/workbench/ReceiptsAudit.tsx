import React from 'react';
import { FileText, Search, ShieldCheck, Download, ExternalLink } from 'lucide-react';

export const ReceiptsAudit: React.FC = () => {
  const receipts = [
    { id: 'RCPT-8273', action: 'Skill Published', actor: 'Dev#01', time: '2 mins ago', hash: '0x82...f2e' },
    { id: 'RCPT-8274', action: 'Order Created', actor: 'Agent_Alpha', time: '15 mins ago', hash: '0x1a...3d4' },
    { id: 'RCPT-8275', action: 'Payment Settled', actor: 'Stripe_Hook', time: '1 hour ago', hash: '0x9c...a1b' },
  ];

  return (
    <div className="bg-slate-900 rounded-xl border border-white/10 overflow-hidden">
      <div className="p-6 border-b border-white/5 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="text-emerald-400" size={24} />
            Receipts & Audit
          </h2>
          <p className="text-xs text-slate-400">Verifiable activity log and on-chain proofs</p>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input 
            placeholder="Search Receipt ID..." 
            className="pl-10 pr-4 py-2 bg-slate-950 border border-white/10 rounded-lg text-sm text-white focus:border-blue-500 outline-none w-64"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white/5 border-b border-white/5">
              <th className="p-4">Receipt ID</th>
              <th className="p-4">Action</th>
              <th className="p-4">Actor</th>
              <th className="p-4">Timestamp</th>
              <th className="p-4 text-right">Verification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {receipts.map((r, i) => (
              <tr key={i} className="hover:bg-white/[0.02] transition-all">
                <td className="p-4 font-mono text-xs text-blue-400">{r.id}</td>
                <td className="p-4 text-sm text-white font-medium">{r.action}</td>
                <td className="p-4 text-xs text-slate-400">{r.actor}</td>
                <td className="p-4 text-xs text-slate-500">{r.time}</td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button className="p-2 hover:bg-white/5 rounded text-slate-500 hover:text-white transition-all">
                      <Download size={14} />
                    </button>
                    <button className="p-2 hover:bg-white/5 rounded text-slate-500 hover:text-white transition-all">
                      <ExternalLink size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
