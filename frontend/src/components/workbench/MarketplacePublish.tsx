import React, { useState, useCallback } from 'react';
import { ShoppingBag, Star, TrendingUp, Users, DollarSign, Loader2, CheckCircle, AlertCircle, Eye, Zap } from 'lucide-react';
import { Skill } from '../../types/skill.types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface PublishFormState {
  pricingType: 'free' | 'per_call' | 'subscription' | 'revenue_share' | 'percentage';
  pricePerCall: number;
  currency: string;
  freeQuota: number;
  commissionRate: number;
  publicInMarketplace: boolean;
  humanAccessible: boolean;
  featured: boolean;
  targetPlatforms: string[];
  ucpEnabled: boolean;
  x402Enabled: boolean;
  // Split plan
  enableSplitPlan: boolean;
  splitRules: Array<{ recipient: string; shareBps: number; role: string }>;
}

const defaultForm: PublishFormState = {
  pricingType: 'free',
  pricePerCall: 0.01,
  currency: 'USD',
  freeQuota: 0,
  commissionRate: 0,
  publicInMarketplace: true,
  humanAccessible: true,
  featured: false,
  targetPlatforms: ['agentrix'],
  ucpEnabled: true,
  x402Enabled: false,
  enableSplitPlan: false,
  splitRules: [],
};

type PublishStatus = 'idle' | 'previewing' | 'publishing' | 'success' | 'error';

