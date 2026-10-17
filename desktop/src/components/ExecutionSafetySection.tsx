/**
 * ExecutionSafetySection — 桌面 D0：设置页里的"这台电脑的执行安全"。
 *
 * - 急停：拉下后三条通道只放行停止类命令，并关闭 Computer Use；只能在这台
 *   电脑上解除。
 * - 允许远程改动（默认关闭）：来自手机或云端的改动类命令需要它。
 * - 允许运行命令（默认关闭）：任何通道的 raw shell 都需要它；开了也逐条审批。
 * - 服务端开关：只显示最近一次观测到的 backend kill switch 状态。
 * - 急停记录（桌面 D2）：最近几次拉下 / 解除，以及两道闸的回读和生效用时。
 */
import { useEffect, useState, type CSSProperties } from "react";
import {
  engageKillSwitch,
  FENCE_SETTINGS_CHANGED_EVENT,
  getBackendRemoteMutationState,
  getKillSwitchState,
  isRawShellEnabled,
  isRemoteMutationEnabled,
  onKillSwitchChange,
  releaseKillSwitch,
  setRawShellEnabled,
  setRemoteMutationEnabled,
  type KillSwitchState,
} from "../services/executionFence";
import {
  describeEmergencyStopRecord,
  EMERGENCY_STOP_LOG_CHANGED_EVENT,
  listEmergencyStopRecords,
  type EmergencyStopRecord,
} from "../services/emergencyStopLog";
import EmergencyStopRing from "./EmergencyStopRing";
import { useI18n } from "../i18n/I18nProvider";
import { fill } from "../i18n/strings";

const SHOWN_RECORDS = 5;

export default function ExecutionSafetySection() {
  const { t } = useI18n();
  const [killSwitch, setKillSwitch] = useState<KillSwitchState>(() => getKillSwitchState());
  const [remoteMutation, setRemoteMutation] = useState(() => isRemoteMutationEnabled());
  const [rawShell, setRawShell] = useState(() => isRawShellEnabled());
  const [backendState, setBackendState] = useState(() => getBackendRemoteMutationState());
  const [records, setRecords] = useState<EmergencyStopRecord[]>(() => listEmergencyStopRecords());

  useEffect(() => {
    const offKill = onKillSwitchChange(setKillSwitch);
    const onFenceChanged = () => {
      setRemoteMutation(isRemoteMutationEnabled());
      setRawShell(isRawShellEnabled());
      setBackendState(getBackendRemoteMutationState());
    };
    const onLogChanged = () => setRecords(listEmergencyStopRecords());
    window.addEventListener(FENCE_SETTINGS_CHANGED_EVENT, onFenceChanged);
    window.addEventListener(EMERGENCY_STOP_LOG_CHANGED_EVENT, onLogChanged);
    return () => {
      offKill();
      window.removeEventListener(FENCE_SETTINGS_CHANGED_EVENT, onFenceChanged);
      window.removeEventListener(EMERGENCY_STOP_LOG_CHANGED_EVENT, onLogChanged);
    };
  }, []);

  return (
    <div style={section} aria-labelledby="execution-safety-title">
      <div id="execution-safety-title" style={sectionTitle}>{t("safety.title")}</div>

      <div role="status" aria-live="polite" style={killSwitch.engaged ? engagedBox : idleBox}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {killSwitch.engaged ? t("safety.state.engaged") : t("safety.state.idle")}
        </div>
        <div style={hint}>
          {killSwitch.engaged
            ? `${t("safety.desc.engaged")}${killSwitch.engagedAt ? ` ${fill(t("safety.desc.engagedAt"), { time: new Date(killSwitch.engagedAt).toLocaleString() })}` : ""}`
            : t("safety.desc.idle")}
        </div>
        {/* The box above is already a polite live region: the ring does not add another. */}
        <EmergencyStopRing record={records[0]} live={false} />
        <button
          type="button"
          onClick={() => {
            if (killSwitch.engaged) {
              releaseKillSwitch({ origin: "settings" });
            } else {
              engageKillSwitch({ origin: "settings", reason: "settings_button" });
            }
          }}
          style={killSwitch.engaged ? releaseButton : stopButton}
        >
          {killSwitch.engaged ? t("safety.btn.release") : t("safety.btn.engage")}
        </button>
      </div>

      <SwitchRow
        id="fence-remote-mutation"
        label={t("safety.remote.label")}
        description={t("safety.remote.desc")}
        value={remoteMutation}
        disabled={killSwitch.engaged}
        onChange={(v) => setRemoteMutationEnabled(v)}
      />
      <SwitchRow
        id="fence-raw-shell"
        label={t("safety.shell.label")}
        description={t("safety.shell.desc")}
        value={rawShell}
        disabled={killSwitch.engaged}
        onChange={(v) => setRawShellEnabled(v)}
      />
      {/* The server switch is named by what it does, never by its setting name (T7 r2, 10-16). */}
      <div style={hint} data-testid="safety-backend-state">
        {fill(t("safety.backend.line"), { state: t(`safety.backend.${backendState.state}`) })}
      </div>
      {records.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div id="emergency-stop-log-title" style={{ fontSize: 12, fontWeight: 600 }}>{t("safety.log.title")}</div>
          <ul aria-labelledby="emergency-stop-log-title" style={recordList} data-testid="emergency-stop-log">
            {records.slice(0, SHOWN_RECORDS).map((record) => (
              <li key={record.id} style={hint}>
                <time dateTime={record.at}>{new Date(record.at).toLocaleString()}</time> {describeEmergencyStopRecord(record, t)}
              </li>
            ))}
          </ul>
          <div style={hint}>{t("safety.log.note")}</div>
        </div>
      )}
    </div>
  );
}

function SwitchRow({
  id,
  label,
  description,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ padding: "6px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <label htmlFor={id} style={{ fontSize: 13 }}>{label}</label>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={value}
          aria-describedby={`${id}-desc`}
          disabled={disabled}
          onClick={() => onChange(!value)}
          style={{
            width: 40,
            height: 22,
            flexShrink: 0,
            borderRadius: 11,
            border: "none",
            background: value ? "var(--accent)" : "var(--bg-overlay-medium)",
            position: "relative",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "white",
              position: "absolute",
              top: 3,
              left: value ? 21 : 3,
            }}
          />
        </button>
      </div>
      <div id={`${id}-desc`} style={hint}>{description}</div>
    </div>
  );
}

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

const hint: CSSProperties = {
  fontSize: 11,
  color: "var(--text-dim)",
  marginTop: 4,
  lineHeight: 1.5,
};

const recordList: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
};

const idleBox: CSSProperties = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid var(--border)",
  marginBottom: 8,
};

const engagedBox: CSSProperties = {
  ...idleBox,
  border: "1px solid #dc2626",
  background: "rgba(220, 38, 38, 0.08)",
};

const stopButton: CSSProperties = {
  marginTop: 8,
  padding: "6px 14px",
  borderRadius: 6,
  border: "none",
  background: "#dc2626",
  color: "white",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const releaseButton: CSSProperties = {
  ...stopButton,
  background: "var(--bg-elevated)",
  color: "var(--text)",
  border: "1px solid var(--border)",
};
