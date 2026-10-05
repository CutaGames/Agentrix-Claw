/**
 * DeviceBindingSection — "这台电脑 → 绑定这台电脑"（E32，REQ-desktop-018）。
 *
 * 本人点"绑定这台电脑"：当前登录的 JWT 只在这一次交给 Rust，Rust 做配对、登记签名凭据、
 * 建绑定、签发运行时凭据（开发者运行时开着时还会让本人选一个工作区）。绑定以后：
 * - 手机、网页发来的 L2 / L3 操作可以在这台电脑上批准（Rust 弹确认框，用设备密钥签名）；
 * - 这台电脑在"我的 → 设备"里出现，可以一键解绑（E30）。
 * 急停拉下时不能绑定。
 * 绑定有效期间不能"重新绑定"（REQ-desktop-030）：还没有续期，新建的一份不会替换现在这份，
 * 两份同时有效时远程执行会失败关闭。到期以后才能再绑。
 *
 * E73：先探测后端的 E32 能力（`probeEnrollmentAvailable`），开着才显示这一节；探测失败、超时、
 * 没开都不显示，也不报错。已经绑定过的电脑照常显示（看状态；开发者运行时没接上时可以"重新接上"，Rust 还会再探测）。
 */
import { useEffect, useState, type CSSProperties } from "react";
import {
  DEVICE_ENROLLMENT_CHANGED_EVENT,
  enrollThisComputer,
  probeEnrollmentAvailable,
  readEnrollmentStatus,
  type DeviceEnrollmentStatus,
} from "../services/deviceEnrollment";
import { agentAccountIdOf } from "../services/actionReceipts";
import { getKillSwitchState, onKillSwitchChange } from "../services/executionFence";
import { useAuthStore } from "../services/store";
import { stagingApiOrigin } from "../services/apiTarget";

const REASON_TEXT: Record<string, string> = {
  signed_out: "请先登录",
  no_agent: "没有找到你的主 Agent，先在网页上建一个",
  no_native_host: "这个窗口不能调用本机功能",
  not_bound: "服务端没有确认绑定",
  kill_switch_engaged: "急停拉下时不能绑定",
  workspace_pick_failed: "没能打开文件夹选择框",
  enroll_backend_disabled: "服务端还没开放绑定，什么都没建",
  enroll_backend_unknown: "没能确认服务端能不能绑定，什么都没建，稍后再试",
};

/** 绑定还剩几小时（向上取整，至少 1）；没有到期时间时是 null。 */
export function bindingHoursLeft(expiresAt: string | null | undefined, nowMs: number = Date.now()): number | null {
  const at = expiresAt ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(at)) return null;
  return Math.max(1, Math.ceil((at - nowMs) / 3_600_000));
}

export function describeEnrollReason(reason: string | undefined): string {
  if (!reason) return "";
  const [code, detail] = reason.split(":");
  if (REASON_TEXT[code]) return REASON_TEXT[code];
  if (code.startsWith("enroll_")) return detail ? `服务端拒绝了（${detail}）` : "服务端拒绝了";
  if (code === "network_not_allowlisted") return "地址不在允许列表里";
  return reason;
}

