/**
 * SubscribeSheet — "套餐", opened from the top-right tier badge.
 *
 * D19: the plan structure and what is never charged; no price until a real
 * checkout works. The same plans and wording as the web pricing page
 * (`frontend/components/marketing/sections/PricingTable.tsx`, kept in step by
 * `src/test/subscribeSheet.test.tsx`).
 * AXP (DECISIONS, Stripe product fit): only earned and redeemed in-app, never
 * bought or withdrawn, and never shown with a fixed dollar value — so there is
 * no AXP-to-dollar discount here, and no checkout from the desktop.
 */
import { useEffect, useId, type CSSProperties } from "react";
import type { SubscriptionTier } from "../services/subscription";
import { WEB_APP_ORIGIN } from "../services/desktopNavigation";
import { open as shellOpen } from "@tauri-apps/plugin-shell";

interface Props {
  onClose: () => void;
  currentTier: SubscriptionTier;
}

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "免费",
  lite: "Lite",
  plus: "Plus",
  pro: "Pro",
  elite: "Elite",
  enterprise: "企业",
};

export interface PlanCard {
  key: "free" | "pro" | "creator";
  name: string;
  price: string;
  description: string;
  features: string[];
  cta?: { label: string; path: string };
}

/** Mirrors the web pricing page (D19). */
export const PLANS: readonly PlanCard[] = [
  {
    key: "free",
    name: "免费",
    price: "免费",
    description: "有一个自己的 AI 伙伴，把以前的记忆带进来。",
    features: ["伙伴对话", "从 ChatGPT、Claude 等带入记忆", "私密分身（只有你能用）"],
  },
  {
    key: "pro",
    name: "Pro",
    price: "开放购买时显示",
    description: "用得更多：更多用量、跨设备同步，让你的电脑替你干活。",
    features: ["更多用量", "手机、电脑、网页之间同步", "在你的电脑上执行任务"],
    cta: { label: "查看当前体验方式", path: "/soul-core/founding-access" },
  },
  {
    key: "creator",
    name: "创作者附加",
    price: "开放购买时显示",
    description: "让分身对外：公开名片、接单和收费。",
    features: ["公开分身名片", "服务目录", "付费问答与定金"],
    cta: { label: "了解分身", path: "/twin" },
  },
];

/** Never charged, on any plan (D19). */
export const NEVER_CHARGED: readonly string[] = ["核验状态", "撤销", "急停", "举报", "最低限度的数据导出", "争议处理"];

/** `PRICING_ESCROW_NOTE` in `frontend/lib/public-site/l3-copy.ts`. */
export const ESCROW_NOTE = "付费问答和定金：钱在托管里，买方验收后放款；放款前可以全额退款；争议 7 天内由平台裁决。";

export const NO_PRICE_NOTE =
  "功能正在分批开放。真实结账开通之前这里不写价格；任何价格、税费、地区限制、额度和超额费用都会在购买前显示，并以结算页或双方书面方案为准。";

export const AXP_NOTE =
  "AXP 是平台内不可提现的积分，不是现金、证券、稳定币或收益凭证。它没有保证兑换率、现金价值或投资回报；具体用途和有效规则以产品内说明为准。";

