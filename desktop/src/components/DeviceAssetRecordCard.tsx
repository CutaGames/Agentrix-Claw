import { useEffect, useMemo, useState } from "react";
import {
  desktopDeviceAssetRecordDeps,
  deviceAssetRecordFailureText,
  deviceAssetRecordLines,
  listThings,
  readThisComputer,
  uploadReading,
  type DeviceAssetRecordDeps,
  type DeviceAssetRecordReading,
  type ThingsResult,
} from "../services/deviceAssetRecord";
import type { DeviceAssetRecordSummaryV1 } from "../../../shared/types/device-assets";
import { useI18n } from "../i18n/I18nProvider";
import { pickFor } from "../i18n/pick";

const box = { marginBottom: 16, padding: 12, borderRadius: 10, background: "var(--surface-2)" } as const;
const dim = { fontSize: 12, color: "var(--text-dim)" } as const;
const button = { fontSize: 13, padding: "4px 10px", borderRadius: 6, cursor: "pointer" } as const;

/**
 * L9 S17 (L2): pick one of my things, let this computer read its own serial number, battery cycle count and capacity and
 * sign them with its device key, look at what it read, then hand it in. The server keeps only the signature and the
 * digest. Mounted behind `VITE_DEVICE_ASSET_RECORD_ENABLED`; it renders nothing while the ledger is not open to this
 * account (404). One language, the app's.
 */
export default function DeviceAssetRecordCard({ deps }: { deps?: DeviceAssetRecordDeps }) {
  const { locale } = useI18n();
  const p = pickFor(locale);
  const api = useMemo(() => deps ?? desktopDeviceAssetRecordDeps(), [deps]);
  const [things, setThings] = useState<ThingsResult | null>(null);
  const [assetRef, setAssetRef] = useState("");
  const [reading, setReading] = useState<DeviceAssetRecordReading | null>(null);
  const [done, setDone] = useState<DeviceAssetRecordSummaryV1 | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void listThings(api).then((next) => {
      if (!alive) return;
      setThings(next);
      if (next.ok && next.items.length > 0) setAssetRef(next.items[0].assetRef);
    });
    return () => {
      alive = false;
    };
  }, [api]);

  if (!things || (things.ok === false && (things.reason === "off" || things.reason === "closed"))) return null;

  const read = async () => {
    setBusy(true);
    setNotice("");
    setReading(null);
    setDone(null);
    const result = await readThisComputer(assetRef, api);
    if (result.ok === false) setNotice(deviceAssetRecordFailureText(result.reason, locale));
    else setReading(result.reading);
    setBusy(false);
  };

  const send = async () => {
    if (!reading) return;
    setBusy(true);
    setNotice("");
    const result = await uploadReading(reading, api);
    if (result.ok === false) setNotice(deviceAssetRecordFailureText(result.reason, locale));
    else {
      setDone(result.record);
      setReading(null);
    }
    setBusy(false);
  };

  return (
    <div data-testid="device-asset-record-card" style={box}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{p("给「我的东西」记一份这台电脑的履历", "Record this computer for My things")}</div>
      <div style={{ ...dim, marginBottom: 8 }}>
        {p(
          "这台电脑读自己的序列号、电池循环次数和容量，用这台电脑的设备钥匙签名，再挂到你选的那件东西上。它是「由这台电脑读取并签名」，不是检测或认证；服务器只留签名和摘要，不留这些数。",
          "This computer reads its own serial number, battery cycle count and capacity, signs them with its device key and adds them to the item you pick. It is \"read and signed by this computer\", not an inspection or a certification; the server keeps only the signature and a digest, not the figures.",
        )}
      </div>
      {things.ok === false ? <div style={dim}>{deviceAssetRecordFailureText(things.reason, locale)}</div> : null}
      {things.ok && things.items.length === 0 ? <div style={dim}>{p("「我的东西」里还没有可以挂的东西。", "There is nothing in My things to add it to yet.")}</div> : null}
      {things.ok && things.items.length > 0 ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select aria-label={p("挂到哪件东西上", "Which item")} value={assetRef} disabled={busy} onChange={(event) => setAssetRef(event.target.value)}>
            {things.items.map((item) => (
              <option key={item.assetRef} value={item.assetRef}>
                {item.name}
              </option>
            ))}
          </select>
          <button type="button" style={button} disabled={busy || !assetRef} onClick={() => void read()} data-testid="device-asset-record-read">
            {p("读取这台电脑", "Read this computer")}
          </button>
        </div>
      ) : null}
      {reading ? (
        <div data-testid="device-asset-record-preview" style={{ marginTop: 8, fontSize: 13 }}>
          {deviceAssetRecordLines(reading.fields, locale).map((line) => (
            <div key={line.label}>
              {line.label}：{line.value}
            </div>
          ))}
          <button type="button" style={{ ...button, marginTop: 6 }} disabled={busy} onClick={() => void send()} data-testid="device-asset-record-send">
            {p("确认，挂上去", "Looks right, add it")}
          </button>
        </div>
      ) : null}
      {done ? <div style={{ ...dim, marginTop: 8 }}>{p("已挂上：由这台电脑读取并签名。", "Added: read and signed by this computer.")}</div> : null}
      {notice ? (
        <div role="status" style={{ ...dim, marginTop: 8 }}>
          {notice}
        </div>
      ) : null}
    </div>
  );
}
