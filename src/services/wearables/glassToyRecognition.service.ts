/**
 * glassToyRecognition.service.ts — Sprint WD #9
 *
 * Per wearable-prd-v4 §3.2: Glass Toy 视觉识别
 *
 * Flow:
 *   1. Glass camera passively captures (user-authorized)
 *   2. Identify Agentrix Toy on desk/shelf via visual features + NFC signal
 *   3. HUD highlights Toy + shows device name
 *   4. Triggers Toy LED celebration (user walks near)
 *   5. Broadcasts `toy.proximity.detected`
 *
 * Implementation:
 *   - Uses Glass camera frames (via BLE characteristic or companion app relay)
 *   - Runs lightweight object detection (MobileNet/YOLO-tiny on-device or cloud)
 *   - Cross-references with registered device visual signatures
 *
 * This is a V5 feature — initial implementation provides the service interface
 * and basic NFC-proximity-based detection (no vision ML yet).
 */
import { GlassHUDController } from './glassHUDController.service';
import { apiFetch } from '../api';

// ── Types ────────────────────────────────────────────────────

export interface ToyProximityEvent {
  device_id: string;
  device_name: string;
  detection_method: 'nfc_proximity' | 'ble_rssi' | 'visual' | 'combined';
  confidence: number; // 0-1
  distance_estimate_m: number | null;
  timestamp: number;
}

export interface RegisteredToyVisual {
  device_id: string;
  device_name: string;
  visual_signature_url: string | null; // Reference image for visual matching
  nfc_token: string | null;
  ble_mac: string | null;
}

type ProximityHandler = (event: ToyProximityEvent) => void;

// ── Service ──────────────────────────────────────────────────

let _hudController: GlassHUDController | null = null;
let _proximityHandler: ProximityHandler | null = null;
let _registeredToys: RegisteredToyVisual[] = [];
let _scanning = false;

/**
 * Initialize the Glass Toy recognition service.
 */
export function initGlassToyRecognition(hud: GlassHUDController): void {
  _hudController = hud;
}

/**
 * Set handler for proximity detection events.
 */
export function onToyProximityDetected(handler: ProximityHandler): () => void {
  _proximityHandler = handler;
  return () => { _proximityHandler = null; };
}

/**
 * Load registered toys for the current user (for matching).
 */
export async function loadRegisteredToys(): Promise<void> {
  try {
    const res = await apiFetch<{ devices: RegisteredToyVisual[] }>('/v1/clawcore/devices?include_visual=true');
    _registeredToys = res.devices || [];
  } catch {
    _registeredToys = [];
  }
}

/**
 * Start passive proximity scanning.
 * V5 Phase 1: Uses BLE RSSI-based proximity (no vision ML yet).
 * V5 Phase 2: Will add visual recognition via Glass camera frames.
 */
export function startProximityScan(): void {
  if (_scanning) return;
  _scanning = true;

  // Listen for BLE proximity events from the wearable gateway
  window.addEventListener('agentrix:ble-proximity', handleBleProximity as EventListener);

  // Listen for NFC tap events (Glass with NFC reader)
  window.addEventListener('agentrix:glass-nfc-tap', handleNfcTap as EventListener);
}

/**
 * Stop proximity scanning.
 */
export function stopProximityScan(): void {
  _scanning = false;
  window.removeEventListener('agentrix:ble-proximity', handleBleProximity as EventListener);
  window.removeEventListener('agentrix:glass-nfc-tap', handleNfcTap as EventListener);
}

// ── Internal handlers ────────────────────────────────────────

function handleBleProximity(e: CustomEvent): void {
  const detail = e.detail as { device_id?: string; rssi?: number } | undefined;
  if (!detail?.device_id) return;

  // Check if this is a registered Toy
  const toy = _registeredToys.find((t) => t.ble_mac === detail.device_id || t.device_id === detail.device_id);
  if (!toy) return;

  // Estimate distance from RSSI (rough: -50 dBm ≈ 1m, -70 ≈ 3m, -90 ≈ 10m)
  const rssi = detail.rssi ?? -80;
  const distanceM = rssi > -50 ? 0.5 : rssi > -60 ? 1 : rssi > -70 ? 3 : rssi > -80 ? 5 : 10;

  // Only trigger if within 3 meters
  if (distanceM > 3) return;

  const event: ToyProximityEvent = {
    device_id: toy.device_id,
    device_name: toy.device_name,
    detection_method: 'ble_rssi',
    confidence: Math.max(0.3, 1 - distanceM / 10),
    distance_estimate_m: distanceM,
    timestamp: Date.now(),
  };

  fireToyDetected(event);
}

function handleNfcTap(e: CustomEvent): void {
  const detail = e.detail as { token?: string } | undefined;
  if (!detail?.token) return;

  const toy = _registeredToys.find((t) => t.nfc_token === detail.token);
  if (!toy) return;

  const event: ToyProximityEvent = {
    device_id: toy.device_id,
    device_name: toy.device_name,
    detection_method: 'nfc_proximity',
    confidence: 1.0,
    distance_estimate_m: 0.05, // NFC = touching
    timestamp: Date.now(),
  };

  fireToyDetected(event);
}

function fireToyDetected(event: ToyProximityEvent): void {
  // 1. Show on Glass HUD
  _hudController?.showNotification(
    `🧸 ${event.device_name}`,
    '🔗',
  );

  // 2. Dispatch global event (for Toy LED celebration trigger)
  window.dispatchEvent(new CustomEvent('agentrix:toy-proximity-detected', { detail: event }));

  // 3. Call handler
  _proximityHandler?.(event);

  // 4. Broadcast to backend
  apiFetch('/v1/clawcore/proximity', {
    method: 'POST',
    body: JSON.stringify(event),
  }).catch(() => {});
}
