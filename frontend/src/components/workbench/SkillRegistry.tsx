import React, { useState, useEffect, useCallback } from 'react';
import { skillApi } from '../../services/skill-api';
import { Skill, SkillCategory, SkillStatus } from '../../types/skill.types';
import { Package, Zap, Check, AlertCircle, Search, Filter, Plus, ExternalLink, ChevronRight } from 'lucide-react';

interface SkillRegistryProps {
  onSkillSelect?: (skill: Skill) => void;
  onSkillCreated?: (skill: Skill) => void;
}

export const SkillRegistry: React.FC<SkillRegistryProps> = ({
  onSkillSelect,
  onSkillCreated
}) => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    version: '1.0.0',
    category: SkillCategory.UTILITY,
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' }
      },
      required: ['query']
    }, null, 2),
    executorType: 'internal' as 'http' | 'internal',
    executorEndpoint: '',
    executorMethod: 'POST',
    internalHandler: 'echo'
  });

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const data = await skillApi.getSkills();
      setSkills(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const [lastReceipt, setLastReceipt] = useState<string | null>(null);

  const handleCreate = async () => {
    setLoading(true);
    setLastReceipt(null);
    try {
      const inputSchema = JSON.parse(formData.inputSchema);
      const skill = await skillApi.createSkill({
        name: formData.name,
        description: formData.description,
        version: formData.version,
        category: formData.category,
        inputSchema,
        executor: formData.executorType === 'http' 
          ? { type: 'http', endpoint: formData.executorEndpoint, method: formData.executorMethod }
          : { type: 'internal', internalHandler: formData.internalHandler } as any
      });
      setSkills(prev => [skill, ...prev]);
      setLastReceipt(`rcpt_skill_${skill.id.slice(0, 8)}`);
      setShowCreateForm(false);
      onSkillCreated?.(skill);
    } catch (err: any) {
      setError(err.message || 'Failed to create skill');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="bg-slate-900 rounded-xl border border-white/10 overflow-hidden">
      <div className="p-6 border-b border-white/5 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Package className="text-blue-400" size={24} />
            Skill Registry
          </h2>
          <p className="text-xs text-slate-400">Manage AX Skill definitions and versions</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 transition-all"
        >
          {showCreateForm ? 'Cancel' : <><Plus size={18} /> New Skill</>}
        </button>
      </div>

      {lastReceipt && (
        <div className="p-4 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Check size={18} className="text-emerald-400" />
            <p className="text-emerald-400 text-sm font-medium">Skill created successfully</p>
          </div>
          <span className="text-[10px] font-mono text-slate-500">Receipt: {lastReceipt}</span>
        </div>
      )}

      {showCreateForm && (

        <div className="p-6 bg-slate-800/50 border-b border-white/5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input
              placeholder="Skill Name"
              value={formData.name}
              onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
              className="bg-slate-950 border border-white/10 rounded-lg p-2 text-white"
            />
            <input
              placeholder="Version"
              value={formData.version}
              onChange={e => setFormData(p => ({ ...p, version: e.target.value }))}
              className="bg-slate-950 border border-white/10 rounded-lg p-2 text-white"
            />
          </div>
          <textarea
            placeholder="Description"
            value={formData.description}
            onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
            className="w-full bg-slate-950 border border-white/10 rounded-lg p-2 text-white h-20"
          />
          <textarea
            placeholder="Input Schema (JSON)"
            value={formData.inputSchema}
            onChange={e => setFormData(p => ({ ...p, inputSchema: e.target.value }))}
            className="w-full bg-slate-950 border border-white/10 rounded-lg p-2 text-blue-300 font-mono text-xs h-32"
          />
          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold"
          >
            {loading ? 'Processing...' : 'Create Skill'}
          </button>
        </div>
      )}

      <div className="divide-y divide-white/5">
        {skills.map(skill => (
          <div key={skill.id} className="p-4 hover:bg-white/5 cursor-pointer flex justify-between items-center" onClick={() => onSkillSelect?.(skill)}>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{skill.name}</span>
                <span className="text-[10px] bg-white/10 px-1 rounded text-slate-400">v{skill.version}</span>
                <span className={`text-[10px] px-2 rounded-full ${skill.status === 'published' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                  {skill.status}
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-1">{skill.description}</p>
            </div>
            <ChevronRight className="text-slate-600" size={20} />
          </div>
        ))}
      </div>
    </div>
  );
};
