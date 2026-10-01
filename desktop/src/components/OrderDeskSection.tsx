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

export const ORDER_STATUS_TEXT: Record<OrderSellerView["status"], string> = {
  awaiting_payment: "等买方付款",
  paid: "已付款，等你交付",
  delivered: "已交付，等买方验收",
  accepted: "买方已验收，等放款",
  settled: "已放款",
  cancelled: "已取消",
  refund_pending: "退款处理中",
  refunded: "已退款",
  disputed: "买方发起了争议，平台处理中",
  unknown: "结果确认中，不要重复操作",
};

const KIND_TEXT: Record<OrderSellerView["kind"], string> = {
  paid_question: "付费问答",
  consultation_deposit: "咨询定金",
};

export default function OrderDeskSection() {
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
  if (load === null) body = <div style={hint}>读取中…</div>;
  else if (load.state === "signed_out") body = <div style={hint}>登录以后，分身接到的单会出现在这里。</div>;
  else if (load.state === "unavailable") body = <div style={hint} data-testid="order-desk-unavailable">接单还没有开放。</div>;
  else if (load.state === "error")
    body = (
      <div style={hint} role="status">
        没有读到订单：{describeOrderDeskReason(load.reason)}
        <button type="button" style={{ ...button, marginLeft: 8 }} onClick={() => void reload()}>
          重试
        </button>
      </div>
    );
  else if (load.orders.length === 0) body = <div style={hint}>还没有订单。</div>;
  else
    body = (
      <>
        {load.orders.some((order) => order.environment === "test") && (
          <div role="note" style={testBanner} data-testid="order-desk-test-mode">
            测试模式，不会真的扣款。
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
      <h2 id="order-desk-title" style={title}>接单与交付</h2>
      <div style={hint}>
        分身接到的付费问答和定金。你写好回答、看过一遍再交付；钱在托管里，买方验收以后才放款。
      </div>
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
            有新付款的单时，让电脑先备一份
          </label>
          <div id="order-desk-background-desc" style={hint}>
            只在这台电脑接着电源、急停没拉下时备，一次一张，只用本地模型。备好以后发一条本机通知，交付照旧要你看过、勾选。
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
  const buyerName = order.buyer.displayName ?? (order.buyer.kind === "visitor" ? "访客" : "用户");
  const textId = `order-answer-${order.orderId}`;
  const reviewId = `order-reviewed-${order.orderId}`;

  const finish = (result: Awaited<ReturnType<typeof saveDeliveryDraft>>, done: string) => {
    if (result.ok) {
      onChanged(result.order);
      setMessage(done);
    } else {
      setMessage(describeOrderDeskReason(result.reason));
      if (result.reason === "order_version_conflict" || result.reason === "delivery_digest_mismatch") onStale();
    }
  };

  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      finish(await saveDeliveryDraft({ token, order, answerText: text }), "草稿已保存。交付前请再看一遍。");
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
        setMessage(
          result.marked
            ? "电脑备好了一份草稿，请看过、改好再交付。"
            : "电脑备好了一份草稿（没能在本机记下是电脑备的），请看过、改好再交付。",
        );
      } else {
        setMessage(describeComputerDraftReason(result.reason));
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
      finish(await deliverReviewedDraft({ token, order, reviewedDigest }), "已交付，等买方验收。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article style={card} data-testid="order-desk-order" aria-label={`${KIND_TEXT[order.kind]}，${buyerName}`}>
      <div style={cardHeader}>
        <strong>{KIND_TEXT[order.kind]}</strong>
        <span>{formatMoney(order.amounts.total)}</span>
        <span style={statusTag} data-testid="order-desk-status">{ORDER_STATUS_TEXT[order.status]}</span>
      </div>
      <div style={hint}>来自 {buyerName}</div>
      <div style={quote} data-testid="order-desk-buyer-note">{order.buyerNote}</div>

      {order.delivery && (
        <div style={hint}>
          已交付的内容：
          <div style={quote}>{order.delivery.answerText ?? ""}</div>
        </div>
      )}

      {deliverable && (
        <>
          {computerCanDraft && !order.deliveryDraft && text === "" && (
            <div style={{ marginTop: 8 }}>
              <button type="button" style={button} disabled={busy} onClick={() => void draftOnComputer()} data-testid="order-desk-computer-draft-button">
                {busy ? "电脑正在备稿…" : "让电脑先备一份"}
              </button>
              <div style={hint}>只用这台电脑上的本地模型，买方的问题不会发给别的服务。备好以后你看过、改好再交付。</div>
            </div>
          )}
          {computerDraft && !dirty && (
            <div role="note" style={computerNote} data-testid="order-desk-computer-draft">
              这份是电脑备的，请看过再交付。
            </div>
          )}
          <label htmlFor={textId} style={{ ...hint, display: "block", marginTop: 8 }}>
            你的回答（{[...text].length} / {ORDER_DELIVERY_ANSWER_MAX_CHARS}）
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
            {busy ? "正在保存…" : "保存草稿"}
          </button>
          {dirty && invalid === null && <span style={{ ...hint, marginLeft: 8 }}>有没保存的修改，保存以后才能交付。</span>}

          {reviewable && (
            <div style={reviewBox} data-testid="order-desk-review">
              <div style={hint}>交付前再看一遍。买方会收到下面这段，交付以后不能再改：</div>
              <div style={quote} data-testid="order-desk-review-text">{reviewable.draft.answerText ?? ""}</div>
              <label htmlFor={reviewId} style={{ ...hint, display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  id={reviewId}
                  type="checkbox"
                  checked={reviewedDigest === reviewable.digest}
                  onChange={(e) => setReviewedDigest(e.target.checked ? reviewable.digest : null)}
                />
                我看过了，就交这一份
              </label>
              <button
                type="button"
                style={button}
                disabled={busy || reviewedDigest !== reviewable.digest}
                onClick={() => void deliver()}
              >
                {busy ? "正在交付…" : "交付"}
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
