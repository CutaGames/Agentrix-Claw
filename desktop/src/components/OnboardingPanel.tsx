/**
 * OnboardingPanel — first-run experience for the desktop app.
 *
 * Pet-first storyline:
 *   Step 1  Welcome           — meet your Agentrix companion (not a "ball")
 *   Step 2  Choose pet        — pick a starter template OR open Pet Creator
 *   Step 3  Connect agent     — cloud / local / manual (skippable)
 *   Step 4  Hotkeys & gestures — drag, double-click → Pro, hold-to-talk
 *
 * Everything after Step 1 is skippable; the gestures card always shows so the
 * user knows the three core gestures before the panel closes.
 */
import { useState, useCallback, type CSSProperties } from "react";
import { API_BASE, apiFetch, useAuthStore } from "../services/store";
import { setActivePet, ACTIVE_PET_NAME_KEY } from "../services/petCreator";
import { trackEvent } from "../services/analytics";

interface Props {
  onComplete: () => void;
  /** Optional callback invoked when user wants to open the full Pet Creator panel. */
  onOpenPetCreator?: () => void;
}

type Step = "welcome" | "pet" | "connect" | "gestures";

/* ── Starter pet templates (no generation needed; uses bundled VRM URLs) ── */

interface StarterPet {
  id: string;
  name: string;
  emoji: string;
  vibe: string;
  vrmUrl: string;
}

const STARTER_PETS: StarterPet[] = [
  { id: "neko",  name: "Neko",  emoji: "🐱", vibe: "好奇 · 灵动", vrmUrl: "https://cdn.agentrix.top/pets/starter-neko.vrm" },
  { id: "shiba", name: "Shiba", emoji: "🐶", vibe: "忠实 · 元气", vrmUrl: "https://cdn.agentrix.top/pets/starter-shiba.vrm" },
  { id: "robo",  name: "Robo",  emoji: "🤖", vibe: "理性 · 极简", vrmUrl: "https://cdn.agentrix.top/pets/starter-robo.vrm" },
];

/* ── Connect-agent options ── */

interface InstanceOption {
  type: "cloud" | "local" | "manual";
  label: string;
  desc: string;
  icon: string;
}

const INSTANCE_OPTIONS: InstanceOption[] = [
  { type: "cloud",  label: "Cloud Agent",    desc: "立即可用 · 我们托管",           icon: "☁️" },
  { type: "local",  label: "Local Agent",    desc: "已在本机运行的 runtime",        icon: "💻" },
  { type: "manual", label: "Manual Connect", desc: "手动填写 URL + Token",          icon: "🔗" },
];

