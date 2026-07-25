/**
 * ClawCoreManager — Sprint I #24
 *
 * Manages connections to ClawCore Toy devices via BLE GATT.
 * Implements the state machine: discovered → connecting → pairing → bound → active.
 *
 * Per toy-prd-v4 §5.4 state machine:
 *   [powered] -hello-> [pairing] -auth-> [bound]
 *   [bound] <-pet.state.sync-> [active]
 *   [active] -pet.interaction-> [active]
 *   [active] -ota.check-> [updating] -ota.chunk*-> [active]
 *   Any state -error/timeout-> [bound] (soft reconnect)
 */
import { BleManager, Device, Characteristic } from 'react-native-ble-plx';
import { encodeFrame, decodeFrame, verifyFrame, isReplayAttack } from './protocol';
import type {
  ClawCoreDevice,
  ClawCoreDeviceState,
  PetStatePayload,
  PetInteractionPayload,
  HelloPayload,
  AuthPayload,
} from './types';
import { apiFetch } from '../api';

// Nordic UART Service UUIDs
const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_TX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Notify: device → phone
const NUS_RX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Write: phone → device

type InteractionHandler = (deviceId: string, payload: PetInteractionPayload) => void;
type StateChangeHandler = (deviceId: string, state: ClawCoreDeviceState) => void;

export class ClawCoreManager {
  private bleManager: BleManager;
  private devices: Map<string, ClawCoreDevice> = new Map();
  private secrets: Map<string, string> = new Map(); // deviceId → HMAC secret
  private lastTs: Map<string, number> = new Map();
  private onInteraction: InteractionHandler | null = null;
  private onStateChange: StateChangeHandler | null = null;
  private rxBuffers: Map<string, string> = new Map(); // partial frame accumulator

  constructor() {
    this.bleManager = new BleManager();
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Set handler for pet.interaction events from toys.
   */
  setInteractionHandler(handler: InteractionHandler): void {
    this.onInteraction = handler;
  }

  /**
   * Set handler for device state changes.
   */
  setStateChangeHandler(handler: StateChangeHandler): void {
    this.onStateChange = handler;
  }

  /**
   * Scan for nearby ClawCore devices.
   */
  async startDiscovery(onFound: (device: ClawCoreDevice) => void): Promise<void> {
    this.bleManager.startDeviceScan(
      [NUS_SERVICE_UUID],
      { allowDuplicates: false },
      (error, device) => {
        if (error || !device) return;
        if (!device.name?.includes('Agentrix') && !device.name?.includes('ClawCore')) return;

        const ccDevice: ClawCoreDevice = {
          id: device.id,
          name: device.name || 'Unknown',
          bleId: device.id,
          firmwareVersion: '',
          hardwareTier: 'L3',
          vendor: 'unknown',
          capabilityFlags: [],
          pairingMethod: 'ble',
          state: 'discovered',
          batteryLevel: null,
          lastActive: null,
          deviceJwt: null,
        };

        if (!this.devices.has(device.id)) {
          this.devices.set(device.id, ccDevice);
          onFound(ccDevice);
        }
      },
    );
  }

  /**
   * Stop BLE discovery.
   */
  stopDiscovery(): void {
    this.bleManager.stopDeviceScan();
  }

  /**
   * Connect to a discovered device and initiate pairing.
   */
  async connect(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) throw new Error('Device not found');

    this.updateState(deviceId, 'connecting');

    try {
      const bleDevice = await this.bleManager.connectToDevice(deviceId);
      await bleDevice.discoverAllServicesAndCharacteristics();

      // Subscribe to TX (notifications from device)
      bleDevice.monitorCharacteristicForService(
        NUS_SERVICE_UUID,
        NUS_TX_UUID,
        (error, characteristic) => {
          if (error || !characteristic?.value) return;
          this.handleIncomingData(deviceId, characteristic.value);
        },
      );

      this.updateState(deviceId, 'pairing');
    } catch (err: any) {
      this.updateState(deviceId, 'error');
      throw err;
    }
  }

