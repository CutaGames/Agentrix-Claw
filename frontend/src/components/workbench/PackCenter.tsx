import React, { useState } from 'react';
import { skillApi } from '../../services/skill-api';
import { Skill } from '../../types/skill.types';
import { Box, Download, Eye, FileJson, Layers, Share2 } from 'lucide-react';

export const PackCenter: React.FC<{ selectedSkill?: Skill }> = ({ selectedSkill }) => {
  const [platform, setPlatform] = useState<'openai' | 'claude' | 'gemini' | 'openapi'>('openai');
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!selectedSkill) return;
    setLoading(true);
    try {
      const data = await skillApi.getPack(selectedSkill.id, platform);
      setPreview(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-white/10 overflow-hidden">
      <div className="p-6 border-b border-white/5">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Layers className="text-purple-400" size={24} />
          Pack Center
        </h2>
        <p className="text-xs text-slate-400">Generate AI-ready artifacts for multiple ecosystems</p>
      </div>

      <div className="p-6 grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Target Ecosystem</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(['openai', 'claude', 'gemini', 'openapi'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`p-3 rounded-lg border text-sm font-bold capitalize transition-all ${
                    platform === p ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-slate-950 border-white/10 text-slate-500'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={!selectedSkill || loading}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            <Box size={18} />
            {loading ? 'Generating...' : 'Generate Pack'}
          </button>
        </div>

        <div className="col-span-2">
          <div className="bg-slate-950 rounded-lg border border-white/10 h-64 overflow-auto p-4">
            {preview ? (
              <pre className="text-[10px] text-blue-300 font-mono leading-relaxed">
                {JSON.stringify(preview, null, 2)}
              </pre>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2">
                <FileJson size={32} className="opacity-20" />
                <p className="text-xs">Select a skill and platform to preview manifest</p>
              </div>
            )}
          </div>
          
          {preview && (
            <div className="flex gap-4 mt-4">
              <button className="flex-1 py-2 bg-white/5 text-slate-300 rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-white/10 transition-all">
                <Download size={16} /> Download Manifest
              </button>
              <button className="flex-1 py-2 bg-white/5 text-slate-300 rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-white/10 transition-all">
                <Share2 size={16} /> Copy to Clipboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
