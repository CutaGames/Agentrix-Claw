import { useState, useEffect, useRef, useCallback, type KeyboardEvent as ReactKBEvent } from "react";
import { useAuthStore, streamDirectChat } from "../services/store";

const MAX_PREVIEW_MESSAGES = 4;
const SESSION_ID = `spotlight-${Date.now()}`;

interface SpotlightMessage {
  role: "user" | "assistant";
  content: string;
}

const QUICK_COMMANDS: Record<string, { label: string; prefix: string }> = {
  "@file": { label: "Read file", prefix: "Read the following file and explain:\n" },
  "@web": { label: "Web search", prefix: "Search the web for:\n" },
  "@translate": { label: "Translate", prefix: "Translate the following to English:\n" },
  "@summarize": { label: "Summarize", prefix: "Summarize concisely:\n" },
  "@explain": { label: "Explain", prefix: "Explain this code/text:\n" },
};

export default function SpotlightPanel() {
  const { token } = useAuthStore();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<SpotlightMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  const expanded = messages.length > 0 || streaming;

  const consumeSeedText = useCallback(() => {
    const seeded = localStorage.getItem("agentrix_spotlight_seed_text");
    if (!seeded || !seeded.trim()) return;
    setInput(seeded);
    localStorage.removeItem("agentrix_spotlight_seed_text");
  }, []);

  // Auto-focus input on mount and on spotlight-focus event
  useEffect(() => {
    inputRef.current?.focus();
    consumeSeedText();
    const onFocus = () => inputRef.current?.focus();
    const onStorage = (event: StorageEvent) => {
      if (event.key === "agentrix_spotlight_seed_text" && typeof event.newValue === "string") {
        setInput(event.newValue);
      }
    };
    window.addEventListener("agentrix:spotlight-focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("agentrix:spotlight-focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [consumeSeedText]);

  // Grab selected text from foreground app
  useEffect(() => {
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const text = await invoke<string | null>("desktop_bridge_get_selected_text");
        if (text && text.trim().length >= 2) {
          setSelectedText(text.trim());
        }
      } catch {}
    })();
  }, []);

  // Handle file drop
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlisten = await win.onDragDropEvent((event) => {
          if (event.payload.type === "drop" && event.payload.paths.length > 0) {
            const path = event.payload.paths[0];
            setInput((prev) => prev ? `${prev}\n[File: ${path}]` : `@file ${path}`);
            inputRef.current?.focus();
          }
        });
      } catch {}
    })();
    return () => unlisten?.();
  }, []);

  // Esc to close, blur to close
  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") closeSpotlight();
    };
    window.addEventListener("keydown", handleKey);

    const handleBlur = () => {
      // Small delay so clicks inside the panel don't trigger close
      setTimeout(() => {
        if (!document.hasFocus()) closeSpotlight();
      }, 200);
    };
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
  }, [messages]);

  // @ command suggestions
  useEffect(() => {
    if (input.startsWith("@") && !input.includes(" ")) {
      const matching = Object.keys(QUICK_COMMANDS).filter((k) => k.startsWith(input));
      setSuggestions(matching);
    } else {
      setSuggestions([]);
    }
  }, [input]);

  const closeSpotlight = useCallback(async () => {
    abortRef.current?.abort();
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_bridge_close_spotlight");
    } catch {}
  }, []);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    // Resolve @ prefix commands
    let finalContent = trimmed;
    for (const [cmd, { prefix }] of Object.entries(QUICK_COMMANDS)) {
      if (trimmed.startsWith(cmd + " ")) {
        finalContent = prefix + trimmed.slice(cmd.length + 1);
        break;
      }
    }

    // Prepend selected text context if available and this is the first message
    if (selectedText && messages.length === 0) {
      finalContent = `Context (selected text):\n\`\`\`\n${selectedText}\n\`\`\`\n\n${finalContent}`;
      setSelectedText(null);
    }

    const userMsg: SpotlightMessage = { role: "user", content: trimmed };
    const updated = [...messages, userMsg].slice(-MAX_PREVIEW_MESSAGES);
    setMessages(updated);
    setInput("");
    setStreaming(true);

    const assistantMsg: SpotlightMessage = { role: "assistant", content: "" };
    let accumulated = "";

    const apiMessages = [...updated].map((m) => ({
      role: m.role,
      content: m === userMsg ? finalContent : m.content,
    }));

    abortRef.current = streamDirectChat({
      messages: apiMessages,
      sessionId: SESSION_ID,
      token: token || "",
      onChunk: (chunk) => {
        accumulated += chunk;
        setMessages((prev) => {
          const copy = [...prev];
          const lastIdx = copy.length - 1;
          if (lastIdx >= 0 && copy[lastIdx].role === "assistant") {
            copy[lastIdx] = { ...copy[lastIdx], content: accumulated };
          } else {
            copy.push({ ...assistantMsg, content: accumulated });
          }
          return copy.slice(-MAX_PREVIEW_MESSAGES);
        });
      },
      onDone: () => {
        setStreaming(false);
        // Ensure final message is stored
        setMessages((prev) => {
          const copy = [...prev];
          if (copy.length > 0 && copy[copy.length - 1].role !== "assistant") {
            copy.push({ role: "assistant", content: accumulated });
          }
          return copy.slice(-MAX_PREVIEW_MESSAGES);
        });
      },
      onError: (err) => {
        setStreaming(false);
        setMessages((prev) => [
          ...prev,
          { role: "assistant" as const, content: `Error: ${err}` },
        ].slice(-MAX_PREVIEW_MESSAGES));
      },
    });

    // Add the assistant placeholder
    setMessages((prev) => [...prev, assistantMsg].slice(-MAX_PREVIEW_MESSAGES));
  }, [input, streaming, messages, token, selectedText]);

  const handleKeyDown = (e: ReactKBEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const applySuggestion = (cmd: string) => {
    setInput(cmd + " ");
    setSuggestions([]);
    inputRef.current?.focus();
  };

  return (
    <div style={styles.root}>
      <div style={{ ...styles.container, height: expanded ? 400 : 60 }}>
        {/* Selected text banner */}
        {selectedText && messages.length === 0 && (
          <div style={styles.contextBanner}>
            <span style={styles.contextIcon}>📋</span>
            <span style={styles.contextText}>
              {selectedText.length > 60 ? selectedText.slice(0, 60) + "…" : selectedText}
            </span>
            <button style={styles.contextClose} onClick={() => setSelectedText(null)}>✕</button>
          </div>
        )}

        {/* Messages area (visible when expanded) */}
        {expanded && (
          <div ref={messagesRef} style={styles.messages}>
            {messages.map((m, i) => (
              <div
                key={i}
                style={m.role === "user" ? styles.userMsg : styles.assistantMsg}
              >
                <div style={styles.msgContent}>
                  {m.content || (streaming && i === messages.length - 1 ? "⏳" : "")}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* @ command suggestions */}
        {suggestions.length > 0 && (
          <div style={styles.suggestions}>
            {suggestions.map((cmd) => (
              <button
                key={cmd}
                style={styles.suggestionItem}
                onClick={() => applySuggestion(cmd)}
              >
                <span>{cmd}</span>
                <span style={styles.suggestionLabel}>
                  {QUICK_COMMANDS[cmd]?.label}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Input bar */}
        <div style={styles.inputBar}>
          <span style={styles.searchIcon}>⌘K</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedText ? "Ask about the selected text…" : "Ask Agentrix anything…"}
            style={styles.input}
            autoFocus
          />
          {streaming ? (
            <button
              style={styles.stopBtn}
              onClick={() => abortRef.current?.abort()}
            >
              ■
            </button>
          ) : (
            <button
              style={{ ...styles.sendBtn, opacity: input.trim() ? 1 : 0.4 }}
              onClick={sendMessage}
              disabled={!input.trim()}
            >
              ↵
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: "100vw",
    height: "100vh",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: 0,
    background: "transparent",
  },
  container: {
    width: "100%",
    maxWidth: 600,
    background: "rgba(24, 24, 30, 0.96)",
    backdropFilter: "blur(24px)",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    transition: "height 0.2s ease",
  },
  contextBanner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 16px",
    background: "rgba(108, 92, 231, 0.12)",
    borderBottom: "1px solid rgba(108, 92, 231, 0.2)",
    fontSize: 13,
    color: "#A29BFE",
  },
  contextIcon: { fontSize: 14 },
  contextText: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  contextClose: {
    background: "none",
    border: "none",
    color: "#888",
    cursor: "pointer",
    fontSize: 14,
    padding: 2,
  },
  messages: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  userMsg: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    background: "rgba(108, 92, 231, 0.2)",
    borderRadius: 12,
    padding: "8px 12px",
  },
  assistantMsg: {
    alignSelf: "flex-start",
    maxWidth: "85%",
    background: "var(--bg-overlay-light)",
    borderRadius: 12,
    padding: "8px 12px",
  },
  msgContent: {
    fontSize: 14,
    lineHeight: "1.5",
    color: "#E8E8EA",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  },
  suggestions: {
    padding: "4px 16px 8px",
    display: "flex",
    gap: 6,
    flexWrap: "wrap" as const,
  },
  suggestionItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    background: "var(--bg-overlay-light)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "#CCC",
    fontSize: 13,
    cursor: "pointer",
  },
  suggestionLabel: {
    color: "#888",
    fontSize: 12,
  },
  inputBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },
  searchIcon: {
    fontSize: 12,
    color: "#666",
    background: "var(--bg-overlay-medium)",
    borderRadius: 4,
    padding: "2px 6px",
    fontFamily: "monospace",
    flexShrink: 0,
  },
  input: {
    flex: 1,
    background: "none",
    border: "none",
    outline: "none",
    color: "#E8E8EA",
    fontSize: 15,
    fontFamily: "inherit",
  },
  sendBtn: {
    background: "linear-gradient(135deg, #6C5CE7, #A29BFE)",
    border: "none",
    borderRadius: 8,
    color: "#FFF",
    width: 32,
    height: 32,
    fontSize: 16,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stopBtn: {
    background: "#E74C3C",
    border: "none",
    borderRadius: 8,
    color: "#FFF",
    width: 32,
    height: 32,
    fontSize: 14,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
};
