/**
 * PetSoulBadge — 灵魂族群徽章（Phase 1 W3 · WB-1.2）
 *
 * 用于公开档案页 / 卡片角标。
 */
import React from 'react';

const CLAN_INFO: Record<string, { label: string; emoji: string; color: string }> = {
  A_office: { label: '效率派', emoji: '🦾', color: 'bg-emerald-500/20 text-emerald-300' },
  B_life: { label: '生活家', emoji: '🍳', color: 'bg-orange-500/20 text-orange-300' },
  C_learn: { label: '学习圈', emoji: '📚', color: 'bg-blue-500/20 text-blue-300' },
  D_play: { label: '娱乐部', emoji: '🎮', color: 'bg-pink-500/20 text-pink-300' },
  E_web3: { label: 'Web3', emoji: '💎', color: 'bg-purple-500/20 text-purple-300' },
  F_family: { label: '家有萌宠', emoji: '🏡', color: 'bg-yellow-500/20 text-yellow-200' },
};

export interface PetSoulBadgeProps {
  clan: string;
  displayName: string;
  tier?: string;
}

export default function PetSoulBadge({ clan, displayName, tier }: PetSoulBadgeProps) {
  const info = CLAN_INFO[clan] || { label: clan, emoji: '🐾', color: 'bg-white/10 text-white/80' };
  return (
    <div className="mt-1 flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${info.color}`}
      >
        <span>{info.emoji}</span>
        <span>{info.label}</span>
      </span>
      <span className="text-sm text-white/80">{displayName}</span>
      {tier && (
        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-white/60">
          {tier}
        </span>
      )}
    </div>
  );
}
