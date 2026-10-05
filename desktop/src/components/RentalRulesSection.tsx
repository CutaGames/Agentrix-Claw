/**
 * RentalRulesSection — "这台电脑 → 出租（试验）"（L5，REQ-desktop-060 第 3 节，E100）。默认关。
 *
 * 主人在这里填一条 `DeviceCapabilityRuleV0`（出租给别的主人的 Agent，能力是本地模型推理）：时段、要空闲、要接电源、
 * 要不要批准、每单最低价、每天最多几单和几分钟；再加这台电脑自己的：空闲多少分钟算空闲、最多几核、多少内存。
 * 下面写明"现在为什么不能出租"。平台还没开放，所以现在只能先把规则定好。
 * 只有这里能改，AI 调不到；急停拉着时打不开。
 */
import { useCallback, useEffect, useId, useState, type CSSProperties } from "react";
import type { DeviceCapabilityRuleV0, DeviceRuleApprovalV0 } from "../../../shared/types/device-capability";
import { getDesktopDeviceId } from "../services/desktop";
import { getKillSwitchState, onKillSwitchChange } from "../services/executionFence";
import {
  RENTAL_CAPABILITY_TYPE,
  RENTAL_IDLE_MINUTES,
  describeRentalBlocker,
  describeRentalRuleErrors,
  describeRentalRulesReason,
  draftRentalRule,
  readRentalRules,
  rentalVerdict,
  ruleRisk,
  saveRentalRules,
  type RentalRulesInput,
  type RentalRulesView,
} from "../services/rentalRules";

const RISK_LABEL: Record<string, string> = { low: "低", medium: "中", high: "高", critical: "极高" };
const APPROVAL_LABEL: Record<DeviceRuleApprovalV0, string> = { never: "不用批准", first_time: "同一个租用方第一次时问我", every_time: "每一单都问我" };

interface Draft {
  windows: string[];
  requireIdle: boolean;
  approval: DeviceRuleApprovalV0;
  minPrice: string;
  maxJobs: string;
  maxMinutes: string;
  idleMinutes: string;
  maxCores: string;
  maxMemoryGib: string;
}

function systemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function draftFrom(view: RentalRulesView): Draft {
  const rule = view.rule ?? {};
  const text = (value: unknown) => (typeof value === "number" && Number.isInteger(value) ? String(value) : "");
  const approval = rule.approval === "never" || rule.approval === "every_time" ? rule.approval : "first_time";
  return {
    windows: Array.isArray(rule.windows) ? rule.windows.filter((w): w is string => typeof w === "string") : [],
    requireIdle: rule.requireIdle !== false,
    approval,
    minPrice: text(rule.minPriceCentsPerJob),
    maxJobs: text(rule.maxJobsPerDay),
    maxMinutes: text(rule.maxMinutesPerDay),
    idleMinutes: String(view.idleMinutes),
    maxCores: String(view.maxCores),
    maxMemoryGib: String(view.maxMemoryGib),
  };
}

function describeWindow(window: string): string {
  const [from, to] = window.split("-");
  if (from === to) return "全天";
  return to < from ? `${from}–次日 ${to}` : `${from}–${to}`;
}

