/**
 * OwnWalletSessionSection — "这台电脑 → 钱包会话（试验）"（L8-6 S7c）。只在 `VITE_AGENT_OWN_WALLET_SESSION_V1_ENABLED=1` 的构建里挂载。
 *
 * 主人在这里让这台电脑替某个 Agent 的独立钱包在额度内自动付款：开关（默认关）、新建（Agent、有效期、收款人和额度）、
 * 指纹核对、去钱包页签名、撤销、本机记录。会话钥由 Rust 生成并存在系统钥匙串里，这里看不到、拿不到；
 * 当天上限只存在这台电脑上。每 30 秒的检查由外壳里的循环做（`ownWalletSessionLoop.ts`），这里能手动检查一次。
 * 全部按钮都是本人点的，AI 调不到（命令不在 fence 里）。急停拉着时不能新建和打开。
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { getDesktopDeviceId } from "../services/desktop";
import { getKillSwitchState, onKillSwitchChange } from "../services/executionFence";
import {
  EMPTY_OWN_WALLET_SESSION_FORM,
  OWN_WALLET_SESSION_VALID_HOURS,
  buildOwnWalletSessionCreateInput,
  desktopOwnWalletSessionLoopDeps,
  desktopOwnWalletSessionTargetDeps,
  lastOwnWalletSessionTick,
  loadOwnWalletSessionTargets,
  onOwnWalletSessionTick,
  ownWalletOriginOf,
  ownWalletSessionCoinOf,
  runOwnWalletSessionTick,
  signedInOwnerUserId,
  unitsToDecimalV1,
  type OwnWalletSessionForm,
  type OwnWalletSessionTarget,
  type OwnWalletSessionTickRecord,
} from "../services/ownWalletSessionLoop";
import {
  UNKNOWN_OWN_WALLET_SESSION_VIEW,
  describeOwnWalletSessionReason,
  readOwnWalletSessions,
  revokeOwnWalletSession,
  setOwnWalletSessionsEnabled,
  startOwnWalletSessionGrant,
  type OwnWalletSessionSlot,
  type OwnWalletSessionView,
} from "../services/ownWalletSession";
import { useI18n } from "../i18n/I18nProvider";
import { pickFor, type Pick } from "../i18n/pick";

async function openExternal(href: string) {
  try {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(href);
  } catch {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const clock = (ms: number) => new Date(ms).toLocaleTimeString();

function statusText(slot: OwnWalletSessionSlot, p: Pick): string {
  if (slot.status === "revoked") return p("已撤销", "Revoked");
  if (slot.expired) return p("已到期", "Expired");
  if (slot.status === "pending") return p("等你在钱包页签名", "Waiting for your signature on the wallet page");
  return p("已启用", "Enabled");
}

function limitLines(slot: OwnWalletSessionSlot, p: Pick): string[] {
  const coin = ownWalletSessionCoinOf(slot.chainId);
  const lines: string[] = [];
  const native = slot.policy.native;
  if (native && coin) {
    const f = (v: string) => `${unitsToDecimalV1(v, coin.nativeDecimals)} ${coin.nativeSymbol}`;
    lines.push(
      p(
        `${coin.nativeSymbol}：只付给 ${short(native.payee)}；单笔 ≤ ${f(native.perTxWei)}，每天 ≤ ${f(native.dailyWei)}，合计 ≤ ${f(native.totalWei)}，最多 ${native.maxCount} 次；今天已用 ${f(slot.nativeUsedToday)}`,
        `${coin.nativeSymbol}: only to ${short(native.payee)}; per payment ≤ ${f(native.perTxWei)}, per day ≤ ${f(native.dailyWei)}, in total ≤ ${f(native.totalWei)}, at most ${native.maxCount} payments; used today ${f(slot.nativeUsedToday)}`,
      ),
    );
  }
  const token = slot.policy.token;
  if (token && coin) {
    const f = (v: string) => `${unitsToDecimalV1(v, coin.tokenDecimals)} ${coin.tokenSymbol}`;
    lines.push(
      p(
        `${coin.tokenSymbol}：只付给 ${short(token.payee)}；单笔 ≤ ${f(token.perTransfer)}，每天 ≤ ${f(token.daily)}，合计 ≤ ${f(token.total)}；今天已用 ${f(slot.tokenUsedToday)}`,
        `${coin.tokenSymbol}: only to ${short(token.payee)}; per payment ≤ ${f(token.perTransfer)}, per day ≤ ${f(token.daily)}, in total ≤ ${f(token.total)}; used today ${f(slot.tokenUsedToday)}`,
      ),
    );
  }
  return lines;
}

function hoursText(hours: number, p: Pick): string {
  if (hours === 1) return p("1 小时", "1 hour");
  if (hours === 24) return p("1 天", "1 day");
  if (hours === 168) return p("7 天", "7 days");
  return p("29 天", "29 days");
}

export default function OwnWalletSessionSection() {
  const { locale } = useI18n();
  const p = pickFor(locale);
  const loopDeps = useMemo(() => desktopOwnWalletSessionLoopDeps(), []);
  const walletOrigin = useMemo(() => ownWalletOriginOf(), []);
  const [view, setView] = useState<OwnWalletSessionView | null>(null);
  const [engaged, setEngaged] = useState(() => getKillSwitchState().engaged);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tick, setTick] = useState<OwnWalletSessionTickRecord | null>(() => lastOwnWalletSessionTick());
  const [targets, setTargets] = useState<OwnWalletSessionTarget[] | null>(null);
  const [form, setForm] = useState<OwnWalletSessionForm | null>(null);
  /** Kept in memory only: it carries the one-time token in its fragment. */
  const [grant, setGrant] = useState<{ fingerprint: string; url: string } | null>(null);

  const refresh = useCallback(async () => setView(await readOwnWalletSessions()), []);
  useEffect(() => {
    void refresh();
    const offKill = onKillSwitchChange((state) => {
      setEngaged(state.engaged);
      void refresh();
    });
    const offTick = onOwnWalletSessionTick((record) => {
      setTick(record);
      void refresh();
    });
    return () => {
      offKill();
      offTick();
    };
  }, [refresh]);

  const ready = view !== null && view.integrity !== "unknown";
  const enabled = view?.enabled === true;
  const say = (reason: string) => setMessage(`${p("没有完成：", "Not done: ")}${describeOwnWalletSessionReason(reason, locale)}`);

  const toggle = async (next: boolean) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await setOwnWalletSessionsEnabled(next);
      if (result.ok === false) say(result.reason);
      else {
        setView(result.value);
        setMessage(next ? p("已打开", "Turned on") : p("已关闭", "Turned off"));
      }
    } finally {
      setBusy(false);
    }
  };

  const openForm = async () => {
    setBusy(true);
    setMessage("");
    setGrant(null);
    try {
      const loaded = await loadOwnWalletSessionTargets(desktopOwnWalletSessionTargetDeps());
      if (loaded.ok === false) {
        say(loaded.reason);
        return;
      }
      setTargets(loaded.targets);
      setForm({ ...EMPTY_OWN_WALLET_SESSION_FORM, agentId: loaded.targets[0]?.agentId ?? "" });
      if (loaded.targets.length === 0) setMessage(p("还没有已部署独立钱包的 Agent，先在主站完成设置。", "No Agent has a deployed own wallet yet; finish the setup on the main site first."));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!form || !targets) return;
    setMessage("");
    if (!walletOrigin) return say("no_wallet_origin");
    const owner = await signedInOwnerUserId();
    if (!owner) return say("no_session");
    const built = buildOwnWalletSessionCreateInput(form, { targets, ownerUserId: owner, deviceId: getDesktopDeviceId(), nowMs: Date.now() });
    if (built.ok === false) return say(built.reason);
    setBusy(true);
    try {
      const started = await startOwnWalletSessionGrant({ api: loopDeps.api }, { ...built.input, agentId: built.target.agentId, walletOrigin });
      if (started.ok === false) say(started.reason);
      else {
        setGrant({ fingerprint: started.value.fingerprint, url: started.value.url });
        setForm(null);
        void refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (slot: OwnWalletSessionSlot) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await revokeOwnWalletSession(slot.slotId);
      if (result.ok === false) say(result.reason);
      else setMessage(p("已撤销，这台电脑不会再用这把钥匙签名。", "Revoked. This computer will not sign with this key again."));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const checkNow = async () => {
    setBusy(true);
    try {
      await runOwnWalletSessionTick(loopDeps);
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (slot: OwnWalletSessionSlot) => targets?.find((t) => t.accountId === slot.accountId)?.name ?? short(slot.account);
  const update = (change: Partial<OwnWalletSessionForm>) => setForm((f) => (f ? { ...f, ...change } : f));
  const updateNative = (change: Partial<OwnWalletSessionForm["native"]>) => setForm((f) => (f ? { ...f, native: { ...f.native, ...change } } : f));
  const updateToken = (change: Partial<OwnWalletSessionForm["token"]>) => setForm((f) => (f ? { ...f, token: { ...f.token, ...change } } : f));
  const formTarget = form ? targets?.find((t) => t.agentId === form.agentId) : undefined;
  const formCoin = formTarget ? ownWalletSessionCoinOf(formTarget.chainId) : null;
  const sessions = view?.sessions ?? UNKNOWN_OWN_WALLET_SESSION_VIEW.sessions;

  return (
    <section style={box} aria-labelledby="own-wallet-session-title" data-testid="own-wallet-session">
      <h2 id="own-wallet-session-title" style={title}>{p("钱包会话（试验）", "Wallet sessions (trial)")}</h2>
      <div style={hint}>
        {p(
          "打开以后，这台电脑可以在你定的收款人、额度和期限内，替 Agent 的独立钱包自动签付款（目前只在测试网）。钥匙只在这台电脑的系统钥匙串里，你的账号和服务器拿不到；服务器要的每一笔，这台电脑都会按你设的规则再核一遍，不符就不签。电脑关着或没联网时，这笔付款不会发出。",
          "Once on, this computer can sign payments for an Agent's own wallet by itself, only to the payee, within the limits and until the time you set (testnet only for now). The key lives only in this computer's system keychain; your account and the server never get it. This computer re-checks every payment the server asks for against your rules and signs nothing that does not fit. If the computer is off or offline, the payment is not sent.",
        )}
      </div>
      {view?.integrity === "tampered" && (
        <div role="alert" style={warn} data-testid="own-wallet-session-tampered">
          {p("会话文件被改过或读不懂，已经按关闭处理。", "The sessions file was changed or can't be read, so sessions are treated as off.")}
        </div>
      )}
      {view?.integrity === "key_unavailable" && <div role="alert" style={warn}>{p("读不到钥匙串，会话按关闭处理。", "Can't read the keychain, so sessions are treated as off.")}</div>}
      {view !== null && view.integrity === "unknown" && <div style={hint}>{p("这个窗口读不到本机的会话功能。", "This window can't reach the computer's session function.")}</div>}

      <label style={{ ...hint, display: "flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" checked={enabled} disabled={busy || !ready || (engaged && !enabled)} onChange={(e) => void toggle(e.target.checked)} data-testid="own-wallet-session-toggle" />
        {p("允许这台电脑自动签付款", "Let this computer sign payments by itself")}
      </label>
      {engaged && <div style={hint}>{p("急停拉着，现在不能打开、新建或签名。", "Emergency stop is on; nothing can be turned on, created or signed now.")}</div>}

      {enabled && (
        <>
          <div role="status" aria-live="polite" style={{ ...hint, marginTop: 8 }} data-testid="own-wallet-session-tick">
            {tick === null
              ? p("每 30 秒检查一次有没有等你这台电脑签的付款。还没有检查过。", "Checks every 30 seconds for payments waiting for this computer. Not checked yet.")
              : tick.result.kind === "off"
                ? p(`上次检查 ${clock(tick.at)}：没有动作（${describeOwnWalletSessionReason(tick.result.reason, locale)}）`, `Last check ${clock(tick.at)}: nothing to do (${describeOwnWalletSessionReason(tick.result.reason, locale)})`)
                : p(
                    `上次检查 ${clock(tick.at)}：启用 ${tick.result.activated.length} 个，签了 ${tick.result.signed.length} 笔，拒签 ${tick.result.refused.length} 笔${tick.result.unavailable ? `（读不到服务器的付款：${describeOwnWalletSessionReason(tick.result.unavailable, locale)}）` : ""}`,
                    `Last check ${clock(tick.at)}: ${tick.result.activated.length} enabled, ${tick.result.signed.length} signed, ${tick.result.refused.length} refused${tick.result.unavailable ? ` (could not read the server's payments: ${describeOwnWalletSessionReason(tick.result.unavailable, locale)})` : ""}`,
                  )}
            <button type="button" style={{ ...button, marginLeft: 8 }} disabled={busy} onClick={() => void checkNow()} data-testid="own-wallet-session-check">
              {p("现在检查", "Check now")}
            </button>
          </div>

          <h3 style={subtitle}>{p("会话", "Sessions")}</h3>
          <ul style={list} aria-label={p("这台电脑上的钱包会话", "Wallet sessions on this computer")}>
            {sessions.length === 0 && <li style={hint}>{p("还没有会话。", "No sessions yet.")}</li>}
            {sessions.map((slot) => (
              <li key={slot.slotId} style={item} data-testid="own-wallet-session-row">
                <div style={{ fontSize: 12, fontWeight: 600 }}>
                  {nameOf(slot)} · {statusText(slot, p)}
                </div>
                <div style={hint}>
                  {p("指纹：", "Fingerprint: ")}<code data-testid="own-wallet-session-fingerprint">{slot.fingerprint}</code> · {p("到期 ", "Expires ")}{new Date(slot.validUntil * 1000).toLocaleString()}
                </div>
                {limitLines(slot, p).map((line) => (
                  <div key={line} style={hint}>{line}</div>
                ))}
                {slot.status !== "revoked" && (
                  <button type="button" style={button} disabled={busy} onClick={() => void revoke(slot)} aria-label={p(`撤销 ${nameOf(slot)} 的会话 ${slot.fingerprint}`, `Revoke the session ${slot.fingerprint} of ${nameOf(slot)}`)}>
                    {p("撤销", "Revoke")}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div style={hint}>
            {p(
              "撤销会马上删掉这把钥匙，这台电脑不会再签。钱包链上的那条授权记录不会被改动，只是没有钥匙就没人能用；到期后也会失效。",
              "Revoking deletes the key at once, so this computer signs nothing more with it. The grant recorded on the chain is not changed; without the key nobody can use it, and it stops at its expiry.",
            )}
          </div>

          {grant && (
            <div style={{ ...hint, marginTop: 8 }} data-testid="own-wallet-session-grant">
              <div>
                {p("新会话的指纹：", "Fingerprint of the new session: ")}
                <code data-testid="own-wallet-session-grant-fingerprint">{grant.fingerprint}</code>
              </div>
              <div>{p("在钱包页签名前，核对那里显示的指纹和这里一模一样，并再看一遍收款人和额度；不一样就不要签。", "Before you sign on the wallet page, check that the fingerprint shown there is exactly this one, and read the payee and limits again. If it differs, do not sign.")}</div>
              <button type="button" style={button} onClick={() => void openExternal(grant.url)} data-testid="own-wallet-session-open-wallet">
                {p("去钱包页签名", "Open the wallet page to sign")}
              </button>
              <button type="button" style={{ ...button, marginLeft: 6 }} onClick={() => setGrant(null)}>{p("收起", "Hide")}</button>
              <div style={hint}>{p("签好以后回到这里，一般 30 秒内会自动启用。", "After signing, come back here; it is usually enabled within 30 seconds.")}</div>
            </div>
          )}

          {form === null ? (
            <button type="button" style={{ ...button, marginTop: 8 }} disabled={busy || engaged} onClick={() => void openForm()} data-testid="own-wallet-session-new">
              {p("新建会话", "New session")}
            </button>
          ) : (
            <form
              style={grid}
              data-testid="own-wallet-session-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <label style={hint}>{p("Agent", "Agent")}</label>
              <select aria-label={p("Agent", "Agent")} value={form.agentId} onChange={(e) => update({ agentId: e.target.value })} style={input}>
                {(targets ?? []).map((t) => (
                  <option key={t.agentId} value={t.agentId}>{t.name}</option>
                ))}
              </select>
              <label style={hint}>{p("有效期", "Valid for")}</label>
              <select aria-label={p("有效期", "Valid for")} value={form.validHours} onChange={(e) => update({ validHours: Number(e.target.value) })} style={input}>
                {OWN_WALLET_SESSION_VALID_HOURS.map((h) => (
                  <option key={h} value={h}>{hoursText(h, p)}</option>
                ))}
              </select>

              <label style={{ ...hint, gridColumn: "1 / -1", display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={form.native.on} onChange={(e) => updateNative({ on: e.target.checked })} />
                {p(`付 ${formCoin?.nativeSymbol ?? "原生币"}`, `Pay ${formCoin?.nativeSymbol ?? "the native coin"}`)}
              </label>
              {form.native.on && (
                <>
                  <label style={hint}>{p("只付给这个地址", "Only to this address")}</label>
                  <input aria-label={p("原生币收款地址", "Native coin payee")} value={form.native.payee} onChange={(e) => updateNative({ payee: e.target.value })} style={input} placeholder="0x…" spellCheck={false} />
                  <label style={hint}>{p(`单笔上限（${formCoin?.nativeSymbol ?? ""}）`, `Per payment (${formCoin?.nativeSymbol ?? ""})`)}</label>
                  <input aria-label={p("原生币单笔上限", "Native per payment")} value={form.native.perTx} onChange={(e) => updateNative({ perTx: e.target.value })} style={input} inputMode="decimal" />
                  <label style={hint}>{p("每天上限（只记在这台电脑上）", "Per day (kept on this computer only)")}</label>
                  <input aria-label={p("原生币每天上限", "Native per day")} value={form.native.daily} onChange={(e) => updateNative({ daily: e.target.value })} style={input} inputMode="decimal" />
                  <label style={hint}>{p("合计上限", "In total")}</label>
                  <input aria-label={p("原生币合计上限", "Native in total")} value={form.native.total} onChange={(e) => updateNative({ total: e.target.value })} style={input} inputMode="decimal" />
                  <label style={hint}>{p("最多几次（1–1000）", "Most payments (1–1000)")}</label>
                  <input aria-label={p("原生币最多几次", "Native most payments")} value={form.native.maxCount} onChange={(e) => updateNative({ maxCount: e.target.value })} style={input} inputMode="numeric" />
                </>
              )}

              <label style={{ ...hint, gridColumn: "1 / -1", display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={form.token.on} onChange={(e) => updateToken({ on: e.target.checked })} />
                {p(`付 ${formCoin?.tokenSymbol ?? "代币"}`, `Pay ${formCoin?.tokenSymbol ?? "the token"}`)}
              </label>
              {form.token.on && (
                <>
                  <label style={hint}>{p("只付给这个地址", "Only to this address")}</label>
                  <input aria-label={p("代币收款地址", "Token payee")} value={form.token.payee} onChange={(e) => updateToken({ payee: e.target.value })} style={input} placeholder="0x…" spellCheck={false} />
                  <label style={hint}>{p(`单笔上限（${formCoin?.tokenSymbol ?? ""}）`, `Per payment (${formCoin?.tokenSymbol ?? ""})`)}</label>
                  <input aria-label={p("代币单笔上限", "Token per payment")} value={form.token.perTransfer} onChange={(e) => updateToken({ perTransfer: e.target.value })} style={input} inputMode="decimal" />
                  <label style={hint}>{p("每天上限（只记在这台电脑上）", "Per day (kept on this computer only)")}</label>
                  <input aria-label={p("代币每天上限", "Token per day")} value={form.token.daily} onChange={(e) => updateToken({ daily: e.target.value })} style={input} inputMode="decimal" />
                  <label style={hint}>{p("合计上限", "In total")}</label>
                  <input aria-label={p("代币合计上限", "Token in total")} value={form.token.total} onChange={(e) => updateToken({ total: e.target.value })} style={input} inputMode="decimal" />
                </>
              )}
              <div style={{ ...hint, gridColumn: "1 / -1" }}>
                {p(
                  "额度是对这一个收款人的总额。授权要你在钱包页用钱包 passkey 签一次；这台电脑的钥匙在此刻生成。",
                  "The limits are totals for this one payee. You sign the grant once on the wallet page with your wallet passkey; this computer makes its key now.",
                )}
              </div>
              <button type="button" style={button} disabled={busy} onClick={() => setForm(null)}>{p("取消", "Cancel")}</button>
              <button type="submit" style={button} disabled={busy || !walletOrigin}>{p("生成钥匙并去签名", "Make the key and go sign")}</button>
              {!walletOrigin && <div style={{ ...warn, gridColumn: "1 / -1" }}>{describeOwnWalletSessionReason("no_wallet_origin", locale)}</div>}
            </form>
          )}

          <h3 style={subtitle}>{p("本机记录", "Log on this computer")}</h3>
          <ul style={list}>
            {(view?.log ?? []).length === 0 && <li style={hint}>{p("还没有记录。这里只记结果和原因，不记地址和金额。", "Nothing yet. Only the outcome and the reason are kept here, never an address or an amount.")}</li>}
            {(view?.log ?? []).slice(-10).reverse().map((entry) => (
              <li key={`${entry.at}-${entry.requestRef}`} style={hint} data-testid="own-wallet-session-log">
                {clock(entry.at)} · {entry.outcome === "signed" ? p("已签", "Signed") : p("拒签", "Refused")} · {describeOwnWalletSessionReason(entry.reason, locale)}
              </li>
            ))}
          </ul>
        </>
      )}

      {message && <div role="status" style={hint} data-testid="own-wallet-session-message">{message}</div>}
    </section>
  );
}

const box: CSSProperties = { padding: 12, borderRadius: 8, border: "1px solid var(--border)", marginBottom: 12 };
const title: CSSProperties = { fontSize: 13, fontWeight: 600, margin: 0 };
const subtitle: CSSProperties = { fontSize: 12, fontWeight: 600, margin: "12px 0 0" };
const hint: CSSProperties = { fontSize: 11, color: "var(--text-dim)", marginTop: 4, lineHeight: 1.5 };
const warn: CSSProperties = { ...hint, color: "var(--tone-warning-text)" };
const list: CSSProperties = { listStyle: "none", margin: "4px 0 0", padding: 0 };
const item: CSSProperties = { padding: "6px 0", borderTop: "1px solid var(--border)" };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, alignItems: "center", marginTop: 8 };
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
