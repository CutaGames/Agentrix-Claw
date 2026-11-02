/**
 * PosterWorkshop — Visual poster creation tool.
 *
 * Lets users pick a template, customize content, preview in real-time,
 * and export as PNG. Integrates with PetCreator for pet screenshots.
 *
 * @see .kiro/specs/creator-studio-mvp/design.md §Module 3
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type PosterContent,
  type PosterSize,
  type PosterTemplate,
  POSTER_SIZES,
  POSTER_TEMPLATES,
  generatePoster,
} from "../services/posterGenerator";

interface Props {
  onClose: () => void;
}

const DEFAULT_COLORS = {
  primary: '#6C5CE7',
  secondary: '#22D3EE',
  bg: ['#0B1220', '#1a1a3e'],
  text: '#FFFFFF',
  textSecondary: '#9CA3AF',
};

export default function PosterWorkshop({ onClose }: Props) {
  const [selectedTemplate, setSelectedTemplate] = useState<PosterTemplate>(POSTER_TEMPLATES[0]);
  const [selectedSize, setSelectedSize] = useState<PosterSize>(POSTER_SIZES[0]);
  const [title, setTitle] = useState("Agentrix");
  const [subtitle, setSubtitle] = useState("你的 AI 灵魂宠物");
  const [bullets, setBullets] = useState<string[]>(["跨 6 端同步", "一句话生成 3D 萌宠", "替你工作帮你赚钱"]);
  const [cta, setCta] = useState("立即下载");
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const content: PosterContent = {
    title,
    subtitle,
    bullets,
    cta,
    colors,
  };

  // Live preview (debounced)
  const updatePreview = useCallback(async () => {
    try {
      const previewSize = { width: 540, height: 960, label: 'preview' };
      const blob = await generatePoster(selectedTemplate, content, previewSize);
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      // Preview generation failed silently
    }
  }, [selectedTemplate, title, subtitle, bullets, cta, colors]);

  useEffect(() => {
    const timer = setTimeout(updatePreview, 300);
    return () => clearTimeout(timer);
  }, [updatePreview]);

  const handleExport = async () => {
    setGenerating(true);
    try {
      const blob = await generatePoster(selectedTemplate, content, selectedSize);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agentrix-poster-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('[PosterWorkshop] export failed:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleBulletChange = (index: number, value: string) => {
    setBullets((prev) => prev.map((b, i) => (i === index ? value : b)));
  };

  const addBullet = () => setBullets((prev) => [...prev, ""]);
  const removeBullet = (index: number) => setBullets((prev) => prev.filter((_, i) => i !== index));

  return (
    <div className="fixed inset-0 z-[9998] flex flex-col bg-[#0a0a14] text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-3 bg-black/30">
        <div className="flex items-center gap-3">
          <span className="text-xl">🎨</span>
          <div>
            <h2 className="text-base font-semibold">海报工坊 · Poster Workshop</h2>
            <p className="text-xs text-white/50">选模板 → 填内容 → 导出 PNG</p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-md px-3 py-1 text-sm text-white/60 hover:bg-white/10">
          关闭
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Controls */}
        <div className="w-[340px] shrink-0 overflow-y-auto border-r border-white/10 p-4 space-y-4">
          {/* Template selector */}
          <Section title="模板">
            <div className="grid grid-cols-3 gap-2">
              {POSTER_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t)}
                  className={`rounded-lg p-2 text-center text-xs transition ${
                    selectedTemplate.id === t.id
                      ? "bg-purple-500/30 ring-1 ring-purple-400"
                      : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="text-sm">{t.nameZh}</div>
                  <div className="text-[10px] text-white/40">{t.aspect}</div>
                </button>
              ))}
            </div>
          </Section>

          {/* Size */}
          <Section title="尺寸">
            <select
              value={`${selectedSize.width}x${selectedSize.height}`}
              onChange={(e) => {
                const [w, h] = e.target.value.split('x').map(Number);
                const s = POSTER_SIZES.find((sz) => sz.width === w && sz.height === h);
                if (s) setSelectedSize(s);
              }}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
            >
              {POSTER_SIZES.map((s) => (
                <option key={`${s.width}x${s.height}`} value={`${s.width}x${s.height}`}>
                  {s.label}
                </option>
              ))}
            </select>
          </Section>

          {/* Content */}
          <Section title="标题">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
              placeholder="主标题"
            />
          </Section>

          <Section title="副标题">
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
              placeholder="副标题"
            />
          </Section>

          <Section title="要点">
            {bullets.map((b, i) => (
              <div key={i} className="flex gap-1 mb-1">
                <input
                  value={b}
                  onChange={(e) => handleBulletChange(i, e.target.value)}
                  className="flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs"
                  placeholder={`要点 ${i + 1}`}
                />
                <button onClick={() => removeBullet(i)} className="text-red-400 text-xs px-1">✕</button>
              </div>
            ))}
            <button onClick={addBullet} className="text-xs text-purple-300 hover:underline">+ 添加要点</button>
          </Section>

          <Section title="CTA 按钮">
            <input
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
              placeholder="按钮文案"
            />
          </Section>

          <Section title="主色">
            <input
              type="color"
              value={colors.primary}
              onChange={(e) => setColors({ ...colors, primary: e.target.value })}
              className="h-8 w-full rounded cursor-pointer"
            />
          </Section>

          {/* Export */}
          <button
            onClick={handleExport}
            disabled={generating}
            className={`w-full rounded-lg py-3 text-sm font-semibold transition ${
              generating
                ? "bg-purple-500/30 text-purple-300 cursor-wait"
                : "bg-purple-600 text-white hover:bg-purple-500"
            }`}
          >
            {generating ? "生成中..." : `📥 导出 PNG (${selectedSize.width}×${selectedSize.height})`}
          </button>
        </div>

        {/* Right: Preview */}
        <div className="flex-1 flex items-center justify-center p-8 bg-[#050508]">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Poster Preview"
              className="max-h-full max-w-full rounded-lg shadow-2xl ring-1 ring-white/10"
              style={{ objectFit: 'contain' }}
            />
          ) : (
            <div className="text-white/30 text-sm">预览加载中...</div>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-white/50 uppercase tracking-wide">{title}</label>
      {children}
    </div>
  );
}
