import React from 'react';
import { ShieldCheck, ArrowLeft, Cpu, User, Calendar, Hash, FileText, CheckCircle } from 'lucide-react';

interface ReceiptDetailProps {
  receiptId: string;
  onBack: () => void;
}

export const ReceiptDetail: React.FC<ReceiptDetailProps> = ({ receiptId, onBack }) => {
  // Mock data for the audit explanation
  const detail = {
    id: receiptId,
    action: 'Purchase Execution',
    agent: 'Shopping Assistant (v2.1)',
    actor: 'User#8273',
    time: '2025-12-24 10:30:45',
    hash: '0x8273...f2e1',
    reasoning: [
      "Detected item 'Agentrix Hoodie' in cart.",
      "Validated price (49.99 USDT) within mandate limit (100 USDT).",
      "Executed payment via session RCPT_SES_827.",
      "Fulfillment triggered via Webhook."
    ],
    verificationStatus: 'verified'
  };

  return (
    <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-300">
      <div className="p-6 border-b border-white/5 bg-white/5 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-all text-sm font-bold">
          <ArrowLeft size={16} /> Back to Audit
        </button>
        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
          <ShieldCheck size={14} className="text-emerald-500" />
          <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Verified on Audit Chain</span>
        </div>
      </div>

      <div className="p-8 grid grid-cols-3 gap-8">
        <div className="col-span-1 space-y-6">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Receipt ID</label>
            <p className="text-blue-400 font-mono text-sm">{detail.id}</p>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">On-chain Hash</label>
            <p className="text-slate-300 font-mono text-[10px] break-all">{detail.hash}</p>
          </div>
          <div className="space-y-4 pt-4 border-t border-white/5">
            <DetailItem icon={<Cpu size={14} />} label="Agent" value={detail.agent} />
            <DetailItem icon={<User size={14} />} label="Actor" value={detail.actor} />
            <DetailItem icon={<Calendar size={14} />} label="Time" value={detail.time} />
          </div>
        </div>

        <div className="col-span-2 space-y-6">
          <div className="p-6 bg-slate-950 border border-white/5 rounded-2xl">
            <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <FileText size={16} className="text-blue-400" />
              Human-Readable Audit Explanation
            </h4>
            <div className="space-y-3">
              {detail.reasoning.map((step, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className="text-slate-600 font-mono">{i + 1}.</span>
                  <p className="text-slate-300">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex items-center gap-3">
            <CheckCircle size={20} className="text-emerald-500" />
            <p className="text-xs text-emerald-400/80">
              This action was performed with valid authorization. The cryptographic signature matches the User&apos;s Mandate #827.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

function DetailItem({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-slate-600">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] text-slate-500 uppercase tracking-tighter">{label}</p>
        <p className="text-xs text-white truncate">{value}</p>
      </div>
    </div>
  );
}
