import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Code, 
  Terminal, 
  Settings, 
  Search, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Database,
  Cpu,
  Globe,
  Copy,
  RefreshCw
} from 'lucide-react';
import { skillApi, Skill } from '../../lib/api/skill.api';

interface SkillSandboxProps {
  initialSkillId?: string;
}

const SkillSandbox: React.FC<SkillSandboxProps> = ({ initialSkillId }) => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [params, setParams] = useState<Record<string, any>>({});
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'input' | 'output' | 'schema'>('input');

  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const res = await skillApi.list({ status: 'published' });
        if (res.success) {
          setSkills(res.items);
          
          // If initialSkillId is provided, select it
          if (initialSkillId) {
            const skill = res.items.find((s: Skill) => s.id === initialSkillId);
            if (skill) {
              handleSkillSelect(skill);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch skills:', err);
      }
    };
    fetchSkills();
  }, [initialSkillId]);

  const handleSkillSelect = (skill: Skill) => {
    setSelectedSkill(skill);
    setResult(null);
    setActiveTab('input');
    
    // Initialize params with defaults
    const initialParams: Record<string, any> = {};
    if (skill.inputSchema?.properties) {
      Object.entries(skill.inputSchema.properties).forEach(([key, prop]: [string, any]) => {
        if (prop.default !== undefined) {
          initialParams[key] = prop.default;
        } else if (prop.type === 'string') {
          initialParams[key] = '';
        } else if (prop.type === 'number' || prop.type === 'integer') {
          initialParams[key] = 0;
        } else if (prop.type === 'boolean') {
          initialParams[key] = false;
        }
      });
    }
    setParams(initialParams);
  };

  const handleExecute = async () => {
    if (!selectedSkill) return;
    
    setExecuting(true);
    setResult(null);
    setActiveTab('output');
    
    try {
      const res = await skillApi.execute(selectedSkill.id, params);
      setResult(res);
    } catch (err: any) {
      setResult({
        success: false,
        error: err.message || 'Execution failed'
      });
    } finally {
      setExecuting(false);
    }
  };

  const filteredSkills = skills.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-200px)]">
      {/* Sidebar: Skill List */}
      <div className="lg:col-span-3 bg-slate-900/50 border border-white/5 rounded-2xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
            <input 
              type="text"
              placeholder="Search skills..."
              className="w-full bg-slate-800/50 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredSkills.map(skill => (
            <button
              key={skill.id}
              onClick={() => handleSkillSelect(skill)}
              className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group ${
                selectedSkill?.id === skill.id 
                  ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400' 
                  : 'hover:bg-white/5 border border-transparent text-slate-400'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={`p-2 rounded-lg ${
                  selectedSkill?.id === skill.id ? 'bg-blue-500/20' : 'bg-slate-800'
                }`}>
                  {skill.executor.type === 'http' ? <Globe size={14} /> : <Cpu size={14} />}
                </div>
                <div className="truncate">
                  <div className="font-bold text-sm truncate">{skill.name}</div>
                  <div className="text-[10px] opacity-60 truncate">{skill.category}</div>
                </div>
              </div>
              <ChevronRight size={14} className={`transition-transform ${selectedSkill?.id === skill.id ? 'rotate-90' : 'group-hover:translate-x-1'}`} />
            </button>
          ))}
        </div>
      </div>

      {/* Main Content: Sandbox */}
      <div className="lg:col-span-9 flex flex-col gap-6">
        {selectedSkill ? (
          <>
            {/* Skill Header */}
            <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-bold text-white">{selectedSkill.name}</h2>
                    <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded uppercase border border-blue-500/20">
                      {selectedSkill.executor.type}
                    </span>
                  </div>
                  <p className="text-slate-400 text-sm">{selectedSkill.description}</p>
                </div>
                <button 
                  onClick={handleExecute}
                  disabled={executing}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-900/20"
                >
                  {executing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Execute Skill
                </button>
              </div>
              
              <div className="flex items-center gap-6 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Clock size={14} />
                  Updated: {new Date(selectedSkill.updatedAt).toLocaleString()}
                </div>
                <div className="flex items-center gap-1.5">
                  <Database size={14} />
                  Calls: {selectedSkill.callCount}
                </div>
              </div>
            </div>

            {/* Tabs & Editor */}
            <div className="flex-1 bg-slate-900/50 border border-white/5 rounded-2xl flex flex-col overflow-hidden">
              <div className="flex border-b border-white/5">
                <button 
                  onClick={() => setActiveTab('input')}
                  className={`px-6 py-4 text-sm font-bold transition-all border-b-2 ${
                    activeTab === 'input' ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Input Parameters
                </button>
                <button 
                  onClick={() => setActiveTab('output')}
                  className={`px-6 py-4 text-sm font-bold transition-all border-b-2 ${
                    activeTab === 'output' ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Execution Result
                </button>
                <button 
                  onClick={() => setActiveTab('schema')}
                  className={`px-6 py-4 text-sm font-bold transition-all border-b-2 ${
                    activeTab === 'schema' ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  JSON Schema
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'input' && (
                  <div className="space-y-6 max-w-2xl">
                    {selectedSkill.inputSchema?.properties ? (
                      Object.entries(selectedSkill.inputSchema.properties).map(([key, prop]: [string, any]) => (
                        <div key={key} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-bold text-slate-300 flex items-center gap-2">
                              {key}
                              {selectedSkill.inputSchema?.required?.includes(key) && (
                                <span className="text-red-500 text-xs">*</span>
                              )}
                            </label>
                            <span className="text-[10px] text-slate-500 font-mono uppercase">{prop.type}</span>
                          </div>
                          {prop.type === 'boolean' ? (
                            <div className="flex items-center gap-3">
                              <button 
                                onClick={() => setParams({...params, [key]: !params[key]})}
                                className={`w-12 h-6 rounded-full transition-all relative ${params[key] ? 'bg-blue-600' : 'bg-slate-700'}`}
                              >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${params[key] ? 'left-7' : 'left-1'}`} />
                              </button>
                              <span className="text-sm text-slate-400">{params[key] ? 'True' : 'False'}</span>
                            </div>
                          ) : prop.enum ? (
                            <select 
                              className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50"
                              value={params[key]}
                              onChange={(e) => setParams({...params, [key]: e.target.value})}
                            >
                              {prop.enum.map((val: string) => (
                                <option key={val} value={val}>{val}</option>
                              ))}
                            </select>
                          ) : (
                            <input 
                              type={prop.type === 'number' || prop.type === 'integer' ? 'number' : 'text'}
                              className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50"
                              placeholder={prop.description}
                              value={params[key] || ''}
                              onChange={(e) => setParams({
                                ...params, 
                                [key]: prop.type === 'number' || prop.type === 'integer' ? Number(e.target.value) : e.target.value
                              })}
                            />
                          )}
                          <p className="text-xs text-slate-500">{prop.description}</p>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-10 text-slate-500">
                        No input parameters required for this skill.
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'output' && (
                  <div className="h-full flex flex-col">
                    {result ? (
                      <div className="flex-1 flex flex-col gap-4">
                        <div className={`p-4 rounded-xl flex items-center gap-3 ${
                          result.success ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
                        }`}>
                          {result.success ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                          <div>
                            <div className="font-bold">{result.success ? 'Execution Successful' : 'Execution Failed'}</div>
                            <div className="text-xs opacity-80">Time: {result.executionTime}ms</div>
                          </div>
                        </div>
                        <div className="flex-1 bg-slate-950 rounded-xl p-4 font-mono text-sm overflow-auto relative group">
                          <button 
                            onClick={() => navigator.clipboard.writeText(JSON.stringify(result.data, null, 2))}
                            className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Copy size={14} className="text-slate-400" />
                          </button>
                          <pre className="text-blue-300">
                            {JSON.stringify(result.data || result.error, null, 2)}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
                        <div className="p-4 bg-slate-800/50 rounded-full">
                          <Terminal size={32} />
                        </div>
                        <p>Execute the skill to see the output here.</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'schema' && (
                  <div className="h-full bg-slate-950 rounded-xl p-4 font-mono text-sm overflow-auto">
                    <pre className="text-purple-300">
                      {JSON.stringify({
                        input: selectedSkill.inputSchema,
                        output: selectedSkill.outputSchema
                      }, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 bg-slate-900/50 border border-white/5 rounded-2xl flex flex-col items-center justify-center text-slate-500 space-y-4">
            <div className="p-6 bg-slate-800/50 rounded-full">
              <Code size={48} />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-white mb-2">Skill Sandbox</h3>
              <p className="max-w-md">Select a skill from the sidebar to test its functionality, validate parameters, and inspect execution results.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SkillSandbox;
