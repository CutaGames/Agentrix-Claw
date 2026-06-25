/**
 * MobileScanToast — Sprint DB #7
 *
 * Per desktop-prd-v4 §3.3:
 * "移动端摄像头扫描完成后推送到桌面，桌面弹 toast
 *  「📷 手机刚扫了一只新宠物，是否预览?」"
 *
 * Listens for `pet.gen.progress` events where origin_surface === 'mobile'
 * and status === 'completed'. Shows a dismissible toast with "Preview" action.
 */
import { useEffect, useState, useCallback, type CSSProperties } from "react";

interface MobileScanEvent {
  task_id: string;
  skin_name: string;
  thumbnail_url: string | null;
  model_url: string;
  origin_surface: string;
}

export default function MobileScanToast() {
  const [event, setEvent] = useState<MobileScanEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as any;
      if (!detail) return;
      // Only show for mobile-originated completed scans
      if (detail.origin_surface === "mobile" && detail.status === "completed" && detail.model_url) {
        setEvent({
          task_id: detail.task_id || detail.taskId,
          skin_name: detail.skin_name || detail.display_name || "新宠物",
          thumbnail_url: detail.thumbnail_url || null,
          model_url: detail.model_url,
          origin_surface: "mobile",
        });
        setVisible(true);
        // Auto-dismiss after 15s
        setTimeout(() => setVisible(false), 15_000);
      }
    };

    window.addEventListener("agentrix:pet-gen-completed", handler);
    window.addEventListener("agentrix:timeline-event", (e: Event) => {
      const detail = (e as CustomEvent).detail as any;
      if (detail?.type === "pet.skin.generated" && detail?.origin_surface === "mobile") {
        handler(new CustomEvent("", { detail }));
      }
    });

    return () => {
      window.removeEventListener("agentrix:pet-gen-completed", handler);
    };
  }, []);

  const handlePreview = useCallback(() => {
    if (!event) return;
    // Set VRM URL to preview the new model
    localStorage.setItem("agentrix_pet_vrm_url", event.model_url);
    window.dispatchEvent(new CustomEvent("agentrix:pet-vrm-changed"));
    setVisible(false);
  }, [event]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
  }, []);

  if (!visible || !event) return null;

  return (
    <div style={container}>
      <div style={content}>
        <div style={iconArea}>📷</div>
        <div style={textArea}>
          <div style={title}>手机刚扫了一只新宠物</div>
          <div style={subtitle}>
            「{event.skin_name}」已生成完毕，是否在桌面预览？
          </div>
        </div>
      </div>
      <div style={actions}>
        <button style={previewBtn} onClick={handlePreview}>
          预览
        </button>
        <button style={dismissBtn} onClick={handleDismiss}>
          稍后
        </button>
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────

const container: CSSProperties = {
  position: "fixed",
  bottom: 20,
  right: 20,
  width: 320,
  background: "rgba(15,15,25,0.95)",
  border: "1px solid rgba(34,211,238,0.3)",
  borderRadius: 14,
  padding: 14,
  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
  zIndex: 99999,
  animation: "slideInRight 300ms ease",
};

const content: CSSProperties = {
  display: "flex",
  gap: 12,
  marginBottom: 10,
};

const iconArea: CSSProperties = {
  fontSize: 28,
  flexShrink: 0,
};

const textArea: CSSProperties = {
  flex: 1,
};

const title: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text-card)",
  marginBottom: 4,
};

const subtitle: CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  lineHeight: "16px",
};

const actions: CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
};

const previewBtn: CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  border: "none",
  background: "#22d3ee",
  color: "#000",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const dismissBtn: CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "transparent",
  color: "var(--text-muted)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
