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
import { useI18n } from "../i18n/I18nProvider";
import { pickFor, type Pick } from "../i18n/pick";

const RISK_LABEL: Record<string, readonly [string, string]> = { low: ["低", "low"], medium: ["中", "medium"], high: ["高", "high"], critical: ["极高", "critical"] };
const APPROVAL_LABEL: Record<DeviceRuleApprovalV0, readonly [string, string]> = {
  never: ["不用批准", "No approval needed"],
  first_time: ["同一个租用方第一次时问我", "Ask me the first time for each renter"],
  every_time: ["每一单都问我", "Ask me for every job"],
};

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

function pickRisk(risk: string, p: Pick): string {
  const words = RISK_LABEL[risk];
  return words ? p(...words) : risk;
}

function describeWindow(window: string, p: Pick): string {
  const [from, to] = window.split("-");
  if (from === to) return p("全天", "All day");
  return to < from ? `${from}–${p("次日", "next day")} ${to}` : `${from}–${to}`;
}

export default function RentalRulesSection() {
  const { locale } = useI18n();
  const p = pickFor(locale);
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
        setMessage(`${p("没有完成：", "Not done: ")}${describeRentalRulesReason(result.reason, locale)}`);
        setErrors(describeRentalRuleErrors(result.errors, locale));
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
      setMessage(p("没有完成：时间写成 HH:MM", "Not done: write the time as HH:MM"));
      return;
    }
    update({ windows: [...draft.windows, `${from}-${to}`] });
    setMessage(p("加上了，记得点保存", "Added. Remember to press Save"));
  };

  return (
    <section style={box} aria-labelledby="rental-rules-title" data-testid="rental-rules">
      <h2 id="rental-rules-title" style={title}>{p("出租（试验）", "Renting out (trial)")}</h2>
      <div style={hint} id={ids.desc}>
        {p(
          "打开以后，这台电脑可以在你定的条件下替别的主人的 Agent 跑本地模型推理。每个任务新起一个受限进程：读不到你的文件，不能联网，用完就停；急停一拉立刻停。只在接着电源、机器不热的时候出租。收入只看服务端的记账，本机不存金额。",
          "Once on, this computer can run local model inference for other owners' Agents under the conditions you set. Each job starts a restricted process: it can't read your files or reach the network, and it stops when done; the emergency stop halts it at once. It only rents while on mains power and not hot. Earnings come only from the server's books; this computer stores no amounts.",
        )}
      </div>
      {view?.integrity === "tampered" && (
        <div role="alert" style={warn} data-testid="rental-rules-tampered">
          {p("规则文件被改过或读不懂，已经按关闭处理。重新保存一次即可。", "The rules file was changed or can't be read, so renting is treated as off. Save once more to fix it.")}
        </div>
      )}
      {view?.integrity === "key_unavailable" && (
        <div role="alert" style={warn}>{p("读不到钥匙串，规则按关闭处理。", "Can't read the keychain, so the rules are treated as off.")}</div>
      )}
      <label style={{ ...hint, display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy || !ready || (engaged && !enabled) || (!enabled && view?.probes.supportedOs !== true)}
          aria-describedby={ids.desc}
          onChange={(e) => draft && void save(e.target.checked, draft, e.target.checked ? p("已允许出租", "Renting allowed") : p("已暂停出租", "Renting paused"))}
          data-testid="rental-rules-toggle"
        />
        {p("允许出租", "Allow renting")}
      </label>
      {engaged && <div style={hint}>{p("急停拉着，现在不能打开。", "Emergency stop is on; it can't be turned on now.")}</div>}

      <div role="status" aria-live="polite" style={{ ...hint, marginTop: 8 }} data-testid="rental-rules-verdict">
        {verdict.mayRent ? (
          p("现在可以接出租任务。", "It can take rental jobs now.")
        ) : (
          <>
            {p("现在不会出租：", "It won't rent right now:")}
            <ul style={reasons}>
              {verdict.blockers.map((blocker) => (
                <li key={blocker} data-testid="rental-rules-blocker">
                  {describeRentalBlocker(blocker, locale)}
                </li>
              ))}
            </ul>
          </>
        )}
        <button type="button" style={button} disabled={busy} onClick={() => void refresh()}>
          {p("重新检查", "Check again")}
        </button>
      </div>

      <div style={{ ...hint, marginTop: 8 }} data-testid="rental-rules-capability">
        {p(
          `出租的能力：本地模型推理（${RENTAL_CAPABILITY_TYPE}，风险${pickRisk(ruleRisk(), p)}）· 平台还没开放`,
          `Capability rented: local model inference (${RENTAL_CAPABILITY_TYPE}, ${pickRisk(ruleRisk(), p)} risk) · not open on the platform yet`,
        )}
      </div>

      <h3 style={subtitle}>{p(`时段（${systemTimezone()}）`, `Time windows (${systemTimezone()})`)}</h3>
      <ul style={list} aria-label={p("出租时段", "Renting time windows")}>
        {(draft?.windows ?? []).length === 0 && <li style={hint}>{p("没有设时段，按合同就是全天。建议至少设一段。", "No time window set; by the contract that means all day. Set at least one.")}</li>}
        {(draft?.windows ?? []).map((window, index) => (
          <li key={`${window}-${index}`} style={item} data-testid="rental-rules-window">
            <span style={{ fontSize: 12 }}>{describeWindow(window, p)}</span>
            <button
              type="button"
              style={button}
              disabled={busy || !ready}
              aria-label={p(`删掉时段 ${describeWindow(window, p)}`, `Remove window ${describeWindow(window, p)}`)}
              onClick={() => draft && update({ windows: draft.windows.filter((_, i) => i !== index) })}
            >
              {p("删掉", "Remove")}
            </button>
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
        <label htmlFor={ids.from} style={hint}>{p("从", "From")}</label>
        <input id={ids.from} type="time" value={from} onChange={(e) => setFrom(e.target.value)} style={input} />
        <label htmlFor={ids.to} style={hint}>{p("到（比开始早就是到第二天）", "To (earlier than the start means the next day)")}</label>
        <input id={ids.to} type="time" value={to} onChange={(e) => setTo(e.target.value)} style={input} />
        <button type="button" style={button} disabled={busy || !ready} onClick={addWindow}>
          {p("加上时段", "Add window")}
        </button>
      </div>

      <h3 style={subtitle}>{p("条件、价格和用量", "Conditions, price and limits")}</h3>
      {draft && (
        <form
          style={grid}
          onSubmit={(e) => {
            e.preventDefault();
            void save(enabled, draft, p("已保存", "Saved"));
          }}
        >
          <label style={{ ...hint, gridColumn: "1 / -1", display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={draft.requireIdle} onChange={(e) => update({ requireIdle: e.target.checked })} />
            {p("只在我不用电脑时", "Only when I'm not using the computer")}
          </label>
          <label htmlFor={ids.idle} style={hint}>
            {p(
              `多久没碰键盘鼠标算不用（分钟，${RENTAL_IDLE_MINUTES.min}–${RENTAL_IDLE_MINUTES.max}）`,
              `How long without keyboard or mouse counts as away (minutes, ${RENTAL_IDLE_MINUTES.min}–${RENTAL_IDLE_MINUTES.max})`,
            )}
          </label>
          <input id={ids.idle} type="number" value={draft.idleMinutes} onChange={(e) => update({ idleMinutes: e.target.value })} style={input} />
          <label style={{ ...hint, gridColumn: "1 / -1", display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked disabled />
            {p("只在接着电源时（试验期固定）", "Only on mains power (fixed during the trial)")}
          </label>
          <label htmlFor={ids.approval} style={hint}>{p("要不要我批准", "Whether I approve")}</label>
          <select id={ids.approval} value={draft.approval} onChange={(e) => update({ approval: e.target.value as DeviceRuleApprovalV0 })} style={input}>
            {(Object.keys(APPROVAL_LABEL) as DeviceRuleApprovalV0[]).map((key) => (
              <option key={key} value={key}>
                {p(...APPROVAL_LABEL[key])}
              </option>
            ))}
          </select>
          <label htmlFor={ids.price} style={hint}>{p("每单最低价（美分）", "Minimum price per job (cents)")}</label>
          <input id={ids.price} type="number" min={1} value={draft.minPrice} onChange={(e) => update({ minPrice: e.target.value })} style={input} />
          <label htmlFor={ids.jobs} style={hint}>{p("每天最多几单", "Most jobs per day")}</label>
          <input id={ids.jobs} type="number" min={1} value={draft.maxJobs} onChange={(e) => update({ maxJobs: e.target.value })} style={input} />
          <label htmlFor={ids.minutes} style={hint}>{p("每天最多跑几分钟", "Most minutes per day")}</label>
          <input id={ids.minutes} type="number" min={1} value={draft.maxMinutes} onChange={(e) => update({ maxMinutes: e.target.value })} style={input} />
          <label htmlFor={ids.cores} style={hint}>
            {p(
              `最多用几个核（这台有 ${view?.cpus || "?"} 个，至少留 1 个给你；现在实际 ${view?.coresAllowed ?? 0} 个）`,
              `Most cores to use (this computer has ${view?.cpus || "?"}; at least 1 stays free for you; actual now: ${view?.coresAllowed ?? 0})`,
            )}
          </label>
          <input id={ids.cores} type="number" min={1} value={draft.maxCores} onChange={(e) => update({ maxCores: e.target.value })} style={input} />
          <label htmlFor={ids.memory} style={hint}>
            {p(
              `最多用多少内存（GB，不超过一半；现在实际 ${view?.memoryGibAllowed ?? 0} GB）`,
              `Most memory to use (GB, at most half; actual now: ${view?.memoryGibAllowed ?? 0} GB)`,
            )}
          </label>
          <input id={ids.memory} type="number" min={1} value={draft.maxMemoryGib} onChange={(e) => update({ maxMemoryGib: e.target.value })} style={input} />
          <span />
          <button type="submit" style={button} disabled={busy || !ready}>
            {p("保存", "Save")}
          </button>
        </form>
      )}

      <h3 style={subtitle}>{p("收入", "Earnings")}</h3>
      <div style={hint} data-testid="rental-rules-earnings">{p("还没有出租记录。收入以服务端记账为准，接上之前这里不显示金额。", "No rentals yet. Earnings follow the server's books; no amount is shown here until that is connected.")}</div>

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
