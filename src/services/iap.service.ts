/**
 * iap.service.ts — In-app purchase service (Sprint M-P0-3, Android-first).
 *
 * Wraps `react-native-purchases` (RevenueCat) so:
 *   - Subscription purchases on iOS / Android go through Apple IAP /
 *     Play Billing (mandatory by store policy).
 *   - AXP top-up purchases on mobile go through IAP (consumable).
 *   - The backend gets webhook notifications via RevenueCat -> our
 *     `/v1/payment/iap-webhook` endpoint (separate spec).
 *
 * Platforms:
 *   - iOS: SKAdNetwork + StoreKit 2 (managed by RevenueCat). **NOTE**:
 *     this sprint skips iOS shipping; the code path is in place but
 *     iOS App Store Connect product registration is deferred.
 *   - Android: Google Play Billing v6+. Products must be registered in
 *     Play Console (deferred to Play account creation).
 *   - Web / Desktop: not used (Stripe Checkout instead).
 *
 * Configuration: set `REVENUECAT_API_KEY_ANDROID` / `REVENUECAT_API_KEY_IOS`
 * in `app.json` `extra` or as `EXPO_PUBLIC_*` env vars at build time.
 *
 * Lifecycle:
 *   1. Call `initIap()` once on app boot (after authentication is loaded).
 *   2. `getOfferings()` to fetch the catalog from RevenueCat.
 *   3. `purchasePackage(pkg)` to launch the native purchase sheet.
 *   4. `restorePurchases()` to re-attach prior purchases on a new device.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';

let _purchases: typeof import('react-native-purchases').default | null = null;
let _initialized = false;

function readKey(): string | null {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;
  if (Platform.OS === 'ios') {
    return (
      extra.REVENUECAT_API_KEY_IOS ||
      process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS ||
      null
    );
  }
  if (Platform.OS === 'android') {
    return (
      extra.REVENUECAT_API_KEY_ANDROID ||
      process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID ||
      null
    );
  }
  return null;
}

/**
 * Lazy-load the SDK. We do this lazily because:
 *   - On Expo Go / web, the native module isn't linked
 *   - When SDK is missing, we want the rest of the app to still run
 *     (purchase UI shows a "configure store account" placeholder).
 */
function loadSdk(): typeof import('react-native-purchases').default | null {
  if (_purchases) return _purchases;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases');
    _purchases = mod?.default ?? mod;
    return _purchases;
  } catch (e) {
    if (__DEV__) console.warn('[iap] react-native-purchases not available:', (e as Error).message);
    return null;
  }
}

/**
 * Initialize RevenueCat. Safe to call multiple times.
 */
export async function initIap(userId?: string | null): Promise<boolean> {
  if (_initialized) {
    if (userId) await setUser(userId);
    return true;
  }
  const sdk = loadSdk();
  if (!sdk) return false;
  const key = readKey();
  if (!key) {
    if (__DEV__) console.log('[iap] No RevenueCat API key configured for', Platform.OS);
    return false;
  }
  try {
    sdk.configure({ apiKey: key, appUserID: userId ?? undefined });
    _initialized = true;
    if (__DEV__) console.log('[iap] RevenueCat configured for', Platform.OS);
    return true;
  } catch (e) {
    console.warn('[iap] configure failed:', (e as Error).message);
    return false;
  }
}

/**
 * Bind / rebind a backend user id so RevenueCat aliases purchases to it.
 * Call after login or account switch.
 */
export async function setUser(userId: string | null): Promise<void> {
  const sdk = loadSdk();
  if (!sdk || !_initialized) return;
  try {
    if (userId) {
      await sdk.logIn(userId);
    } else {
      await sdk.logOut();
    }
  } catch (e) {
    if (__DEV__) console.warn('[iap] setUser failed:', (e as Error).message);
  }
}

/**
 * Fetch product offerings (subscription tiers + AXP packs) from
 * RevenueCat. Return `null` if SDK unavailable or no offerings exist.
 */
export async function getOfferings(): Promise<unknown | null> {
  const sdk = loadSdk();
  if (!sdk || !_initialized) return null;
  try {
    const offerings = await sdk.getOfferings();
    return offerings?.current ?? null;
  } catch (e) {
    if (__DEV__) console.warn('[iap] getOfferings failed:', (e as Error).message);
    return null;
  }
}

/**
 * Buy a package. The package object comes from `getOfferings()`.
 * Returns the customer info on success; throws on user cancel.
 */
export async function purchasePackage(pkg: any): Promise<unknown | null> {
  const sdk = loadSdk();
  if (!sdk || !_initialized) {
    throw new Error('In-app purchases are not available on this device.');
  }
  const result = await sdk.purchasePackage(pkg);
  return result?.customerInfo ?? null;
}

/**
 * Restore previously purchased entitlements. Required on iOS to comply
 * with App Store Review Guideline 3.1.1.
 */
export async function restorePurchases(): Promise<unknown | null> {
  const sdk = loadSdk();
  if (!sdk || !_initialized) return null;
  try {
    return await sdk.restorePurchases();
  } catch (e) {
    if (__DEV__) console.warn('[iap] restorePurchases failed:', (e as Error).message);
    return null;
  }
}

/**
 * Whether the IAP SDK is configured and ready.
 */
export function isIapReady(): boolean {
  return _initialized;
}
