import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Code, Globe, Shield, Zap, RefreshCw, Users, DollarSign, ToggleLeft, ToggleRight } from 'lucide-react';
import { skillApi, CreateSkillDto, SkillCategory, CommercePublishDto, SplitRuleDto } from '../../../lib/api/skill.api';

interface SkillPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPublish?: (skillData: any) => void;
  product?: any;
}

const SkillPublishModal: React.FC<SkillPublishModalProps> = ({ isOpen, onClose, onPublish, product }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateSkillDto>({
    name: '',
    description: '',
    category: 'commerce' as SkillCategory,
    version: '1.0.0',
    executor: {
      type: 'http',
      endpoint: '',
      method: 'POST',
    },
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    pricing: {
      type: 'free' as any,
      pricePerCall: 0,
      currency: 'USD',
    },
    tags: [],
  });

  // Commerce config state
  const [enableSplitPlan, setEnableSplitPlan] = useState(false);
  const [splitRules, setSplitRules] = useState<SplitRuleDto[]>([
    { recipient: '', shareBps: 7000, role: 'merchant' },
    { recipient: '', shareBps: 3000, role: 'agent' },
  ]);
  const [ucpEnabled, setUcpEnabled] = useState(true);
  const [x402Enabled, setX402Enabled] = useState(true);
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>(['agentrix', 'claude', 'openai']);
  const [humanAccessible, setHumanAccessible] = useState(true);

  useEffect(() => {
    if (product) {
      setFormData(prev => ({
        ...prev,
        name: `buy_${product.name.toLowerCase().replace(/\s+/g, '_')}`,
        description: `Purchase ${product.name}: ${product.description}`,
        category: 'commerce' as SkillCategory,
        executor: {
          type: 'http',
          endpoint: `${window.location.origin}/api/orders/create-from-skill`,
          method: 'POST',
        },
        inputSchema: {
          type: 'object',
          properties: {
            productId: { type: 'string', description: 'The ID of the product to buy', default: product.id },
            quantity: { type: 'integer', description: 'Number of items to purchase', default: 1 },
            shippingAddress: { type: 'string', description: 'Delivery address for physical goods' }
          },
          required: ['productId', 'quantity']
        }
      }));
    }
  }, [product]);

  const [newProp, setNewProp] = useState({ name: '', type: 'string', description: '', required: false });

  if (!isOpen) return null;

  const handleAddProperty = () => {
    if (!newProp.name) return;
    
    const updatedProperties = {
      ...formData.inputSchema.properties,
      [newProp.name]: {
        type: newProp.type,
        description: newProp.description,
      }
    };

    const updatedRequired = newProp.required 
      ? [...formData.inputSchema.required, newProp.name]
      : formData.inputSchema.required;

    setFormData({
      ...formData,
      inputSchema: {
        ...formData.inputSchema,
        properties: updatedProperties,
        required: updatedRequired,
      }
    });

    setNewProp({ name: '', type: 'string', description: '', required: false });
  };

  const handleRemoveProperty = (name: string) => {
    const updatedProperties = { ...formData.inputSchema.properties };
    delete updatedProperties[name];
    
    const remainingRequired = formData.inputSchema.required.filter(r => r !== name);

    setFormData({
      ...formData,
      inputSchema: {
        ...formData.inputSchema,
        properties: updatedProperties,
        required: remainingRequired,
      }
    });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      // Use Commerce Publish API for one-stop publishing
      const publishDto: CommercePublishDto = {
        name: formData.name,
        displayName: formData.displayName || formData.name,
        description: formData.description,
        category: formData.category,
        version: formData.version,
        tags: formData.tags,
        executor: formData.executor,
        inputSchema: formData.inputSchema,
        pricing: {
          type: formData.pricing?.type || 'free',
          pricePerCall: formData.pricing?.pricePerCall,
          currency: formData.pricing?.currency || 'USD',
        },
        splitPlan: enableSplitPlan ? {
          name: `${formData.name} Split Plan`,
          productType: 'skill',
          rules: splitRules.filter(r => r.recipient),
        } : undefined,
        marketplace: {
          humanAccessible,
          targetPlatforms,
        },
        ucpEnabled,
        x402Enabled: x402Enabled && formData.pricing?.type !== 'free',
      };

      const res = await skillApi.commercePublish(publishDto);
      if (res.success) {
        if (onPublish) onPublish(res);
        onClose();
      } else {
        setError('Failed to publish commerce skill');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while publishing');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[#1a1b23] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Publish New Skill</h2>
            <p className="text-sm text-gray-400">Share your capability with the Agentrix ecosystem</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Steps Indicator */}
        <div className="px-6 py-4 bg-white/5 flex items-center gap-3 overflow-x-auto">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2 shrink-0">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === s ? 'bg-blue-500 text-white' : 
                step > s ? 'bg-green-500 text-white' : 'bg-white/10 text-gray-400'
              }`}>
                {step > s ? '\u2713' : s}
              </div>
              <span className={`text-sm ${step === s ? 'text-white font-medium' : 'text-gray-500'}`}>
                {s === 1 ? 'Basic Info' : s === 2 ? 'Schema' : s === 3 ? 'Pricing' : 'Commerce'}
              </span>
              {s < 4 && <div className="w-6 h-px bg-white/10" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs flex items-center gap-2">
              <Zap className="w-4 h-4" />
              {error}
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Skill Name</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="e.g. Token Swap, Weather Check"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
                <textarea 
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="What does this skill do?"
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value as SkillCategory})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="payment">Payment</option>
                    <option value="commerce">Commerce</option>
                    <option value="data">Data</option>
                    <option value="utility">Utility</option>
                    <option value="integration">Integration</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Version</label>
                  <input 
                    type="text" 
                    value={formData.version}
                    onChange={(e) => setFormData({...formData, version: e.target.value})}
                    placeholder="1.0.0"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">Execution Endpoint (HTTP POST)</label>
                <div className="flex gap-2">
                  <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-gray-400 text-sm flex items-center">POST</div>
                  <input 
                    type="text" 
                    value={formData.executor.endpoint}
                    onChange={(e) => setFormData({...formData, executor: {...formData.executor, endpoint: e.target.value}})}
                    placeholder="https://api.your-service.com/v1/skill"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">Input Parameters (JSON Schema)</label>
                <div className="space-y-3 mb-4">
                  {Object.entries(formData.inputSchema.properties).map(([name, prop]: [string, any]) => (
                    <div key={name} className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/5">
                      <div>
                        <span className="text-blue-400 font-mono text-sm">{name}</span>
                        <span className="text-gray-500 text-xs ml-2">({prop.type})</span>
                        <p className="text-gray-400 text-xs mt-1">{prop.description}</p>
                      </div>
                      <button onClick={() => handleRemoveProperty(name)} className="text-red-400 hover:text-red-300">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="bg-white/5 p-4 rounded-xl border border-dashed border-white/20">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <input 
                      type="text" 
                      placeholder="Param Name"
                      value={newProp.name}
                      onChange={(e) => setNewProp({...newProp, name: e.target.value})}
                      className="bg-[#1a1b23] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
                    />
                    <select 
                      value={newProp.type}
                      onChange={(e) => setNewProp({...newProp, type: e.target.value})}
                      className="bg-[#1a1b23] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
                    >
                      <option value="string">String</option>
                      <option value="number">Number</option>
                      <option value="boolean">Boolean</option>
                      <option value="integer">Integer</option>
                    </select>
                  </div>
                  <input 
                    type="text" 
                    placeholder="Description"
                    value={newProp.description}
                    onChange={(e) => setNewProp({...newProp, description: e.target.value})}
                    className="w-full bg-[#1a1b23] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white mb-3"
                  />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-gray-400">
                      <input 
                        type="checkbox" 
                        checked={newProp.required}
                        onChange={(e) => setNewProp({...newProp, required: e.target.checked})}
                        className="rounded border-white/10 bg-white/5"
                      />
                      Required
                    </label>
                    <button 
                      onClick={handleAddProperty}
                      className="flex items-center gap-1 text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add Parameter
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { id: 'free', label: 'Free', icon: Zap, desc: 'No cost to use' },
                  { id: 'per_call', label: 'Pay per Call', icon: Code, desc: 'Charge per usage' },
                  { id: 'subscription', label: 'Subscription', icon: Shield, desc: 'Monthly access' },
                ].map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => setFormData({...formData, pricing: {...formData.pricing, type: plan.id as any}})}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      formData.pricing.type === plan.id 
                        ? 'bg-blue-500/10 border-blue-500' 
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <plan.icon className={`w-5 h-5 mb-2 ${formData.pricing.type === plan.id ? 'text-blue-400' : 'text-gray-400'}`} />
                    <div className="text-sm font-bold text-white">{plan.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{plan.desc}</div>
                  </button>
                ))}
              </div>

              {formData.pricing.type !== 'free' && (
                <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    {formData.pricing.type === 'per_call' ? 'Price per Call' : 'Monthly Price'}
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                      <input 
                        type="number" 
                        value={formData.pricing.pricePerCall}
                        onChange={(e) => setFormData({...formData, pricing: {...formData.pricing, pricePerCall: parseFloat(e.target.value)}})}
                        className="w-full bg-[#1a1b23] border border-white/10 rounded-lg pl-8 pr-4 py-2 text-white focus:outline-none focus:border-blue-500"
                        placeholder="0.00"
                      />
                    </div>
                    <select 
                      value={formData.pricing.currency}
                      onChange={(e) => setFormData({...formData, pricing: {...formData.pricing, currency: e.target.value}})}
                      className="bg-[#1a1b23] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="USD">USD</option>
                      <option value="USDC">USDC</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                <div className="flex gap-3">
                  <Globe className="w-5 h-5 text-blue-400 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-blue-400">Global Availability</div>
                    <p className="text-xs text-gray-400 mt-1">
                      Once published, your skill will be available to all Agentrix users and AI agents. 
                      You can manage or deprecate it anytime from your Developer Dashboard.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              {/* Split Plan Config */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-400 flex items-center gap-2">
                    <Users className="w-4 h-4" /> Revenue Split Plan
                  </label>
                  <button
                    onClick={() => setEnableSplitPlan(!enableSplitPlan)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {enableSplitPlan ? <ToggleRight className="w-6 h-6 text-green-400" /> : <ToggleLeft className="w-6 h-6" />}
                  </button>
                </div>
                {enableSplitPlan && (
                  <div className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-3">
                    <p className="text-xs text-gray-500">Define how revenue is split (total must = 10000 bps = 100%)</p>
                    {splitRules.map((rule, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <input
                          type="text"
                          placeholder="Wallet or User ID"
                          value={rule.recipient}
                          onChange={(e) => {
                            const updated = [...splitRules];
                            updated[idx] = { ...updated[idx], recipient: e.target.value };
                            setSplitRules(updated);
                          }}
                          className="col-span-5 bg-[#1a1b23] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
                        />
                        <input
                          type="number"
                          placeholder="BPS"
                          value={rule.shareBps}
                          onChange={(e) => {
                            const updated = [...splitRules];
                            updated[idx] = { ...updated[idx], shareBps: parseInt(e.target.value) || 0 };
                            setSplitRules(updated);
                          }}
                          className="col-span-3 bg-[#1a1b23] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
                        />
                        <select
                          value={rule.role}
                          onChange={(e) => {
                            const updated = [...splitRules];
                            updated[idx] = { ...updated[idx], role: e.target.value as any };
                            setSplitRules(updated);
                          }}
                          className="col-span-3 bg-[#1a1b23] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
                        >
                          <option value="merchant">Merchant</option>
                          <option value="agent">Agent</option>
                          <option value="referrer">Referrer</option>
                          <option value="platform">Platform</option>
                          <option value="custom">Custom</option>
                        </select>
                        <button
                          onClick={() => setSplitRules(splitRules.filter((_, i) => i !== idx))}
                          className="col-span-1 text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setSplitRules([...splitRules, { recipient: '', shareBps: 0, role: 'custom' }])}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    >
                      <Plus className="w-3 h-3" /> Add Recipient
                    </button>
                    <div className="text-xs text-gray-500">
                      Total: {splitRules.reduce((s, r) => s + r.shareBps, 0)} / 10000 bps
                      ({(splitRules.reduce((s, r) => s + r.shareBps, 0) / 100).toFixed(1)}%)
                    </div>
                  </div>
                )}
              </div>

              {/* Protocol Toggles */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">Protocol Support</label>
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/10">
                    <div>
                      <div className="text-sm text-white font-medium">UCP (Universal Commerce Protocol)</div>
                      <div className="text-xs text-gray-500">Enable checkout sessions for AI agents</div>
                    </div>
                    <button onClick={() => setUcpEnabled(!ucpEnabled)} className="transition-colors">
                      {ucpEnabled ? <ToggleRight className="w-6 h-6 text-green-400" /> : <ToggleLeft className="w-6 h-6 text-gray-500" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/10">
                    <div>
                      <div className="text-sm text-white font-medium">X402 Micropayments</div>
                      <div className="text-xs text-gray-500">Enable pay-per-call via HTTP 402</div>
                    </div>
                    <button onClick={() => setX402Enabled(!x402Enabled)} className="transition-colors">
                      {x402Enabled ? <ToggleRight className="w-6 h-6 text-green-400" /> : <ToggleLeft className="w-6 h-6 text-gray-500" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Target Platforms */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">Target AI Platforms</label>
                <div className="flex flex-wrap gap-2">
                  {['agentrix', 'claude', 'openai', 'gemini', 'windsurf', 'cursor'].map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setTargetPlatforms(prev =>
                          prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
                        );
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        targetPlatforms.includes(p)
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                          : 'bg-white/5 text-gray-500 border border-white/10 hover:border-white/20'
                      }`}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Human Accessible Toggle */}
              <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/10">
                <div>
                  <div className="text-sm text-white font-medium">Human Accessible</div>
                  <div className="text-xs text-gray-500">Show in marketplace for human users (not just agents)</div>
                </div>
                <button onClick={() => setHumanAccessible(!humanAccessible)} className="transition-colors">
                  {humanAccessible ? <ToggleRight className="w-6 h-6 text-green-400" /> : <ToggleLeft className="w-6 h-6 text-gray-500" />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 flex items-center justify-between bg-[#1a1b23]">
          <button 
            onClick={() => step > 1 && setStep(step - 1)}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
              step === 1 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:bg-white/5'
            }`}
            disabled={step === 1}
          >
            Back
          </button>
          
          {step < 4 ? (
            <button 
              onClick={() => setStep(step + 1)}
              className="px-8 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-blue-500/20"
            >
              Continue
            </button>
          ) : (
            <button 
              onClick={handleSubmit}
              disabled={loading}
              className="px-8 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-green-500/20 flex items-center gap-2"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              Publish to Marketplace
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SkillPublishModal;