async function openOnWeb(path: string) {
  const url = `${WEB_APP_ORIGIN}${path}`;
  try {
    await shellOpen(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export default function SubscribeSheet({ onClose, currentTier }: Props) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={sheetStyle}
        onClick={(event) => event.stopPropagation()}
        data-testid="subscribe-sheet"
      >
        <div style={headerStyle}>
          <div>
            <h2 id={titleId} style={titleStyle}>
              套餐
            </h2>
            <div style={subtitleStyle} data-testid="subscribe-current-tier">
              你现在是：{TIER_LABELS[currentTier] ?? currentTier}
            </div>
          </div>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="关闭">
            ✕
          </button>
        </div>

        <div style={bodyStyle}>
          <ul style={planList}>
            {PLANS.map((plan) => (
              <li key={plan.key} style={cardStyle} data-testid={`subscribe-plan-${plan.key}`}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <h3 style={planName}>{plan.name}</h3>
                  <span style={planPrice}>{plan.price}</span>
                </div>
                <p style={planDescription}>{plan.description}</p>
                <ul style={featureList}>
                  {plan.features.map((feature) => (
                    <li key={feature} style={featureItem}>
                      <span aria-hidden="true" style={{ color: "var(--tone-success-text)" }}>
                        ✓
                      </span>{" "}
                      {feature}
                    </li>
                  ))}
                </ul>
                {plan.cta && (
                  <button type="button" style={linkBtn} onClick={() => void openOnWeb(plan.cta!.path)}>
                    {plan.cta.label}（在浏览器打开）
                  </button>
                )}
              </li>
            ))}
          </ul>

          <p style={noteStyle} data-testid="subscribe-escrow-note">
            {ESCROW_NOTE}
          </p>
          <p style={noteStyle}>{NO_PRICE_NOTE}</p>

          <section aria-labelledby={`${titleId}-never`} style={sectionStyle}>
            <h3 id={`${titleId}-never`} style={sectionTitle}>
              这些永远不收费
            </h3>
            <ul style={neverList} data-testid="subscribe-never-charged">
              {NEVER_CHARGED.map((item) => (
                <li key={item} style={neverItem}>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby={`${titleId}-axp`} style={sectionStyle}>
            <h3 id={`${titleId}-axp`} style={sectionTitle}>
              AXP
            </h3>
            <p style={noteStyle}>{AXP_NOTE}</p>
          </section>
        </div>

        <div style={footerStyle}>
          <button type="button" onClick={() => void openOnWeb("/pricing")} style={primaryBtn}>
            在网页上查看套餐
          </button>
        </div>
      </div>
    </div>
  );
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 23, 0.45)",
  zIndex: 9800,
  display: "flex",
  justifyContent: "flex-end",
};
const sheetStyle: CSSProperties = {
  width: 400,
  maxWidth: "100vw",
  height: "100%",
  background: "var(--bg-panel)",
  borderLeft: "1px solid var(--border)",
  display: "flex",
  flexDirection: "column",
  color: "var(--text)",
};
const headerStyle: CSSProperties = {
  padding: 16,
  borderBottom: "1px solid var(--border)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
};
const titleStyle: CSSProperties = { fontSize: 18, fontWeight: 800, margin: 0 };
const subtitleStyle: CSSProperties = { fontSize: 12, color: "var(--text-muted)", marginTop: 4 };
const closeBtn: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text-muted)",
  borderRadius: 8,
  padding: "4px 9px",
  cursor: "pointer",
  fontSize: 12,
};
const bodyStyle: CSSProperties = { flex: 1, overflowY: "auto", padding: "12px 14px" };
const planList: CSSProperties = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 };
const cardStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
};
const planName: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 800 };
const planPrice: CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text-muted)" };
const planDescription: CSSProperties = { margin: "6px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 };
const featureList: CSSProperties = { listStyle: "none", margin: "8px 0 0", padding: 0 };
const featureItem: CSSProperties = { fontSize: 12, lineHeight: 1.7 };
const linkBtn: CSSProperties = {
  marginTop: 8,
  padding: 0,
  background: "transparent",
  border: "none",
  color: "var(--accent-light)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "underline",
};
const noteStyle: CSSProperties = { margin: "12px 0 0", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 };
const sectionStyle: CSSProperties = { marginTop: 14 };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 13, fontWeight: 700 };
const neverList: CSSProperties = { listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexWrap: "wrap", gap: 6 };
const neverItem: CSSProperties = {
  fontSize: 12,
  padding: "3px 9px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
};
const footerStyle: CSSProperties = { padding: 14, borderTop: "1px solid var(--border)" };
const primaryBtn: CSSProperties = {
  width: "100%",
  padding: "11px",
  background: "var(--accent)",
  border: "none",
  borderRadius: 10,
  color: "var(--text-on-accent)",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};