export const MarketplacePublish: React.FC<{ selectedSkill?: Skill; onPublished?: () => void }> = ({ selectedSkill, onPublished }) => {
  const [form, setForm] = useState<PublishFormState>(defaultForm);
  const [status, setStatus] = useState<PublishStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [preview, setPreview] = useState<any>(null);

  const updateForm = useCallback((patch: Partial<PublishFormState>) => {
    setForm(prev => ({ ...prev, ...patch }));
  }, []);

  const buildPayload = () => ({
    skillId: selectedSkill?.id,
    name: selectedSkill?.name || '',
    description: selectedSkill?.description || '',
    category: selectedSkill?.category,
    version: selectedSkill?.version,
    pricing: {
      type: form.pricingType,
      pricePerCall: form.pricingType === 'per_call' ? form.pricePerCall : undefined,
      currency: form.currency,
      freeQuota: form.freeQuota || undefined,
      commissionRate: form.pricingType === 'revenue_share' || form.pricingType === 'percentage'
        ? form.commissionRate : undefined,
    },
    splitPlan: form.enableSplitPlan && form.splitRules.length > 0 ? {
      name: `${selectedSkill?.name} Split Plan`,
      productType: 'skill',
      rules: form.splitRules,
    } : undefined,
    marketplace: {
      featured: form.featured,
      humanAccessible: form.humanAccessible,
      targetPlatforms: form.targetPlatforms,
    },
    ucpEnabled: form.ucpEnabled,
    x402Enabled: form.x402Enabled,
  });

  const handlePreview = async () => {
    if (!selectedSkill) return;
    setStatus('previewing');
    setErrorMsg('');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`${API_BASE}/commerce/publish/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Preview failed');
      setPreview(data);
      setStatus('idle');
    } catch (err: any) {
      setErrorMsg(err.message || 'Preview failed');
      setStatus('error');
    }
  };

  const handlePublish = async () => {
    if (!selectedSkill) return;
    setStatus('publishing');
    setErrorMsg('');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`${API_BASE}/commerce/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Publish failed');
      setStatus('success');
      onPublished?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Publish failed');
      setStatus('error');
    }
  };

  const handleUnpublish = async () => {
    if (!selectedSkill) return;
    setStatus('publishing');
    setErrorMsg('');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`${API_BASE}/commerce/unpublish/${selectedSkill.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Unpublish failed');
      setStatus('idle');
      onPublished?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unpublish failed');
      setStatus('error');
    }
  };

  const addSplitRule = () => {
    updateForm({
      splitRules: [...form.splitRules, { recipient: '', shareBps: 5000, role: 'developer' }],
    });
  };

  const removeSplitRule = (idx: number) => {
    updateForm({
      splitRules: form.splitRules.filter((_, i) => i !== idx),
    });
  };

  const updateSplitRule = (idx: number, patch: Partial<{ recipient: string; shareBps: number; role: string }>) => {
    const rules = [...form.splitRules];
    rules[idx] = { ...rules[idx], ...patch };
    updateForm({ splitRules: rules });
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-white/10 overflow-hidden">
      <div className="p-6 border-b border-white/5">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <ShoppingBag className="text-orange-400" size={24} />
          Marketplace Publish
        </h2>
        <p className="text-xs text-slate-400">List your skills and set monetization policies</p>
      </div>

      <div className="p-6">
        {!selectedSkill ? (
          <div className="p-20 text-center border-2 border-dashed border-white/5 rounded-2xl">
            <ShoppingBag size={48} className="mx-auto mb-4 opacity-10" />
            <p className="text-slate-500">Select a skill from the registry to publish</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Skill Info Header */}
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white">
                  {selectedSkill.name[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-white">{selectedSkill.name}</h3>
                  <p className="text-xs text-slate-500">v{selectedSkill.version} • {selectedSkill.category}</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                selectedSkill.status === 'published' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
              }`}>
                {selectedSkill.status}
              </span>
            </div>

            {/* Monetization Model */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Monetization Model</label>
                <div className="space-y-2">
                  {(['free', 'per_call', 'revenue_share'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => updateForm({ pricingType: type })}
                      className={`w-full p-3 rounded-lg flex items-center justify-between transition-all ${
                        form.pricingType === type
                          ? 'bg-slate-950 border border-blue-500/30'
                          : 'bg-slate-950 border border-white/5 opacity-60 hover:opacity-80'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {type === 'free' ? <Zap size={16} className="text-green-400" /> :
                         type === 'per_call' ? <DollarSign size={16} className="text-blue-400" /> :
                         <Users size={16} className="text-purple-400" />}
                        <span className="text-sm text-white">
                          {type === 'free' ? 'Free' : type === 'per_call' ? 'Pay per Execution' : 'Revenue Share'}
                        </span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        form.pricingType === type ? 'border-blue-500 bg-blue-500' : 'border-slate-600'
                      }`} />
                    </button>
                  ))}
                </div>

                {/* Price input for per_call */}
                {form.pricingType === 'per_call' && (
                  <div className="flex items-center gap-2 p-3 bg-slate-950 border border-white/10 rounded-lg">
                    <DollarSign size={14} className="text-blue-400" />
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={form.pricePerCall}
                      onChange={(e) => updateForm({ pricePerCall: parseFloat(e.target.value) || 0 })}
                      className="flex-1 bg-transparent text-white text-sm outline-none"
                      placeholder="Price per call"
                    />
                    <select
                      value={form.currency}
                      onChange={(e) => updateForm({ currency: e.target.value })}
                      className="bg-transparent text-xs text-slate-400 outline-none"
                    >
                      <option value="USD">USD</option>
                      <option value="USDT">USDT</option>
                      <option value="USDC">USDC</option>
                    </select>
                  </div>
                )}

                {/* Commission rate for revenue_share */}
                {form.pricingType === 'revenue_share' && (
                  <div className="flex items-center gap-2 p-3 bg-slate-950 border border-white/10 rounded-lg">
                    <span className="text-xs text-slate-400">Commission Rate</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={form.commissionRate}
                      onChange={(e) => updateForm({ commissionRate: parseFloat(e.target.value) || 0 })}
                      className="w-16 bg-transparent text-white text-sm text-right outline-none"
                    />
                    <span className="text-xs text-slate-500">%</span>
                  </div>
                )}

                {/* Free quota */}
                <div className="flex items-center gap-2 p-3 bg-slate-950 border border-white/5 rounded-lg">
                  <span className="text-xs text-slate-400">Free Quota</span>
                  <input
                    type="number"
                    min="0"
                    value={form.freeQuota}
                    onChange={(e) => updateForm({ freeQuota: parseInt(e.target.value) || 0 })}
                    className="w-16 bg-transparent text-white text-sm text-right outline-none"
                    placeholder="0"
                  />
                  <span className="text-xs text-slate-500">calls/month</span>
                </div>
              </div>

              {/* Visibility & Protocols */}
              <div className="space-y-4">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Visibility & Access</label>
                <div className="p-4 bg-slate-950 border border-white/5 rounded-lg space-y-4">
                  {([
                    { key: 'publicInMarketplace', label: 'Public in Marketplace' },
                    { key: 'humanAccessible', label: 'Human Accessible' },
                    { key: 'ucpEnabled', label: 'UCP Protocol' },
                    { key: 'x402Enabled', label: 'X402 Protocol' },
                  ] as const).map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">{label}</span>
                      <button
                        onClick={() => updateForm({ [key]: !form[key] } as any)}
                        className={`w-10 h-5 rounded-full relative transition-colors ${
                          form[key] ? 'bg-blue-600' : 'bg-slate-700'
                        }`}
                      >
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${
                          form[key] ? 'right-1' : 'left-1'
                        }`} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Target Platforms */}
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Target Platforms</label>
                <div className="flex flex-wrap gap-2">
                  {['agentrix', 'claude', 'openai', 'gemini'].map((platform) => (
                    <button
                      key={platform}
                      onClick={() => {
                        const platforms = form.targetPlatforms.includes(platform)
                          ? form.targetPlatforms.filter(p => p !== platform)
                          : [...form.targetPlatforms, platform];
                        updateForm({ targetPlatforms: platforms });
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        form.targetPlatforms.includes(platform)
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                          : 'bg-slate-800 text-slate-500 border border-white/5 hover:border-white/10'
                      }`}
                    >
                      {platform}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Split Plan Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Revenue Split Plan</label>
                <button
                  onClick={() => updateForm({ enableSplitPlan: !form.enableSplitPlan })}
                  className={`w-10 h-5 rounded-full relative transition-colors ${
                    form.enableSplitPlan ? 'bg-purple-600' : 'bg-slate-700'
                  }`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${
                    form.enableSplitPlan ? 'right-1' : 'left-1'
                  }`} />
                </button>
              </div>

              {form.enableSplitPlan && (
                <div className="p-4 bg-slate-950 border border-white/5 rounded-lg space-y-3">
                  {form.splitRules.map((rule, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={rule.recipient}
                        onChange={(e) => updateSplitRule(idx, { recipient: e.target.value })}
                        placeholder="Wallet / User ID"
                        className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none"
                      />
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        value={rule.shareBps}
                        onChange={(e) => updateSplitRule(idx, { shareBps: parseInt(e.target.value) || 0 })}
                        className="w-20 px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white text-right outline-none"
                      />
                      <span className="text-[10px] text-slate-500">bps</span>
                      <select
                        value={rule.role}
                        onChange={(e) => updateSplitRule(idx, { role: e.target.value })}
                        className="px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none"
                      >
                        <option value="developer">Developer</option>
                        <option value="platform">Platform</option>
                        <option value="referrer">Referrer</option>
                        <option value="operator">Operator</option>
                      </select>
                      <button
                        onClick={() => removeSplitRule(idx)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >✕</button>
                    </div>
                  ))}
                  <button
                    onClick={addSplitRule}
                    className="w-full py-2 border border-dashed border-white/10 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:border-white/20 transition-all"
                  >
                    + Add Split Rule
                  </button>
                </div>
              )}
            </div>

            {/* Preview Panel */}
            {preview && (
              <div className="p-4 bg-blue-900/20 border border-blue-500/20 rounded-lg space-y-2">
                <div className="text-xs font-bold text-blue-400 uppercase tracking-widest">Publish Preview</div>
                <div className="text-sm text-slate-300">
                  <div>Protocols: {preview.protocols?.join(', ')}</div>
                  <div>Marketplace: {preview.marketplaceVisibility?.unifiedMarketplace ? 'Unified' : 'None'}</div>
                  {preview.feeBreakdown && (
                    <div>Platform Fee: {preview.feeBreakdown.platformFee}</div>
                  )}
                </div>
              </div>
            )}

            {/* Error message */}
            {status === 'error' && errorMsg && (
              <div className="p-3 bg-red-900/20 border border-red-500/20 rounded-lg flex items-center gap-2">
                <AlertCircle size={16} className="text-red-400" />
                <span className="text-sm text-red-300">{errorMsg}</span>
              </div>
            )}

            {/* Success message */}
            {status === 'success' && (
              <div className="p-3 bg-emerald-900/20 border border-emerald-500/20 rounded-lg flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400" />
                <span className="text-sm text-emerald-300">Successfully published to marketplace!</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handlePreview}
                disabled={status === 'previewing' || status === 'publishing'}
                className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-medium hover:bg-slate-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {status === 'previewing' ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                Preview
              </button>

              {selectedSkill.status === 'published' ? (
                <button
                  onClick={handleUnpublish}
                  disabled={status === 'publishing'}
                  className="flex-1 py-3 bg-red-600/80 text-white rounded-xl font-medium hover:bg-red-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {status === 'publishing' ? <Loader2 size={16} className="animate-spin" /> : null}
                  Unpublish
                </button>
              ) : (
                <button
                  onClick={handlePublish}
                  disabled={status === 'publishing'}
                  className="flex-1 py-3 bg-orange-600 text-white rounded-xl font-bold hover:bg-orange-700 transition-all shadow-lg shadow-orange-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {status === 'publishing' ? <Loader2 size={16} className="animate-spin" /> : <ShoppingBag size={16} />}
                  Publish to Marketplace
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
