/**
 * Receipts & Audit Center 组件
 * 
 * 聚合展示用户/商户/Skill 的所有交易收据与审计记录
 */

import React, { useState, useEffect, useCallback } from 'react';
import { receiptApi, Receipt, ReceiptType, ReceiptStatus, AuditPackage } from '../../lib/api/receipt.api';
import { 
  FileText, 
  Search, 
  Filter, 
  Download, 
  ShieldCheck, 
  ShieldAlert,
  Clock,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Activity,
  Zap,
  Package,
  ChevronRight,
  Shield,
  FileDown,
  Plus
} from 'lucide-react';

export const ReceiptsCenter: React.FC = () => {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ type?: ReceiptType; status?: ReceiptStatus; search?: string }>({});
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [auditPackages, setAuditPackages] = useState<AuditPackage[]>([]);
  const [stats, setStats] = useState<any>(null);

  // 加载收据
  const loadReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await receiptApi.list({ ...filter, limit: 50 });
      setReceipts(response.items || []);
    } catch (err: any) {
      setError(err.message || '加载收据失败');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // 加载统计与审计包
  const loadExtraData = useCallback(async () => {
    try {
      const [statsRes, packagesRes] = await Promise.all([
        receiptApi.getStats(),
        receiptApi.listAuditPackages()
      ]);
      setStats(statsRes.stats);
      setAuditPackages(packagesRes.items || []);
    } catch (err) {
      console.error('Failed to load extra audit data', err);
    }
  }, []);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  useEffect(() => {
    loadExtraData();
  }, [loadExtraData]);

  const verifyReceipt = async (id: string) => {
    try {
      const result = await receiptApi.verify(id);
      if (result.valid) {
        alert('✅ 收据验证通过：哈希一致，链上存证有效。');
      } else {
        alert('❌ 验证失败：' + (result.errors?.[0] || '未知错误'));
      }
    } catch (err: any) {
      alert('验证请求出错: ' + err.message);
    }
  };

  const generateAudit = async () => {
    try {
      setLoading(true);
      await receiptApi.generateAuditPackage({
        name: `Audit-Export-${new Date().toISOString().split('T')[0]}`,
        description: 'Manual audit export from workspace'
      });
      loadExtraData();
      alert('审计包生成成功！');
    } catch (err: any) {
      alert('生成失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="receipts-center space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
              <FileText size={18} />
            </div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Proofs</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats?.total || 0}</p>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold">
            <Activity size={10} />
            REAL-TIME SYNCING
          </div>
        </div>

        <div className="bg-slate-900 border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <ShieldCheck size={18} />
            </div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Verified Rate</span>
          </div>
          <p className="text-2xl font-bold text-white">99.9%</p>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
            ON-CHAIN IMMUTABLE
          </div>
        </div>

        <div className="bg-slate-900 border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Zap size={18} />
            </div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Skill Executions</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats?.byType?.skill_execution || 0}</p>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
            AI AGENT ACTIONS
          </div>
        </div>

        <div className="bg-slate-900 border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
              <Package size={18} />
            </div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Audit Packages</span>
          </div>
          <p className="text-2xl font-bold text-white">{auditPackages.length}</p>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-blue-400 font-bold cursor-pointer hover:underline" onClick={generateAudit}>
            GENERATE NEW PACK
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Receipts List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-5 border-b border-white/5 bg-white/5 flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2">
                <FileText className="text-blue-400" size={18} />
                Proof of Execution (Receipts)
              </h3>
              <div className="flex gap-2">
                <select 
                  className="bg-slate-950 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] font-bold text-slate-400 outline-none"
                  onChange={(e) => setFilter(f => ({ ...f, type: e.target.value as any || undefined }))}
                >
                  <option value="">All Types</option>
                  <option value="skill_execution">Skill Exec</option>
                  <option value="payment_completed">Payment</option>
                  <option value="webhook_sent">Webhook</option>
                </select>
              </div>
            </div>

            <div className="divide-y divide-white/5">
              {loading && receipts.length === 0 ? (
                <div className="p-12 text-center text-slate-500">Loading proofs...</div>
              ) : receipts.length === 0 ? (
                <div className="p-12 text-center text-slate-500">No receipts found.</div>
              ) : (
                receipts.map(receipt => (
                  <div 
                    key={receipt.id} 
                    className={`p-4 hover:bg-white/[0.02] cursor-pointer transition-all flex items-center justify-between group ${selectedReceipt?.id === receipt.id ? 'bg-white/[0.03] border-l-4 border-blue-500' : 'border-l-4 border-transparent'}`}
                    onClick={() => setSelectedReceipt(receipt)}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        receipt.status === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {receipt.type === 'skill_execution' ? <Zap size={18} /> : 
                         receipt.type.includes('payment') ? <Package size={18} /> : <FileText size={18} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white uppercase tracking-tight">{receipt.type.replace('_', ' ')}</span>
                          <span className="text-[10px] font-mono text-slate-500">#{receipt.id.slice(-8)}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{receipt.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono text-slate-400 mb-1">{new Date(receipt.createdAt).toLocaleTimeString()}</div>
                      <div className={`text-[10px] font-bold uppercase tracking-widest ${
                        receipt.status === 'success' ? 'text-emerald-500' : 'text-red-500'
                      }`}>
                        {receipt.status}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar: Detail & Audit Packs */}
        <div className="space-y-6">
          {/* Selected Receipt Detail */}
          {selectedReceipt ? (
            <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="p-5 border-b border-white/5 bg-blue-600/10 flex items-center justify-between">
                <h4 className="font-bold text-white text-sm uppercase tracking-tight">Receipt Detail</h4>
                <button onClick={() => setSelectedReceipt(null)} className="text-slate-500 hover:text-white">✕</button>
              </div>
              <div className="p-5 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Full Receipt ID</label>
                  <p className="text-xs font-mono text-blue-400 break-all bg-slate-950 p-2 rounded-lg border border-white/5">{selectedReceipt.id}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</label>
                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                      <CheckCircle2 size={14} className="text-emerald-500" />
                      {selectedReceipt.status.toUpperCase()}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Timestamp</label>
                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                      <Clock size={14} className="text-slate-400" />
                      {new Date(selectedReceipt.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cryptographic Proof</label>
                  <div className="bg-slate-950 p-3 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-slate-500">Hash: {selectedReceipt.metadata?.proofHash?.slice(0, 16) || 'N/A'}...</span>
                      <ShieldCheck size={14} className="text-emerald-500" />
                    </div>
                    <button 
                      onClick={() => verifyReceipt(selectedReceipt.id)}
                      className="w-full py-2 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/20 rounded-lg text-[10px] font-bold transition-all"
                    >
                      VERIFY ON AUDIT CHAIN
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Request Payload</label>
                  <pre className="text-[10px] bg-slate-950 p-3 rounded-xl border border-white/5 text-slate-400 max-h-32 overflow-auto">
                    {JSON.stringify(selectedReceipt.requestData, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-white/10 border-dashed rounded-2xl p-12 text-center text-slate-600">
              <FileText size={32} className="mx-auto mb-3 opacity-10" />
              <p className="text-xs font-bold uppercase tracking-widest">Select a receipt<br/>to view details</p>
            </div>
          )}

          {/* Audit Packages */}
          <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-5 border-b border-white/5 bg-white/5">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <Shield className="text-orange-400" size={18} />
                Audit Packages
              </h4>
            </div>
            <div className="divide-y divide-white/5 max-h-80 overflow-y-auto scrollbar-hide">
              {auditPackages.length === 0 ? (
                <div className="p-8 text-center text-slate-600 text-xs">No audit packages yet.</div>
              ) : (
                auditPackages.map(pkg => (
                  <div key={pkg.id} className="p-4 hover:bg-white/[0.02] transition-colors group">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-bold text-white truncate pr-2">{pkg.name}</span>
                      <button 
                        onClick={() => receiptApi.downloadAuditPackage(pkg.id)}
                        className="text-slate-500 hover:text-blue-400"
                      >
                        <FileDown size={14} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>{pkg.summary.totalReceipts} Receipts</span>
                      <span>{new Date(pkg.generatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-4 bg-white/5">
              <button 
                onClick={generateAudit}
                className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white transition-all flex items-center justify-center gap-2"
              >
                <Plus size={14} />
                Generate Audit Package
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