export default function OnboardingPanel({ onComplete, onOpenPetCreator }: Props) {
  const { token, agents } = useAuthStore();
  const [step, setStep] = useState<Step>("welcome");

  // Pet step state
  const [chosenPetId, setChosenPetId] = useState<string | null>(null);

  // Connect step state
  const [selectedType, setSelectedType] = useState<string>("");
  const [manualUrl, setManualUrl] = useState("");
  const [connecting, setConnecting] = useState(false);

  /* ── Pet step ── */

  const handlePickStarterPet = useCallback((pet: StarterPet) => {
    setChosenPetId(pet.id);
    setActivePet(pet.vrmUrl, pet.name);
    try { localStorage.setItem(ACTIVE_PET_NAME_KEY, pet.name); } catch {}
    trackEvent("onboarding_pet_chosen", { petId: pet.id, source: "starter" });
  }, []);

  const handleOpenCreator = useCallback(() => {
    trackEvent("onboarding_pet_creator_opened");
    if (onOpenPetCreator) {
      onOpenPetCreator();
      onComplete();
    } else {
      try { localStorage.setItem("agentrix_pending_open_pet_creator", "1"); } catch {}
      setStep("connect");
    }
  }, [onComplete, onOpenPetCreator]);

  /* ── Connect step ── */

  const handleConnect = useCallback(
    async (type: string) => {
      setSelectedType(type);
      setConnecting(true);
      trackEvent("onboarding_agent_connect_attempt", { type });

      const baseBody = (label: string, desc: string, runtimeUrl?: string) => ({
        name: label,
        description: desc,
        status: "active",
        metadata: {
          desktopProfile: {
            source: "desktop-onboarding",
            connectionType: type,
            ...(runtimeUrl ? { runtimeUrl } : {}),
          },
        },
      });

      try {
        if (type === "cloud") {
          await apiFetch(`${API_BASE}/agent-presence/agents`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(baseBody("Desktop Agent", "Primary desktop agent provisioned from onboarding")),
          });
          await useAuthStore.getState().loadToken();
        } else if (type === "local") {
          const health = await fetch("http://localhost:7474/health", { signal: AbortSignal.timeout(3000) }).catch(() => null);
          if (health?.ok) {
            await apiFetch(`${API_BASE}/agent-presence/agents`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify(baseBody("Local Desktop Agent", "Desktop agent linked to a local runtime", "http://localhost:7474")),
            });
            await useAuthStore.getState().loadToken();
          }
        } else if (type === "manual") {
          await apiFetch(`${API_BASE}/agent-presence/agents`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(
              baseBody(
                "Manual Desktop Agent",
                manualUrl ? `Desktop agent linked to ${manualUrl}` : "Desktop agent with a manual runtime endpoint",
                manualUrl || undefined,
              ),
            ),
          });
          await useAuthStore.getState().loadToken();
        }
      } catch {
        // Soft-fail: never trap the user in onboarding.
      }

      setConnecting(false);
      setStep("gestures");
    },
    [token, manualUrl],
  );

  /* ─────────────────────────── Step 1: Welcome ─────────────────────────── */

  if (step === "welcome") {
    return (
      <div style={container}>
        <div style={card}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={petHero}>
              <div style={petHeroEmoji}>🐱</div>
              <div style={petHeroSparkles}>✨</div>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: "16px 0 6px" }}>
              欢迎认识你的 Agentrix 伴侣
            </h1>
            <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.5 }}>
              不只是一个 AI 浮窗——而是一只属于你的数字宠物。<br />
              它会陪你工作、学习、聊天，并随你成长。
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
            <Feature icon="🎨" text="先给它选一个形象 / 你也可以亲手生成" />
            <Feature icon="💬" text="点击它即可开始对话" />
            <Feature icon="🎤" text="按住 Ctrl+Shift+A 就能直接说话" />
            <Feature icon="📱" text="与你的手机、Web、可穿戴设备同步" />
          </div>

          <button
            onClick={() => { trackEvent("onboarding_step", { step: "welcome_done" }); setStep("pet"); }}
            style={primaryBtn}
          >
            开始 — 给它一个形象 →
          </button>
        </div>
      </div>
    );
  }

  /* ─────────────────────────── Step 2: Pet ────────────────────────────── */

  if (step === "pet") {
    return (
      <div style={container}>
        <div style={card}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>选一只起手宠物</h2>
          <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 16 }}>
            随时可以换装 / 重新生成 / 与好友"繁殖"出新宠物
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            {STARTER_PETS.map((pet) => {
              const active = chosenPetId === pet.id;
              return (
                <button
                  key={pet.id}
                  onClick={() => handlePickStarterPet(pet)}
                  style={{
                    ...petCardStyle,
                    borderColor: active ? "var(--accent)" : "var(--border)",
                    boxShadow: active ? "0 4px 16px rgba(108,92,231,0.45)" : "none",
                  }}
                >
                  <div style={{ fontSize: 36 }}>{pet.emoji}</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>{pet.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{pet.vibe}</div>
                </button>
              );
            })}
          </div>

          <button
            onClick={handleOpenCreator}
            style={{ ...secondaryBtn, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}
          >
            <span style={{ fontSize: 18 }}>🪄</span>
            亲手生成专属宠物（文本 / 图片 → 3D）
          </button>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => { trackEvent("onboarding_step", { step: "pet_skipped" }); setStep(agents.length > 0 ? "gestures" : "connect"); }}
              style={skipBtn}
            >
              稍后再说 →
            </button>
            <button
              disabled={!chosenPetId}
              onClick={() => {
                trackEvent("onboarding_step", { step: "pet_done", petId: chosenPetId || "none" });
                setStep(agents.length > 0 ? "gestures" : "connect");
              }}
              style={{ ...primaryBtn, marginTop: 0, flex: 1, opacity: chosenPetId ? 1 : 0.4, cursor: chosenPetId ? "pointer" : "not-allowed" }}
            >
              下一步 →
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────── Step 3: Connect ────────────────────────── */

  if (step === "connect") {
    return (
      <div style={container}>
        <div style={card}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>连接你的 Agent</h2>
          <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 16 }}>
            选择 AI Agent 运行的位置（可跳过，随时在 Settings 里更改）
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {INSTANCE_OPTIONS.map((opt) => (
              <button
                key={opt.type}
                onClick={() => handleConnect(opt.type)}
                disabled={connecting}
                style={{ ...optionBtn, borderColor: selectedType === opt.type ? "var(--accent)" : "var(--border)" }}
              >
                <span style={{ fontSize: 24 }}>{opt.icon}</span>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{opt.desc}</div>
                </div>
                {connecting && selectedType === opt.type && <span>⏳</span>}
              </button>
            ))}
          </div>

          {selectedType === "manual" && (
            <div style={{ marginTop: 12 }}>
              <input
                type="url"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="http://your-agent:7474"
                style={inputStyle}
              />
              <button onClick={() => handleConnect("manual")} style={{ ...primaryBtn, marginTop: 8 }}>
                Connect
              </button>
            </div>
          )}

          <button onClick={() => setStep("gestures")} style={{ ...skipBtn, width: "100%", marginTop: 10 }}>
            跳过 →
          </button>
        </div>
      </div>
    );
  }

  /* ─────────────────────────── Step 4: Gestures ───────────────────────── */

  return (
    <div style={container}>
      <div style={card}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>三个手势就够了</h2>
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 16 }}>
          学会这三个，你就掌握了 Agentrix 的全部
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <GestureRow icon="🖱️" title="拖动宠物" desc="你可以把它拖到屏幕任何位置，松手会自动吸附到最近的边缘" />
          <GestureRow icon="👆" title="单击 = 聊天 · 双击 = Pro 工作台" desc="单击打开紧凑对话框，双击进入完整的多 Tab 工作台" />
          <GestureRow icon="🎤" title="按住 Ctrl+Shift+A 直接说话" desc="松手即识别 + 发送，可以在任何应用窗口里使用" />
        </div>

        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            background: "rgba(108,92,231,0.08)",
            border: "1px solid rgba(108,92,231,0.25)",
            borderRadius: "var(--radius-sm)",
            fontSize: 12,
            color: "var(--text-dim)",
            lineHeight: 1.55,
          }}
        >
          💡 还有 <kbd style={kbdStyle}>Ctrl+K</kbd> 打开 Spotlight，
          <kbd style={kbdStyle}>Ctrl+Shift+S</kbd> 切换 Pro 面板。
        </div>

        <button
          onClick={() => { trackEvent("onboarding_complete", { petChosen: chosenPetId ? 1 : 0 }); onComplete(); }}
          style={{ ...primaryBtn, marginTop: 18 }}
        >
          完成 — 开始使用 Agentrix ✨
        </button>
      </div>
    </div>
  );
}

