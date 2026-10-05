/**
 * L7-4 v0 device passports on the phone, read only (`DEVICE_MARKET_ROUTES_V0.passports`, shared decoder
 * `decodeDevicePassportListV0`): for each of the owner's devices, what it says it can do, the market services among
 * them, and the rental jobs it finished. Off unless the build sets `EXPO_PUBLIC_DEVICE_MARKET_ENABLED=1`; the route
 * answers 404 while the server switches are off ("not open yet"). No React Native import: the transport is injected.
 */
import type { HttpTransportV1 } from '../../shared/client/transport';
import { decodeDevicePassportListV0, type DevicePassportV0 } from '../../shared/types/device-market';
import type { MeshRead } from './deviceMeshReadonly';

type Copy = { zh: string; en: string };

export function isDevicePassportsEnabled(
  env: { EXPO_PUBLIC_DEVICE_MARKET_ENABLED?: string } = { EXPO_PUBLIC_DEVICE_MARKET_ENABLED: process.env.EXPO_PUBLIC_DEVICE_MARKET_ENABLED },
): boolean {
  return env.EXPO_PUBLIC_DEVICE_MARKET_ENABLED === '1';
}

export async function readDevicePassports(transport: HttpTransportV1, baseUrl: string, token: string | null): Promise<MeshRead<DevicePassportV0[]>> {
  if (!token) return { kind: 'unreadable' };
  try {
    const response = await transport.request({
      method: 'GET',
      path: `${baseUrl.replace(/\/+$/, '')}/device-market/passports`,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (response.status === 404) return { kind: 'closed' };
    if (response.status !== 200) return { kind: 'unreadable' };
    const list = decodeDevicePassportListV0(response.body);
    return list ? { kind: 'ready', value: list.passports } : { kind: 'unreadable' };
  } catch {
    return { kind: 'unreadable' };
  }
}

export const DEVICE_MARKET_SERVICE_COPY: Readonly<Record<string, Copy>> = {
  'gadget.display.v1': { zh: '显示', en: 'Display' },
  'gadget.notify.v1': { zh: '通知', en: 'Notifications' },
  'gadget.env_sensor.v1': { zh: '环境传感器', en: 'Environment sensor' },
  'hardware.print.v1': { zh: '打印', en: 'Printing' },
};

/** "显示 · 打印（每次先问你）", busy or unavailable ones marked; null when the device offers no market service. */
export function devicePassportServicesText(passport: DevicePassportV0, lang: 'zh' | 'en'): string | null {
  if (passport.marketServices.length === 0) return null;
  return passport.marketServices
    .map((service) => {
      const name = DEVICE_MARKET_SERVICE_COPY[service.type]?.[lang] ?? service.type;
      const ask = service.confirmEachTime ? (lang === 'zh' ? '（每次先问你）' : ' (asks you each time)') : '';
      const state = service.state === 'available' ? '' : lang === 'zh' ? (service.state === 'busy' ? '（忙）' : '（不可用）') : ` (${service.state})`;
      return `${name}${ask}${state}`;
    })
    .join(' · ');
}

export function devicePassportJobsText(passport: DevicePassportV0, lang: 'zh' | 'en'): string {
  const { completed, failed } = passport.jobs;
  return lang === 'zh'
    ? `完成 ${completed} 单 · 失败 ${failed} 单 · 信誉 ${passport.reputation}`
    : `${completed} done · ${failed} failed · reputation ${passport.reputation}`;
}
