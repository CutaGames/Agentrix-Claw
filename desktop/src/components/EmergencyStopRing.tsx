/**
 * EmergencyStopRing — 急停的"签名时刻"（`gtm/showcase-v1.md` A，I-048）。
 *
 * 拉下或解除急停以后，要在 3 秒内回读两道闸：倒计时环从满走到空，两道闸确认一道亮一道。
 * 都确认了就显示"已停"或"已解除"，并写出用了多久；没在 3 秒内全部确认就照实写。
 * - 只读急停记录（`emergencyStopLog`），不改判断和上报。
 * - 动效只在状态变化时出现：确认中的倒计时，确认完 250 ms 的收尾。
 * - 系统开了"减少动态效果"时，不画扫动的弧，也没有收尾动画，只有文字。
 * - 读屏只播报开始和结果，不念每 0.1 秒的倒计时。
 * - 只显示最近 60 秒内的那一条；更早的看下面的急停记录。
 */
import { useEffect, useState, type CSSProperties } from "react";
import { EMERGENCY_STOP_BUDGET_MS, type EmergencyStopRecord, type GateReadback } from "../services/emergencyStopLog";

/** 结果在这里留多久。 */
export const RING_VISIBLE_FOR_MS = 60_000;
/** 过了 3 秒再多等这么久还没有结论，就不再倒计时（比如确认中途应用被关掉）。 */
const STALL_AFTER_MS = EMERGENCY_STOP_BUDGET_MS + 1_000;
const TICK_MS = 100;
const SIZE = 64;
const RADIUS = 27;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type Phase = "confirming" | "done" | "not_confirmed" | "stalled";

const GATE_TEXT: Record<GateReadback, string> = {
  pending: "确认中",
  confirmed: "已确认",
  not_confirmed: "未确认",
  unavailable: "读不到",
};

function prefersReducedMotion(): boolean {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  } catch {
    return false;
  }
}

export function ringPhase(record: EmergencyStopRecord, nowMs: number): Phase {
  const pending = record.nativeGate === "pending" || record.runtime === "pending";
  if (pending) return nowMs - Date.parse(record.at) > STALL_AFTER_MS ? "stalled" : "confirming";
  return record.withinBudget ? "done" : "not_confirmed";
}

export default function EmergencyStopRing({
  record,
  live = true,
}: {
  record: EmergencyStopRecord | null | undefined;
  /** Own live region for the caption. Pass false inside a container that is already one. */
  live?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [reduced] = useState(prefersReducedMotion);
  const startedAt = record ? Date.parse(record.at) : NaN;
  const phase = record ? ringPhase(record, now) : null;

  // Tick only while confirming (at most ~4 s); nothing runs at rest (E64).
  useEffect(() => {
    if (phase !== "confirming") return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [phase, record?.id]);

  // One timeout to take the result away after a minute.
  useEffect(() => {
    if (!record || phase === "confirming") return;
    const left = startedAt + RING_VISIBLE_FOR_MS - Date.now();
    if (left <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), left + 10);
    return () => clearTimeout(timer);
  }, [record?.id, phase, startedAt]);

  // The 250 ms finish only plays on the change into a result.
  const [entered, setEntered] = useState(true);
  useEffect(() => {
    if (phase === "confirming" || reduced) {
      setEntered(true);
      return;
    }
    setEntered(false);
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [phase, reduced]);

  if (!record || !Number.isFinite(startedAt) || now - startedAt > RING_VISIBLE_FOR_MS || !phase) return null;

  const engaged = record.kind === "engaged";
  const remaining = Math.max(0, EMERGENCY_STOP_BUDGET_MS - (now - startedAt));
  const fraction = phase === "confirming" ? remaining / EMERGENCY_STOP_BUDGET_MS : 1;
  const stroke = phase === "done" ? "#16a34a" : phase === "confirming" ? (engaged ? "#dc2626" : "var(--accent)") : "#d97706";
  const center =
    phase === "confirming" ? `${(remaining / 1000).toFixed(1)} s` : phase === "done" ? (engaged ? "已停" : "已解除") : "未确认";
  const gates: Array<[string, GateReadback]> = [["电脑侧闸门", record.nativeGate]];
  if (engaged) gates.push(["本机开发运行时", record.runtime ?? "pending"]);

  let caption: string;
  if (phase === "confirming") caption = engaged ? "正在确认两道闸都停下了（3 秒内）" : "正在确认电脑侧闸门已解除（3 秒内）";
  else if (phase === "done")
    caption = engaged
      ? `${record.settledAfterMs ?? 0} ms 内两道闸都已确认，AI 在这台电脑上已经停下`
      : `${record.settledAfterMs ?? 0} ms 内确认电脑侧闸门已解除`;
  else if (phase === "stalled") caption = "没有读到结论，请看下面的急停记录";
  else caption = "没有在 3 秒内全部确认，请看下面的急停记录";

  const finish: CSSProperties = reduced
    ? {}
    : { transition: "transform 250ms ease-out, opacity 250ms ease-out", transform: entered ? "scale(1)" : "scale(0.85)", opacity: entered ? 1 : 0.4 };

  return (
    <div style={box} data-testid="emergency-stop-ring" data-phase={phase}>
      <div style={{ position: "relative", width: SIZE, height: SIZE, flexShrink: 0, ...finish }} aria-hidden="true">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--border)" strokeWidth={5} />
          {!(reduced && phase === "confirming") && (
            <circle
              data-testid="emergency-stop-ring-arc"
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={stroke}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          )}
        </svg>
        <div style={centerText} data-testid="emergency-stop-ring-center">{center}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div {...(live ? { role: "status", "aria-live": "polite" as const } : {})} style={captionStyle} data-testid="emergency-stop-ring-caption">
          {caption}
        </div>
        <ul style={gateList} aria-label="两道闸">
          {gates.map(([label, state]) => (
            <li key={label} style={gateRow} data-testid="emergency-stop-ring-gate">
              <span aria-hidden="true" style={{ ...dot, background: DOT[state] }} />
              {label}：{GATE_TEXT[state]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const DOT: Record<GateReadback, string> = {
  pending: "var(--border)",
  confirmed: "#16a34a",
  not_confirmed: "#d97706",
  unavailable: "#d97706",
};

const box: CSSProperties = { display: "flex", gap: 12, alignItems: "center", marginTop: 10 };
const centerText: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
};
const captionStyle: CSSProperties = { fontSize: 12, fontWeight: 600, lineHeight: 1.5 };
const gateList: CSSProperties = { listStyle: "none", margin: "4px 0 0", padding: 0 };
const gateRow: CSSProperties = { fontSize: 11, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 6, lineHeight: 1.6 };
const dot: CSSProperties = { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 };
