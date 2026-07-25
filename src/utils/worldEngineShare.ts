/**
 * World Engine Share Utilities — Task 15.3
 *
 * Implements:
 * - One-tap share to WeChat, Douyin, Instagram, Twitter, system share sheet
 * - Share card preview before sharing
 * - Deep link handling for incoming links
 * - Fallback: copy deep link to clipboard when platform unavailable
 *
 * Deep link schema:
 *   agentrix://world-engine/asset/{id}
 *   agentrix://world-engine/battle/{id}
 *   agentrix://world-engine/dungeon/{code}
 *
 * Requirements: 7.1, 7.4, 7.5, 7.7
 */

import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Alert, Platform } from 'react-native';

// ============================================================
// Types
// ============================================================

export type ShareTarget = 'wechat' | 'douyin' | 'instagram' | 'twitter' | 'system';

export type DeepLinkType = 'asset' | 'battle' | 'dungeon';

export interface ShareCardData {
  type: DeepLinkType;
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  deepLink: string;
  webFallbackUrl: string;
}

export interface ParsedDeepLink {
  type: DeepLinkType;
  id: string;
}

// ============================================================
// Constants
// ============================================================

const DEEP_LINK_SCHEME = 'agentrix://world-engine';
const WEB_FALLBACK_BASE = 'https://app.agentrix.io/world';

// ============================================================
// Deep Link Generation
// ============================================================

/**
 * Generate a deep link for a World Engine entity.
 */
export function generateDeepLink(type: DeepLinkType, id: string): string {
  return `${DEEP_LINK_SCHEME}/${type}/${id}`;
}

/**
 * Generate a web fallback URL for non-app users.
 */
export function generateWebFallbackUrl(id: string): string {
  const token = Buffer.from(id, 'utf-8').toString('base64url');
  return `${WEB_FALLBACK_BASE}/${token}`;
}

// ============================================================
// Deep Link Parsing
// ============================================================

/**
 * Parse an incoming deep link URL.
 *
 * Handles:
 * - agentrix://world-engine/asset/{id}
 * - agentrix://world-engine/battle/{id}
 * - agentrix://world-engine/dungeon/{code}
 *
 * @returns Parsed deep link or null if invalid
 */
export function parseDeepLink(url: string): ParsedDeepLink | null {
  if (!url) return null;

  // Handle both scheme-based and web-based URLs
  const patterns: Array<{ regex: RegExp; type: DeepLinkType }> = [
    { regex: /agentrix:\/\/world-engine\/asset\/(.+)/, type: 'asset' },
    { regex: /agentrix:\/\/world-engine\/battle\/(.+)/, type: 'battle' },
    { regex: /agentrix:\/\/world-engine\/dungeon\/(.+)/, type: 'dungeon' },
    // Web fallback pattern
    { regex: /app\.agentrix\.io\/world\/(.+)/, type: 'asset' },
  ];

  for (const { regex, type } of patterns) {
    const match = url.match(regex);
    if (match && match[1]) {
      return { type, id: match[1] };
    }
  }

  return null;
}

// ============================================================
// Share Functions
// ============================================================

/**
 * Share a World Engine entity via the system share sheet or specific platform.
 *
 * Attempts platform-specific sharing first, falls back to system share sheet,
 * then falls back to clipboard copy.
 *
 * @param data - Share card data
 * @param target - Target platform (default: system)
 */
export async function shareWorldAsset(
  data: ShareCardData,
  target: ShareTarget = 'system',
): Promise<{ success: boolean; method: string }> {
  const shareMessage = `${data.title}\n${data.description}\n\n${data.webFallbackUrl}`;

  try {
    // Try platform-specific sharing
    if (target !== 'system') {
      const platformResult = await shareToPlatform(target, data);
      if (platformResult.success) {
        return platformResult;
      }
      // Fall through to system share if platform-specific fails
    }

    // System share sheet
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable && data.imageUrl) {
      await Sharing.shareAsync(data.imageUrl, {
        dialogTitle: data.title,
        mimeType: 'image/gif',
      });
      return { success: true, method: 'system_share' };
    }

    // Fallback: copy to clipboard
    await Clipboard.setStringAsync(shareMessage);
    Alert.alert('已复制', '分享链接已复制到剪贴板');
    return { success: true, method: 'clipboard' };
  } catch (error) {
    // Final fallback: clipboard
    try {
      await Clipboard.setStringAsync(shareMessage);
      Alert.alert('已复制', '分享链接已复制到剪贴板');
      return { success: true, method: 'clipboard_fallback' };
    } catch {
      return { success: false, method: 'failed' };
    }
  }
}

/**
 * Attempt platform-specific sharing.
 *
 * Phase 1: Uses URL schemes to open platform apps.
 * Production: Would use platform SDKs (WeChat SDK, Douyin SDK, etc.)
 */
async function shareToPlatform(
  target: ShareTarget,
  data: ShareCardData,
): Promise<{ success: boolean; method: string }> {
  const encodedMessage = encodeURIComponent(
    `${data.title} - ${data.webFallbackUrl}`,
  );

  const platformUrls: Record<string, string> = {
    wechat: `weixin://dl/moments?text=${encodedMessage}`,
    douyin: `snssdk1128://`,
    instagram: `instagram://library`,
    twitter: `twitter://post?message=${encodedMessage}`,
  };

  const url = platformUrls[target];
  if (!url) {
    return { success: false, method: 'unsupported_platform' };
  }

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return { success: true, method: target };
    }
    return { success: false, method: `${target}_not_installed` };
  } catch {
    return { success: false, method: `${target}_error` };
  }
}

/**
 * Build share card data for a World Asset.
 */
export function buildAssetShareCard(asset: {
  id: string;
  name: string;
  category: string;
  level: number;
  battleWins: number;
  battleLosses: number;
  styledMeshUrl?: string;
}): ShareCardData {
  return {
    type: 'asset',
    id: asset.id,
    title: asset.name,
    description: `Lv.${asset.level} ${asset.category} | ${asset.battleWins}W/${asset.battleLosses}L`,
    imageUrl: asset.styledMeshUrl,
    deepLink: generateDeepLink('asset', asset.id),
    webFallbackUrl: generateWebFallbackUrl(asset.id),
  };
}

/**
 * Build share card data for a Battle.
 */
export function buildBattleShareCard(battle: {
  id: string;
  winnerName: string;
  loserName: string;
  rounds: number;
}): ShareCardData {
  return {
    type: 'battle',
    id: battle.id,
    title: `⚔️ ${battle.winnerName} vs ${battle.loserName}`,
    description: `${battle.winnerName} 获胜！(${battle.rounds} 回合)`,
    deepLink: generateDeepLink('battle', battle.id),
    webFallbackUrl: generateWebFallbackUrl(battle.id),
  };
}

/**
 * Build share card data for a Dungeon.
 */
export function buildDungeonShareCard(dungeon: {
  code: string;
  theme: string;
  difficulty: number;
  creatorName: string;
}): ShareCardData {
  return {
    type: 'dungeon',
    id: dungeon.code,
    title: `🏰 ${dungeon.creatorName} 的副本`,
    description: `主题: ${dungeon.theme} | 难度: ${'★'.repeat(dungeon.difficulty)}`,
    deepLink: generateDeepLink('dungeon', dungeon.code),
    webFallbackUrl: generateWebFallbackUrl(dungeon.code),
  };
}
