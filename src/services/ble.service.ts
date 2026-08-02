/**
 * BLE Device Discovery Service — Sprint 4 Task 4.6
 *
 * Uses react-native-ble-plx to scan for and interact with
 * Agentrix/ClawCore toy devices via Bluetooth Low Energy.
 *
 * Device filtering:
 * - Service UUID: "0000AGXR-0000-1000-8000-00805F9B34FB" (Agentrix custom)
 * - Name prefix: "AGX-" or "CLAW-"
 */
import { BleManager, Device, State } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { apiFetch } from './api';

// ── Types ──────────────────────────────────────────────────────────────────

export interface DiscoveredDevice {
  id: string;
  name: string;
  rssi: number;
  type: 'agx' | 'claw' | 'unknown';
}

export interface PairedDevice {
  id: string;
  name: string;
  type: string;
  firmwareVersion: string;
  batteryLevel?: number;
  lastActive?: string;
}

export interface PairDeviceResponse {
  success: boolean;
  device?: PairedDevice;
  error?: string;
}

export interface OtaCheckResponse {
  available: boolean;
  version?: string;
  releaseNotes?: string;
  downloadUrl?: string;
}

export type BleStatus = 'ready' | 'powered_off' | 'unauthorized' | 'unsupported' | 'unknown';

// ── Constants ──────────────────────────────────────────────────────────────

const AGENTRIX_SERVICE_UUID = '0000AGXR-0000-1000-8000-00805F9B34FB';
const DEVICE_NAME_PREFIXES = ['AGX-', 'CLAW-'];
const SCAN_TIMEOUT_MS = 15000;

// ── Singleton BLE Manager ──────────────────────────────────────────────────

let bleManager: BleManager | null = null;

function getBleManager(): BleManager {
  if (!bleManager) {
    bleManager = new BleManager();
  }
  return bleManager;
}

// ── Permission Helpers ─────────────────────────────────────────────────────

async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    // iOS permissions are handled via Info.plist
    return true;
  }

  // Android 12+ requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT
  if (Platform.OS === 'android' && Platform.Version >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return (
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted'
    );
  }

  // Older Android — location permission needed for BLE scan
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return result === 'granted';
  }

  return true;
}

// ── Service Functions ──────────────────────────────────────────────────────

/**
 * Check BLE adapter state.
 */
export async function checkBleStatus(): Promise<BleStatus> {
  try {
    const manager = getBleManager();
    const state = await manager.state();
    switch (state) {
      case State.PoweredOn:
        return 'ready';
      case State.PoweredOff:
        return 'powered_off';
      case State.Unauthorized:
        return 'unauthorized';
      case State.Unsupported:
        return 'unsupported';
      default:
        return 'unknown';
    }
  } catch {
    return 'unsupported';
  }
}

/**
 * Start scanning for nearby Agentrix/ClawCore BLE devices.
 * Calls `onDeviceFound` for each discovered device matching our filter.
 * Automatically stops after SCAN_TIMEOUT_MS.
 */
export async function startBleScan(
  onDeviceFound: (device: DiscoveredDevice) => void,
): Promise<void> {
  const hasPermission = await requestBlePermissions();
  if (!hasPermission) {
    throw new Error('Bluetooth permissions not granted.');
  }

  const manager = getBleManager();
  const state = await manager.state();
  if (state !== State.PoweredOn) {
    throw new Error('Bluetooth is not enabled. Please turn on Bluetooth.');
  }

  const seenIds = new Set<string>();

  manager.startDeviceScan(
    null, // Scan all service UUIDs (filter by name below)
    { allowDuplicates: false },
    (error, device) => {
      if (error) {
        console.warn('[BLE] Scan error:', error.message);
        return;
      }
      if (!device) return;

      // Filter by name prefix
      const name = device.name || device.localName || '';
      const isAgentrixDevice = DEVICE_NAME_PREFIXES.some((prefix) =>
        name.toUpperCase().startsWith(prefix),
      );

      if (!isAgentrixDevice) return;
      if (seenIds.has(device.id)) return;
      seenIds.add(device.id);

      const type: DiscoveredDevice['type'] = name.toUpperCase().startsWith('CLAW-')
        ? 'claw'
        : name.toUpperCase().startsWith('AGX-')
          ? 'agx'
          : 'unknown';

      onDeviceFound({
        id: device.id,
        name,
        rssi: device.rssi ?? -100,
        type,
      });
    },
  );

  // Auto-stop after timeout
  setTimeout(() => {
    stopBleScan();
  }, SCAN_TIMEOUT_MS);
}

