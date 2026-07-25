/**
 * Pet Mode adapters (Sprint P-6 phase 6.4 — 2026-05-22; expanded 2026-05-23
 * for P-9 wave 6 to subscribe all 15 presence topics).
 *
 * Wires real platform events into the unified `petMode` bus AND the
 * P-9 `companionEvents` bus:
 *
 *   - Backend `presence:pet.*` 11 pet topics → mode transitions + bridge
 *   - Backend `presence:wallet.delta` → companionEvents.wallet-delta + WalletCapsule
 *   - Backend `presence:world-engine.*` → companionEvents.world-engine-event
 *   - Backend `presence:skill.update` → companionEvents.skill-update + nudge mode
 *   - DeviceEventEmitter `presence:approval:wrist-trigger` → approval mode
 *   - PetTapGameModal level-up callback (caller-driven)
 *
 * Lives outside `petMode.ts` so the core bus stays platform-agnostic and
 * unit-testable in pure-Node jest. The adapters lazily require RN
 * DeviceEventEmitter + connectPetPresence inside `bootPetModeAdapters`
 * so importing this module from tests does not pull in react-native.
 *
 * Idempotent: `bootPetModeAdapters({ token, deviceId })` may be called
 * once on login. Returns a disposer that disconnects all listeners.
 */
import { setPetMode, setCompanionMode, type PetMode } from './petMode';
import { companionEvents } from './companionEvents.service';
import type { PetEmotion, PetState } from '../../shared/types/agentrix-presence';
import type {
  PetSoulChangedPayload,
  PetSkinChangedPayload,
  PetProactivePayload,
  PetEnergyPayload,
  WalletDeltaPayload,
  WorldEngineBattlePendingPayload,
  WorldEngineAssetReadyPayload,
  SkillUpdatePayload,
} from '../../shared/types/pet-presence';

export interface PetModeAdaptersOpts {
  token: string;
  deviceId: string;
  deviceName?: string;
  appVersion?: string;
}

/**
 * Map a backend `PetEmotion` to a sensible `PetMode`. Emotions that
 * don't have a dedicated form fall back to `idle` (the bus is already
 * driven by chat/voice events, so the emotion mostly fine-tunes
 * what the pet does *between* user-initiated activity).
 *
 * Mapping rationale (intentionally conservative — avoid form thrash):
 *
 *   focused / excited → speaking (active engagement)
 *   tired / sleepy    → sleep
 *   concerned / sad / angry → idle (no dedicated alarmed sprite for
 *                                    pure emotion; reserve `alert` for
 *                                    actual approval modals)
 *   happy / love / calm → idle (default ambient)
 */
export function mapEmotionToMode(emotion: PetEmotion | undefined): PetMode {
  switch (emotion) {
    case 'focused':
    case 'excited':
      return 'speaking';
    case 'tired':
    case 'sleepy':
      return 'sleep';
    case 'concerned':
    case 'sad':
    case 'angry':
    case 'happy':
    case 'love':
    case 'calm':
    default:
      return 'idle';
  }
}

/**
 * Trigger a one-shot celebration sprite. Called by anything that wants
 * to "dance the pet" briefly — AXP level-up, achievement unlock, task
 * complete in chat, etc.
 */
export function celebratePet(source: string, ttlMs: number = 1200): void {
  setPetMode('done', source, ttlMs);
}

/**
 * Connect to the backend pet-presence socket and translate
 * `presence:pet.state` into `setPetMode(...)` calls. Returns a
 * disposer that closes the socket and clears the wrist-trigger
 * subscription.
 *
 * Lazily imports react-native + petPresence so the pure helpers above
 * stay importable in jest (pure-Node) without pulling RN runtime.
 */
