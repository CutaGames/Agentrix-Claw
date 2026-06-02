/**
 * liveActivity.service — Sprint 5 · Task 5.7
 *
 * iOS Dynamic Island Live Activity service stub.
 *
 * Dynamic Island requires a native Swift ActivityKit widget extension.
 * This service defines the TypeScript interface and provides graceful
 * stubs that log warnings until the native module is implemented.
 *
 * Native implementation requirements:
 *   1. Create an iOS Widget Extension target with ActivityKit capability
 *   2. Define `PetLiveActivityAttributes` in Swift (matching this interface)
 *   3. Bridge via expo-modules-core or a custom Expo module
 *   4. Register the native module as "AgentrixLiveActivity"
 *
 * The native Swift code needs to:
 *   - Import ActivityKit
 *   - Define ActivityAttributes with ContentState
 *   - Request, update, and end Activities
 *   - Render compact/expanded/lock screen views
 *
 * @see src/native/README.md for full native implementation guide
 */
import { Platform } from 'react-native';

// ── Types ──────────────────────────────────────────────────────────────────

export interface PetLiveActivityState {
  /** Display name of the pet */
  petName: string;
  /** Current emotion (drives the Dynamic Island mini avatar) */
  emotion: string;
  /** Energy level 0-100 */
  energyPercent: number;
  /** Current task description (shown in expanded view) */
  currentTask?: string;
  /** Task progress 0-100 (shown as progress bar) */
  taskProgress?: number;
}

export interface LiveActivityConfig {
  /** Whether to show on lock screen */
  showOnLockScreen?: boolean;
  /** Stale date — when the activity should be considered outdated */
  staleDateMinutes?: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MODULE_NAME = 'AgentrixLiveActivity';
const MIN_IOS_VERSION = 16.1;

// ── Native Module Bridge (stub) ────────────────────────────────────────────

/**
 * Attempts to load the native Live Activity module.
 * Returns null if not available (expected until Swift implementation exists).
 */
function getNativeModule(): any | null {
  if (Platform.OS !== 'ios') return null;

  try {
    // expo-modules-core pattern: require the native module by name
    const { NativeModulesProxy } = require('expo-modules-core');
    return NativeModulesProxy?.[MODULE_NAME] || null;
  } catch {
    return null;
  }
}

/**
 * Checks if the current device supports Live Activities.
 * Requires iOS 16.1+ and the native module to be available.
 */
function isLiveActivitySupported(): boolean {
  if (Platform.OS !== 'ios') return false;

  const version = parseFloat(Platform.Version as string);
  if (isNaN(version) || version < MIN_IOS_VERSION) return false;

  return true;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Start a Live Activity showing pet status on Dynamic Island.
 *
 * On iOS 16.1+, this will display the pet's emotion and energy on the
 * Dynamic Island (compact view) and lock screen (expanded view).
 *
 * @param state - Initial pet state to display
 * @param config - Optional configuration
 * @returns Activity ID string, or null if not supported/available
 */
export async function startPetLiveActivity(
  state: PetLiveActivityState,
  config?: LiveActivityConfig,
): Promise<string | null> {
  if (!isLiveActivitySupported()) {
    if (__DEV__) {
      console.log('[LiveActivity] Not supported on this platform/version');
    }
    return null;
  }

  const nativeModule = getNativeModule();
  if (!nativeModule) {
    console.warn(
      '[LiveActivity] Native module not available. ' +
      'The Swift ActivityKit widget extension has not been implemented yet. ' +
      'See src/native/README.md for implementation guide.',
    );
    return null;
  }

  try {
    const activityId = await nativeModule.startActivity({
      petName: state.petName,
      emotion: state.emotion,
      energyPercent: state.energyPercent,
      currentTask: state.currentTask || null,
      taskProgress: state.taskProgress ?? null,
      showOnLockScreen: config?.showOnLockScreen ?? true,
      staleDateMinutes: config?.staleDateMinutes ?? 30,
    });
    return activityId || null;
  } catch (err: any) {
    console.warn('[LiveActivity] Failed to start:', err?.message);
    return null;
  }
}

/**
 * Update an existing Live Activity with new pet state.
 *
 * Call this when the pet's emotion, energy, or task progress changes.
 * Updates are rate-limited by iOS (typically max ~1 per second).
 *
 * @param activityId - ID returned from startPetLiveActivity
 * @param state - Partial state update
 */
export async function updatePetLiveActivity(
  activityId: string,
  state: Partial<PetLiveActivityState>,
): Promise<void> {
  if (!activityId || !isLiveActivitySupported()) return;

  const nativeModule = getNativeModule();
  if (!nativeModule) {
    if (__DEV__) {
      console.log('[LiveActivity] Update skipped — native module not available');
    }
    return;
  }

  try {
    await nativeModule.updateActivity(activityId, {
      petName: state.petName,
      emotion: state.emotion,
      energyPercent: state.energyPercent,
      currentTask: state.currentTask,
      taskProgress: state.taskProgress,
    });
  } catch (err: any) {
    console.warn('[LiveActivity] Failed to update:', err?.message);
  }
}

/**
 * End a Live Activity and remove it from Dynamic Island / lock screen.
 *
 * @param activityId - ID returned from startPetLiveActivity
 */
export async function endPetLiveActivity(activityId: string): Promise<void> {
  if (!activityId || !isLiveActivitySupported()) return;

  const nativeModule = getNativeModule();
  if (!nativeModule) {
    if (__DEV__) {
      console.log('[LiveActivity] End skipped — native module not available');
    }
    return;
  }

  try {
    await nativeModule.endActivity(activityId);
  } catch (err: any) {
    console.warn('[LiveActivity] Failed to end:', err?.message);
  }
}

/**
 * End all active Live Activities for this app.
 * Useful on logout or app reset.
 */
export async function endAllPetLiveActivities(): Promise<void> {
  if (!isLiveActivitySupported()) return;

  const nativeModule = getNativeModule();
  if (!nativeModule) return;

  try {
    await nativeModule.endAllActivities();
  } catch (err: any) {
    console.warn('[LiveActivity] Failed to end all:', err?.message);
  }
}

/**
 * Check if there's currently an active Live Activity.
 *
 * @returns true if at least one Live Activity is running
 */
export async function hasActiveLiveActivity(): Promise<boolean> {
  if (!isLiveActivitySupported()) return false;

  const nativeModule = getNativeModule();
  if (!nativeModule) return false;

  try {
    return await nativeModule.hasActiveActivity();
  } catch {
    return false;
  }
}