  /**
   * Complete pairing with a 6-digit code.
   * Calls backend to verify and get device JWT + HMAC secret.
   */
  async completePairing(deviceId: string, code: string): Promise<void> {
    try {
      const response = await apiFetch<{
        device_jwt: string;
        hmac_secret: string;
        device_info: { firmware_version: string; hardware_tier: 'L2' | 'L3'; vendor: string };
      }>('/v1/clawcore/pair', {
        method: 'POST',
        body: JSON.stringify({ device_id: deviceId, pairing_code: code }),
      });

      // Store secret for HMAC verification
      this.secrets.set(deviceId, response.hmac_secret);

      // Update device info
      const device = this.devices.get(deviceId);
      if (device) {
        device.deviceJwt = response.device_jwt;
        device.firmwareVersion = response.device_info.firmware_version;
        device.hardwareTier = response.device_info.hardware_tier;
        device.vendor = response.device_info.vendor;
        device.state = 'bound';
      }

      // Send auth frame to device
      const authPayload: AuthPayload = {
        device_jwt: response.device_jwt,
        server_pub: '', // Server public key for future E2E
      };
      await this.sendFrame(deviceId, 'auth', authPayload);

      this.updateState(deviceId, 'bound');
    } catch (err: any) {
      this.updateState(deviceId, 'error');
      throw err;
    }
  }

  /**
   * Push pet state to a connected toy.
   */
  async pushPetState(deviceId: string, state: PetStatePayload): Promise<void> {
    await this.sendFrame(deviceId, 'pet.state.sync', state);
    this.updateState(deviceId, 'active');
  }

  /**
   * Push pet state to ALL connected toys.
   */
  async broadcastPetState(state: PetStatePayload): Promise<void> {
    for (const [id, device] of this.devices) {
      if (device.state === 'bound' || device.state === 'active') {
        await this.pushPetState(id, state).catch(() => {});
      }
    }
  }

  /**
   * Disconnect from a device.
   */
  async disconnect(deviceId: string): Promise<void> {
    try {
      await this.bleManager.cancelDeviceConnection(deviceId);
    } catch {
      // Already disconnected
    }
    this.updateState(deviceId, 'disconnected');
  }

  /**
   * Get all known devices.
   */
  getDevices(): ClawCoreDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Destroy manager and clean up.
   */
  destroy(): void {
    this.bleManager.destroy();
    this.devices.clear();
    this.secrets.clear();
  }

  // ── Private ────────────────────────────────────────────────

  private async sendFrame(deviceId: string, type: string, payload: unknown): Promise<void> {
    const secret = this.secrets.get(deviceId) || '';
    const frameStr = encodeFrame(type as any, payload, secret);
    const base64 = Buffer.from(frameStr, 'utf-8').toString('base64');

    await this.bleManager.writeCharacteristicWithResponseForDevice(
      deviceId,
      NUS_SERVICE_UUID,
      NUS_RX_UUID,
      base64,
    );
  }

  private handleIncomingData(deviceId: string, base64Value: string): void {
    const raw = Buffer.from(base64Value, 'base64').toString('utf-8');

    // Accumulate partial frames (BLE MTU may split JSON lines)
    const buffer = (this.rxBuffers.get(deviceId) || '') + raw;
    const lines = buffer.split('\n');

    // Last element may be incomplete — keep in buffer
    this.rxBuffers.set(deviceId, lines.pop() || '');

    for (const line of lines) {
      if (!line.trim()) continue;
      const frame = decodeFrame(line);
      if (!frame) continue;

      // Verify HMAC
      const secret = this.secrets.get(deviceId);
      if (secret && !verifyFrame(frame, secret)) {
        console.warn(`[ClawCore] Invalid HMAC from ${deviceId}`);
        continue;
      }

      // Replay check
      const lastTs = this.lastTs.get(deviceId) || 0;
      if (isReplayAttack(frame, lastTs)) {
        console.warn(`[ClawCore] Replay attack detected from ${deviceId}`);
        continue;
      }
      this.lastTs.set(deviceId, frame.ts);

      // Dispatch by type
      this.dispatchFrame(deviceId, frame);
    }
  }

  private dispatchFrame(deviceId: string, frame: ReturnType<typeof decodeFrame>): void {
    if (!frame) return;

    switch (frame.type) {
      case 'hello': {
        const payload = frame.payload as any;
        const device = this.devices.get(deviceId);
        if (device) {
          device.firmwareVersion = payload.fw_version || '';
          device.capabilityFlags = payload.capability_flags || [];
        }
        break;
      }
      case 'pet.interaction': {
        const payload = frame.payload as PetInteractionPayload;
        this.onInteraction?.(deviceId, payload);
        break;
      }
      case 'vitals.report': {
        // Forward to vitals bus (future integration)
        break;
      }
      case 'error': {
        console.warn(`[ClawCore] Error from ${deviceId}:`, frame.payload);
        break;
      }
    }
  }

  private updateState(deviceId: string, state: ClawCoreDeviceState): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.state = state;
      device.lastActive = Date.now();
    }
    this.onStateChange?.(deviceId, state);
  }
}