export function bootPetModeAdapters(opts: PetModeAdaptersOpts): () => void {
  // Lazy requires — keep the static import graph free of react-native
  // so Node-only test consumers can import { mapEmotionToMode, celebratePet }
  // without the jest worker exploding on RN's `requireNativeComponent`.
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { DeviceEventEmitter } = require('react-native') as typeof import('react-native');
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { connectPetPresence } = require('./petPresence') as typeof import('./petPresence');

  // 1) Backend pet.state emotion → mode
  const handle = connectPetPresence({
    token: opts.token,
    deviceId: opts.deviceId,
    deviceName: opts.deviceName || 'Agentrix Mobile',
    appVersion: opts.appVersion || '1.0.0',
    handlers: {
      // Existing — pet emotion → ambient sprite mode
      'presence:pet.state': (payload) => {
        const state = payload as PetState | null | undefined;
        if (!state) return;
        // Don't override speaking/listening/done that the local UI just
        // set — only apply emotion when the bus is at idle. (The order
        // here is "local action wins"; emotion is ambient.)
        const mode = mapEmotionToMode(state.emotion);
        if (mode === 'idle') return; // No-op transition, leave whatever local state set
        setPetMode(mode, `presence:emotion:${state.emotion}`);
        companionEvents.emit({
          type: 'cross-device-event',
          sourceDevice: 'mobile',
          eventType: 'presence:pet.state',
          payload: state,
        });
      },

      // P-9 wave 6 — soul / skin changes mean the active pet's identity
      // shifted on another device. Surface as cross-device-event so
      // CompanionBall / PetDetailSheet can re-fetch sprite data, and
      // pulse to whisper for 800ms (R5.3 cross-fade window).
      'presence:pet.soul.changed': (payload) => {
        const s = payload as PetSoulChangedPayload | null | undefined;
        if (!s) return;
        companionEvents.emit({
          type: 'cross-device-event',
          sourceDevice: 'desktop',
          eventType: 'presence:pet.soul.changed',
          payload: s,
        });
        setCompanionMode('whisper', `presence:soul:${s.soul_template_id ?? 'na'}`, { ttlMs: 800 });
      },
      'presence:pet.skin.changed': (payload) => {
        const s = payload as PetSkinChangedPayload | null | undefined;
        if (!s) return;
        companionEvents.emit({
          type: 'cross-device-event',
          sourceDevice: 'desktop',
          eventType: 'presence:pet.skin.changed',
          payload: s,
        });
      },

      // Proactive moments (missed_you / Voice_Greet hint / etc) →
      // whisper mode + bridge so VoiceGreetCapsule can hear it.
      'presence:pet.proactive': (payload) => {
        const p = payload as PetProactivePayload | null | undefined;
        if (!p) return;
        companionEvents.emit({
          type: 'cross-device-event',
          sourceDevice: 'mobile',
          eventType: 'presence:pet.proactive',
          payload: p,
        });
        // R3 — proactive event with `missed_you` text becomes a Voice_Greet
        // (background TTS layer is the authority on whether to actually
        // play audio; we just surface the same text on screen).
        if (p.kind === 'missed_you' && p.body) {
          companionEvents.emit({
            type: 'voice-greet',
            scenario: 'comeback',
            text: p.body,
            lang: 'zh',
          });
        }
      },

      // Energy delta — surface as cross-device-event for Phase 1
      // diagnostics; PetDetailSheet hero refreshes on its own.
      'presence:pet.energy': (payload) => {
        const e = payload as PetEnergyPayload | null | undefined;
        if (!e) return;
        companionEvents.emit({
          type: 'cross-device-event',
          sourceDevice: 'mobile',
          eventType: 'presence:pet.energy',
          payload: e,
        });
      },

      // P-9 cross-domain topics — bridge directly to dedicated event types

      'presence:wallet.delta': (payload) => {
        const w = payload as WalletDeltaPayload | null | undefined;
        if (!w) return;
        const sourceMap: Record<string, any> = {
          'transfer-in': 'transfer-in',
          'transfer-out': 'transfer-out',
          'marketplace-purchase': 'marketplace-purchase',
          'marketplace-sale': 'marketplace-sale',
          'agentic-commerce': 'agentic-commerce',
          'subscription-charge': 'subscription-charge',
          withdrawal: 'withdrawal',
          deposit: 'deposit',
        };
        companionEvents.emit({
          type: 'wallet-delta',
          delta: w.delta,
          currency: w.currency || 'USDC',
          balanceAfter: w.balance_after ?? undefined,
          source: sourceMap[w.source] ?? 'other',
          petId: w.pet_id ?? null,
          note: w.note ?? null,
        });
      },

      'presence:world-engine.battle-pending': (payload) => {
        const b = payload as WorldEngineBattlePendingPayload | null | undefined;
        if (!b) return;
        companionEvents.emit({
          type: 'world-engine-event',
          kind: 'battle-pending',
          battleId: b.battle_id,
        });
        setCompanionMode('nudge', 'world-engine:battle-pending', { ttlMs: 4000 });
      },

      'presence:world-engine.asset.ready': (payload) => {
        const a = payload as WorldEngineAssetReadyPayload | null | undefined;
        if (!a) return;
        companionEvents.emit({
          type: 'world-engine-event',
          kind: 'asset-ready',
          assetId: a.asset_id,
        });
        setCompanionMode('whisper', 'world-engine:asset-ready', { ttlMs: 4000 });
      },

      'presence:skill.update': (payload) => {
        const s = payload as SkillUpdatePayload | null | undefined;
        if (!s) return;
        companionEvents.emit({
          type: 'skill-update',
          skillId: s.skill_id,
          installedVersion: (s as any).installed_version ?? undefined,
          newVersion: s.new_version,
          introducesNewPermissions: !!(s as any).new_permissions?.length,
        });
        setCompanionMode('nudge', 'skill:update', { ttlMs: 3000 });
      },
    },
  });

  // 2) Wrist trigger from a wearable / watch → high-risk approval mode
  //    (mirrors desktop `approval-active` event family).
  const wristSub = DeviceEventEmitter.addListener(
    'presence:approval:wrist-trigger',
    () => {
      setPetMode('approval', 'wrist-approval', 4000);
    },
  );

  return () => {
    try {
      handle.disconnect();
    } catch {
      /* noop */
    }
    wristSub.remove();
  };
}
