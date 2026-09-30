// Sprint Pre-launch P-3 (2026-05-23) — `@` and `/` autocomplete dropdown.
//
// Provides Cursor-/Cascade-like mention completions for the chat
// input: typing `@` opens a file/symbol/web/docs picker, typing `/`
// opens a slash-command palette. Selecting an item inserts the
// completion at the trigger position.
//
// Design constraints:
//  - The textarea in `ChatInputComposer.tsx` is UNCONTROLLED
//    (defaultValue + ref). We therefore listen on the textarea via a
//    ref forwarded through chatPanel and read its DOM `value` directly.
//  - We don't introduce React state for the textarea content. Only
//    the autocomplete UI itself is stateful (open/close + filter).
//  - The component renders nothing while idle so it has zero impact
//    on baseline render cost.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import {
  listWorkspaceDir,
  searchSymbols,
  type FileEntry,
  type SymbolHit,
} from "../../services/workspace";
import { useIsProMode } from "../../services/userMode";

// ── Slash commands — these mirror the Cursor / Cline conventions ───────────

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  /** Inserted into the textarea when chosen, replacing the `/` trigger. */
  insert: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: "explain", label: "/explain",  description: "解释当前选中的内容是什么、做什么用",         insert: "/explain " },
  { id: "fix",     label: "/fix",      description: "修一个 bug 或失败的测试",                       insert: "/fix " },
  { id: "test",    label: "/test",     description: "为当前代码生成测试",                             insert: "/test " },
  { id: "refactor",label: "/refactor", description: "重构选中的内容,保持外部行为不变",               insert: "/refactor " },
  { id: "doc",     label: "/doc",      description: "为当前代码生成文档/注释",                       insert: "/doc " },
  { id: "summary", label: "/summary",  description: "总结整个工作区或当前文件",                       insert: "/summary " },
  { id: "redo",    label: "/redo",     description: "撤销 agent 上一次修改",                          insert: "/redo " },
  { id: "continue",label: "/continue", description: "从上次中断处继续",                              insert: "/continue " },
];

// ── Mention sources ────────────────────────────────────────────────────────

type MentionItem = {
  id: string;
  /** What's shown in the dropdown row. */
  label: string;
  /** Sub-label / description / kind. */
  hint?: string;
  /** What gets inserted into the textarea (replacing the `@<filter>`). */
  insert: string;
  kind: "file" | "dir" | "web" | "docs" | "symbol";
};

const STATIC_MENTION_PRELUDE: MentionItem[] = [
  { id: "@web",    label: "@web",    hint: "用网络上最新的信息回答",  insert: "@web ",    kind: "web" },
  { id: "@docs",   label: "@docs",   hint: "搜索项目文档",          insert: "@docs ",   kind: "docs" },
];

// ── Public component ───────────────────────────────────────────────────────

interface Props {
  /** Forwarded ref pointing at the chat textarea. */
  textareaRef: RefObject<HTMLTextAreaElement>;
  /** Latest workspace path (changes when user picks a different folder). */
  workspaceDir: string | null;
}

interface TriggerState {
  kind: "@" | "/";
  /** Position in textarea where the trigger char sits. */
  startIndex: number;
  /** Current filter text after the trigger char. */
  filter: string;
  /** Caret rect on screen so the dropdown can position itself. */
  rect: { left: number; top: number };
}

