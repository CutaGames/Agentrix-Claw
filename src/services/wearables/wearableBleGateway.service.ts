import { BleManager, type Characteristic, type Device, type State, type Subscription } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';
import {
  type BlePermissionState,
  type BleScanResult,
  type LiveCharacteristicEvent,
  type WearableCharacteristicSnapshot,
  type WearableConnectionSnapshot,
  type WearableConnectionStage,
  type WearableServiceSnapshot,
} from './wearableTypes';

type StartScanParams = {
  durationMs?: number;
  onDevice: (device: BleScanResult) => void;
  onFinished?: (devices: BleScanResult[]) => void;
  onError?: (error: Error) => void;
};

const DEFAULT_SCAN_DURATION_MS = 10000;

export class WearableBleGatewayService {
  private static manager = new BleManager();

  static async requestPermissions(): Promise<BlePermissionState> {
    if (Platform.OS !== 'android') {
      return {
        bluetooth: true,
        location: true,
        nearbyDevices: true,
        granted: true,
      };
    }

    const androidPermissions = PermissionsAndroid.PERMISSIONS;
    const requestedPermissions = Platform.Version >= 31
      ? [
          androidPermissions.BLUETOOTH_SCAN,
          androidPermissions.BLUETOOTH_CONNECT,
          androidPermissions.ACCESS_FINE_LOCATION,
        ]
      : [androidPermissions.ACCESS_FINE_LOCATION];

    const result = await PermissionsAndroid.requestMultiple(requestedPermissions);
    const isGranted = (permission: string) => result[permission] === PermissionsAndroid.RESULTS.GRANTED;

    const bluetooth = Platform.Version >= 31
      ? isGranted('android.permission.BLUETOOTH_SCAN') && isGranted('android.permission.BLUETOOTH_CONNECT')
      : true;
    const location = isGranted('android.permission.ACCESS_FINE_LOCATION');
    const nearbyDevices = bluetooth;

    return {
      bluetooth,
      location,
      nearbyDevices,
      granted: bluetooth && location && nearbyDevices,
    };
  }

  static async ensurePoweredOn(timeoutMs = 12000): Promise<void> {
    const currentState = await this.manager.state();
    if (currentState === 'PoweredOn') {
      return;
    }
    if (currentState === 'Unsupported') {
      throw new Error('Bluetooth LE is not supported on this device.');
    }
    if (currentState === 'Unauthorized') {
      throw new Error('Bluetooth permission is not authorized.');
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        subscription.remove();
        reject(new Error('Bluetooth is off or unavailable. Please enable Bluetooth and try again.'));
      }, timeoutMs);

