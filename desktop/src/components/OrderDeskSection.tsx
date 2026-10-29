/**
 * OrderDeskSection — "分身 → 接单与交付"（桌面 D5 第 1 片，REQ-desktop-032）。
 *
 * 分身接到的付费问答 / 定金：看买方的问题，写回答、存草稿，交付前再看一遍，本人勾选"我看过了"
 * 才能交付（`orderDesk.deliverReviewedDraft` 只交本人看过的那份）。钱在托管里，买方验收以后才放款。
 * 订单总开关没开时只写"还没有开放"。所有按钮都是本人点的，AI 调不到。
 *
 * 第 2 片（合同 v0.11）：这台电脑绑定以后，还没有草稿的单可以"让电脑先备一份"（本机模型写，运行时凭据存，
 * `orderRuntimeDraft.ts`）。电脑备的草稿标"这份是电脑备的，请看过再交付"；交付照旧只认本人看过的那份。
 *
 * 后台起草（REQ-desktop-047，`orderBackgroundDraft.ts`）：绑定以后这里多一个本机开关，默认关。打开以后，
 * 有新付款的单时电脑在接着电源时先备一份，一次一张；交付照旧要本人看过、勾选。
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { formatMoney, reviewableDeliveryDraft, type OrderSellerView } from "../../../shared/types/order-escrow-view";
import { ORDER_DELIVERY_ANSWER_MAX_CHARS } from "../../../shared/types/order-escrow";
import { agentAccountIdOf } from "../services/actionReceipts";
import {
  canDeliver,
  deliverReviewedDraft,
  describeOrderDeskReason,
  loadOrderDesk,
  saveDeliveryDraft,
  validateAnswer,
  type OrderDeskLoad,
} from "../services/orderDesk";
import { useAuthStore } from "../services/store";
import { useI18n } from "../i18n/I18nProvider";
import { fill, type Translator } from "../i18n/strings";
import { DEVICE_ENROLLMENT_CHANGED_EVENT, readEnrollmentStatus, renewRuntimeCredential } from "../services/deviceEnrollment";
import {
  BACKGROUND_DRAFT_CHANGED_EVENT,
  BACKGROUND_DRAFT_READY_EVENT,
  isBackgroundDraftingOn,
  setBackgroundDrafting,
} from "../services/orderBackgroundDraft";
import {
  describeComputerDraftReason,
  draftWithComputer,
  isComputerDraft,
  loadComputerDraftMarks,
  type ComputerDraftMark,
} from "../services/orderRuntimeDraft";

export function orderStatusText(status: OrderSellerView["status"], t: Translator): string {
  return t(`orders.status.${status}`);
}

function orderKindText(kind: OrderSellerView["kind"], t: Translator): string {
  return t(`orders.kind.${kind}`);
}

/**
 * Reasons that all mean "your main Agent could not be found" — there is no twin yet, so there is nothing to retry
 * (T7 r2, 10-16: the desk said "没有读到订单：读不到主 Agent 的编号" with a 重试 that could never work).
 */
export function isNoTwinReason(reason: string): boolean {
  return reason === "agent_unresolved" || reason === "no_agent";
}

