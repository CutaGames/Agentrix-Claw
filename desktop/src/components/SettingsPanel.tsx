import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { useAuthStore } from "../services/store";
import { pickWorkspaceFolder, getWorkspaceDir, setWorkspaceDir as saveWorkspaceDir } from "../services/workspace";
import { readDesktopWakeWordConfig, resetDesktopWakeWordConfig, saveDesktopWakeWordConfig } from "../services/wakeWordConfig";
import { LocalModelManager, type LocalModelDownloadEvent } from "../services/localLLM";

interface ModelOption {
  id: string;
  label?: string;
}

interface Props {
  ttsEnabled: boolean;
  onTtsToggle: (v: boolean) => void;
  onClose: () => void;
  models?: ModelOption[];
  selectedModel?: string;
  onModelChange?: (id: string) => void;
}

export default function SettingsPanel({ ttsEnabled, onTtsToggle, onClose, models = [], selectedModel = "", onModelChange }: Props) {
  const { user, logout } = useAuthStore();
  const [autoStart, setAutoStart] = useState(true);
  const [workspaceDir, setWorkspaceDir] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceInput, setWorkspaceInput] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">(() => (localStorage.getItem("agentrix_theme") as "dark" | "light") || "dark");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "available" | "downloading" | "up-to-date" | "error">("idle");
  const [updateVersion, setUpdateVersion] = useState("");
  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const [wakeWordAccessKey, setWakeWordAccessKey] = useState("");
  const [wakeWordBuiltInKeyword, setWakeWordBuiltInKeyword] = useState("picovoice");
  const [wakeWordCustomKeywordPath, setWakeWordCustomKeywordPath] = useState("");
  const [wakeWordDisplayName, setWakeWordDisplayName] = useState("Picovoice");
  const [wakeWordSensitivity, setWakeWordSensitivity] = useState("0.65");
  const [wakeWordStatus, setWakeWordStatus] = useState("");

  useEffect(() => {
    const config = readDesktopWakeWordConfig();
    setWakeWordEnabled(config.enabled);
    setWakeWordAccessKey(config.accessKey);
    setWakeWordBuiltInKeyword(config.builtInKeyword);
    setWakeWordCustomKeywordPath(config.customKeywordPath);
    setWakeWordDisplayName(config.displayName);
    setWakeWordSensitivity(String(config.sensitivity));

    getWorkspaceDir()
      .then((dir) => {
        setWorkspaceDir(dir);
        setWorkspaceInput(dir || "");
      })
      .catch(() => {});
  }, []);

  const handlePickWorkspace = async () => {
    setWorkspaceError(null);
    try {
      const dir = await pickWorkspaceFolder();
      if (dir) {
        setWorkspaceDir(dir);
        setWorkspaceInput(dir);
        window.dispatchEvent(new CustomEvent("agentrix:workspace-changed"));
      }
    } catch (error: any) {
      setWorkspaceError(error?.message || "Failed to select a workspace folder.");
    }
  };

  const handleSaveWorkspacePath = async () => {
    const trimmed = workspaceInput.trim();
    if (!trimmed) {
      setWorkspaceError("Enter a workspace path first.");
      return;
    }

    setWorkspaceError(null);
    try {
      const dir = await saveWorkspaceDir(trimmed);
      setWorkspaceDir(dir);
      setWorkspaceInput(dir);
      window.dispatchEvent(new CustomEvent("agentrix:workspace-changed"));
    } catch (error: any) {
      setWorkspaceError(error?.message || "Failed to save the workspace path.");
    }
  };

  const handleToggleTheme = (light: boolean) => {
    const next = light ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("agentrix_theme", next);
  };

  const handleToggleAutoStart = async (enabled: boolean) => {
    setAutoStart(enabled);
    try {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      if (enabled) await enable();
      else await disable();
    } catch {
      // Not in Tauri
    }
  };

  const handleCheckUpdate = useCallback(async () => {
    setUpdateStatus("checking");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        setUpdateStatus("available");
        setUpdateVersion(update.version);
      } else {
        setUpdateStatus("up-to-date");
      }
    } catch {
      setUpdateStatus("error");
    }
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    setUpdateStatus("downloading");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        await update.downloadAndInstall();
        // Relaunch after install
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      }
    } catch {
      setUpdateStatus("error");
    }
  }, []);

  const handleSaveWakeWord = () => {
    const saved = saveDesktopWakeWordConfig({
      enabled: wakeWordEnabled,
      accessKey: wakeWordAccessKey,
      builtInKeyword: wakeWordBuiltInKeyword,
      customKeywordPath: wakeWordCustomKeywordPath,
      displayName: wakeWordDisplayName,
      sensitivity: Number(wakeWordSensitivity) || 0.65,
    });
    setWakeWordSensitivity(String(saved.sensitivity));
    setWakeWordStatus(saved.accessKey ? `Saved. Active keyword: ${saved.displayName}` : "Saved. Add an access key to enable wake-word listening.");
  };

  const handleResetWakeWord = () => {
    const reset = resetDesktopWakeWordConfig();
    setWakeWordEnabled(reset.enabled);
    setWakeWordAccessKey(reset.accessKey);
    setWakeWordBuiltInKeyword(reset.builtInKeyword);
    setWakeWordCustomKeywordPath(reset.customKeywordPath);
    setWakeWordDisplayName(reset.displayName);
    setWakeWordSensitivity(String(reset.sensitivity));
    setWakeWordStatus("Reset. Runtime config now falls back to packaged env/window defaults.");
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Settings</h3>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {/* User info */}
        {user && (
          <div style={section}>
            <div style={sectionTitle}>Account</div>
            <div style={{ fontSize: 13, color: "var(--text)" }}>
              {user.email || user.username || "User"}
            </div>
          </div>
        )}

        {/* Voice settings */}
        <div style={section}>
          <div style={sectionTitle}>Voice</div>
          <ToggleRow
            label="Auto-play TTS responses"
            value={ttsEnabled}
            onChange={onTtsToggle}
          />
        </div>

        <div style={section}>
          <div style={sectionTitle}>Wake Word</div>
          <ToggleRow
            label="Enable wake-word listening"
            value={wakeWordEnabled}
            onChange={setWakeWordEnabled}
          />
          <div style={fieldStack}>
            <input
              value={wakeWordAccessKey}
              onChange={(event) => setWakeWordAccessKey(event.target.value)}
              placeholder="Picovoice access key"
              style={workspaceInputStyle}
            />
            <input
              value={wakeWordDisplayName}
              onChange={(event) => setWakeWordDisplayName(event.target.value)}
              placeholder="Wake-word label, e.g. Hey Agentrix"
              style={workspaceInputStyle}
            />
            <input
              value={wakeWordBuiltInKeyword}
              onChange={(event) => setWakeWordBuiltInKeyword(event.target.value)}
              placeholder="Built-in keyword"
              style={workspaceInputStyle}
            />
            <input
              value={wakeWordCustomKeywordPath}
              onChange={(event) => setWakeWordCustomKeywordPath(event.target.value)}
              placeholder="Custom .ppn path (takes priority when filled)"
              style={workspaceInputStyle}
            />
            <input
              value={wakeWordSensitivity}
              onChange={(event) => setWakeWordSensitivity(event.target.value)}
              placeholder="0.65"
              style={workspaceInputStyle}
            />
          </div>
          <div style={{ display: "flex", gap: 8, paddingTop: 8 }}>
            <button onClick={handleSaveWakeWord} style={{ ...kbdStyle, cursor: "pointer", border: "1px solid var(--border)", flex: 1 }}>
              Save Wake Word
            </button>
            <button onClick={handleResetWakeWord} style={{ ...kbdStyle, cursor: "pointer", border: "1px solid var(--border)", flex: 1 }}>
              Reset
            </button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", paddingTop: 6 }}>
            Fill a custom `.ppn` path to use your own wake word. Leave it empty to use the built-in keyword.
          </div>
          {wakeWordStatus ? <div style={{ fontSize: 11, color: "var(--accent-light)", paddingTop: 4 }}>{wakeWordStatus}</div> : null}
        </div>

        {/* Appearance */}
        <div style={section}>
          <div style={sectionTitle}>Appearance</div>
          <ToggleRow
            label="Light mode"
            value={theme === "light"}
            onChange={handleToggleTheme}
          />
        </div>

        {/* AI Model */}
        {models.length > 0 && (
          <div style={section}>
            <div style={sectionTitle}>AI Model</div>
            <select
              value={selectedModel}
              onChange={(e) => onModelChange?.(e.target.value)}
              style={{
                width: "100%",
                background: "var(--bg-dark)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 12,
                cursor: "pointer",
                outline: "none",
              }}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label || m.id}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* System settings */}
        <div style={section}>
          <div style={sectionTitle}>System</div>
          <ToggleRow
            label="Start on login"
            value={autoStart}
            onChange={handleToggleAutoStart}
          />
        </div>

        {/* Hotkeys */}
        <div style={section}>
          <div style={sectionTitle}>Shortcuts</div>
          <div style={hotkeyRow}>
            <span>Voice</span>
            <kbd style={kbdStyle}>Ctrl+Shift+A</kbd>
          </div>
          <div style={hotkeyRow}>
            <span>Panel</span>
            <kbd style={kbdStyle}>Ctrl+Shift+S</kbd>
          </div>
        </div>

        {/* Workspace / Coding Agent */}
        <div style={section}>
          <div style={sectionTitle}>Workspace (Coding Agent)</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {workspaceDir ? (
                <div style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  📁 {workspaceDir}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>No workspace selected</div>
              )}
            </div>
            <button onClick={handlePickWorkspace} style={{ ...kbdStyle, cursor: "pointer", border: "1px solid var(--border)" }}>
              {workspaceDir ? "Change" : "Select Folder"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, paddingTop: 6 }}>
            <input
              value={workspaceInput}
              onChange={(event) => setWorkspaceInput(event.target.value)}
              placeholder="Paste workspace path, e.g. D:\\wsl\\Ubuntu-24.04\\Code\\Agentrix\\Agentrix-website"
              style={workspaceInputStyle}
            />
            <button onClick={handleSaveWorkspacePath} style={{ ...kbdStyle, cursor: "pointer", border: "1px solid var(--border)", whiteSpace: "nowrap" }}>
              Use Path
            </button>
          </div>
          {workspaceError ? (
            <div style={{ fontSize: 11, color: "#f87171", padding: "2px 0" }}>{workspaceError}</div>
          ) : null}
          <div style={{ fontSize: 11, color: "var(--text-dim)", padding: "2px 0" }}>
            Agent can read/edit files in this folder for coding tasks. If Select Folder fails, paste the path manually.
          </div>
        </div>

        {/* Local Models */}
        <LocalModelSection />

        {/* Version & Update */}
        <div style={{ ...section, borderBottom: "none" }}>
          <div style={sectionTitle}>About</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Agentrix Desktop v0.1.0</span>
            {updateStatus === "idle" && (
              <button onClick={handleCheckUpdate} style={{ ...kbdStyle, cursor: "pointer", border: "1px solid var(--border)" }}>
                Check for Updates
              </button>
            )}
            {updateStatus === "checking" && (
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Checking...</span>
            )}
            {updateStatus === "up-to-date" && (
              <span style={{ fontSize: 11, color: "#4ade80" }}>✓ Up to date</span>
            )}
            {updateStatus === "available" && (
              <button onClick={handleInstallUpdate} style={{ ...kbdStyle, cursor: "pointer", border: "1px solid var(--accent)", color: "var(--accent)" }}>
                Update to {updateVersion}
              </button>
            )}
            {updateStatus === "downloading" && (
              <span style={{ fontSize: 11, color: "var(--accent-light)" }}>Downloading...</span>
            )}
            {updateStatus === "error" && (
              <button onClick={handleCheckUpdate} style={{ ...kbdStyle, cursor: "pointer", border: "1px solid var(--border)" }}>
                Retry
              </button>
            )}
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={() => {
            logout();
            onClose();
          }}
          style={logoutBtn}
        >
          Log Out
        </button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          border: "none",
          background: value ? "var(--accent)" : "rgba(255,255,255,0.12)",
          position: "relative",
          cursor: "pointer",
          transition: "background 0.2s",
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "white",
            position: "absolute",
            top: 3,
            left: value ? 21 : 3,
            transition: "left 0.2s",
          }}
        />
      </button>
    </div>
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const panel: CSSProperties = {
  width: 320,
  maxHeight: "80vh",
  background: "var(--bg-panel)",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow)",
  padding: "20px 24px",
  overflowY: "auto",
};

