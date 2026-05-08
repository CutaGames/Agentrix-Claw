import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { captureScreen, type ScreenCaptureResult } from "../../services/screenshot";
import {
  getWorkspaceCodeIndexSummary,
  indexWorkspaceCode,
  searchWorkspaceSymbols,
  semanticSearchWorkspaceCode,
  type WorkspaceCodeIndexSummary,
  type WorkspaceSemanticResult,
  type WorkspaceSymbol,
} from "../../services/codeIntelligence";
import {
  getWorkspaceDir,
  pickWorkspaceFolder,
  searchWorkspaceFiles,
  type WorkspaceSearchResult,
} from "../../services/workspace";
import {
  readDesktopWakeWordConfig,
  resetDesktopWakeWordConfig,
  saveDesktopWakeWordConfig,
  type DesktopWakeWordConfig,
} from "../../services/wakeWordConfig";

type SearchMode = "text" | "symbol" | "semantic";

interface Props {
  open: boolean;
  onClose: () => void;
  onAddSystemMessage: (content: string) => void;
}

export default function DeepOsPanel({ open, onClose, onAddSystemMessage }: Props) {
  const [config, setConfig] = useState<DesktopWakeWordConfig>(() => readDesktopWakeWordConfig());
  const [workspaceDir, setWorkspaceDir] = useState<string | null>(null);
  const [indexSummary, setIndexSummary] = useState<WorkspaceCodeIndexSummary | null>(() => getWorkspaceCodeIndexSummary());
  const [indexing, setIndexing] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>("semantic");
  const [query, setQuery] = useState("");
  const [screenCapture, setScreenCapture] = useState<ScreenCaptureResult | null>(null);
  const [runningCapture, setRunningCapture] = useState(false);
  const [textResults, setTextResults] = useState<WorkspaceSearchResult | null>(null);
  const [symbolResults, setSymbolResults] = useState<WorkspaceSymbol[]>([]);
  const [semanticResults, setSemanticResults] = useState<WorkspaceSemanticResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setConfig(readDesktopWakeWordConfig());
    setIndexSummary(getWorkspaceCodeIndexSummary());
    void getWorkspaceDir().then(setWorkspaceDir).catch(() => {});
  }, [open]);

  const canSaveWakeWord = useMemo(
    () => Boolean(config.accessKey.trim()),
    [config.accessKey],
  );

  if (!open) {
    return null;
  }

  const runCapture = async () => {
    setRunningCapture(true);
    try {
      const result = await captureScreen(true);
      setScreenCapture(result);
      onAddSystemMessage(`📸 Screen context updated (${result.width}×${result.height})${result.filePath ? `\nSaved: ${result.filePath}` : ""}`);
    } catch (error: any) {
      onAddSystemMessage(`❌ Screen capture failed: ${error?.message || String(error)}`);
    } finally {
      setRunningCapture(false);
    }
  };

  const handleSaveWakeWord = () => {
    const next = saveDesktopWakeWordConfig(config);
    setConfig(next);
    onAddSystemMessage(`🎤 Wake word updated: ${next.displayName || next.builtInKeyword}`);
  };

  const handleResetWakeWord = () => {
    const next = resetDesktopWakeWordConfig();
    setConfig(next);
    onAddSystemMessage("🎤 Wake word config reset.");
  };

  const handleChooseWorkspace = async () => {
    try {
      const selected = await pickWorkspaceFolder();
      setWorkspaceDir(selected);
      setIndexSummary(null);
      setTextResults(null);
      setSymbolResults([]);
      setSemanticResults([]);
      if (selected) {
        onAddSystemMessage(`📁 Workspace selected: ${selected}`);
      }
    } catch (error: any) {
      onAddSystemMessage(`❌ Workspace picker failed: ${error?.message || String(error)}`);
    }
  };

  const handleBuildIndex = async () => {
    setIndexing(true);
    setSearchError(null);
    try {
      const summary = await indexWorkspaceCode({ maxFiles: 600 });
      setIndexSummary(summary);
      onAddSystemMessage(`🧠 Local code index ready · ${summary.fileCount} files · ${summary.symbolCount} symbols · ${summary.chunkCount} chunks`);
    } catch (error: any) {
      const message = error?.message || String(error);
      setSearchError(message);
      onAddSystemMessage(`❌ Local index failed: ${message}`);
    } finally {
      setIndexing(false);
    }
  };

  const handleSearch = async () => {
    const normalized = query.trim();
    if (!normalized) {
      setSearchError("Enter a query first.");
      return;
    }
    setSearchError(null);
    try {
      if (searchMode === "text") {
        const result = await searchWorkspaceFiles({ query: normalized, maxResults: 12 });
        setTextResults(result);
        setSymbolResults([]);
        setSemanticResults([]);
        return;
      }
      if (searchMode === "symbol") {
        const result = searchWorkspaceSymbols(normalized, 20);
        setSymbolResults(result);
        setTextResults(null);
        setSemanticResults([]);
        return;
      }
      const result = semanticSearchWorkspaceCode(normalized, 10);
      setSemanticResults(result);
      setTextResults(null);
      setSymbolResults([]);
    } catch (error: any) {
      setSearchError(error?.message || String(error));
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(event) => event.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <div style={titleStyle}>Deep OS / Local-first</div>
            <div style={subtitleStyle}>Wake word, screen context, local workspace index and RAG search</div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        <div style={bodyStyle}>
          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <span>🎤 Global wake word</span>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("agentrix:voice-activate"))}
                style={actionBtnStyle}
                title="Open panel and start voice flow"
              >
                Test voice
              </button>
            </div>
            <label style={fieldRowStyle}>
              <span style={fieldLabelStyle}>Enabled</span>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(event) => setConfig((current) => ({ ...current, enabled: event.target.checked }))}
              />
            </label>
            <label style={fieldColumnStyle}>
              <span style={fieldLabelStyle}>Picovoice Access Key</span>
              <input
                value={config.accessKey}
                onChange={(event) => setConfig((current) => ({ ...current, accessKey: event.target.value }))}
                style={inputStyle}
                placeholder="Enter access key"
              />
            </label>
            <div style={twoColStyle}>
              <label style={fieldColumnStyle}>
                <span style={fieldLabelStyle}>Built-in keyword</span>
                <input
                  value={config.builtInKeyword}
                  onChange={(event) => setConfig((current) => ({ ...current, builtInKeyword: event.target.value, displayName: event.target.value }))}
                  style={inputStyle}
                  placeholder="picovoice"
                />
              </label>
              <label style={fieldColumnStyle}>
                <span style={fieldLabelStyle}>Custom keyword path</span>
                <input
                  value={config.customKeywordPath}
                  onChange={(event) => setConfig((current) => ({ ...current, customKeywordPath: event.target.value }))}
                  style={inputStyle}
                  placeholder="Optional .ppn path"
                />
              </label>
            </div>
            <label style={fieldColumnStyle}>
              <span style={fieldLabelStyle}>Sensitivity · {config.sensitivity.toFixed(2)}</span>
              <input
                type="range"
                min={0.05}
                max={0.95}
                step={0.05}
                value={config.sensitivity}
                onChange={(event) => setConfig((current) => ({ ...current, sensitivity: Number(event.target.value) }))}
              />
            </label>
            <div style={buttonRowStyle}>
              <button onClick={handleSaveWakeWord} style={primaryBtnStyle} disabled={!canSaveWakeWord}>Save</button>
              <button onClick={handleResetWakeWord} style={secondaryBtnStyle}>Reset</button>
            </div>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <span>🖥 Screen context</span>
              <button onClick={runCapture} style={actionBtnStyle} disabled={runningCapture}>
                {runningCapture ? "Capturing..." : "Capture now"}
              </button>
            </div>
            {screenCapture ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={metaTextStyle}>
                  {screenCapture.width}×{screenCapture.height}
                  {screenCapture.filePath ? ` · ${screenCapture.filePath}` : ""}
                </div>
                <img
                  src={`data:image/png;base64,${screenCapture.dataBase64}`}
                  alt="Screen capture"
                  style={previewImageStyle}
                />
              </div>
            ) : (
              <div style={emptyTextStyle}>No screen context captured yet.</div>
            )}
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <span>🧠 Local workspace index / RAG</span>
              <button onClick={handleBuildIndex} style={actionBtnStyle} disabled={indexing}>
                {indexing ? "Indexing..." : "Build / refresh index"}
              </button>
            </div>
            <div style={metaTextStyle}>
              Workspace: {workspaceDir || "Not selected"}
            </div>
            <div style={buttonRowStyle}>
              <button onClick={handleChooseWorkspace} style={secondaryBtnStyle}>Choose workspace</button>
            </div>
            {indexSummary ? (
              <div style={summaryGridStyle}>
                <SummaryCard label="Files" value={String(indexSummary.fileCount)} />
                <SummaryCard label="Symbols" value={String(indexSummary.symbolCount)} />
                <SummaryCard label="Chunks" value={String(indexSummary.chunkCount)} />
                <SummaryCard label="Embedding" value={indexSummary.embeddingProvider} />
              </div>
            ) : (
              <div style={emptyTextStyle}>Index not built yet.</div>
            )}
            <div style={segmentedStyle}>
              {(["text", "symbol", "semantic"] as SearchMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSearchMode(mode)}
                  style={{
                    ...segmentBtnStyle,
                    ...(searchMode === mode ? segmentBtnActiveStyle : {}),
                  }}
                >
                  {mode === "text" ? "Text" : mode === "symbol" ? "Symbols" : "Semantic"}
                </button>
              ))}
            </div>
            <div style={searchRowStyle}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void handleSearch()}
                style={inputStyle}
                placeholder={searchMode === "semantic" ? "Find code by meaning" : searchMode === "symbol" ? "Find symbol name" : "Search exact text"}
              />
              <button onClick={handleSearch} style={primaryBtnStyle}>Search</button>
            </div>
            {searchError && <div style={errorStyle}>{searchError}</div>}
            {textResults && (
              <div style={resultListStyle}>
                {textResults.matches.map((match) => (
                  <div key={`${match.path}:${match.lineNumber}:${match.column}`} style={resultCardStyle}>
                    <div style={resultPathStyle}>{match.path}:{match.lineNumber}</div>
                    <div style={resultBodyStyle}>{match.lineText}</div>
                  </div>
                ))}
              </div>
            )}
            {symbolResults.length > 0 && (
              <div style={resultListStyle}>
                {symbolResults.map((symbol) => (
                  <div key={`${symbol.path}:${symbol.line}:${symbol.name}`} style={resultCardStyle}>
                    <div style={resultPathStyle}>{symbol.kind} · {symbol.name}</div>
                    <div style={resultBodyStyle}>{symbol.path}:{symbol.line}</div>
                    {symbol.signature && <div style={metaTextStyle}>{symbol.signature}</div>}
                  </div>
                ))}
              </div>
            )}
            {semanticResults.length > 0 && (
              <div style={resultListStyle}>
                {semanticResults.map((result) => (
                  <div key={`${result.path}:${result.startLine}-${result.endLine}`} style={resultCardStyle}>
                    <div style={resultPathStyle}>{result.path}:{result.startLine}-{result.endLine}</div>
                    <div style={metaTextStyle}>score {result.score.toFixed(4)} · {result.language}</div>
                    <div style={resultBodyStyle}>{result.preview}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryCardStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  zIndex: 260,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: 20,
};

const panelStyle: CSSProperties = {
  width: "min(980px, 100%)",
  maxHeight: "100%",
  overflow: "hidden",
  borderRadius: 16,
  border: "1px solid var(--border)",
  background: "var(--bg-panel)",
  boxShadow: "0 18px 48px rgba(0,0,0,0.35)",
  display: "flex",
  flexDirection: "column",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "18px 20px",
  borderBottom: "1px solid var(--border)",
};

const titleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "var(--text)",
};

const subtitleStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--text-dim)",
  marginTop: 4,
};

const closeBtnStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--text-dim)",
  cursor: "pointer",
  fontSize: 18,
};