export default function OrderDeskSection() {
  const { t } = useI18n();
  const token = useAuthStore((s) => s.token);
  const instances = useAuthStore((s) => s.instances);
  const activeInstanceId = useAuthStore((s) => s.activeInstanceId);
  const active = instances.find((i) => i.id === activeInstanceId) ?? instances.find((i) => (i as { isPrimary?: boolean }).isPrimary) ?? instances[0];
  const agentAccountId = active ? agentAccountIdOf(active as never) : null;
  const [load, setLoad] = useState<OrderDeskLoad | null>(null);
  // D5 slice 2: drafts this computer wrote (local marks, no text) and whether it can draft at all.
  const [marks, setMarks] = useState<ComputerDraftMark[]>([]);
  const [computerCanDraft, setComputerCanDraft] = useState(false);
  const [backgroundOn, setBackgroundOn] = useState(() => isBackgroundDraftingOn());

  const reload = useCallback(async () => {
    setLoad(await loadOrderDesk({ token, agentAccountId }));
    setMarks(await loadComputerDraftMarks());
  }, [token, agentAccountId]);

  useEffect(() => {
    let alive = true;
    setLoad(null);
    void loadOrderDesk({ token, agentAccountId }).then((next) => alive && setLoad(next));
    void loadComputerDraftMarks().then((next) => alive && setMarks(next));
    return () => {
      alive = false;
    };
  }, [token, agentAccountId]);

  useEffect(() => {
    let alive = true;
    // The event carries the new status; do not re-read in the listener (reading publishes the event).
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ bound?: boolean }>).detail;
      if (alive) setComputerCanDraft(detail?.bound === true);
    };
    window.addEventListener(DEVICE_ENROLLMENT_CHANGED_EVENT, onChanged);
    // A live binding is enough: an expired runtime credential is re-issued on the owner's click.
    void readEnrollmentStatus().then((status) => alive && setComputerCanDraft(status.bound));
    return () => {
      alive = false;
      window.removeEventListener(DEVICE_ENROLLMENT_CHANGED_EVENT, onChanged);
    };
  }, []);

  // A draft written in the background shows up without a manual refresh.
  useEffect(() => {
    const onReady = () => void reload();
    const onSetting = () => setBackgroundOn(isBackgroundDraftingOn());
    window.addEventListener(BACKGROUND_DRAFT_READY_EVENT, onReady);
    window.addEventListener(BACKGROUND_DRAFT_CHANGED_EVENT, onSetting);
    return () => {
      window.removeEventListener(BACKGROUND_DRAFT_READY_EVENT, onReady);
      window.removeEventListener(BACKGROUND_DRAFT_CHANGED_EVENT, onSetting);
    };
  }, [reload]);

  const replace = (order: OrderSellerView) =>
    setLoad((current) =>
      current?.state === "ready"
        ? { ...current, orders: current.orders.map((item) => (item.orderId === order.orderId ? order : item)) }
        : current,
    );

  let body;
  if (load === null) body = <div style={hint}>{t("orders.loading")}</div>;
  else if (load.state === "signed_out") body = <div style={hint}>{t("orders.signedOut")}</div>;
  else if (load.state === "unavailable") body = <div style={hint} data-testid="order-desk-unavailable">{t("orders.unavailable")}</div>;
  else if (load.state === "error" && isNoTwinReason(load.reason))
    body = (
      <div style={hint} role="status" data-testid="order-desk-no-twin">
        {t("orders.noTwin")}
      </div>
    );
  else if (load.state === "error")
    body = (
      <div style={hint} role="status">
        {fill(t("orders.readError"), { reason: describeOrderDeskReason(load.reason, t) })}
        <button type="button" style={{ ...button, marginLeft: 8 }} onClick={() => void reload()}>
          {t("common.retry")}
        </button>
      </div>
    );
  else if (load.orders.length === 0) body = <div style={hint}>{t("orders.empty")}</div>;
  else
    body = (
      <>
        {load.orders.some((order) => order.environment === "test") && (
          <div role="note" style={testBanner} data-testid="order-desk-test-mode">
            {t("orders.testMode")}
          </div>
        )}
        {load.orders.map((order) => (
          <OrderCard
            key={order.orderId}
            order={order}
            token={token ?? ""}
            computerDraft={isComputerDraft(order, marks)}
            computerCanDraft={computerCanDraft}
            onChanged={replace}
            onComputerDrafted={() => void loadComputerDraftMarks().then(setMarks)}
            onStale={() => void reload()}
          />
        ))}
      </>
    );

  return (
    <section style={box} aria-labelledby="order-desk-title" data-testid="order-desk">
      <h2 id="order-desk-title" style={title}>{t("orders.title")}</h2>
      <div style={hint}>{t("orders.intro")}</div>
      {computerCanDraft && (
        <div style={{ marginTop: 8 }}>
          <label htmlFor="order-desk-background" style={{ ...hint, display: "flex", gap: 6, alignItems: "center", marginTop: 0 }}>
            <input
              id="order-desk-background"
              type="checkbox"
              checked={backgroundOn}
              onChange={(e) => setBackgroundDrafting(e.target.checked)}
              aria-describedby="order-desk-background-desc"
              data-testid="order-desk-background-toggle"
            />
            {t("orders.bg.label")}
          </label>
          <div id="order-desk-background-desc" style={hint}>
            {t("orders.bg.desc")}
          </div>
        </div>
      )}
      {body}
    </section>
  );
}

