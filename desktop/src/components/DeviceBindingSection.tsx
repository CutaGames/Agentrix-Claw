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
import { useI18n } from "../i18n/I18nProvider";
import { fill, zhT, type Translator } from "../i18n/strings";

/** 绑定还剩几小时（向上取整，至少 1）；没有到期时间时是 null。 */
export function bindingHoursLeft(expiresAt: string | null | undefined, nowMs: number = Date.now()): number | null {
  const at = expiresAt ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(at)) return null;
  return Math.max(1, Math.ceil((at - nowMs) / 3_600_000));
}

/** Plain words for a binding failure, in the app language (`bind.reason.<code>` in `i18n/strings.ts`). */
export function describeEnrollReason(reason: string | undefined, t: Translator = zhT): string {
  if (!reason) return "";
  const [code, detail] = reason.split(":");
  const key = `bind.reason.${code}`;
  if (t(key) !== key) return t(key);
  if (code.startsWith("enroll_")) return detail ? fill(t("bind.reason.rejectedDetail"), { detail }) : t("bind.reason.rejected");
  return reason;
}

export default function DeviceBindingSection() {
  const { t } = useI18n();
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
        setMessage(result.runtime?.outcome === "ok" ? t("bind.msg.boundWithRuntime") : t("bind.msg.bound"));
      } else {
        setMessage(fill(t("bind.msg.failed"), { reason: describeEnrollReason(result.reason, t) }));
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
      <h2 id="device-binding-title" style={title}>{t("bind.title")}</h2>
      <div style={hint}>{t("bind.intro")}</div>
      {stagingOrigin && (
        <div role="note" style={{ ...hint, marginTop: 8 }} data-testid="device-binding-target">
          {fill(t("bind.staging"), { origin: stagingOrigin })}
        </div>
      )}
      <div style={{ ...hint, marginTop: 8 }} data-testid="device-binding-status">
        {status === null
          ? t("runtime.loading")
          : bound
            ? fill(t("bind.status.bound"), { device: status.deviceId ?? "", hours: bindingHoursLeft(status.bindingExpiresAt) ?? "?" })
            : t("bind.status.unbound")}
      </div>
      {canReconnect && (
        <>
          <button type="button" style={button} disabled={busy || engaged || !token} onClick={() => void bind()}>
            {busy ? t("bind.reconnecting") : t("bind.reconnect")}
          </button>
          {engaged && <div style={hint}>{t("bind.engagedReconnect")}</div>}
        </>
      )}
      {!bound && (
        <>
          <label htmlFor="device-binding-label" style={{ ...hint, display: "block", marginTop: 8 }}>{t("bind.nameLabel")}</label>
          <input
            id="device-binding-label"
            value={label}
            maxLength={64}
            placeholder="Agentrix Desktop"
            onChange={(e) => setLabel(e.target.value)}
            style={input}
          />
          <button type="button" style={button} disabled={busy || engaged || !token} onClick={() => void bind()}>
            {busy ? t("bind.binding") : t("bind.title")}
          </button>
          {engaged && <div style={hint}>{t("bind.engagedBind")}</div>}
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
