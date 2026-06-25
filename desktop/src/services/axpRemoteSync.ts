/**
 * AXP Remote Sync — listens for cross-device AXP earn events forwarded
 * from the backend via agent-presence socket (registered in
 * services/agentPresence.ts as `axp:earned`). When the user earns AXP
 * on another device (mobile check-in, co-raising feed, task complete),
 * the desktop pet shows a head-bubble "+N AXP ✨" so the reward feels
 * unified across devices.
 *
 * Sprint DE1.
 */
import { showAxpToast } from "./axpToast";

type RemotePayload = {
  amount?: number;
  source?: string;
  note?: string;
  deviceHint?: string;
  reasonZh?: string;
  reasonEn?: string;
};

const SOURCE_LABELS: Record<string, { en: string; zh: string; emoji: string }> = {
  daily_checkin:      { en: "Daily check-in",       zh: "每日签到",         emoji: "☀️" },
  chat_active:        { en: "Chat bonus",           zh: "对话奖励",         emoji: "💬" },
  pet_lvl_up:         { en: "Pet leveled up",       zh: "主宠升级",         emoji: "⭐" },
  coraising_feed:     { en: "Co-raising feed",      zh: "共养喂食",         emoji: "🌱" },
  coraising_owner:    { en: "Friend fed your pet",  zh: "好友帮你喂宠",     emoji: "🌱" },
  referral_signup:    { en: "Friend signed up",     zh: "邀请注册",         emoji: "🤝" },
  feed_post_liked:    { en: "Post got likes",       zh: "帖子获赞",         emoji: "👍" },
  task_complete:      { en: "Task completed",       zh: "任务完成",         emoji: "💼" },
  skin_sold:          { en: "Skin sold",            zh: "皮肤售出分成",     emoji: "🎨" },
  greeting_sent:      { en: "Greeting sent",        zh: "贺卡发送",         emoji: "🎁" },
  greeting_received:  { en: "Greeting received",    zh: "收到贺卡",         emoji: "🎁" },
  game_participate:   { en: "Game played",          zh: "游戏奖励",         emoji: "🎮" },
  contest_win:        { en: "Contest winner",       zh: "大赛夺冠",         emoji: "🏆" },
  sub_cashback:       { en: "Subscription cashback", zh: "订阅返现",        emoji: "💳" },
  admin_grant:        { en: "Platform grant",       zh: "平台赠送",         emoji: "🎁" },
};

function onRemote(e: Event) {
  const detail = (e as CustomEvent<RemotePayload>).detail;
  if (!detail || !detail.amount || detail.amount <= 0) return;

  const src = detail.source ?? "admin_grant";
  const info = SOURCE_LABELS[src] ?? { en: "AXP earned", zh: "获得 AXP", emoji: "💎" };
  const reasonZh = detail.reasonZh ?? info.zh;
  const reasonEn = detail.reasonEn ?? info.en;

  showAxpToast({
    amount: detail.amount,
    emoji: info.emoji,
    reason: { en: reasonEn, zh: reasonZh },
  });

  window.dispatchEvent(new CustomEvent("agentrix:axp-changed"));
}

let started = false;

export function startAxpRemoteSync(): void {
  if (started) return;
  started = true;
  window.addEventListener("agentrix:axp-earned-remote", onRemote as EventListener);
}

export function stopAxpRemoteSync(): void {
  if (!started) return;
  started = false;
  window.removeEventListener("agentrix:axp-earned-remote", onRemote as EventListener);
}