      const subscription = this.manager.onStateChange((state: State) => {
        if (settled) {
          return;
        }
        if (state === 'PoweredOn') {
          settled = true;
          clearTimeout(timer);
          subscription.remove();
          resolve();
          return;
        }
        if (state === 'Unsupported' || state === 'Unauthorized') {
          settled = true;
          clearTimeout(timer);
          subscription.remove();
          reject(new Error(state === 'Unsupported' ? 'Bluetooth LE is not supported on this device.' : 'Bluetooth permission is not authorized.'));
        }
      }, true);
    });
  }

  static async startScan(params: StartScanParams): Promise<() => void> {
    await this.ensurePoweredOn();

    this.manager.stopDeviceScan();
    const seenDevices = new Map<string, BleScanResult>();
    let finished = false;

    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(scanTimer);
      this.manager.stopDeviceScan();
      params.onFinished?.(
        Array.from(seenDevices.values()).sort((left, right) => (right.rssi ?? -999) - (left.rssi ?? -999)),
      );
    };

    const scanTimer = setTimeout(finish, params.durationMs ?? DEFAULT_SCAN_DURATION_MS);

    this.manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        params.onError?.(new Error(error.message || 'BLE scan failed.'));
        finish();
        return;
      }

      const normalizedDevice = this.normalizeDevice(device);
      seenDevices.set(normalizedDevice.id, normalizedDevice);
      params.onDevice(normalizedDevice);
    });

    return finish;
  }

  static async connectAndInspect(
    device: BleScanResult,
    onStageChange?: (stage: WearableConnectionStage) => void,
  ): Promise<WearableConnectionSnapshot> {
    onStageChange?.('connecting');
    const connectedDevice = await this.manager.connectToDevice(device.id);

    onStageChange?.('discovering');
    const discoveredDevice = await connectedDevice.discoverAllServicesAndCharacteristics();
    const services = await discoveredDevice.services();
    const serviceSnapshots: WearableServiceSnapshot[] = [];
    const readableCharacteristics: WearableCharacteristicSnapshot[] = [];
    const notifiableCharacteristics: WearableCharacteristicSnapshot[] = [];

    for (const service of services) {
      const characteristics = await discoveredDevice.characteristicsForService(service.uuid);
      const characteristicSnapshots = characteristics.map((characteristic) => this.toCharacteristicSnapshot(characteristic, service.uuid));
      readableCharacteristics.push(...characteristicSnapshots.filter((characteristic) => characteristic.isReadable));
      notifiableCharacteristics.push(...characteristicSnapshots.filter((characteristic) => characteristic.isNotifiable));
      serviceSnapshots.push({
        uuid: service.uuid.toLowerCase(),
        characteristics: characteristicSnapshots,
      });
    }

    let firstReadCharacteristic: WearableCharacteristicSnapshot | null = null;
    let readError: string | null = null;
    const firstReadableCharacteristic = readableCharacteristics[0] ?? null;

    if (firstReadableCharacteristic) {
      onStageChange?.('reading');
      try {
        const characteristic = await discoveredDevice.readCharacteristicForService(
          firstReadableCharacteristic.serviceUuid,
          firstReadableCharacteristic.uuid,
        );
        firstReadCharacteristic = this.toCharacteristicSnapshot(characteristic, firstReadableCharacteristic.serviceUuid);
      } catch (error: any) {
        readError = error?.message || 'Characteristic read failed.';
        firstReadCharacteristic = firstReadableCharacteristic;
      }
    }

    onStageChange?.('done');
    return {
      device: this.normalizeDevice(discoveredDevice),
      services: serviceSnapshots,
      readableCharacteristics,
      notifiableCharacteristics,
      firstReadCharacteristic,
      readError,
      connectedAt: new Date().toISOString(),
    };
  }

  static monitorCharacteristic(
    deviceId: string,
    serviceUuid: string,
    characteristicUuid: string,
    onEvent: (event: LiveCharacteristicEvent) => void,
    onError?: (error: Error) => void,
  ): () => void {
    const subscription: Subscription = this.manager.monitorCharacteristicForDevice(
      deviceId,
      serviceUuid,
      characteristicUuid,
      (error, characteristic) => {
        if (error) {
          onError?.(new Error(error.message || 'Characteristic monitor failed.'));
          return;
        }
        if (!characteristic) {
          return;
        }
        onEvent({
          id: `${deviceId}:${characteristicUuid}:${Date.now()}`,
          deviceId,
          serviceUuid: serviceUuid.toLowerCase(),
          characteristicUuid: characteristicUuid.toLowerCase(),
          value: characteristic.value ?? null,
          receivedAt: new Date().toISOString(),
        });
      },
    );

    return () => {
      subscription.remove();
    };
  }

  static async disconnectDevice(deviceId: string): Promise<void> {
    try {
      const isConnected = await this.manager.isDeviceConnected(deviceId);
      if (isConnected) {
        await this.manager.cancelDeviceConnection(deviceId);
      }
    } catch {
      // Ignore disconnect cleanup errors.
    }
  }

  private static normalizeDevice(device: Device): BleScanResult {
    return {
      id: device.id,
      name: device.name || device.localName || `BLE-${device.id.slice(-4)}`,
      localName: device.localName ?? null,
      rssi: typeof device.rssi === 'number' ? device.rssi : null,
      manufacturerData: device.manufacturerData ?? null,
      serviceUUIDs: (device.serviceUUIDs ?? []).map((uuid) => uuid.toLowerCase()),
    };
  }

  private static toCharacteristicSnapshot(
    characteristic: Characteristic,
    serviceUuid: string,
  ): WearableCharacteristicSnapshot {
    return {
      uuid: characteristic.uuid.toLowerCase(),
      serviceUuid: serviceUuid.toLowerCase(),
      isReadable: characteristic.isReadable,
      isWritableWithResponse: characteristic.isWritableWithResponse,
      isWritableWithoutResponse: characteristic.isWritableWithoutResponse,
      isNotifiable: characteristic.isNotifiable,
      value: characteristic.value ?? null,
    };
  }
}