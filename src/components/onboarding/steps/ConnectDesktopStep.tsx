/**
 * ConnectDesktopStep — Soul_Birth ④ 「引导连接桌面端」(复用 DesktopBanner 首连引导)。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * task:   4.2(Requirements 7.5, 7.6, 7.7, 8.1,Design §6 / §7.3),依赖 Task 4.1 的 DesktopBanner。
 *
 * 行为(Design §6 与编排器衔接):
 *   - R7.5:进入 `connect_desktop` 即展示 DesktopBanner 首连引导——内嵌
 *     `<DesktopBanner variant="embedded" />`(自动展开,直接呈现介绍 + 首连引导;
 *     若此前已配对过则直接展示跨端状态)。
 *   - R7.6:banner 的「稍后连接」(onLater)→ `onComplete()`(`complete('connect_desktop')`)
 *     并继续推进到 `settle_aeon`。banner 在主界面继续常驻——它已由 Task 4.1 挂在
 *     ProfileScreen 上,此处无需改动;onLater 仅映射为完成本步。
 *   - R7.7 + R8.1:首次配对成功(onPaired)→ **先建立 presence,再完成本步**。
 *     建立 presence:对配对出的实例发一次 `sendHeartbeat({ instanceId, device:'mobile' })`,
 *     即创建该 Claw_Instance 的跨端在线关系(R8.1)。banner 已自行把实例登记进 authStore。
 *   - 弹性(Correctness Property 1 · 主线必达):presence 建立**绝不阻塞完成**——心跳
 *     以 fire-and-forget 发起并吞掉失败,随后立即 `onComplete()`;心跳失败不影响推进
 *     (主界面常驻心跳会后续重试)。
 *
 * 跳过语义区分(镜像 FirstWordsStep):
 *   - 顶部 StepScaffold「跳过」= `onSkip` → 结束整条 Soul_Birth 主线(R1.5)。
 *   - banner 内「稍后连接」= `onLater` → 仅完成本步并推进到 settle_aeon(R7.6)。
 *
 * 复用(不重写):`DesktopBanner`(Task 4.1,QR 配对 + presence 视图)、
 *   `sendHeartbeat`(presence.service,跨端在线上报)、`StepScaffold`(统一外壳 + 全局跳过)。
 */
import React, { useCallback, useRef } from 'react';
import { StepScaffold } from '../StepScaffold';
import type { SoulBirthStepProps } from '../types';
import { DesktopBanner } from '../../desktop/DesktopBanner';
import { sendHeartbeat } from '../../../services/presence.service';
import type { OpenClawInstanceInfo } from '../../../services/openclaw.service';

export function ConnectDesktopStep({ onComplete, onSkip }: SoulBirthStepProps) {
  // 防重入:onPaired / onLater 多路触发只生效一次,避免重复推进。
  const completedRef = useRef(false);

  const advance = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  // R7.6:「稍后连接」→ 仅完成本步(banner 主界面继续常驻,无需在此改动)。
  const handleLater = useCallback(() => {
    advance();
  }, [advance]);

  // R7.7 + R8.1:首次配对成功 → 先建立 presence,再完成本步。
  const handlePaired = useCallback(
    (instance: OpenClawInstanceInfo) => {
      const instanceId = instance?.id ?? null;
      if (instanceId) {
        // 建立跨端在线关系(R8.1):fire-and-forget 一次心跳,吞掉失败。
        // 绝不 hard-await——presence 失败不得阻塞本步完成(Property 1 主线必达)。
        void sendHeartbeat({ instanceId, device: 'mobile' }).catch(() => {
          /* presence 建立失败:主界面常驻心跳会后续重试,此处不阻塞推进。 */
        });
      }
      // R7.7:配对成功即完成 `connect_desktop`。
      advance();
    },
    [advance],
  );

  return (
    <StepScaffold
      title="连接你的电脑"
      subtitle="同一个灵魂跨到桌面端:Computer Use、vibe coding,记忆全程同步。"
      onSkip={onSkip}
    >
      {/* R7.5:内嵌 DesktopBanner 首连引导(embedded:自动展开,直接呈现介绍 + 首连引导;
          已配对过则直接展示跨端状态)。banner 内部复用 createBindSession / pollBindSession
          完成 QR 配对,确认后自行 addInstance 登记实例,再回调 onPaired。 */}
      <DesktopBanner variant="embedded" onPaired={handlePaired} onLater={handleLater} />
    </StepScaffold>
  );
}

export default ConnectDesktopStep;
