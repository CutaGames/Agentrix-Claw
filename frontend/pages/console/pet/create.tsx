import React, { useState } from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';

type Mode = 'text' | 'image' | 'fusion';

export default function PetCreatorPage() {
  const { t } = useLocalization();
  const [mode, setMode] = useState<Mode>('text');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleGenerate = () => {
    setGenerating(true);
    // TODO W3: WebSocket real generation
    setTimeout(() => setGenerating(false), 3000);
  };

  return (
    <ConsoleLayout title={t({ zh: 'PetCreator 工坊', en: 'PetCreator Studio' })}>
      <p className="mb-6 text-sm text-gray-400">
        {t({ zh: '三种模式生成你的宠物皮肤：文生 / 图生 / 双图融合。生成后可直接装备或上架集市。', en: 'Three modes to generate pet skins: text-to-skin / image-to-skin / dual-image fusion. Equip or list on marketplace after generation.' })}
      </p>

      {/* Mode selector */}
      <div className="mb-6 flex gap-2">
        {(['text', 'image', 'fusion'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              mode === m ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {m === 'text' ? t({ zh: '✍️ 文生', en: '✍️ Text-to-Skin' }) :
             m === 'image' ? t({ zh: '🖼️ 图生', en: '🖼️ Image-to-Skin' }) :
             t({ zh: '🔀 双图融合', en: '🔀 Dual Fusion' })}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-6">
        {mode === 'text' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {t({ zh: '描述你想要的宠物皮肤', en: 'Describe the pet skin you want' })}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
              placeholder={t({ zh: '例如：赛博朋克风格的龙猫，霓虹灯光效果，金属质感…', en: 'e.g. Cyberpunk chinchilla with neon glow, metallic texture...' })}
            />
          </div>
        )}
        {mode === 'image' && (
          <div className="text-center py-8">
            <div className="mx-auto h-32 w-32 rounded-xl border-2 border-dashed border-gray-600 flex items-center justify-center">
              <span className="text-gray-500 text-sm">{t({ zh: '拖拽上传', en: 'Drag & drop' })}</span>
            </div>
          </div>
        )}
        {mode === 'fusion' && (
          <div className="flex gap-4 justify-center py-8">
            <div className="h-32 w-32 rounded-xl border-2 border-dashed border-gray-600 flex items-center justify-center">
              <span className="text-gray-500 text-xs">{t({ zh: '父图 A', en: 'Parent A' })}</span>
            </div>
            <div className="flex items-center text-2xl text-gray-500">×</div>
            <div className="h-32 w-32 rounded-xl border-2 border-dashed border-gray-600 flex items-center justify-center">
              <span className="text-gray-500 text-xs">{t({ zh: '父图 B', en: 'Parent B' })}</span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="mt-4 w-full rounded-lg bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {generating ? t({ zh: '生成中…', en: 'Generating…' }) : t({ zh: '🚀 开始生成', en: '🚀 Generate' })}
        </button>
      </div>

      {/* Progress / result placeholder */}
      {generating && (
        <div className="mt-6 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-6 text-center">
          <div className="animate-pulse text-sm text-indigo-300">
            {t({ zh: '正在生成你的宠物皮肤… WebSocket 进度条（W3 完善）', en: 'Generating your pet skin… WebSocket progress (W3 polish)' })}
          </div>
        </div>
      )}
    </ConsoleLayout>
  );
}
