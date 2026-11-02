/**
 * PetMemoryAlbumPanel — Phase 6 S4 时光相册
 *
 * 浏览 / 创建 / 删除宠物回忆。
 */
import { useCallback, useEffect, useState } from "react";
import {
  type PetMemoryItem,
  createMemory,
  deleteMemory,
  formatRelativeTime,
  listMemories,
} from "../services/petPhase6Sdk";

interface Props {
  onClose: () => void;
}

const CATEGORIES = ["all", "milestone", "chat", "task", "creation", "other"] as const;
const CAT_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  all: "全部",
  milestone: "里程碑",
  chat: "对话",
  task: "任务",
  creation: "创作",
  other: "其他",
};

export default function PetMemoryAlbumPanel({ onClose }: Props) {
  const [items, setItems] = useState<PetMemoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // create form fields
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [thumb, setThumb] = useState("");
  const [formCat, setFormCat] = useState("milestone");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listMemories({
        limit: 100,
        category: category === "all" ? undefined : category,
      });
      setItems(r.items);
      setTotal(r.total ?? r.items.length);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = useCallback(async () => {
    if (!title.trim()) {
      setError("请填写标题");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createMemory({
        title: title.trim(),
        body: body.trim() || undefined,
        thumbnailUrl: thumb.trim() || null,
        category: formCat,
      });
      setTitle("");
      setBody("");
      setThumb("");
      setShowForm(false);
      await refresh();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCreating(false);
    }
  }, [title, body, thumb, formCat, refresh]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("删除这条记忆？")) return;
      try {
        await deleteMemory(id);
        setItems((cur) => cur.filter((i) => i.id !== id));
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    },
    [],
  );

  return (
    <div
      data-testid="pet-memory-album"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative flex h-[85vh] w-[min(960px,94vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b13] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold">📔 时光相册 · Memory Album</h2>
            <p className="text-xs text-white/60">
              共 {total} 条记忆 —— 与宠物的故事都收藏在这里
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1 text-sm text-white/70 hover:bg-white/10"
          >
            关闭
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-5 py-2 text-xs">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-md px-3 py-1 ${
                category === c
                  ? "bg-emerald-600/80 text-white"
                  : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {CAT_LABELS[c]}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setShowForm((v) => !v)}
              className="rounded-md bg-purple-600/80 px-3 py-1 font-medium hover:bg-purple-500"
              data-testid="memory-add-toggle"
            >
              {showForm ? "✕ 取消" : "＋ 新增记忆"}
            </button>
            <button
              onClick={refresh}
              disabled={loading}
              className="text-white/50 hover:text-white"
            >
              {loading ? "刷新中…" : "↻"}
            </button>
          </div>
        </div>

        {showForm && (
          <div className="border-b border-white/10 bg-black/30 px-5 py-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="标题（必填，例：第一次提交代码）"
                className="rounded-md bg-white/10 px-3 py-2 text-sm placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              />
              <select
                value={formCat}
                onChange={(e) => setFormCat(e.target.value)}
                className="rounded-md bg-white/10 px-3 py-2 text-sm"
              >
                {CATEGORIES.filter((c) => c !== "all").map((c) => (
                  <option key={c} value={c} className="bg-[#0b0b13]">
                    {CAT_LABELS[c]}
                  </option>
                ))}
              </select>
              <input
                value={thumb}
                onChange={(e) => setThumb(e.target.value)}
                placeholder="缩略图 URL（可选）"
                className="rounded-md bg-white/10 px-3 py-2 text-sm placeholder-white/40 sm:col-span-2"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="详细内容（可选）"
                rows={3}
                className="rounded-md bg-white/10 px-3 py-2 text-sm placeholder-white/40 sm:col-span-2"
              />
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={submit}
                disabled={creating || !title.trim()}
                className="rounded-md bg-emerald-600/80 px-4 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
                data-testid="memory-submit"
              >
                {creating ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mx-5 mt-3 rounded-md bg-red-500/15 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 && !loading ? (
            <div className="py-12 text-center text-sm text-white/50">
              还没有记忆。点 ＋ 创建第一条吧。
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((m) => (
                <article
                  key={m.id}
                  data-testid={`memory-${m.id}`}
                  className="group flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3 transition hover:bg-white/10"
                >
                  {m.thumbnail_url && (
                    <div className="h-28 w-full overflow-hidden rounded-md bg-black/30">
                      <img
                        src={m.thumbnail_url}
                        alt={m.title}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{m.title}</div>
                      <div className="mt-0.5 text-[10px] text-white/40">
                        {m.category && (
                          <span className="mr-1 rounded bg-white/10 px-1.5 py-0.5">
                            {CAT_LABELS[(m.category as keyof typeof CAT_LABELS) ?? "other"] ??
                              m.category}
                          </span>
                        )}
                        {formatRelativeTime(m.created_at)}
                      </div>
                    </div>
                    <button
                      onClick={() => void handleDelete(m.id)}
                      className="opacity-0 group-hover:opacity-100 text-xs text-red-300 hover:text-red-200"
                      title="删除"
                    >
                      ✕
                    </button>
                  </div>
                  {m.body && (
                    <p className="text-xs text-white/70 line-clamp-3">{m.body}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