const bodyStyle: CSSProperties = {
  overflowY: "auto",
  padding: 20,
  display: "grid",
  gap: 16,
};

const sectionStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 16,
  display: "grid",
  gap: 12,
  background: "rgba(255,255,255,0.03)",
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: 14,
  fontWeight: 700,
  color: "var(--text)",
};

const fieldRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const fieldColumnStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const twoColStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--text-dim)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg-input)",
  color: "var(--text)",
  padding: "10px 12px",
  fontSize: 13,
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const primaryBtnStyle: CSSProperties = {
  border: "1px solid var(--accent)",
  background: "var(--accent)",
  color: "#fff",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
};

const secondaryBtnStyle: CSSProperties = {
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: 12,
};

const actionBtnStyle: CSSProperties = {
  ...secondaryBtnStyle,
  padding: "6px 10px",
};

const metaTextStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--text-dim)",
  lineHeight: 1.5,
};

const emptyTextStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--text-dim)",
  padding: "8px 0",
};

const previewImageStyle: CSSProperties = {
  width: "100%",
  maxHeight: 320,
  objectFit: "contain",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.02)",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 10,
};

const summaryCardStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  padding: 12,
  background: "rgba(255,255,255,0.03)",
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--text-dim)",
};

const summaryValueStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 14,
  fontWeight: 700,
  color: "var(--text)",
  wordBreak: "break-word",
};

const segmentedStyle: CSSProperties = {
  display: "inline-flex",
  gap: 4,
  padding: 4,
  borderRadius: 999,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid var(--border)",
  width: "fit-content",
};

const segmentBtnStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--text-dim)",
  cursor: "pointer",
  fontSize: 12,
  borderRadius: 999,
  padding: "6px 12px",
};

const segmentBtnActiveStyle: CSSProperties = {
  background: "var(--accent)",
  color: "#fff",
};

const searchRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 8,
};

const resultListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const resultCardStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.02)",
  padding: 12,
  display: "grid",
  gap: 6,
};

const resultPathStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text)",
  wordBreak: "break-all",
};

const resultBodyStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--text-dim)",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const errorStyle: CSSProperties = {
  fontSize: 12,
  color: "#f87171",
};
