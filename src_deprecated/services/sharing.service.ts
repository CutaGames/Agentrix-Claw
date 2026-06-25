// ClawLink Share Card & Referral Service
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { apiFetch } from './api';

const SHARE_BASE = 'https://clawlink.app/i';
const API_BASE = 'https://api.agentrix.top/api';

export type ShareContentType = 'agent_result' | 'skill' | 'post' | 'invite' | 'install_success';

export interface ShareLink {
  code: string;
  url: string;
  fullUrl: string;
}

// Create a referral / share short-link via backend
export async function createShareLink(opts: {
  type: ShareContentType;
  contentId?: string;
  channel?: 'wechat' | 'telegram' | 'twitter' | 'whatsapp' | 'copy' | 'system';
}): Promise<ShareLink> {
  try {
    const res = await apiFetch<{ shortCode: string }>('/referral/links', {
      method: 'POST',
      body: JSON.stringify({
        type: opts.type === 'invite' ? 'GENERAL' : 'SKILL',
        contentId: opts.contentId,
        channel: opts.channel,
      }),
    });
    const url = `${SHARE_BASE}/${res.shortCode}`;
    return { code: res.shortCode, url, fullUrl: url };
  } catch {
    // Fallback: generate local code
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    const url = `${SHARE_BASE}/${code}`;
    return { code, url, fullUrl: url };
  }
}

// Build share text based on content type
export function buildShareText(
  type: ShareContentType,
  opts: { agentName?: string; skillName?: string; url?: string; lang?: string }
): string {
  const url = opts.url ?? 'https://clawlink.app';
  const isChinese = opts.lang?.startsWith('zh');

  switch (type) {
    case 'install_success':
      return isChinese
        ? `我刚拥有了自己的 AI Agent「${opts.agentName ?? 'My Agent'}」！ 🤖\n\n你也可以免费拥有一个 → ${url}`
        : `I just got my own AI Agent "${opts.agentName ?? 'My Agent'}"! 🤖\n\nYou can get one for free → ${url}`;

    case 'agent_result':
      return isChinese
        ? `我的 AI Agent「${opts.agentName ?? 'Agent'}」刚帮我完成了一个任务！ ✨\n\n用 ClawLink 免费试试 → ${url}`
        : `My AI Agent "${opts.agentName ?? 'Agent'}" just completed an amazing task! ✨\n\nTry ClawLink for free → ${url}`;

    case 'skill':
      return isChinese
        ? `推荐这个 OpenClaw 技能：「${opts.skillName ?? 'Skill'}」 🔧\n\n一键安装 → ${url}`
        : `Check out this OpenClaw skill: "${opts.skillName ?? 'Skill'}" 🔧\n\nOne-tap install → ${url}`;

    case 'invite':
    default:
      return isChinese
        ? `加入 ClawLink，30 秒免费拥有你的 AI Agent！ 🚀\n\n${url}`
        : `Join ClawLink and get your own AI Agent in 30 seconds, for free! 🚀\n\n${url}`;
  }
}

// Share via system share sheet
export async function shareViaSystem(text: string): Promise<void> {
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    // For text-only sharing, we use Clipboard + alert as RN doesn't support text-only sharing natively
    await Clipboard.setStringAsync(text);
  }
}

// Copy link to clipboard
export async function copyLinkToClipboard(url: string): Promise<void> {
  await Clipboard.setStringAsync(url);
}

// Track a share event
export async function trackShare(opts: {
  shortCode: string;
  channel: string;
}): Promise<void> {
  try {
    await apiFetch(`/referral/r/${opts.shortCode}/resolve`, {
      method: 'GET',
    });
  } catch {
    // Non-critical, ignore errors
  }
}

// Get user's referral stats
export async function getReferralStats(): Promise<{
  totalReferrals: number;
  activeReferrals: number;
  totalEarnings: number;
  pendingEarnings: number;
  weeklyReferrals: number;
  links: Array<{
    id: string;
    shortCode: string;
    type: string;
    clickCount: number;
    conversionCount: number;
    status: string;
  }>;
}> {
  return apiFetch('/referral/stats');
}

// Get user's referral links
export async function getMyLinks(): Promise<Array<{
  id: string;
  shortCode: string;
  type: string;
  clickCount: number;
  uniqueClickCount: number;
  conversionCount: number;
  gmv: number;
  totalEarnings: number;
  status: string;
  createdAt: string;
}>> {
  return apiFetch('/referral/links');
}

// Get pending commissions
export async function getPendingCommissions(): Promise<Array<{
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}>> {
  return apiFetch('/referral/commissions/pending');
}
