import {
  type BleScanResult,
  type WearableConnectionSnapshot,
  type WearableKind,
  type WearableProfile,
  type WearableScanCandidate,
  type WearableSupportTier,
} from './wearableTypes';
import { WearableVendorRegistryService } from './wearableVendorRegistry.service';

const STANDARD_SERVICE_LABELS: Record<string, string> = {
  '1800': 'Generic Access',
  '1801': 'Generic Attribute',
  '1809': 'Health Thermometer',
  '180a': 'Device Information',
  '180d': 'Heart Rate',
  '180f': 'Battery',
  '1810': 'Blood Pressure',
  '181a': 'Environmental Sensing',
};

export class WearableDeviceAdapterService {
  static buildScanCandidate(device: BleScanResult): WearableScanCandidate {
    const kind = this.inferKind(device.name);
    const serviceLabels = this.getServiceLabels(device.serviceUUIDs);
    const supportTier = this.inferSupportTier(serviceLabels, 0);
    const signalLabel = typeof device.rssi === 'number' ? `${device.rssi} dBm` : 'RSSI unknown';

    return WearableVendorRegistryService.enrichScanCandidate({
      id: device.id,
      name: device.name,
      kind,
      supportTier,
      summary: this.buildScanSummary(kind, serviceLabels, signalLabel),
      serviceLabels,
      signalLabel,
      raw: device,
    });
  }

  static adaptConnectionSnapshot(snapshot: WearableConnectionSnapshot): WearableProfile {
    const serviceLabels = this.getServiceLabels(snapshot.services.map((service) => service.uuid));
    const kind = this.inferKind(snapshot.device.name);
    const supportTier = this.inferSupportTier(serviceLabels, snapshot.readableCharacteristics.length);

    return WearableVendorRegistryService.enrichProfile({
      id: snapshot.device.id,
      name: snapshot.device.name,
      kind,
      supportTier,
      summary: this.buildConnectionSummary(snapshot.services.length, snapshot.readableCharacteristics.length, serviceLabels),
      serviceLabels,
      servicesCount: snapshot.services.length,
      readableCount: snapshot.readableCharacteristics.length,
      notifiableCount: snapshot.notifiableCharacteristics.length,
      firstReadCharacteristicUuid: snapshot.firstReadCharacteristic?.uuid ?? null,
      firstReadPayload: snapshot.firstReadCharacteristic?.value ?? null,
      readError: snapshot.readError,
      connectedAt: snapshot.connectedAt,
    });
  }

  static getServiceLabels(serviceUUIDs: string[]): string[] {
    const labels = serviceUUIDs.map((serviceUuid) => STANDARD_SERVICE_LABELS[this.toShortUuid(serviceUuid)] || this.toShortUuid(serviceUuid));
    return Array.from(new Set(labels));
  }

  private static inferKind(deviceName: string): WearableKind {
    const normalizedName = deviceName.toLowerCase();
    if (normalizedName.includes('ring')) {
      return 'ring';
    }
    if (normalizedName.includes('band') || normalizedName.includes('bracelet') || normalizedName.includes('watch')) {
      return 'band';
    }
    if (normalizedName.includes('clip') || normalizedName.includes('tag')) {
      return 'clip';
    }
    if (normalizedName.includes('sensor') || normalizedName.includes('heart') || normalizedName.includes('thermo')) {
      return 'sensor';
    }
    return 'unknown';
  }

  private static inferSupportTier(serviceLabels: string[], readableCount: number): WearableSupportTier {
    if (readableCount > 0 || serviceLabels.includes('Heart Rate') || serviceLabels.includes('Battery')) {
      return 'ready';
    }
    if (serviceLabels.length > 0) {
      return 'known';
    }
    return 'beta';
  }

  private static buildScanSummary(kind: WearableKind, serviceLabels: string[], signalLabel: string): string {
    const serviceSummary = serviceLabels.length > 0
      ? `Advertises ${serviceLabels.slice(0, 3).join(', ')}.`
      : 'No advertised standard services detected yet.';
    return `${this.kindLabel(kind)} candidate. ${serviceSummary} ${signalLabel}.`;
  }

  private static buildConnectionSummary(servicesCount: number, readableCount: number, serviceLabels: string[]): string {
    const serviceSummary = serviceLabels.length > 0 ? serviceLabels.join(', ') : 'vendor-specific services only';
    return `Discovered ${servicesCount} GATT services, ${readableCount} readable characteristics, and identified ${serviceSummary}.`;
  }

  private static kindLabel(kind: WearableKind): string {
    switch (kind) {
      case 'ring':
        return 'Ring';
      case 'band':
        return 'Band';
      case 'clip':
        return 'Clip';
      case 'sensor':
        return 'Sensor';
      default:
        return 'Wearable';
    }
  }

  private static toShortUuid(uuid: string): string {
    const normalizedUuid = uuid.toLowerCase();
    const standardMatch = normalizedUuid.match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/);
    return standardMatch?.[1] ?? normalizedUuid;
  }
}