const closeBtn: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  background: "transparent",
  color: "var(--text-dim)",
  border: "none",
  cursor: "pointer",
  fontSize: 13,
};

const section: CSSProperties = {
  padding: "10px 0",
  borderBottom: "1px solid var(--border)",
};

const sectionTitle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-dim)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 8,
};

const hotkeyRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "4px 0",
  fontSize: 13,
};

const kbdStyle: CSSProperties = {
  background: "var(--bg-dark)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "2px 8px",
  fontSize: 11,
  fontFamily: "monospace",
  color: "var(--accent-light)",
};

const fieldStack: CSSProperties = {
  display: "grid",
  gap: 8,
  paddingTop: 8,
};

const workspaceInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: "var(--bg-dark)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 11,
  color: "var(--text)",
};

const logoutBtn: CSSProperties = {
  width: "100%",
  padding: "10px",
  background: "rgba(239, 68, 68, 0.1)",
  color: "#f87171",
  border: "1px solid rgba(239, 68, 68, 0.2)",
  borderRadius: "var(--radius-sm)",
  fontSize: 13,
  cursor: "pointer",
  marginTop: 8,
};

function LocalModelSection() {
  const [models, setModels] = useState<Array<{ name: string; path: string; sizeBytes: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [manager] = useState(() => new LocalModelManager("models"));
  const [activeModelPath, setActiveModelPath] = useState<string | null>(() => {
    try { return localStorage.getItem("agentrix_local_model_path") || null; } catch { return null; }
  });
  const [sidecarStatus, setSidecarStatus] = useState<string>("stopped");
  const [sidecarRef] = useState(() => {
    const { LocalLLMSidecar } = require("../services/localLLM") as typeof import("../services/localLLM");
    return new LocalLLMSidecar((s) => setSidecarStatus(s));
  });

  const RECOMMENDED_MODELS = [
    {
      id: "gemma-2-2b",
      name: "Gemma 2 2B (Q4_K_M)",
      size: "1.7 GB",
      sizeBytes: 1.7e9,
      fileName: "gemma-2-2b-it-Q4_K_M.gguf",
      url: "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf?download=true",
      matchTerms: ["gemma-2-2b-it-q4_k_m", "gemma-2-2b"],
      desc: "入门本地模型，适合轻薄本和低功耗设备。",
    },
    {
      id: "gemma-3-4b",
      name: "Gemma 3 4B (Q4_0)",
      size: "3.0 GB",
      sizeBytes: 3.0e9,
      fileName: "model.gguf",
      url: "https://huggingface.co/google/gemma-3-4b-it-qat-q4_0-gguf/resolve/main/model.gguf?download=true",
      matchTerms: ["gemma-3-4b", "model.gguf"],
      desc: "质量更高，适合 8GB 以上内存的日常本地问答。",
    },
    {
      id: "gemma-2-27b",
      name: "Gemma 2 27B (Q4_K_M)",
      size: "16.4 GB",
      sizeBytes: 16.4e9,
      fileName: "gemma-2-27b-it-Q4_K_M.gguf",
      url: "https://huggingface.co/bartowski/gemma-2-27b-it-GGUF/resolve/main/gemma-2-27b-it-Q4_K_M.gguf?download=true",
      matchTerms: ["gemma-2-27b-it-q4_k_m", "gemma-2-27b"],
      desc: "工作站档位，本机直接跑复杂推理，建议 32GB+ RAM。",
    },
    {
      id: "gemma-4-31b",
      name: "Gemma 4 31B (Custom URL)",
      size: "30 GB+",
      sizeBytes: 30e9,
      fileName: "gemma-4-31b-it-Q4_K_M.gguf",
      url: "https://huggingface.co/QuantFactory/gemma-4-31b-it-GGUF/resolve/main/gemma-4-31b-it-Q4_K_M.gguf?download=true",
      matchTerms: ["gemma-4-31b-it-q4_k_m", "gemma-4-31b"],
      desc: "高端台式机/服务器工作站档位，跳过云端直接本机工作。",
    },
  ];

  const refreshModels = useCallback(async () => {
    try {
      const list = await manager.listModels();
      setModels(list);
    } catch {
      // Tauri bridge not available (dev mode)
    }
  }, [manager]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await manager.listModels();
        if (!cancelled) setModels(list);
      } catch {
        // Tauri bridge not available (dev mode)
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [manager]);

  const formatSize = (bytes: number) => {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
    return `${(bytes / 1e3).toFixed(0)} KB`;
  };

  const handleDownload = async (modelId: string) => {
    const target = RECOMMENDED_MODELS.find((item) => item.id === modelId);
    if (!target) return;

    setDownloadingId(modelId);
    setDownloadProgress(0);
    setDownloadMessage(null);

    try {
      await manager.downloadModel({
        modelId: target.id,
        url: target.url,
        fileName: target.fileName,
        onProgress: (event: LocalModelDownloadEvent) => {
          if (event.status === "error") {
            setDownloadMessage(event.message || "模型下载失败");
            return;
          }

          if (typeof event.progress === "number") {
            setDownloadProgress(Math.max(0, Math.min(100, Math.round(event.progress))));
          }

          if (event.status === "started") {
            setDownloadMessage("开始下载模型…");
          } else if (event.status === "progress" && event.totalBytes) {
            setDownloadMessage(`${formatSize(event.downloadedBytes)} / ${formatSize(event.totalBytes)}`);
          } else if (event.status === "completed") {
            setDownloadMessage("模型下载完成");
          }
        },
      });

      await refreshModels();
    } catch (error: any) {
      setDownloadMessage(error?.message || "模型下载失败");
    } finally {
      setDownloadingId(null);
    }
  };

  const isModelDownloaded = (modelId: string) => {
    const target = RECOMMENDED_MODELS.find((item) => item.id === modelId);
    if (!target) return false;

    return models.some((model) => {
      const lowerName = model.name.toLowerCase();
      return target.matchTerms.some((term) => lowerName.includes(term.toLowerCase()));
    });
  };

  return (
    <div style={section}>
      <div style={sectionTitle}>Local Models (端侧 AI)</div>

      {/* Tri-tier explanation */}
      <div style={{ fontSize: 11, color: "var(--text-dim)", padding: "4px 0", lineHeight: "16px" }}>
        📱 Local → ☁️ Cloud API → 🧠 Ultra. Download a local model for offline inference, faster wake word detection, and privacy filtering.
      </div>

      {/* Recommended models */}
      <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
        {RECOMMENDED_MODELS.map((rm) => {
          const downloaded = isModelDownloaded(rm.id);
          const isDownloading = downloadingId === rm.id;
          return (
            <div key={rm.id} style={{
              padding: "10px 12px", borderRadius: 8,
              background: downloaded ? "rgba(16,185,129,0.06)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${downloaded ? "rgba(16,185,129,0.3)" : "var(--border)"}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: downloaded ? "#10B981" : "var(--text)" }}>
                    {rm.name} {downloaded ? "✅" : ""}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>{rm.desc}</div>
                </div>
                {downloaded ? (
                  <div style={{ fontSize: 10, color: "#10B981", fontWeight: 600 }}>Active</div>
                ) : isDownloading ? (
                  <div style={{ fontSize: 10, color: "#3B82F6", fontWeight: 600, minWidth: 40, textAlign: "right" }}>
                    {downloadProgress}%
                  </div>
                ) : (
                  <button
                    onClick={() => { void handleDownload(rm.id); }}
                    style={{
                      padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(59,130,246,0.3)",
                      background: "rgba(59,130,246,0.1)", color: "#3B82F6", fontSize: 10,
                      fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    ⬇ {rm.size}
                  </button>
                )}
              </div>
              {isDownloading && (
                <>
                  <div style={{
                    height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2,
                    marginTop: 6, overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%", width: `${downloadProgress}%`,
                      background: "#3B82F6", borderRadius: 2, transition: "width 0.3s",
                    }} />
                  </div>
                  {downloadMessage ? (
                    <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>{downloadMessage}</div>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>

      {downloadMessage && !downloadingId ? (
        <div style={{ fontSize: 11, color: downloadMessage.includes("失败") ? "#f87171" : "var(--text-dim)", marginTop: 8 }}>
          {downloadMessage}
        </div>
      ) : null}

      {/* Already downloaded models — select & launch */}
      {loading ? (
        <div style={{ fontSize: 11, color: "var(--text-dim)", padding: "4px 0" }}>Scanning local models…</div>
      ) : models.length > 0 ? (
        <>
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Downloaded Models
          </div>
          {sidecarStatus !== "stopped" && (
            <div style={{ fontSize: 11, color: sidecarStatus === "running" ? "#10B981" : sidecarStatus === "error" ? "#f87171" : "#3B82F6", marginBottom: 4 }}>
              Sidecar: {sidecarStatus}{sidecarStatus === "running" ? " (localhost:8787)" : ""}
            </div>
          )}
          <div style={{ display: "grid", gap: 6 }}>
            {models.map((m) => {
              const isDefault = activeModelPath === m.path;
              return (
                <div key={m.path} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 8px", borderRadius: 6,
                  background: isDefault ? "rgba(16,185,129,0.06)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${isDefault ? "rgba(16,185,129,0.3)" : "var(--border)"}`,
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isDefault ? "#10B981" : "var(--text)" }}>
                      {isDefault ? "★ " : ""}{m.name}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{formatSize(m.sizeBytes)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    {!isDefault && (
                      <button
                        onClick={() => {
                          localStorage.setItem("agentrix_local_model_path", m.path);
                          setActiveModelPath(m.path);
                        }}
                        style={{
                          padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(16,185,129,0.3)",
                          background: "rgba(16,185,129,0.08)", color: "#10B981", fontSize: 10,
                          fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        Set Default
                      </button>
                    )}
                    {isDefault && sidecarStatus !== "running" && (
                      <button
                        onClick={async () => {
                          try {
                            await sidecarRef.start({ modelPath: m.path, contextSize: 4096, nGpuLayers: 0 });
                          } catch (err: any) {
                            setDownloadMessage(`Sidecar error: ${err?.message || "unknown"}`);
                          }
                        }}
                        disabled={sidecarStatus === "starting"}
                        style={{
                          padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(59,130,246,0.3)",
                          background: "rgba(59,130,246,0.1)", color: "#3B82F6", fontSize: 10,
                          fontWeight: 600, cursor: sidecarStatus === "starting" ? "default" : "pointer",
                          opacity: sidecarStatus === "starting" ? 0.5 : 1,
                        }}
                      >
                        {sidecarStatus === "starting" ? "Starting…" : "▶ Start"}
                      </button>
                    )}
                    {isDefault && sidecarStatus === "running" && (
                      <button
                        onClick={async () => { await sidecarRef.stop(); }}
                        style={{
                          padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(239,68,68,0.3)",
                          background: "rgba(239,68,68,0.08)", color: "#ef4444", fontSize: 10,
                          fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        ■ Stop
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
