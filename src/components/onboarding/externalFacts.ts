/**
 * externalFacts — 拉取 Soul_Birth「外部事实」用于 skip-earlier-if-later-done(R1.2a)。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * design: §2.1(ExternalFacts)/ §2.2(SoulBirthHost 挂载时拉取)/ §6(relay 历史)
 *
 * `SoulBirthHost` 挂载时调用 `fetchExternalFacts()`,把结果喂给
 * `soulBirthStore.recompute()`,从而把「已通过主线之外的行为达成」的较后步骤回填为
 * 完成,使指针自动跳过其之前未完成项(Design Correctness Property 5)。
 *
 * 三条事实的来源(复用现有底座,不新建接口):
 *   - hasInstance         ← `getMyInstances()` 非空(已有可用 Claw_Instance → birth 完成)。
 *   - desktopPairedBefore ← relay 历史:实例带 relayConnected/relayToken,或 local/server
 *                            部署实例经 `getRelayStatus` 确认曾连接(→ connect_desktop 完成)。
 *   - hasClaimedPlot      ← `listMyPlots()` 非空(已圈过地 → settle_aeon 完成)。
 *
 * 主线必达(Design Correctness Property 1):**任一事实拉取失败都默认 false 且绝不阻塞
 * 渲染**。每次外部调用都包在 `safe()` 里吞掉异常并回退到安全默认值。
 */
import {
  getMyInstances,
  getRelayStatus,
  type OpenClawInstanceInfo,
} from '../../services/openclaw.service';
import { listMyPlots } from '../../services/aeon/aeonApi';
import type { ExternalFacts } from '../../stores/soulBirthStore';

/** 包裹一次可能失败的异步取数:失败时静默回退到 `fallback`,绝不抛出。 */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/** 该实例是否携带「曾配对桌面端」的强信号(无需额外网络调用)。 */
function hasRelaySignal(i: OpenClawInstanceInfo): boolean {
  return i.relayConnected === true || !!i.relayToken;
}

/** 该实例是否为桌面端常用的本地/自托管部署形态。 */
function isLocalLike(i: OpenClawInstanceInfo): boolean {
  return i.deployType === 'local' || i.deployType === 'server';
}

/**
 * 判定该用户是否「曾成功配对过桌面端」(R7.3a / R1.2a 共用的单一检测路径)。
 *
 * 复用顺序(Design §6):
 *   1. 实例列表里的强信号:任一实例带 `relayConnected` / `relayToken`(无需额外请求)。
 *   2. 对 local/server 部署实例用 `getRelayStatus` 确认「曾连接」。
 *   3. 兜底:存在本地/自托管实例本身即视为配对过。
 *
 * 由 `DesktopBanner`(首连 vs 已配对分流)与 `fetchExternalFacts`(skip-earlier-if-later-done)
 * 共用,避免在两处重复实现同一判定。任一网络调用失败静默回退,**绝不抛出**(主线必达
 * Property 1)。可传入已取的实例列表以复用、避免重复 `getMyInstances`。
 */
export async function detectDesktopPairedBefore(
  instances?: OpenClawInstanceInfo[],
): Promise<boolean> {
  const list =
    instances ?? (await safe<OpenClawInstanceInfo[]>(() => getMyInstances(), []));

  // 1. 列表强信号(零额外请求)。
  if (list.some(hasRelaySignal)) return true;

  // 2. local/server 实例 relay-status 曾连接。
  const localish = list.filter(isLocalLike);
  for (const inst of localish) {
    const status = await safe(() => getRelayStatus(inst.id), {
      connected: false,
      instanceId: inst.id,
    });
    if (status.connected) return true;
  }

  // 3. 兜底:存在本地/自托管实例即视为配对过(Design §6)。
  return localish.length > 0;
}

/**
 * 拉取 Soul_Birth 外部事实。任一来源失败 → 对应事实回退 false,不阻塞主线。
 */
export async function fetchExternalFacts(): Promise<ExternalFacts> {
  // 一次取实例列表,供 hasInstance 与 desktopPairedBefore 共用,避免重复请求。
  const instances = await safe<OpenClawInstanceInfo[]>(() => getMyInstances(), []);
  const hasInstance = instances.length > 0;

  // desktopPairedBefore:复用 detectDesktopPairedBefore(同一检测路径,Design §6)。
  const desktopPairedBefore = await detectDesktopPairedBefore(instances);

  // hasClaimedPlot:我的地块非空即视为已圈地。
  const myPlots = await safe(() => listMyPlots(), []);
  const hasClaimedPlot = myPlots.length > 0;

  return { hasInstance, desktopPairedBefore, hasClaimedPlot };
}
