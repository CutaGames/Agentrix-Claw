/**
 * coppaMode.ts — Sprint WD #12
 *
 * Per toy-prd-v4 §6.5 + cross-platform PRD §8.4: 儿童安全（COPPA 模式）
 *
 * When F-clan family account mounts a Toy:
 *   - TTS禁用任何 L2+ 价格/支付/链上信息
 *   - 监护人在 Web/Mobile 可看到该 Toy 的所有交互流水
 *   - PetCreator NSFW 模型阈值降低 20%（更严）
 *
 * This module provides:
 *   - COPPA mode detection (based on user clan + family account flag)
 *   - Content filtering for TTS payloads
 *   - Interaction logging for guardian visibility
 *   - NSFW threshold adjustment
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../api';
import type { PetStatePayload, TtsPlayPayload } from './types';

// ── Types ────────────────────────────────────────────────────

export interface CoppaConfig {
  enabled: boolean;
  child_user_id: string | null;
  guardian_user_id: string | null;
  max_tts_content_level: 'child_safe' | 'teen' | 'adult';
  nsfw_threshold_reduction_pct: number; // e.g. 20 = 20% stricter
  blocked_topics: string[];
  interaction_logging: boolean;
}

export interface CoppaInteractionLog {
  device_id: string;
  interaction_kind: string;
  content_preview: string;
  timestamp: number;
  flagged: boolean;
  flag_reason?: string;
}

// ── Constants ────────────────────────────────────────────────

const COPPA_CONFIG_KEY = 'clawcore_coppa_config';

const BLOCKED_KEYWORDS = [
  'price', 'cost', 'payment', 'buy', 'purchase', 'wallet', 'crypto',
  'blockchain', 'nft', 'token', 'usd', 'dollar', 'yuan', 'rmb',
  '价格', '支付', '购买', '钱包', '加密', '区块链', '代币',
];

const DEFAULT_CONFIG: CoppaConfig = {
  enabled: false,
  child_user_id: null,
  guardian_user_id: null,
  max_tts_content_level: 'adult',
  nsfw_threshold_reduction_pct: 0,
  blocked_topics: [],
  interaction_logging: false,
};

// ── State ────────────────────────────────────────────────────

let _config: CoppaConfig = { ...DEFAULT_CONFIG };

// ── Public API ───────────────────────────────────────────────

/**
 * Load COPPA configuration for the current user/device.
 * Call on app start and when family account settings change.
 */
export async function loadCoppaConfig(): Promise<CoppaConfig> {
  try {
    // Try backend first
    const res = await apiFetch<CoppaConfig>('/v1/family/coppa-config');
    _config = res;
    await AsyncStorage.setItem(COPPA_CONFIG_KEY, JSON.stringify(res));
    return res;
  } catch {
    // Fallback to cached
    try {
      const raw = await AsyncStorage.getItem(COPPA_CONFIG_KEY);
      if (raw) {
        _config = JSON.parse(raw);
        return _config;
      }
    } catch {}
    return DEFAULT_CONFIG;
  }
}

/**
 * Check if COPPA mode is currently active.
 */
export function isCoppaEnabled(): boolean {
  return _config.enabled;
}

/**
 * Get the current COPPA config.
 */
export function getCoppaConfig(): CoppaConfig {
  return { ..._config };
}

/**
 * Filter a TTS payload for COPPA compliance.
 * Removes price/payment/blockchain references from text.
 * Returns null if the entire payload should be blocked.
 */
export function filterTtsForCoppa(payload: TtsPlayPayload): TtsPlayPayload | null {
  if (!_config.enabled) return payload;

  if (!payload.text) return payload; // Audio URL pass-through (pre-screened server-side)

  let text = payload.text;

  // Check for blocked keywords
  const lowerText = text.toLowerCase();
  for (const keyword of [...BLOCKED_KEYWORDS, ..._config.blocked_topics]) {
    if (lowerText.includes(keyword.toLowerCase())) {
      // Replace the entire sentence containing the keyword
      text = text.replace(
        new RegExp(`[^.!?。！？]*${keyword}[^.!?。！？]*[.!?。！？]?`, 'gi'),
        '',
      ).trim();
    }
  }

  // If nothing left after filtering, block entirely
  if (!text || text.length < 5) return null;

  return { ...payload, text };
}

/**
 * Filter a pet state payload for COPPA (remove economic data).
 */
export function filterPetStateForCoppa(state: PetStatePayload): PetStatePayload {
  if (!_config.enabled) return state;

  // Remove any economic indicators from the state
  return {
    emotion: state.emotion,
    intimacy: state.intimacy,
    skin_thumbnail_url: state.skin_thumbnail_url,
    soul_template_id: state.soul_template_id,
    level: state.level,
    // Explicitly exclude any balance/earning fields that might be added
  };
}

/**
 * Log an interaction for guardian visibility.
 * Only logs when COPPA mode is active and interaction_logging is enabled.
 */
export async function logCoppaInteraction(log: Omit<CoppaInteractionLog, 'timestamp' | 'flagged' | 'flag_reason'>): Promise<void> {
  if (!_config.enabled || !_config.interaction_logging) return;

  const flagged = checkContentFlag(log.content_preview);

  try {
    await apiFetch('/v1/family/coppa-interaction-log', {
      method: 'POST',
      body: JSON.stringify({
        ...log,
        timestamp: Date.now(),
        flagged: flagged.flagged,
        flag_reason: flagged.reason,
        child_user_id: _config.child_user_id,
        guardian_user_id: _config.guardian_user_id,
      }),
    });
  } catch {
    // Best effort — don't block interaction on logging failure
  }
}

/**
 * Get the adjusted NSFW threshold for PetCreator.
 * Per PRD: "PetCreator NSFW 模型阈值降低 20%（更严）"
 */
export function getAdjustedNsfwThreshold(baseThreshold: number): number {
  if (!_config.enabled) return baseThreshold;
  const reduction = _config.nsfw_threshold_reduction_pct / 100;
  return baseThreshold * (1 - reduction);
}

// ── Internal ─────────────────────────────────────────────────

function checkContentFlag(content: string): { flagged: boolean; reason?: string } {
  const lower = content.toLowerCase();
  for (const keyword of BLOCKED_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) {
      return { flagged: true, reason: `Contains blocked keyword: ${keyword}` };
    }
  }
  return { flagged: false };
}
