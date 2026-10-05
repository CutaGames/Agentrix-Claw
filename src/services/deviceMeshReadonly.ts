/**
 * deviceMeshReadonly — the owner's devices and rental earnings, read-only on the phone (L5 backlog mobile 5;
 * `DEVICE_MESH_ROUTES_V0` / `DEVICE_RENTAL_ROUTES_V0`). Off unless the build sets `EXPO_PUBLIC_DEVICE_MESH_ENABLED=1`;
 * the routes answer 404 while the server switches are off ("not open yet"). Everything goes through the shared
 * decoders; what does not decode is dropped. No React Native import: the transport is injected.
 */
import type { HttpTransportV1 } from '../../shared/client/transport';
import {
  decodeDeviceCapabilityDeclarationV0,
  decodeDeviceRentalJobViewV0,
  type DeviceCapabilityDeclarationV0,
  type DeviceRentalJobViewV0,
} from '../../shared/types/device-capability';

export type MeshRead<T> = { kind: 'ready'; value: T } | { kind: 'closed' } | { kind: 'unreadable' };

export function isDeviceMeshReadonlyEnabled(env: { EXPO_PUBLIC_DEVICE_MESH_ENABLED?: string } = { EXPO_PUBLIC_DEVICE_MESH_ENABLED: process.env.EXPO_PUBLIC_DEVICE_MESH_ENABLED }): boolean {
  return env.EXPO_PUBLIC_DEVICE_MESH_ENABLED === '1';
}

function itemsOf(body: unknown): unknown[] | null {
  return body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items) ? (body as { items: unknown[] }).items : null;
}

async function read<T>(transport: HttpTransportV1, baseUrl: string, token: string | null, path: string, decode: (items: unknown[]) => T): Promise<MeshRead<T>> {
  try {
    const response = await transport.request({
      method: 'GET',
      path: `${baseUrl.replace(/\/+$/, '')}${path}`,
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (response.status === 404) return { kind: 'closed' };
    if (response.status !== 200) return { kind: 'unreadable' };
    const items = itemsOf(response.body);
    return items ? { kind: 'ready', value: decode(items) } : { kind: 'unreadable' };
  } catch {
    return { kind: 'unreadable' };
  }
}

export function readMyDevices(transport: HttpTransportV1, baseUrl: string, token: string | null, now: Date = new Date()): Promise<MeshRead<DeviceCapabilityDeclarationV0[]>> {
  return read(transport, baseUrl, token, '/device-mesh/devices', (items) =>
    items.flatMap((item) => {
      const decoded = decodeDeviceCapabilityDeclarationV0(item, now);
      return decoded.ok === true ? [(decoded as { ok: true; value: DeviceCapabilityDeclarationV0 }).value] : [];
    }),
  );
}

/** Completed jobs this owner's devices ran for others, and their total (computed here from what decoded). */
export function readRentalEarnings(transport: HttpTransportV1, baseUrl: string, token: string | null): Promise<MeshRead<{ items: DeviceRentalJobViewV0[]; totalCents: number }>> {
  return read(transport, baseUrl, token, '/device-rental/earnings', (items) => {
    const jobs = items
      .map((item) => decodeDeviceRentalJobViewV0(item))
      .filter((job): job is DeviceRentalJobViewV0 => job !== null && job.role === 'seller' && job.status === 'completed');
    return { items: jobs, totalCents: jobs.reduce((sum, job) => sum + (job.amountCents ?? 0), 0) };
  });
}