function OrderCard({
  order,
  token,
  computerDraft,
  computerCanDraft,
  onChanged,
  onComputerDrafted,
  onStale,
}: {
  order: OrderSellerView;
  token: string;
  /** The server's draft is the one this computer wrote (local mark, same digest). */
  computerDraft: boolean;
  /** This computer has a live binding (the runtime credential is renewed on click if it expired). */
  computerCanDraft: boolean;
  onChanged: (order: OrderSellerView) => void;
  onComputerDrafted: () => void;
  onStale: () => void;
}) {
  const { t } = useI18n();
  const saved = order.deliveryDraft?.answerText ?? "";
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // The digest of the draft that was on screen when the owner ticked "I read it".
  const [reviewedDigest, setReviewedDigest] = useState<string | null>(null);

  useEffect(() => {
    setText(order.deliveryDraft?.answerText ?? "");
    setReviewedDigest(null);
  }, [order.orderId, order.version, order.deliveryDraft?.digest]);

  const deliverable = canDeliver(order);
  const dirty = text !== saved;
  const invalid = validateAnswer(text);
  const reviewable = deliverable && !dirty ? reviewableDeliveryDraft(order) : null;
  const buyerName = order.buyer.displayName ?? (order.buyer.kind === "visitor" ? t("orders.buyer.visitor") : t("orders.buyer.user"));
  const textId = `order-answer-${order.orderId}`;
  const reviewId = `order-reviewed-${order.orderId}`;

  const finish = (result: Awaited<ReturnType<typeof saveDeliveryDraft>>, done: string) => {
    if (result.ok) {
      onChanged(result.order);
      setMessage(done);
    } else {
      setMessage(describeOrderDeskReason(result.reason, t));
      if (result.reason === "order_version_conflict" || result.reason === "delivery_digest_mismatch") onStale();
    }
  };

  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      finish(await saveDeliveryDraft({ token, order, answerText: text }), t("orders.msg.saved"));
    } finally {
      setBusy(false);
    }
  };

  const draftOnComputer = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await draftWithComputer({ order, renew: () => renewRuntimeCredential(token) });
      if (result.ok) {
        onChanged(result.order);
        onComputerDrafted();
        setMessage(result.marked ? t("orders.msg.computerDrafted") : t("orders.msg.computerDraftedNoMark"));
      } else {
        setMessage(describeComputerDraftReason(result.reason, t));
        if (result.reason === "order_version_conflict" || result.reason === "draft_exists") onStale();
      }
    } finally {
      setBusy(false);
    }
  };

  const deliver = async () => {
    if (!reviewedDigest) return;
    setBusy(true);
    setMessage("");
    try {
      finish(await deliverReviewedDraft({ token, order, reviewedDigest }), t("orders.msg.delivered"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article style={card} data-testid="order-desk-order" aria-label={fill(t("orders.cardLabel"), { kind: orderKindText(order.kind, t), buyer: buyerName })}>
      <div style={cardHeader}>
        <strong>{orderKindText(order.kind, t)}</strong>
        <span>{formatMoney(order.amounts.total)}</span>
        <span style={statusTag} data-testid="order-desk-status">{orderStatusText(order.status, t)}</span>
      </div>
      <div style={hint}>{fill(t("orders.from"), { name: buyerName })}</div>
      <div style={quote} data-testid="order-desk-buyer-note">{order.buyerNote}</div>

      {order.delivery && (
        <div style={hint}>
          {t("orders.deliveredContent")}
          <div style={quote}>{order.delivery.answerText ?? ""}</div>
        </div>
      )}

      {deliverable && (
        <>
          {computerCanDraft && !order.deliveryDraft && text === "" && (
            <div style={{ marginTop: 8 }}>
              <button type="button" style={button} disabled={busy} onClick={() => void draftOnComputer()} data-testid="order-desk-computer-draft-button">
                {busy ? t("orders.draftBusy") : t("orders.draftBtn")}
              </button>
              <div style={hint}>{t("orders.draftHint")}</div>
            </div>
          )}
          {computerDraft && !dirty && (
            <div role="note" style={computerNote} data-testid="order-desk-computer-draft">
              {t("orders.computerNote")}
            </div>
          )}
          <label htmlFor={textId} style={{ ...hint, display: "block", marginTop: 8 }}>
            {fill(t("orders.answerLabel"), { n: [...text].length, max: ORDER_DELIVERY_ANSWER_MAX_CHARS })}
          </label>
          <textarea
            id={textId}
            value={text}
            rows={5}
            onChange={(e) => {
              setText(e.target.value);
              setReviewedDigest(null);
            }}
            style={textarea}
          />
          <button type="button" style={button} disabled={busy || !dirty || invalid !== null} onClick={() => void save()}>
            {busy ? t("orders.saving") : t("orders.save")}
          </button>
          {dirty && invalid === null && <span style={{ ...hint, marginLeft: 8 }}>{t("orders.dirty")}</span>}

          {reviewable && (
            <div style={reviewBox} data-testid="order-desk-review">
              <div style={hint}>{t("orders.reviewIntro")}</div>
              <div style={quote} data-testid="order-desk-review-text">{reviewable.draft.answerText ?? ""}</div>
              <label htmlFor={reviewId} style={{ ...hint, display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  id={reviewId}
                  type="checkbox"
                  checked={reviewedDigest === reviewable.digest}
                  onChange={(e) => setReviewedDigest(e.target.checked ? reviewable.digest : null)}
                />
                {t("orders.reviewed")}
              </label>
              <button
                type="button"
                style={button}
                disabled={busy || reviewedDigest !== reviewable.digest}
                onClick={() => void deliver()}
              >
                {busy ? t("orders.delivering") : t("orders.deliver")}
              </button>
            </div>
          )}
        </>
      )}

      {message && (
        <div role="status" style={hint} data-testid="order-desk-message">
          {message}
        </div>
      )}
    </article>
  );
}

const box: CSSProperties = { padding: 12, borderRadius: 8, border: "1px solid var(--border)", marginBottom: 12 };
const title: CSSProperties = { fontSize: 13, fontWeight: 600, margin: 0 };
const hint: CSSProperties = { fontSize: 11, color: "var(--text-dim)", marginTop: 4, lineHeight: 1.5 };
const card: CSSProperties = { marginTop: 10, padding: 10, borderRadius: 6, border: "1px solid var(--border)" };
const cardHeader: CSSProperties = { display: "flex", gap: 8, alignItems: "baseline", fontSize: 12, flexWrap: "wrap" };
const statusTag: CSSProperties = { fontSize: 11, color: "var(--text-dim)", marginLeft: "auto" };
const quote: CSSProperties = {
  marginTop: 4,
  padding: "6px 8px",
  borderRadius: 6,
  background: "var(--bg-elevated)",
  fontSize: 12,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
const reviewBox: CSSProperties = { marginTop: 10, paddingTop: 8, borderTop: "1px dashed var(--border)" };
const computerNote: CSSProperties = { ...hint, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", marginTop: 8 };
const testBanner: CSSProperties = { ...hint, padding: "4px 8px", borderRadius: 6, border: "1px dashed var(--border)", marginTop: 8 };
const textarea: CSSProperties = {
  width: "100%",
  marginTop: 4,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
  fontSize: 12,
  resize: "vertical",
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