/* ── Helpers ── */

function Feature({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 13, color: "var(--text)" }}>{text}</span>
    </div>
  );
}

function GestureRow({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 14px",
        background: "var(--bg-input)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div style={{ fontSize: 22, lineHeight: 1.2 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4, lineHeight: 1.5 }}>{desc}</div>
      </div>
    </div>
  );
}

/* ── Styles ── */

const container: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--bg-dark)",
  overflow: "auto",
};

const card: CSSProperties = {
  width: 440,
  padding: "32px 28px",
  background: "var(--bg-panel)",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow)",
  margin: "16px",
};

const petHero: CSSProperties = {
  width: 96,
  height: 96,
  borderRadius: "50%",
  background: "radial-gradient(circle at 30% 30%, #A29BFE, #6C5CE7 70%)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 8px 32px rgba(108, 92, 231, 0.55), inset 0 -8px 16px rgba(0,0,0,0.18)",
  position: "relative",
};

const petHeroEmoji: CSSProperties = {
  fontSize: 52,
  filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.25))",
};

const petHeroSparkles: CSSProperties = {
  position: "absolute",
  top: -4,
  right: -4,
  fontSize: 22,
  filter: "drop-shadow(0 0 6px rgba(255,255,255,0.7))",
};

const petCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
  padding: "16px 8px",
  background: "var(--bg-input)",
  border: "1.5px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  color: "var(--text)",
  transition: "all 0.15s ease",
};

const primaryBtn: CSSProperties = {
  width: "100%",
  padding: "12px",
  background: "var(--accent)",
  color: "white",
  border: "none",
  borderRadius: "var(--radius-sm)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  marginTop: 20,
};

const secondaryBtn: CSSProperties = {
  width: "100%",
  padding: "11px",
  background: "transparent",
  color: "var(--text)",
  border: "1px dashed var(--border)",
  borderRadius: "var(--radius-sm)",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const skipBtn: CSSProperties = {
  flex: "0 0 auto",
  padding: "10px 16px",
  background: "transparent",
  color: "var(--text-dim)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  fontSize: 12,
};

const optionBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "14px 16px",
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  color: "var(--text)",
  transition: "border-color 0.2s",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  background: "var(--bg-input)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  fontSize: 14,
  outline: "none",
};

const kbdStyle: CSSProperties = {
  display: "inline-block",
  background: "var(--bg-dark)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "1px 6px",
  fontSize: 11,
  fontFamily: "monospace",
  color: "var(--accent-light)",
  margin: "0 2px",
};