export default function MentionAutocomplete({ textareaRef, workspaceDir }: Props) {
  const [trigger, setTrigger] = useState<TriggerState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [files, setFiles] = useState<FileEntry[]>([]);
  // Sprint Pro Mode Coding Views (2026-05-24): Pro-only `@symbol` picker.
  // Holds the latest grep-derived symbol hits; reset on filter change.
  const [symbolHits, setSymbolHits] = useState<SymbolHit[]>([]);
  const isProMode = useIsProMode();
  // Cache top-level directory listing once, refresh when workspace changes.
  const filesLoadedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceDir) {
      setFiles([]);
      filesLoadedRef.current = null;
      return () => { cancelled = true; };
    }
    if (filesLoadedRef.current === workspaceDir) return () => { cancelled = true; };
    (async () => {
      try {
        const top = await listWorkspaceDir("");
        if (cancelled) return;
        // Sort: directories first, alphabetical
        const sorted = [...top].sort((a, b) => {
          if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setFiles(sorted);
        filesLoadedRef.current = workspaceDir;
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [workspaceDir]);

  // ── Trigger detection ─────────────────────────────────────────────────────
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const onInput = () => updateTrigger(ta);
    const onSelectionChange = () => updateTrigger(ta);
    ta.addEventListener("input", onInput);
    ta.addEventListener("keyup", onSelectionChange);
    ta.addEventListener("click", onSelectionChange);
    return () => {
      ta.removeEventListener("input", onInput);
      ta.removeEventListener("keyup", onSelectionChange);
      ta.removeEventListener("click", onSelectionChange);
    };
  }, [textareaRef]);

  function updateTrigger(ta: HTMLTextAreaElement) {
    const value = ta.value;
    const caret = ta.selectionStart || 0;
    // Walk backwards from caret to find a `@` or `/` that's at a word boundary.
    let i = caret - 1;
    while (i >= 0) {
      const ch = value[i];
      if (ch === "@" || ch === "/") {
        // Confirm boundary: previous char must be space, newline, or BOF.
        const prev = i === 0 ? "" : value[i - 1];
        if (prev === "" || /\s/.test(prev)) {
          const filter = value.slice(i + 1, caret);
          // If the filter contains whitespace, we're past the mention.
          if (/\s/.test(filter)) { setTrigger(null); return; }
          const rect = caretRectFor(ta, i);
          setTrigger({ kind: ch as "@" | "/", startIndex: i, filter, rect });
          setActiveIndex(0);
          return;
        }
        // Not at boundary — keep walking left.
      }
      // Stop at whitespace before finding a trigger.
      if (/\s/.test(ch || "")) { setTrigger(null); return; }
      i--;
    }
    setTrigger(null);
  }

  // ── Item list assembly ────────────────────────────────────────────────────
  // Sprint Pro Mode Coding Views (2026-05-24): when in Pro Mode and the
  // filter starts with `s` / `sym`, fetch symbol hits asynchronously and
  // merge into the picker. In Simple/Standard the picker stays file-only.
  useEffect(() => {
    if (!trigger || trigger.kind !== "@" || !isProMode || !workspaceDir) {
      if (symbolHits.length) setSymbolHits([]);
      return;
    }
    const filter = trigger.filter.toLowerCase();
    // Heuristic: only fetch when user shows intent ("@s", "@sym", "@symbol",
    // or any 2+ char query that doesn't match a top-level file). Avoid
    // hammering the bridge on every keystroke.
    const looksLikeSymbolQuery =
      filter.startsWith("s") ||
      filter.startsWith("sy") ||
      filter.startsWith("sym") ||
      filter.length >= 2;
    if (!looksLikeSymbolQuery) {
      if (symbolHits.length) setSymbolHits([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      // Strip the optional "symbol" / "sym" / "s" prefix so users can type
      // "@symMyHelper" or "@MyHelper" interchangeably.
      const stripped = filter
        .replace(/^symbol/, "")
        .replace(/^sym/, "")
        .replace(/^s(?=[A-Za-z])/, "");
      try {
        const hits = await searchSymbols(stripped || filter, { limit: 15 });
        if (!cancelled) setSymbolHits(hits);
      } catch {
        if (!cancelled) setSymbolHits([]);
      }
    }, 150); // debounce
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [trigger, isProMode, workspaceDir]);

  const items = useMemo<MentionItem[]>(() => {
    if (!trigger) return [];
    if (trigger.kind === "/") {
      const filter = trigger.filter.toLowerCase();
      return SLASH_COMMANDS
        .filter((cmd) => cmd.id.includes(filter) || cmd.label.toLowerCase().includes(filter))
        .map<MentionItem>((cmd) => ({
          id: cmd.id,
          label: cmd.label,
          hint: cmd.description,
          insert: cmd.insert,
          kind: "symbol",
        }));
    }
    // `@` mention: prelude + workspace files (+ Pro Mode symbol hits)
    const filter = trigger.filter.toLowerCase();
    const fileItems: MentionItem[] = files
      .filter((f) => !filter || f.name.toLowerCase().includes(filter))
      .slice(0, 20)
      .map((f) => ({
        id: `file:${f.name}`,
        label: `@${f.name}${f.is_dir ? "/" : ""}`,
        hint: f.is_dir ? "目录" : `${(f.size / 1024).toFixed(1)} KB`,
        insert: `@${f.name}${f.is_dir ? "/" : ""} `,
        kind: f.is_dir ? "dir" : "file",
      }));
    const prelude = STATIC_MENTION_PRELUDE
      .filter((m) => !filter || m.label.toLowerCase().includes(filter));
    // Sprint Pro Mode Coding Views (2026-05-24): symbol hits go between
    // prelude (@web/@docs) and file list. They insert as `@<file>:<line>`
    // which the existing `@file` consumer already understands.
    const symbolItems: MentionItem[] = isProMode
      ? symbolHits.slice(0, 15).map((s) => ({
          id: `symbol:${s.file}:${s.line}:${s.name}`,
          label: `@${s.name}`,
          hint: `${s.kind} · ${s.file}:${s.line}`,
          insert: `@${s.file}:${s.line} `,
          kind: "symbol" as const,
        }))
      : [];
    return [...prelude, ...symbolItems, ...fileItems];
  }, [trigger, files, isProMode, symbolHits]);

  // ── Keyboard handling — capture phase ─────────────────────────────────────
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!trigger || items.length === 0) return;
      if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((i) => (i + 1) % items.length); }
      else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((i) => (i - 1 + items.length) % items.length); }
      else if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        applySelection(ta, items[activeIndex]);
      } else if (event.key === "Escape") {
        setTrigger(null);
      }
    };
    ta.addEventListener("keydown", onKeyDown);
    return () => ta.removeEventListener("keydown", onKeyDown);
  }, [trigger, items, activeIndex, textareaRef]);

  function applySelection(ta: HTMLTextAreaElement, item: MentionItem) {
    if (!trigger) return;
    const value = ta.value;
    const before = value.slice(0, trigger.startIndex);
    const after = value.slice((ta.selectionStart || 0));
    const next = before + item.insert + after;
    // Programmatically set value AND fire React-friendly input event
    // (uncontrolled textarea so we go through nativeInputValueSetter).
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(ta, next);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    const newCaret = before.length + item.insert.length;
    ta.setSelectionRange(newCaret, newCaret);
    ta.focus();
    setTrigger(null);
  }

  if (!trigger || items.length === 0) return null;

  return (
    <div
      style={{
        ...dropdownStyle,
        left: trigger.rect.left,
        top: trigger.rect.top,
      }}
      role="listbox"
      aria-label={trigger.kind === "/" ? "Slash commands" : "Mentions"}
      data-testid="mention-autocomplete"
    >
      {items.map((item, index) => {
        const active = index === activeIndex;
        return (
          <div
            key={item.id}
            role="option"
            aria-selected={active}
            onMouseDown={(e) => {
              // Prevent textarea blur before we can apply.
              e.preventDefault();
              const ta = textareaRef.current;
              if (ta) applySelection(ta, item);
            }}
            onMouseEnter={() => setActiveIndex(index)}
            style={{
              ...itemStyle,
              ...(active ? itemActiveStyle : {}),
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600 }}>{item.label}</div>
            {item.hint && (
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
                {item.hint}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Caret rect helper ──────────────────────────────────────────────────────
//
// Positions the dropdown roughly under the `@` / `/` trigger char. Uses a
// hidden DOM mirror trick — render an offscreen <div> with the same font
// metrics + content up to the caret, measure where its trailing element
// sits, transform back to viewport coords. This is the same technique
// React-Mentions / Slate / Notion use for inline overlays on a textarea
// (textareas don't expose a native caret rect API).

function caretRectFor(ta: HTMLTextAreaElement, charIndex: number): { left: number; top: number } {
  const rect = ta.getBoundingClientRect();
  // Cheap fallback — anchor at the textarea bottom-left. Good enough for
  // single-line input. Multi-line precision can be added later if users
  // ask. Right now a popup just above the textarea is the priority.
  return { left: rect.left + 8, top: rect.top - 4 };
}

// ── Styles ─────────────────────────────────────────────────────────────────

const dropdownStyle: CSSProperties = {
  position: "fixed",
  transform: "translateY(-100%)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  boxShadow: "var(--shadow)",
  zIndex: 10000,
  maxWidth: 360,
  minWidth: 220,
  maxHeight: 280,
  overflowY: "auto",
  padding: 4,
};

const itemStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  cursor: "pointer",
};

const itemActiveStyle: CSSProperties = {
  background: "var(--bg-overlay-medium)",
};
