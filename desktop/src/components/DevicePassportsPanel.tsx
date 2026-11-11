import { useEffect, useState } from "react";
import { devicePassportJobsText, devicePassportServicesText, readDevicePassports, type DevicePassportsRead } from "../services/devicePassports";
import { API_BASE, apiFetch, useAuthStore } from "../services/store";
import { useI18n } from "../i18n/I18nProvider";
import { pickFor } from "../i18n/pick";

type Reader = () => Promise<DevicePassportsRead>;

const liveReader: Reader = () => readDevicePassports({ fetch: apiFetch, apiBase: API_BASE, token: () => useAuthStore.getState().token });

/** L7-4 v0: a read-only passport per device. Renders nothing while the server switches are off. One language, the app's. */
export default function DevicePassportsPanel({ read = liveReader }: { read?: Reader }) {
  const { locale } = useI18n();
  const p = pickFor(locale);
  const [state, setState] = useState<DevicePassportsRead | null>(null);
  useEffect(() => {
    let alive = true;
    void read().then((next) => { if (alive) setState(next); });
    return () => { alive = false; };
  }, [read]);

  if (!state || state.kind === "closed") return null;
  return (
    <div data-testid="device-passports-panel" style={{ marginBottom: 16, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{p("设备护照（只读）", "Device passports (read only)")}</div>
      {state.kind === "no_session" ? <div style={{ fontSize: 12, opacity: 0.7 }}>{p("请先登录。", "Please sign in first.")}</div> : null}
      {state.kind === "unreadable" ? <div style={{ fontSize: 12, opacity: 0.7 }}>{p("暂时读不到。", "Cannot be read right now.")}</div> : null}
      {state.kind === "ready" && state.passports.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.7 }}>{p("最近 15 分钟没有设备上报能做什么。", "No device said what it can do in the last 15 minutes.")}</div>
      ) : null}
      {state.kind === "ready" ? state.passports.map((passport) => (
        <div key={passport.deviceId} style={{ fontSize: 13, marginBottom: 6 }}>
          <div><strong>{passport.kind}</strong> <code>{passport.deviceId}</code></div>
          <div style={{ opacity: 0.8 }}>{devicePassportServicesText(passport, locale)}</div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>{devicePassportJobsText(passport, locale)}</div>
        </div>
      )) : null}
    </div>
  );
}
