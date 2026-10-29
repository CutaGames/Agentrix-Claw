/**
 * L7-4 v0 device passports on desktop, read only (`DEVICE_MARKET_ROUTES_V0.passports`, shared decoder
 * `decodeDevicePassportListV0`). Off unless the build sets VITE_DEVICE_MARKET_ENABLED=1; while the server switches are
 * off the route answers 404 and the panel shows nothing.
 */
import { decodeDevicePassportListV0, type DevicePassportV0 } from "../../../shared/types/device-market";
import { pickFor } from "../i18n/pick";

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

/** [zh, en] per service type. */
const SERVICE_TEXT: Readonly<Record<string, readonly [string, string]>> = {
  "gadget.display.v1": ["显示", "Display"],
  "gadget.notify.v1": ["通知", "Notifications"],
  "gadget.env_sensor.v1": ["环境传感器", "Environment sensor"],
  "hardware.print.v1": ["打印", "Printing"],
};

/** One language, the app's (`locale`; Chinese when none is given). */
export function devicePassportServicesText(passport: DevicePassportV0, locale: string = "zh"): string {
  const pick = pickFor(locale);
  if (passport.marketServices.length === 0) return pick("没有可接单的服务", "No market service declared");
  return passport.marketServices
    .map((s) => {
      const name = SERVICE_TEXT[s.type];
      return `${name ? pick(name[0], name[1]) : s.type}${s.confirmEachTime ? pick("（每次先问你）", " (asks you each time)") : ""}${s.state === "available" ? "" : ` (${s.state})`}`;
    })
    .join(", ");
}

export function devicePassportJobsText(passport: DevicePassportV0, locale: string = "zh"): string {
  const pick = pickFor(locale);
  return pick(
    `完成 ${passport.jobs.completed} 单，失败 ${passport.jobs.failed} 单，信誉 ${passport.reputation}`,
    `${passport.jobs.completed} done · ${passport.jobs.failed} failed · reputation ${passport.reputation}`,
  );
}
