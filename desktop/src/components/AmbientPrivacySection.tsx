/**
 * AmbientPrivacySection — 设置 → 隐私（E64 / I-030）。
 *
 * 剪贴板同步、前台应用感知都默认关，只能由本人在这里打开，并写清楚打开后会发生什么。
 */
import { useEffect, useState, type CSSProperties } from "react";
import {
  CLIPBOARD_SYNC_MAX_CHARS,
  isActiveAppAwarenessEnabled,
  isClipboardSyncEnabled,
  onAmbientPrivacyChange,
  setActiveAppAwarenessEnabled,
  setClipboardSyncEnabled,
} from "../services/ambientPrivacy";

function Switch({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        border: "none",
        background: checked ? "var(--accent)" : "var(--bg-overlay-medium)",
        position: "relative",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "white",
          position: "absolute",
          top: 3,
          left: checked ? 21 : 3,
          transition: "left 0.2s",
        }}
      />
    </button>
  );
}

export default function AmbientPrivacySection() {
  const [clipboard, setClipboard] = useState(isClipboardSyncEnabled);
  const [activeApp, setActiveApp] = useState(isActiveAppAwarenessEnabled);
  useEffect(
    () =>
      onAmbientPrivacyChange(() => {
        setClipboard(isClipboardSyncEnabled());
        setActiveApp(isActiveAppAwarenessEnabled());
      }),
    [],
  );

  return (
    <section style={box} aria-labelledby="ambient-privacy-title" data-testid="ambient-privacy">
      <h2 id="ambient-privacy-title" style={title}>隐私</h2>
      <div style={row}>
        <div>
          <label htmlFor="ambient-privacy-clipboard" style={{ fontSize: 13 }}>同步剪贴板到我的其他设备</label>
          <div style={hint} id="ambient-privacy-clipboard-desc">
            打开后，Agentrix 每 2 秒读一次这台电脑的剪贴板；复制的文字（每次最多 {CLIPBOARD_SYNC_MAX_CHARS} 字）会经 Agentrix
            服务器发到你登录的其他设备。像密码、密钥、token 的内容不会读取，也不会发送。默认关。
          </div>
        </div>
        <Switch id="ambient-privacy-clipboard" label="同步剪贴板到我的其他设备" checked={clipboard} onChange={setClipboardSyncEnabled} />
      </div>
      <div style={row}>
        <div>
          <label htmlFor="ambient-privacy-active-app" style={{ fontSize: 13 }}>让桌宠知道我在用哪个应用</label>
          <div style={hint}>
            打开后，Agentrix 每 8 秒读一次最前面那个应用的名字（不读窗口标题、不读内容），显示在桌宠旁边。只留在这台电脑上。默认关。
          </div>
        </div>
        <Switch id="ambient-privacy-active-app" label="让桌宠知道我在用哪个应用" checked={activeApp} onChange={setActiveAppAwarenessEnabled} />
      </div>
    </section>
  );
}

const box: CSSProperties = { padding: 12, borderRadius: 8, border: "1px solid var(--border)", marginBottom: 12 };
const title: CSSProperties = { fontSize: 13, fontWeight: 600, margin: 0 };
const hint: CSSProperties = { fontSize: 11, color: "var(--text-dim)", marginTop: 4, lineHeight: 1.5 };
const row: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "8px 0", borderTop: "1px solid var(--border)", marginTop: 8 };
