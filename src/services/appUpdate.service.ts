/**
 * App Update Service — OTA (Over-the-Air) Updates via Expo Updates
 *
 * Checks the Expo Update server for new JS bundles and applies them
 * without requiring a full APK/IPA reinstall.
 *
 * User data (SecureStore tokens, AsyncStorage state) is preserved across updates
 * because OTA only replaces the JS bundle, not native storage.
 *
 * Usage:
 *   - Auto-check on app launch (configurable)
 *   - Manual check from Settings screen
 *   - Background periodic check
 */
import { Alert, Platform } from 'react-native';

// Dynamically import expo-updates to avoid crash if not installed
let Updates: typeof import('expo-updates') | null = null;
try {
  Updates = require('expo-updates');
} catch {
  // expo-updates not available (e.g. in Expo Go dev mode)
}

export interface UpdateCheckResult {
  available: boolean;
  manifest?: any;
  error?: string;
}

export interface UpdateStatus {
  isChecking: boolean;
  isDownloading: boolean;
  isRestarting: boolean;
  lastCheck: Date | null;
  currentVersion: string;
  runtimeVersion: string;
  channel: string;
  isEmbedded: boolean;
}

/**
 * Check if OTA updates are available.
 * Returns immediately in dev mode (Expo Go) — updates only work in standalone builds.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (!Updates || __DEV__) {
    return { available: false, error: 'Updates not available in development mode' };
  }

  try {
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      return { available: true, manifest: update.manifest };
    }
    return { available: false };
  } catch (err: any) {
    console.warn('[AppUpdate] Check failed:', err.message);
    return { available: false, error: err.message };
  }
}

/**
 * Download and apply an OTA update, then restart the app.
 * User data (SecureStore, AsyncStorage, SQLite) is fully preserved.
 */
export async function downloadAndApplyUpdate(): Promise<boolean> {
  if (!Updates || __DEV__) return false;

  try {
    const result = await Updates.fetchUpdateAsync();
    if (result.isNew) {
      // Restart to apply the new bundle
      await Updates.reloadAsync();
      return true; // won't reach here — app restarts
    }
    return false;
  } catch (err: any) {
    console.error('[AppUpdate] Download failed:', err.message);
    return false;
  }
}

/**
 * Show a user-friendly update prompt.
 * On "Update Now", downloads and restarts. On "Later", dismisses.
 */
export function promptForUpdate(manifest?: any): void {
  const version = manifest?.version || manifest?.runtimeVersion || 'new version';

  Alert.alert(
    '🔄 New Update Available',
    `A new version (${version}) is available. Your data will be preserved during the update.\n\nUpdate now?`,
    [
      { text: 'Later', style: 'cancel' },
      {
        text: 'Update Now',
        style: 'default',
        onPress: async () => {
          try {
            await downloadAndApplyUpdate();
          } catch {
            Alert.alert('Update Failed', 'Please try again later or check your network connection.');
          }
        },
      },
    ],
    { cancelable: true },
  );
}

/**
 * Silent background check — downloads update in background,
 * applies on next app restart (no interruption).
 */
export async function silentBackgroundUpdate(): Promise<void> {
  if (!Updates || __DEV__) return;

  try {
    const check = await Updates.checkForUpdateAsync();
    if (check.isAvailable) {
      console.log('[AppUpdate] Downloading update in background...');
      await Updates.fetchUpdateAsync();
      console.log('[AppUpdate] Update ready — will apply on next restart');
      // Don't call reloadAsync() — let user restart naturally
    }
  } catch (err: any) {
    console.warn('[AppUpdate] Silent update failed:', err.message);
  }
}

/**
 * Get current update status information.
 */
export function getUpdateStatus(): UpdateStatus {
  if (!Updates || __DEV__) {
    return {
      isChecking: false,
      isDownloading: false,
      isRestarting: false,
      lastCheck: null,
      currentVersion: '1.1.0-dev',
      runtimeVersion: 'development',
      channel: 'development',
      isEmbedded: true,
    };
  }

  return {
    isChecking: false,
    isDownloading: false,
    isRestarting: false,
    lastCheck: Updates.createdAt ?? null,
    currentVersion: (Updates.manifest as any)?.version ?? 'unknown',
    runtimeVersion: Updates.runtimeVersion ?? 'unknown',
    channel: Updates.channel ?? 'default',
    isEmbedded: Updates.isEmbeddedLaunch ?? true,
  };
}

/**
 * Full update flow: check → prompt → download → restart.
 * Call this on app launch or from Settings.
 */
export async function checkAndPromptUpdate(): Promise<void> {
  const result = await checkForUpdate();
  if (result.available) {
    promptForUpdate(result.manifest);
  }
}
