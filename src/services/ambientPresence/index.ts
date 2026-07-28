/**
 * ambientPresence — unified entry for the P-9 Ambient Presence system.
 *
 * One boot call wires both platforms:
 *   - iOS Live Activity (lock screen + Dynamic Island)
 *   - Android SYSTEM_ALERT_WINDOW system overlay
 *
 * Subscribes to companionEvents.mode-changed so the platform-side
 * presentation updates within the R4.5 30s budget.
 *
 * Spec: requirements.md R1.5 / R1.6 / R4.4 / R4.5 / R4.9 / R4.11.
 */
import { Platform } from 'react-native';
import { companionEvents } from '../companionEvents.service';
import { getCompanionMode, subscribeCompanionMode, type CompanionMode } from '../petMode';
import { getActivePet } from '../activePet.service';
import {
  isIosLiveActivityAvailable,
  bootIosLiveActivityLifecycle,
  startPetLiveActivity,
  updatePetLiveActivity,
  captionForMode,
} from './iosLiveActivity';
import {
  isAndroidSystemOverlayAvailable,
  bootAndroidOverlayLifecycle,
  startSystemOverlay,
  updateSystemOverlay,
} from './androidOverlay';

export {
  isIosLiveActivityAvailable,
  bootIosLiveActivityLifecycle,
  startPetLiveActivity,
  endPetLiveActivity,
  updatePetLiveActivity,
} from './iosLiveActivity';
export {
  isAndroidSystemOverlayAvailable,
  bootAndroidOverlayLifecycle,
  startSystemOverlay,
  stopSystemOverlay,
  updateSystemOverlay,
  hasOverlayPermission,
  requestOverlayPermission,
} from './androidOverlay';

export interface BootAmbientPresenceOpts {
  /** Whether the user has the ambient presence feature enabled. */
  isEnabled: () => boolean;
}

export function bootAmbientPresence(opts: BootAmbientPresenceOpts): () => void {
  const disposers: Array<() => void> = [];

  const getMode = (): CompanionMode => getCompanionMode();
  const getPetName = (): string => getActivePet().name;

  if (Platform.OS === 'ios' && isIosLiveActivityAvailable()) {
    disposers.push(
      bootIosLiveActivityLifecycle({
        getMode,
        getPetName,
        isEnabled: opts.isEnabled,
      }),
    );
  }

  if (Platform.OS === 'android' && isAndroidSystemOverlayAvailable()) {
    disposers.push(
      bootAndroidOverlayLifecycle({
        getMode,
        getPetName,
        isEnabled: opts.isEnabled,
      }),
    );
  }

  // Mirror mode changes to the platform presentation. We update on every
  // companion-mode transition so the lock screen / overlay text stays
  // within R4.5's 30s freshness budget.
  const offMode = subscribeCompanionMode((mode) => {
    if (!opts.isEnabled()) return;
    const petName = getPetName();
    if (Platform.OS === 'ios' && isIosLiveActivityAvailable()) {
      void updatePetLiveActivity('current', {
        mode,
        petName,
        caption: captionForMode(mode),
      });
    }
    if (Platform.OS === 'android' && isAndroidSystemOverlayAvailable()) {
      void updateSystemOverlay(mode, petName);
    }
  });
  disposers.push(offMode);

  // Bridge wallet-delta to a brief override caption per R4.12 ("+$N
  // for 8s, then revert"). Phase 1 maps to a one-shot updateSystemOverlay
  // / updatePetLiveActivity call; mode revert happens automatically when
  // the next mode-changed event fires.
  const offWallet = companionEvents.subscribe('wallet-delta', (evt) => {
    if (!opts.isEnabled()) return;
    const sign = evt.delta >= 0 ? '+' : '';
    const captionOverride = `${sign}${evt.delta.toFixed(evt.currency === 'USDC' ? 2 : 0)} ${evt.currency}`;
    const petName = getPetName();
    const mode = getCompanionMode();
    if (Platform.OS === 'ios' && isIosLiveActivityAvailable()) {
      void updatePetLiveActivity('current', {
        mode,
        petName,
        caption: captionOverride,
        walletDeltaText: captionOverride,
      });
    }
    if (Platform.OS === 'android' && isAndroidSystemOverlayAvailable()) {
      // Android overlay only carries one caption slot; reuse the same
      // text for 8s. The next mode change will revert it.
      void updateSystemOverlay(mode, petName);
    }
  });
  disposers.push(offWallet);

  return () => {
    for (const d of disposers) {
      try {
        d();
      } catch {
        /* ignore */
      }
    }
  };
}