/**
 * Stop the current BLE scan.
 */
export function stopBleScan(): void {
  try {
    const manager = getBleManager();
    manager.stopDeviceScan();
  } catch {
    // Ignore — scan may not be active
  }
}

/**
 * Read device characteristics (battery level, firmware version).
 * Connects to the device briefly to read GATT characteristics.
 */
export async function getDeviceInfo(deviceId: string): Promise<{
  batteryLevel?: number;
  firmwareVersion?: string;
}> {
  const manager = getBleManager();
  let connectedDevice: Device | null = null;

  try {
    connectedDevice = await manager.connectToDevice(deviceId, {
      timeout: 5000,
    });
    await connectedDevice.discoverAllServicesAndCharacteristics();

    // Read battery level (standard BLE Battery Service: 0x180F, char 0x2A19)
    let batteryLevel: number | undefined;
    try {
      const batteryChar = await connectedDevice.readCharacteristicForService(
        '0000180F-0000-1000-8000-00805F9B34FB',
        '00002A19-0000-1000-8000-00805F9B34FB',
      );
      if (batteryChar?.value) {
        const decoded = Buffer.from(batteryChar.value, 'base64');
        batteryLevel = decoded[0];
      }
    } catch {
      // Battery service may not be available
    }

    // Read firmware version (Device Information Service: 0x180A, Firmware Revision: 0x2A26)
    let firmwareVersion: string | undefined;
    try {
      const fwChar = await connectedDevice.readCharacteristicForService(
        '0000180A-0000-1000-8000-00805F9B34FB',
        '00002A26-0000-1000-8000-00805F9B34FB',
      );
      if (fwChar?.value) {
        firmwareVersion = Buffer.from(fwChar.value, 'base64').toString('utf-8');
      }
    } catch {
      // Device info service may not be available
    }

    return { batteryLevel, firmwareVersion };
  } finally {
    // Disconnect after reading
    if (connectedDevice) {
      try {
        await manager.cancelDeviceConnection(deviceId);
      } catch {
        // Ignore disconnect errors
      }
    }
  }
}

// ── Backend API Calls ──────────────────────────────────────────────────────

/**
 * Pair a device with the given pairing code.
 * POST /api/v1/clawcore/devices/pair { deviceId, code }
 */
export async function pairDevice(deviceId: string, code: string): Promise<PairDeviceResponse> {
  return apiFetch<PairDeviceResponse>('/api/v1/clawcore/devices/pair', {
    method: 'POST',
    body: JSON.stringify({ deviceId, code }),
  });
}

/**
 * Fetch list of paired devices.
 * GET /api/v1/clawcore/devices
 */
export async function getPairedDevices(): Promise<PairedDevice[]> {
  try {
    const result = await apiFetch<{ devices: PairedDevice[] }>('/api/v1/clawcore/devices');
    return result.devices || [];
  } catch {
    return [];
  }
}

/**
 * Unpair a device.
 * DELETE /api/v1/clawcore/devices/:id
 */
export async function unpairDevice(deviceId: string): Promise<void> {
  await apiFetch(`/api/v1/clawcore/devices/${deviceId}`, {
    method: 'DELETE',
  });
}

/**
 * Check for OTA firmware update.
 * GET /api/v1/clawcore/devices/:id/ota
 */
export async function checkDeviceOta(deviceId: string): Promise<OtaCheckResponse> {
  return apiFetch<OtaCheckResponse>(`/api/v1/clawcore/devices/${deviceId}/ota`);
}
