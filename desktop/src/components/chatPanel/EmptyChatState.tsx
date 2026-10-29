import type { CSSProperties } from "react";
import { useI18n } from "../../i18n/I18nProvider";

const containerStyle: CSSProperties = {
  textAlign: "center",
  color: "var(--text-dim)",
  marginTop: 80,
};

export default function EmptyChatState() {
  const { t } = useI18n();
  return (
    <div style={containerStyle}>
      <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>
        Agentrix
      </div>
      <div style={{ fontSize: 13 }} data-testid="chat-empty-ready">{t("chat.empty.ready")}</div>
    </div>
  );
}
