/**
 * Chat Milestones — listens for `agentrix:chat-milestone` events from
 * ChatPanelImpl and awards AXP via POST /v1/axp/earn. Dedupes per
 * session+round so a re-render won't double-award.
 *
 * Sprint DA6.
 */
import { earnAxp } from "./axp";
import { showAxpToast } from "./axpToast";

type MilestoneDetail = { rounds: number; sessionId: string };

const seen = new Set<string>();

function onMilestone(e: Event) {
  const detail = (e as CustomEvent<MilestoneDetail>).detail;
  if (!detail || !detail.sessionId || !detail.rounds) return;
  const key = `${detail.sessionId}:${Math.floor(detail.rounds / 10)}`;
  if (seen.has(key)) return;
  seen.add(key);

  // Fire-and-forget. Backend has a daily cap so this is safe to retry
  // and safe to over-call. We don't await — want the UI fast.
  void earnAxp({
    source: "chat_active",
    amount: 20,
    ref_id: detail.sessionId,
    note: `Chat milestone: ${detail.rounds} rounds`,
  })
    .then(() => {
      showAxpToast({
        amount: 20,
        emoji: "💬",
        reason: { en: "Chat 10-round bonus", zh: "对话 10 轮奖励" },
      });
      window.dispatchEvent(new CustomEvent("agentrix:axp-changed"));
    })
    .catch(() => {
      // Daily cap hit — silent, expected.
    });
}

let started = false;

export function startChatMilestoneWatcher(): void {
  if (started) return;
  started = true;
  window.addEventListener("agentrix:chat-milestone", onMilestone as EventListener);
}

export function stopChatMilestoneWatcher(): void {
  if (!started) return;
  started = false;
  window.removeEventListener("agentrix:chat-milestone", onMilestone as EventListener);
  seen.clear();
}
