/**
 * MarketplaceListingModal — List a pet skin on the marketplace.
 *
 * Opened from WardrobePanel's "上架" button on user-created skins.
 * Collects title, description, price, clan, tags → submits to backend.
 *
 * @see .kiro/specs/creator-studio-mvp/design.md §Module 2
 */
import { useState } from "react";
import { API_BASE, useAuthStore } from "../services/store";
import type { PetSkinSummary } from "../services/petSoulSdk";

interface Props {
  skin: PetSkinSummary;
  onClose: () => void;
  onSuccess?: (listingId: string) => void;
}

const CLAN_OPTIONS = [
  { value: "", label: "不分类" },
  { value: "A_office", label: "A · 办公军团" },
  { value: "B_life", label: "B · 生活伙伴" },
  { value: "C_learn", label: "C · 学习成长" },
  { value: "D_play", label: "D · 娱乐玩伴" },
  { value: "E_web3", label: "E · Web3 投资" },
  { value: "F_family", label: "F · 家庭亲情" },
];

const TAG_OPTIONS = [
  "cute", "cool", "fantasy", "sci-fi", "animal", "robot",
  "chibi", "realistic", "abstract", "seasonal", "limited",
];

export default function MarketplaceListingModal({ skin, onClose, onSuccess }: Props) {
  const [title, setTitle] = useState(skin.display_name || "");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(500);
  const [priceCurrency, setPriceCurrency] = useState<"AXP" | "USD">("AXP");
  const [clan, setClan] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [includeVariants, setIncludeVariants] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("请填写标题");
      return;
    }
    if (price <= 0) {
      setError("价格必须大于 0");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`${API_BASE}/v1/marketplace/skins/listing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          skinId: skin.id,
          title: title.trim(),
          description: description.trim(),
          price,
          priceCurrency,
          clan: clan || undefined,
          tags: tags.length > 0 ? tags : undefined,
          includeVariants,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`上架失败: ${res.status} ${text}`);
      }

      const data = await res.json();
      setSuccess(data.listingId || "上架成功！");
      onSuccess?.(data.listingId);
    } catch (err: any) {
      setError(err?.message || "上架失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="relative flex w-[min(560px,92vw)] max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0f1018] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">🛍 上架到市场</h2>
            <p className="text-xs text-white/50">让其他用户购买你的萌宠皮肤</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-white/60 hover:bg-white/10"
          >
            ✕
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Skin preview */}
          <div className="flex items-center gap-3 rounded-lg bg-white/5 p-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-black/30">
              {skin.thumbnail_url ? (
                <img src={skin.thumbnail_url} alt={skin.display_name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl">🐾</div>
              )}
            </div>
            <div>
              <div className="text-sm font-medium">{skin.display_name}</div>
              <div className="text-xs text-white/50">{skin.format} · {skin.source}</div>
            </div>
          </div>

          {/* Title */}
          <Field label="标题 *">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="给你的皮肤起个名字"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30"
              maxLength={60}
            />
          </Field>

          {/* Description */}
          <Field label="描述">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述你的皮肤特点、灵感来源..."
              rows={3}
              className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30"
              maxLength={500}
            />
          </Field>

          {/* Price */}
          <Field label="定价 *">
            <div className="flex gap-2">
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))}
                min={1}
                className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
              <select
                value={priceCurrency}
                onChange={(e) => setPriceCurrency(e.target.value as "AXP" | "USD")}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              >
                <option value="AXP">AXP 积分</option>
                <option value="USD">USD 美元</option>
              </select>
            </div>
            <p className="mt-1 text-xs text-white/40">
              {priceCurrency === "AXP"
                ? `${price} AXP ≈ $${(price * 0.001).toFixed(2)}`
                : `$${price} · 平台抽成 30%，你获得 $${(price * 0.7).toFixed(2)}`}
            </p>
          </Field>

          {/* Clan */}
          <Field label="族群分类">
            <select
              value={clan}
              onChange={(e) => setClan(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            >
              {CLAN_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>

          {/* Tags */}
          <Field label="标签（可多选）">
            <div className="flex flex-wrap gap-2">
              {TAG_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    tags.includes(tag)
                      ? "bg-purple-500/30 text-purple-300 ring-1 ring-purple-400/50"
                      : "bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </Field>

          {/* Include variants */}
          <Field label="包含多形态变体">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeVariants}
                onChange={(e) => setIncludeVariants(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-white/70">
                如果有萌态/专家态/商人态变体，一起上架
              </span>
            </label>
          </Field>

          {/* Error / Success */}
          {error && (
            <div className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">
              ✅ 上架成功！Listing ID: {success}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-3 border-t border-white/10 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-white/60 hover:bg-white/10"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !!success}
            className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
              submitting || success
                ? "bg-purple-500/30 text-purple-300 cursor-not-allowed"
                : "bg-purple-600 text-white hover:bg-purple-500"
            }`}
          >
            {submitting ? "提交中..." : success ? "已上架 ✓" : "🚀 确认上架"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-white/60">{label}</label>
      {children}
    </div>
  );
}
