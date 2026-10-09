/**
 * L7-4 v0 device passports on desktop, read only (`DEVICE_MARKET_ROUTES_V0.passports`, shared decoder
 * `decodeDevicePassportListV0`). Off unless the build sets VITE_DEVICE_MARKET_ENABLED=1; while the server switches are
 * off the route answers 404 and the panel shows nothing.
 */
import { decodeDevicePassportListV0, type DevicePassportV0 } from "../../../shared/types/device-market";

export function devicePassportsEnabled(env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>): boolean {
  return env.VITE_DEVICE_MARKET_ENABLED === "1";
}

export type DevicePassportsRead = { kind: "ready"; passports: DevicePassportV0[] } | { kind: "closed" } | { kind: "no_session" } | { kind: "unreadable" };

export async function readDevicePassports(deps: {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  apiBase: string;
  token: () => string | null | undefined;
}): Promise<DevicePassportsRead> {
  const token = deps.token();
  if (!token) return { kind: "no_session" };
  try {
    const response = await deps.fetch(`${deps.apiBase.replace(/\/+$/, "")}/device-market/passports`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    if (response.status === 404) return { kind: "closed" };
    if (response.status !== 200) return { kind: "unreadable" };
    const list = decodeDevicePassportListV0(await response.json().catch(() => null));
    return list ? { kind: "ready", passports: list.passports } : { kind: "unreadable" };
  } catch {
    return { kind: "unreadable" };
  }
}

const SERVICE_TEXT: Readonly<Record<string, string>> = {
  "gadget.display.v1": "Display · 显示",
  "gadget.notify.v1": "Notifications · 通知",
  "gadget.env_sensor.v1": "Environment sensor · 环境传感器",
  "hardware.print.v1": "Printing · 打印",
};

export function devicePassportServicesText(passport: DevicePassportV0): string {
  if (passport.marketServices.length === 0) return "No market service declared · 没有可接单的服务";
  return passport.marketServices
    .map((s) => `${SERVICE_TEXT[s.type] ?? s.type}${s.confirmEachTime ? " (asks you each time · 每次先问你)" : ""}${s.state === "available" ? "" : ` (${s.state})`}`)
    .join(", ");
}

export function devicePassportJobsText(passport: DevicePassportV0): string {
  return `${passport.jobs.completed} done · ${passport.jobs.failed} failed · reputation ${passport.reputation} · 完成 ${passport.jobs.completed} 单，失败 ${passport.jobs.failed} 单，信誉 ${passport.reputation}`;
}
