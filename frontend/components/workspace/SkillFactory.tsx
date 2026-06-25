import React, { useState } from 'react';
import { 
  Plus, 
  Save, 
  X, 
  Globe, 
  Cpu, 
  Code, 
  Settings, 
  ChevronRight, 
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  Info,
  PlusCircle,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { skillApi, CreateSkillDto, SkillCategory } from '../../lib/api/skill.api';

const SkillFactory: React.FC<{ onComplete?: () => void }> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState<CreateSkillDto>({
    name: '',
    description: '',
    category: 'utility' as SkillCategory,
    version: '1.0.0',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    executor: {
      type: 'http',
      endpoint: '',
      method: 'POST',
      headers: {}
    },
    tags: []
  });

  const [newProp, setNewProp] = useState({
    key: '',
    type: 'string',
    description: '',
    required: false
  });

  const handleAddProperty = () => {
    if (!newProp.key) return;
    
    const updatedProperties = {
      ...formData.inputSchema.properties,
      [newProp.key]: {
        type: newProp.type,
        description: newProp.description
      }
    };

    const updatedRequired = newProp.required 
      ? [...formData.inputSchema.required, newProp.key]
      : formData.inputSchema.required;

    setFormData({
      ...formData,
      inputSchema: {
        ...formData.inputSchema,
        properties: updatedProperties,
        required: updatedRequired
      }
    });

    setNewProp({ key: '', type: 'string', description: '', required: false });
  };

  const handleRemoveProperty = (key: string) => {
    const updatedProperties = { ...formData.inputSchema.properties };
    delete updatedProperties[key];

    setFormData({
      ...formData,
      inputSchema: {
        ...formData.inputSchema,
        properties: updatedProperties,
        required: formData.inputSchema.required.filter(k => k !== key)
      }
    });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await skillApi.create(formData);
      if (res.success) {
        setSuccess(true);
        if (onComplete) onComplete();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create skill');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-12 text-center">
        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="text-green-400 w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Skill Created Successfully!</h2>
        <p className="text-slate-400 mb-8">Your skill has been registered and is ready for testing in the sandbox.</p>
        <button 
          onClick={() => setSuccess(false)}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all"
        >
          Create Another Skill
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress Bar */}
      <div className="flex items-center justify-between mb-12 relative">
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-800 -translate-y-1/2 z-0" />
        {[1, 2, 3].map((s) => (
          <div key={s} className="relative z-10 flex flex-col items-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
              step >= s ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'
            }`}>
              {s}
            </div>
            <span className={`text-[10px] mt-2 font-bold uppercase tracking-wider ${
              step >= s ? 'text-blue-400' : 'text-slate-500'
            }`}>
              {s === 1 ? 'Basic Info' : s === 2 ? 'Input Schema' : 'Executor'}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-slate-900/50 border border-white/5 rounded-2xl overflow-hidden">
        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-300">Skill Name</label>
                  <input 
                    type="text"
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50"
                    placeholder="e.g., fetch_weather"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-300">Category</label>
                  <select 
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50"
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value as SkillCategory})}
                  >
                    <option value="payment">Payment</option>
                    <option value="commerce">Commerce</option>
                    <option value="data">Data</option>
                    <option value="utility">Utility</option>
                    <option value="integration">Integration</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-300">Description</label>
                <textarea 
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50 h-32"
                  placeholder="Describe what this skill does..."
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8">
              <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 flex items-start gap-3">
                <Info className="text-blue-400 w-5 h-5 mt-0.5" />
                <p className="text-xs text-slate-400 leading-relaxed">
                  Define the input parameters your skill requires. These will be automatically converted to JSON Schema for AI models to understand.
                </p>
              </div>

              {/* Property List */}
              <div className="space-y-3">
                {Object.entries(formData.inputSchema.properties).map(([key, prop]: [string, any]) => (
                  <div key={key} className="flex items-center justify-between p-4 bg-slate-800/50 border border-white/5 rounded-xl">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{key}</span>
                        <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded uppercase">{prop.type}</span>
                        {formData.inputSchema.required.includes(key) && (
                          <span className="text-[10px] text-red-400 font-bold">REQUIRED</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{prop.description}</p>
                    </div>
                    <button 
                      onClick={() => handleRemoveProperty(key)}
                      className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add New Property */}
              <div className="p-6 bg-slate-800/30 border border-dashed border-white/10 rounded-2xl space-y-4">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <PlusCircle size={16} className="text-blue-400" />
                  Add Parameter
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input 
                    type="text"
                    placeholder="Key (e.g., city)"
                    className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                    value={newProp.key}
                    onChange={(e) => setNewProp({...newProp, key: e.target.value})}
                  />
                  <select 
                    className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                    value={newProp.type}
                    onChange={(e) => setNewProp({...newProp, type: e.target.value})}
                  >
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="integer">Integer</option>
                    <option value="boolean">Boolean</option>
                  </select>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={newProp.required}
                        onChange={(e) => setNewProp({...newProp, required: e.target.checked})}
                      />
                      Required
                    </label>
                    <button 
                      onClick={handleAddProperty}
                      className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 rounded-lg transition-all"
                    >
                      Add
                    </button>
                  </div>
                </div>
                <input 
                  type="text"
                  placeholder="Description (e.g., The name of the city to fetch weather for)"
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                  value={newProp.description}
                  onChange={(e) => setNewProp({...newProp, description: e.target.value})}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 p-1 bg-slate-800 rounded-xl w-fit mb-6">
                <button 
                  onClick={() => setFormData({...formData, executor: {...formData.executor, type: 'http'}})}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    formData.executor.type === 'http' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Globe size={16} /> HTTP API
                </button>
                <button 
                  onClick={() => setFormData({...formData, executor: {...formData.executor, type: 'internal'}})}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    formData.executor.type === 'internal' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Cpu size={16} /> Internal Handler
                </button>
              </div>

              {formData.executor.type === 'http' ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-1 space-y-2">
                      <label className="text-sm font-bold text-slate-300">Method</label>
                      <select 
                        className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50"
                        value={formData.executor.method}
                        onChange={(e) => setFormData({...formData, executor: {...formData.executor, method: e.target.value as any}})}
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="DELETE">DELETE</option>
                      </select>
                    </div>
                    <div className="md:col-span-3 space-y-2">
                      <label className="text-sm font-bold text-slate-300">Endpoint URL</label>
                      <input 
                        type="text"
                        className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50"
                        placeholder="https://api.example.com/v1/action"
                        value={formData.executor.endpoint}
                        onChange={(e) => setFormData({...formData, executor: {...formData.executor, endpoint: e.target.value}})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-300">Custom Headers (JSON)</label>
                    <textarea 
                      className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-blue-500/50 h-32"
                      placeholder='{ "Authorization": "Bearer ..." }'
                      onChange={(e) => {
                        try {
                          const headers = JSON.parse(e.target.value);
                          setFormData({...formData, executor: {...formData.executor, headers}});
                        } catch (err) {}
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-300">Internal Handler Name</label>
                  <input 
                    type="text"
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50"
                    placeholder="e.g., search_products"
                    value={formData.executor.internalHandler}
                    onChange={(e) => setFormData({...formData, executor: {...formData.executor, internalHandler: e.target.value}})}
                  />
                  <p className="text-xs text-slate-500">This must match a handler registered in the backend.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 bg-slate-800/30 border-t border-white/5 flex items-center justify-between">
          <button 
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
            className="flex items-center gap-2 px-6 py-3 text-slate-400 hover:text-white disabled:opacity-30 transition-all font-bold"
          >
            <ChevronLeft size={18} /> Back
          </button>
          
          {step < 3 ? (
            <button 
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-900/20"
            >
              Next Step <ChevronRight size={18} />
            </button>
          ) : (
            <button 
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-8 py-3 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-green-900/20"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save size={18} />}
              Create Skill
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SkillFactory;
