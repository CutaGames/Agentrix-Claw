/**
 * SkillDraftsSection — "分身 → 从经验长出的技能"（桌面，L8 C2）。
 *
 * 同一个自动化成功跑了好几次，可以提炼成一份技能草稿。草稿只是几行文字，本人点"确认并启用"以后才启用；
 * "从经验里找技能"要用平台的模型额度，每天有次数上限。只在 `VITE_SKILL_DISTILL_ENABLED=1` 的构建里挂载；
 * 服务端没开（404）或读不出来时什么都不显示。所有按钮都是本人点的，AI 调不到。
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { SkillDraftDecisionV1, SkillDraftViewV1 } from "../../../shared/types/skill-draft";
import { useAuthStore } from "../services/store";
import { useI18n } from "../i18n/I18nProvider";
import { decideSkillDraft, listSkillDrafts, scanSkillDrafts } from "../services/skillDrafts";

type Copy = { zh: string; en: string };

const box: CSSProperties = { border: "1px solid var(--border, #2a2a2a)", borderRadius: 12, padding: 16, display: "grid", gap: 10 };
const button: CSSProperties = { minHeight: 36, padding: "0 14px", borderRadius: 8, cursor: "pointer" };

export default function SkillDraftsSection() {
  const { locale } = useI18n();
  const say = (copy: Copy) => (locale === "zh" ? copy.zh : copy.en);
  const token = useAuthStore((s) => s.token);
  const [items, setItems] = useState<SkillDraftViewV1[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const result = await listSkillDrafts(token);
    setItems(result.ok === true ? result.value : null);
  }, [token]);

  useEffect(() => {
    let alive = true;
    void listSkillDrafts(token).then((result) => {
      if (alive) setItems(result.ok === true ? result.value : null);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  if (!items) return null;

  const scan = async () => {
    setBusy(true);
    setNotice("");
    try {
      const result = await scanSkillDrafts(token);
      if (result.ok === true) {
        const { created, capReached } = result.value;
        setNotice(
          created.length > 0
            ? say({ zh: `找到 ${created.length} 个新技能草稿，请看一下。`, en: `Found ${created.length} new skill draft(s). Please have a look.` })
            : capReached
              ? say({ zh: "今天的提炼次数用完了，明天再试。", en: "Today's distilling limit is used up. Try again tomorrow." })
              : say({ zh: "暂时没有足够多次成功的任务。", en: "No task has succeeded often enough yet." }),
        );
      } else {
        setNotice(say({ zh: "现在没法提炼，请稍后再试。", en: "Distilling is not available right now. Try again later." }));
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const decide = async (draftRef: string, decision: SkillDraftDecisionV1) => {
    setBusy(true);
    setNotice("");
    try {
      const result = await decideSkillDraft(token, draftRef, decision);
      if (result.ok !== true) setNotice(say({ zh: "没有处理成功，请重试。", en: "That did not go through. Try again." }));
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={box} data-testid="skill-drafts-section">
      <h2 style={{ margin: 0, fontSize: 16 }}>{say({ zh: "从经验长出的技能", en: "Skills grown from experience" })}</h2>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
        {say({
          zh: "同一个自动化成功跑了好几次以后，可以提炼成技能草稿。草稿只是几行文字，你确认以后才启用。",
          en: "When one automation has succeeded several times it can become a skill draft. A draft is a few lines of text and is on only after you confirm it.",
        })}
      </p>
      <div>
        <button type="button" style={button} disabled={busy} onClick={() => void scan()} data-testid="skill-drafts-scan">
          {say({ zh: "从经验里找技能", en: "Look for skills in my experience" })}
        </button>
      </div>
      {items.length === 0 ? <p style={{ margin: 0, fontSize: 13 }}>{say({ zh: "还没有技能草稿。", en: "No skill drafts yet." })}</p> : null}
      {items.map((item) => (
        <div key={item.draftRef} style={{ display: "grid", gap: 4 }} data-testid="skill-draft" data-status={item.status}>
          <strong>{item.title}</strong>
          <span style={{ fontSize: 13 }}>{item.summary}</span>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
            {item.steps.map((step, index) => (
              <li key={`${item.draftRef}-${index}`}>{step}</li>
            ))}
          </ol>
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            {item.status === "pending" ? say({ zh: "等你确认", en: "Waiting for you" }) : item.status === "confirmed" ? say({ zh: "已启用", en: "On" }) : say({ zh: "已拒绝", en: "Declined" })}
            {` · ${say({ zh: `成功过 ${item.successRuns} 次`, en: `Succeeded ${item.successRuns} times` })}`}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {item.status !== "confirmed" ? (
              <button type="button" style={button} disabled={busy} onClick={() => void decide(item.draftRef, "confirm")} data-testid="skill-draft-confirm">
                {say({ zh: "确认并启用", en: "Confirm and turn on" })}
              </button>
            ) : null}
            {item.status !== "declined" ? (
              <button type="button" style={button} disabled={busy} onClick={() => void decide(item.draftRef, "decline")} data-testid="skill-draft-decline">
                {item.status === "confirmed" ? say({ zh: "关掉", en: "Turn off" }) : say({ zh: "不要", en: "Decline" })}
              </button>
            ) : null}
          </div>
        </div>
      ))}
      {notice ? <p role="status" style={{ margin: 0, fontSize: 13 }} data-testid="skill-drafts-notice">{notice}</p> : null}
    </div>
  );
}