export default function DeviceBindingSection() {
  const token = useAuthStore((s) => s.token);
  const instances = useAuthStore((s) => s.instances);
  const activeInstanceId = useAuthStore((s) => s.activeInstanceId);
  const [status, setStatus] = useState<DeviceEnrollmentStatus | null>(null);
  const [engaged, setEngaged] = useState(() => getKillSwitchState().engaged);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [label, setLabel] = useState("");
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let alive = true;
    void readEnrollmentStatus().then((next) => alive && setStatus(next));
    const onChange = (e: Event) => setStatus((e as CustomEvent<DeviceEnrollmentStatus>).detail);
    window.addEventListener(DEVICE_ENROLLMENT_CHANGED_EVENT, onChange);
    const off = onKillSwitchChange((state) => setEngaged(state.engaged));
    return () => {
      alive = false;
      window.removeEventListener(DEVICE_ENROLLMENT_CHANGED_EVENT, onChange);
      off();
    };
  }, []);

  const probeDeviceId = status?.deviceId ?? null;
  useEffect(() => {
    let alive = true;
    setAvailable(false);
    if (!token) return;
    void probeEnrollmentAvailable({ userJwt: token, deviceId: probeDeviceId }).then((ok) => alive && setAvailable(ok));
    return () => {
      alive = false;
    };
  }, [token, probeDeviceId]);

  const active = instances.find((i) => i.id === activeInstanceId) ?? instances.find((i) => (i as { isPrimary?: boolean }).isPrimary) ?? instances[0];
  const agentAccountId = active ? agentAccountIdOf(active as never) : null;

  const bind = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await enrollThisComputer({ userJwt: token, agentAccountId, label: label || "Agentrix Desktop" });
      if (result.ok) {
        const runtime = result.runtime?.outcome === "ok" ? "，开发者运行时也已接上" : "";
        setMessage(`已绑定${runtime}`);
      } else {
        setMessage(`没有完成：${describeEnrollReason(result.reason)}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const bound = status?.bound === true;
  // Bound, the runtime was switched on for this launch, but it is not
  // connected (e.g. after a restart): Rust reuses the live binding and only
  // issues a new runtime credential and bootstrap, never a second binding.
  const canReconnect = bound && status?.runtimeOptIn === true && status?.runtimeConnected !== true;
  const stagingOrigin = stagingApiOrigin();
  if (!bound && !available) return null;
  return (
    <section style={box} aria-labelledby="device-binding-title" data-testid="device-binding">
      <h2 id="device-binding-title" style={title}>绑定这台电脑</h2>
      <div style={hint}>
        绑定以后，手机或网页发来的高风险操作可以在这台电脑上批准（会再弹一次系统确认框，用这台电脑的设备密钥签名）；
        这台电脑会出现在"我的 → 设备"里，随时可以解绑。登录凭据只在绑定这一次交给本机，不会保存。
      </div>
      {stagingOrigin && (
        <div role="note" style={{ ...hint, marginTop: 8 }} data-testid="device-binding-target">
          这次启动连的是 staging（{stagingOrigin}），绑定和登录都只在 staging 上，和正式环境互不影响。
        </div>
      )}
      <div style={{ ...hint, marginTop: 8 }} data-testid="device-binding-status">
        {status === null
          ? "读取中…"
          : bound
            ? `已绑定：${status.deviceId}，还剩 ${bindingHoursLeft(status.bindingExpiresAt) ?? "?"} 小时。到期以后再点"绑定这台电脑"。`
            : "还没有绑定"}
      </div>
      {canReconnect && (
        <>
          <button type="button" style={button} disabled={busy || engaged || !token} onClick={() => void bind()}>
            {busy ? "正在接上…" : "重新接上开发者运行时"}
          </button>
          {engaged && <div style={hint}>急停拉下时不能接上。</div>}
        </>
      )}
      {!bound && (
        <>
          <label htmlFor="device-binding-label" style={{ ...hint, display: "block", marginTop: 8 }}>电脑名（会显示在设备列表里）</label>
          <input
            id="device-binding-label"
            value={label}
            maxLength={64}
            placeholder="Agentrix Desktop"
            onChange={(e) => setLabel(e.target.value)}
            style={input}
          />
          <button type="button" style={button} disabled={busy || engaged || !token} onClick={() => void bind()}>
            {busy ? "正在绑定…" : "绑定这台电脑"}
          </button>
          {engaged && <div style={hint}>急停拉下时不能绑定。</div>}
        </>
      )}
      {message && (
        <div role="status" style={hint} data-testid="device-binding-message">
          {message}
        </div>
      )}
    </section>
  );
}

const box: CSSProperties = { padding: 12, borderRadius: 8, border: "1px solid var(--border)", marginBottom: 12 };
const title: CSSProperties = { fontSize: 13, fontWeight: 600, margin: 0 };
const hint: CSSProperties = { fontSize: 11, color: "var(--text-dim)", marginTop: 4, lineHeight: 1.5 };
const input: CSSProperties = {
  width: "100%",
  marginTop: 4,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
  fontSize: 12,
};
const button: CSSProperties = {
  marginTop: 8,
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
  fontSize: 12,
  cursor: "pointer",
};
