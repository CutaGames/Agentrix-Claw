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
  BACKEND_REMOTE_MUTATION_FLAG,
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

const SHOWN_RECORDS = 5;

const BACKEND_STATE_LABEL = {
  unknown: "未知（还没有收到远程命令）",
  enabled: "已开启",
  disabled: "已关闭",
} as const;

export default function ExecutionSafetySection() {
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
      <div id="execution-safety-title" style={sectionTitle}>这台电脑的执行安全</div>

      <div role="status" aria-live="polite" style={killSwitch.engaged ? engagedBox : idleBox}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {killSwitch.engaged ? "急停已拉下" : "正常运行"}
        </div>
        <div style={hint}>
          {killSwitch.engaged
            ? `AI 在这台电脑上的操作已全部暂停，只允许停止类命令。${killSwitch.engagedAt ? `拉下时间：${new Date(killSwitch.engagedAt).toLocaleString()}。` : ""}`
            : "拉下急停后，AI 不能再在这台电脑上执行任何操作，Computer Use 也会关闭。"}
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
          {killSwitch.engaged ? "解除急停" : "急停"}
        </button>
      </div>

      <SwitchRow
        id="fence-remote-mutation"
        label="允许手机和云端在这台电脑上做改动"
        description="关闭时，只允许读取类和停止类命令。打开后每个改动仍需审批，高风险的要在这台电脑上确认。"
        value={remoteMutation}
        disabled={killSwitch.engaged}
        onChange={(v) => setRemoteMutationEnabled(v)}
      />
      <SwitchRow
        id="fence-raw-shell"
        label="允许 AI 运行命令"
        description="关闭时，拒绝所有 shell 命令（包括聊天和远程）。打开后每条命令都要审批，不能记住。"
        value={rawShell}
        disabled={killSwitch.engaged}
        onChange={(v) => setRawShellEnabled(v)}
      />
      <div style={hint}>
        服务端开关 {BACKEND_REMOTE_MUTATION_FLAG}：{BACKEND_STATE_LABEL[backendState.state]}
      </div>
      {records.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div id="emergency-stop-log-title" style={{ fontSize: 12, fontWeight: 600 }}>急停记录</div>
          <ul aria-labelledby="emergency-stop-log-title" style={recordList} data-testid="emergency-stop-log">
            {records.slice(0, SHOWN_RECORDS).map((record) => (
              <li key={record.id} style={hint}>
                <time dateTime={record.at}>{new Date(record.at).toLocaleString()}</time> {describeEmergencyStopRecord(record)}
              </li>
            ))}
          </ul>
          <div style={hint}>这是这台电脑上的本机记录，还不是服务端回执。</div>
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