export default function RentalRulesSection() {
  const [view, setView] = useState<RentalRulesView | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [engaged, setEngaged] = useState(() => getKillSwitchState().engaged);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [from, setFrom] = useState("22:00");
  const [to, setTo] = useState("07:00");
  const [now, setNow] = useState(() => new Date());
  const ids = {
    desc: useId(),
    from: useId(),
    to: useId(),
    approval: useId(),
    price: useId(),
    jobs: useId(),
    minutes: useId(),
    idle: useId(),
    cores: useId(),
    memory: useId(),
  };

  const show = useCallback((next: RentalRulesView) => {
    setView(next);
    setDraft(draftFrom(next));
    setNow(new Date());
  }, []);
  const refresh = useCallback(async () => show(await readRentalRules()), [show]);
  useEffect(() => {
    void refresh();
    return onKillSwitchChange((state) => {
      setEngaged(state.engaged);
      void refresh();
    });
  }, [refresh]);

  const ruleFromDraft = (d: Draft): DeviceCapabilityRuleV0 => {
    const base = draftRentalRule(getDesktopDeviceId(), systemTimezone());
    const previous = typeof view?.rule?.revision === "number" && Number.isInteger(view.rule.revision) ? (view.rule.revision as number) : 0;
    const integer = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : (Number.NaN as number));
    return {
      ...(base as unknown as DeviceCapabilityRuleV0),
      windows: d.windows,
      requireIdle: d.requireIdle,
      // The pilot rents on mains power only (REQ-desktop-060 §3).
      requireOnPower: true,
      approval: d.approval,
      minPriceCentsPerJob: integer(d.minPrice),
      maxJobsPerDay: integer(d.maxJobs),
      maxMinutesPerDay: integer(d.maxMinutes),
      revision: previous + 1,
    };
  };

  const save = async (enabled: boolean, d: Draft, done: string) => {
    if (!view) return;
    setBusy(true);
    setMessage("");
    setErrors([]);
    try {
      const input: RentalRulesInput = {
        enabled,
        rule: ruleFromDraft(d),
        idleMinutes: Number(d.idleMinutes),
        maxCores: Number(d.maxCores),
        maxMemoryGib: Number(d.maxMemoryGib),
      };
      const result = await saveRentalRules(input);
      if (!result.ok) {
        setMessage(`没有完成：${describeRentalRulesReason(result.reason)}`);
        setErrors(describeRentalRuleErrors(result.errors));
      } else {
        show(result.view);
        setMessage(done);
      }
    } finally {
      setBusy(false);
    }
  };

  const ready = view !== null && view.integrity !== "unknown" && draft !== null;
  const enabled = view?.enabled === true;
  const verdict = view ? rentalVerdict(view, now) : { mayRent: false, blockers: ["off" as const] };
  const update = (change: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...change } : d));
  const addWindow = () => {
    if (!draft) return;
    if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) {
      setMessage("没有完成：时间写成 HH:MM");
      return;
    }
    update({ windows: [...draft.windows, `${from}-${to}`] });
    setMessage("加上了，记得点保存");
  };

  return (
    <section style={box} aria-labelledby="rental-rules-title" data-testid="rental-rules">
      <h2 id="rental-rules-title" style={title}>出租（试验）</h2>
      <div style={hint} id={ids.desc}>
        打开以后，这台电脑可以在你定的条件下替别的主人的 Agent 跑本地模型推理。每个任务新起一个受限进程：读不到你的文件，不能联网，用完就停；急停一拉立刻停。只在接着电源、机器不热的时候出租。收入只看服务端的记账，本机不存金额。
      </div>
      {view?.integrity === "tampered" && (
        <div role="alert" style={warn} data-testid="rental-rules-tampered">
          规则文件被改过或读不懂，已经按关闭处理。重新保存一次即可。
        </div>
      )}
      {view?.integrity === "key_unavailable" && (
        <div role="alert" style={warn}>读不到钥匙串，规则按关闭处理。</div>
      )}
      <label style={{ ...hint, display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy || !ready || (engaged && !enabled) || (!enabled && view?.probes.supportedOs !== true)}
          aria-describedby={ids.desc}
          onChange={(e) => draft && void save(e.target.checked, draft, e.target.checked ? "已允许出租" : "已暂停出租")}
          data-testid="rental-rules-toggle"
        />
        允许出租
      </label>
      {engaged && <div style={hint}>急停拉着，现在不能打开。</div>}

      <div role="status" aria-live="polite" style={{ ...hint, marginTop: 8 }} data-testid="rental-rules-verdict">
        {verdict.mayRent ? (
          "现在可以接出租任务。"
        ) : (
          <>
            现在不会出租：
            <ul style={reasons}>
              {verdict.blockers.map((blocker) => (
                <li key={blocker} data-testid="rental-rules-blocker">
                  {describeRentalBlocker(blocker)}
                </li>
              ))}
            </ul>
          </>
        )}
        <button type="button" style={button} disabled={busy} onClick={() => void refresh()}>
          重新检查
        </button>
      </div>

      <div style={{ ...hint, marginTop: 8 }} data-testid="rental-rules-capability">
        出租的能力：本地模型推理（{RENTAL_CAPABILITY_TYPE}，风险{RISK_LABEL[ruleRisk()] ?? ruleRisk()}）· 平台还没开放
      </div>

      <h3 style={subtitle}>时段（{systemTimezone()}）</h3>
      <ul style={list} aria-label="出租时段">
        {(draft?.windows ?? []).length === 0 && <li style={hint}>没有设时段，按合同就是全天。建议至少设一段。</li>}
        {(draft?.windows ?? []).map((window, index) => (
          <li key={`${window}-${index}`} style={item} data-testid="rental-rules-window">
            <span style={{ fontSize: 12 }}>{describeWindow(window)}</span>
            <button
              type="button"
              style={button}
              disabled={busy || !ready}
              aria-label={`删掉时段 ${describeWindow(window)}`}
              onClick={() => draft && update({ windows: draft.windows.filter((_, i) => i !== index) })}
            >
              删掉
            </button>
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
        <label htmlFor={ids.from} style={hint}>从</label>
        <input id={ids.from} type="time" value={from} onChange={(e) => setFrom(e.target.value)} style={input} />
        <label htmlFor={ids.to} style={hint}>到（比开始早就是到第二天）</label>
        <input id={ids.to} type="time" value={to} onChange={(e) => setTo(e.target.value)} style={input} />
        <button type="button" style={button} disabled={busy || !ready} onClick={addWindow}>
          加上时段
        </button>
      </div>

      <h3 style={subtitle}>条件、价格和用量</h3>
      {draft && (
        <form
          style={grid}
          onSubmit={(e) => {
            e.preventDefault();
            void save(enabled, draft, "已保存");
          }}
        >
          <label style={{ ...hint, gridColumn: "1 / -1", display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={draft.requireIdle} onChange={(e) => update({ requireIdle: e.target.checked })} />
            只在我不用电脑时
          </label>
          <label htmlFor={ids.idle} style={hint}>
            多久没碰键盘鼠标算不用（分钟，{RENTAL_IDLE_MINUTES.min}–{RENTAL_IDLE_MINUTES.max}）
          </label>
          <input id={ids.idle} type="number" value={draft.idleMinutes} onChange={(e) => update({ idleMinutes: e.target.value })} style={input} />
          <label style={{ ...hint, gridColumn: "1 / -1", display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked disabled />
            只在接着电源时（试验期固定）
          </label>
          <label htmlFor={ids.approval} style={hint}>要不要我批准</label>
          <select id={ids.approval} value={draft.approval} onChange={(e) => update({ approval: e.target.value as DeviceRuleApprovalV0 })} style={input}>
            {(Object.keys(APPROVAL_LABEL) as DeviceRuleApprovalV0[]).map((key) => (
              <option key={key} value={key}>
                {APPROVAL_LABEL[key]}
              </option>
            ))}
          </select>
          <label htmlFor={ids.price} style={hint}>每单最低价（美分）</label>
          <input id={ids.price} type="number" min={1} value={draft.minPrice} onChange={(e) => update({ minPrice: e.target.value })} style={input} />
          <label htmlFor={ids.jobs} style={hint}>每天最多几单</label>
          <input id={ids.jobs} type="number" min={1} value={draft.maxJobs} onChange={(e) => update({ maxJobs: e.target.value })} style={input} />
          <label htmlFor={ids.minutes} style={hint}>每天最多跑几分钟</label>
          <input id={ids.minutes} type="number" min={1} value={draft.maxMinutes} onChange={(e) => update({ maxMinutes: e.target.value })} style={input} />
          <label htmlFor={ids.cores} style={hint}>
            最多用几个核（这台有 {view?.cpus || "?"} 个，至少留 1 个给你；现在实际 {view?.coresAllowed ?? 0} 个）
          </label>
          <input id={ids.cores} type="number" min={1} value={draft.maxCores} onChange={(e) => update({ maxCores: e.target.value })} style={input} />
          <label htmlFor={ids.memory} style={hint}>
            最多用多少内存（GB，不超过一半；现在实际 {view?.memoryGibAllowed ?? 0} GB）
          </label>
          <input id={ids.memory} type="number" min={1} value={draft.maxMemoryGib} onChange={(e) => update({ maxMemoryGib: e.target.value })} style={input} />
          <span />
          <button type="submit" style={button} disabled={busy || !ready}>
            保存
          </button>
        </form>
      )}

      <h3 style={subtitle}>收入</h3>
      <div style={hint} data-testid="rental-rules-earnings">还没有出租记录。收入以服务端记账为准，接上之前这里不显示金额。</div>

      {message && (
        <div role="status" style={hint} data-testid="rental-rules-message">
          {message}
        </div>
      )}
      {errors.length > 0 && (
        <ul style={{ ...reasons, ...warn }} data-testid="rental-rules-errors">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

const box: CSSProperties = { padding: 12, borderRadius: 8, border: "1px solid var(--border)", marginBottom: 12 };
const title: CSSProperties = { fontSize: 13, fontWeight: 600, margin: 0 };
const subtitle: CSSProperties = { fontSize: 12, fontWeight: 600, margin: "12px 0 0" };
const hint: CSSProperties = { fontSize: 11, color: "var(--text-dim)", marginTop: 4, lineHeight: 1.5 };
const warn: CSSProperties = { ...hint, color: "var(--tone-warning-text)" };
const reasons: CSSProperties = { margin: "2px 0 4px", paddingLeft: 18 };
const list: CSSProperties = { listStyle: "none", margin: "4px 0 0", padding: 0 };
const item: CSSProperties = { display: "flex", gap: 8, alignItems: "baseline", padding: "4px 0", borderTop: "1px solid var(--border)" };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 120px", gap: 6, alignItems: "center", marginTop: 4 };
const input: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
  fontSize: 12,
};
const button: CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
  fontSize: 12,
  cursor: "pointer",
};
