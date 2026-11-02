/**
 * RelationshipBookSection — "分身 → 关系簿"（桌面，L8 R4）。
 *
 * 你打过交道的人，newest contact first；只有你看得到，分身不会拿它去回答访客。档位只是你给自己的标签，不会让对方多得到任何权限。
 * 只在 `VITE_RELATIONSHIP_BOOK_ENABLED=1` 的构建里挂载；服务端没开（404）或读不出来时什么都不显示。联系方式点开一个人才去取。
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  RELATIONSHIP_SOURCE_COPY_V1,
  RELATIONSHIP_TIERS_V1,
  RELATIONSHIP_TIER_COPY_V1,
  relationshipOpenItemsLabelV1,
  type RelationshipContactSummaryV1,
  type RelationshipContactViewV1,
  type RelationshipTierV1,
} from "../../../shared/types/relationship-book";
import { useAuthStore } from "../services/store";
import { useI18n } from "../i18n/I18nProvider";
import { getRelationship, listRelationships, setRelationshipTier } from "../services/relationshipBook";

type Copy = { zh: string; en: string };
const box: CSSProperties = { border: "1px solid var(--border, #2a2a2a)", borderRadius: 12, padding: 16, display: "grid", gap: 10 };
const button: CSSProperties = { minHeight: 36, padding: "0 14px", borderRadius: 8, cursor: "pointer" };

export default function RelationshipBookSection() {
  const { locale } = useI18n();
  const lang: "zh" | "en" = locale === "zh" ? "zh" : "en";
  const say = (copy: Copy) => copy[lang];
  const token = useAuthStore((s) => s.token);
  const [items, setItems] = useState<RelationshipContactSummaryV1[] | null>(null);
  const [open, setOpen] = useState<RelationshipContactViewV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const result = await listRelationships(token);
    setItems(result.ok === true ? result.value : null);
  }, [token]);

  useEffect(() => {
    let alive = true;
    void listRelationships(token).then((result) => {
      if (alive) setItems(result.ok === true ? result.value : null);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  if (!items) return null;

  const view = async (ref: string) => {
    setBusy(true);
    setNotice("");
    try {
      const result = await getRelationship(token, ref);
      if (result.ok === true) setOpen(result.value);
      else setNotice(say({ zh: "读不出这个人的资料。", en: "This person's details cannot be read." }));
    } finally {
      setBusy(false);
    }
  };

  const setTier = async (ref: string, tier: RelationshipTierV1 | null) => {
    setBusy(true);
    setNotice("");
    try {
      const result = await setRelationshipTier(token, ref, tier);
      if (result.ok === true) setOpen(result.value);
      else setNotice(say({ zh: "没有处理成功，请重试。", en: "That did not go through. Try again." }));
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={box} data-testid="relationship-book-section">
      <h2 style={{ margin: 0, fontSize: 16 }}>{say({ zh: "关系簿", en: "Relationship book" })}</h2>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
        {say({
          zh: "你打过交道的人。只有你看得到，分身不会拿它去回答访客。档位只是你的标签，不会让对方多得到任何权限。",
          en: "Everyone you have dealt with. Only you can see this; your twin never uses it to answer visitors. A tier is a label for you and gives the other side no permission.",
        })}
      </p>
      {items.length === 0 ? <p style={{ margin: 0, fontSize: 13 }}>{say({ zh: "还没有人。", en: "No one yet." })}</p> : null}
      {items.map((item) => (
        <div key={item.contactRef} style={{ display: "grid", gap: 2 }} data-testid="relationship">
          <strong>{item.displayName ?? say({ zh: "（没留名字）", en: "(no name)" })}</strong>
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            {`${item.tier ? say(RELATIONSHIP_TIER_COPY_V1[item.tier]) : say({ zh: "没分档", en: "Not sorted" })} · ${say(RELATIONSHIP_SOURCE_COPY_V1[item.sourceKind])} · ${new Date(item.lastContactAt).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")}`}
          </span>
          {item.openItems.length > 0 ? <span style={{ fontSize: 12 }}>{`${say({ zh: "没结的事：", en: "Still open: " })}${relationshipOpenItemsLabelV1(item.openItems, lang)}`}</span> : null}
          <div>
            <button type="button" style={button} disabled={busy} onClick={() => void view(item.contactRef)} data-testid="relationship-open">
              {say({ zh: "看详情", en: "Details" })}
            </button>
          </div>
        </div>
      ))}
      {open ? (
        <div style={{ display: "grid", gap: 4 }} data-testid="relationship-detail">
          <strong>{open.displayName ?? say({ zh: "（没留名字）", en: "(no name)" })}</strong>
          {open.contactState === "unreadable" ? <span style={{ fontSize: 13 }}>{say({ zh: "联系方式已加密，现在打不开。", en: "The contact details are sealed and cannot be opened right now." })}</span> : null}
          {open.contact?.email ? <span style={{ fontSize: 13 }}>{open.contact.email}</span> : null}
          {open.contact?.phone ? <span style={{ fontSize: 13 }}>{open.contact.phone}</span> : null}
          {open.contact?.other ? <span style={{ fontSize: 13 }}>{open.contact.other}</span> : null}
          {open.contact?.visitorMessage ? <span style={{ fontSize: 13 }}>{`${say({ zh: "对方留言：", en: "Their message: " })}${open.contact.visitorMessage}`}</span> : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {RELATIONSHIP_TIERS_V1.map((tier) => (
              <button key={tier} type="button" style={{ ...button, fontWeight: open.tier === tier ? 700 : 400 }} aria-pressed={open.tier === tier} disabled={busy} onClick={() => void setTier(open.contactRef, open.tier === tier ? null : tier)} data-testid={`relationship-tier-${tier}`}>
                {say(RELATIONSHIP_TIER_COPY_V1[tier])}
              </button>
            ))}
            <button type="button" style={button} onClick={() => setOpen(null)}>{say({ zh: "关上", en: "Close" })}</button>
          </div>
          <span style={{ fontSize: 12, opacity: 0.8 }}>{say({ zh: "写备注和删除一个人，现在在网页上做。", en: "Notes and deleting a person are on the web for now." })}</span>
        </div>
      ) : null}
      {notice ? <p role="status" style={{ margin: 0, fontSize: 13 }} data-testid="relationship-book-notice">{notice}</p> : null}
    </div>
  );
}
