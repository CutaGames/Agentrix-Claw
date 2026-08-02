/**
 * SoulBirthHost — Soul_Birth 首跑引导的挂载/编排层(覆盖层)。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * design: §2.2(SoulBirthHost 渲染决策)
 *
 * 挂载位置:`RootNavigator` 已登录(Main)分支之上,作为覆盖层渲染,**不替换路由树**
 * (与 CompanionLayer 同为 NavigationContainer 内、导航器旁的兄弟覆盖层)。
 *
 * 渲染决策(Design §2.2):
 *   if (!isAuthenticated || isGuest) return null   // C3 登录前置:游客/未登录不渲染
 *   if (terminated) return null                    // C9 完成/跳过后不再自动触发
 *   step = currentStep(completed)
 *   if (step == null) { markTerminated(); return null }   // 全部完成 → 终止(R1.6)
 *   switch(step): birth/first_words/connect_desktop/settle_aeon
 *
 * 挂载时拉取 ExternalFacts(getMyInstances / relay 历史 / listMyPlots)并 `recompute`,
 * 实现 skip-earlier-if-later-done(R1.2a / Design Correctness Property 5)。事实拉取失败
 * 默认 false 且不阻塞渲染(主线必达 / Design Correctness Property 1)。
 *
 * 各 Step 通过统一回调推进:onComplete → complete(step)(R1.3);onSkip → skip()(R1.5)。
 * 真实 Step 实现见后续任务(3.3–3.6 / 4.2),本层结构稳定,可无缝替换占位组件。
 *
 * 暂挂/恢复(修复 task 3.3 已知缺陷):BirthStep 的「拍一张 / 去市场选」会把用户导航到
 * 另一个全屏路由(WorldEngineScanner / PetsSkins)。本覆盖层的 Step 外壳为不透明全屏,
 * 若不处理会**遮挡目标屏**,用户既看不到也用不了。修复:Step 离开前调 `suspend()`,host
 * 据 `suspended` 临时返回 null(让出全屏);用户返回(导航状态变化)或 App 回前台时,host
 * 检测到已离开「外出」屏即调 `resume()`,覆盖层在**同一步**原样恢复。`suspended` 为瞬态、
 * 不持久化(见 store),且恢复判定"仅在外出屏隐藏",从设计上不会卡死隐藏(主线必达)。
 */
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, AppState } from 'react-native';
import { useAuthStore } from '../../stores/authStore';
import {
  useSoulBirthStore,
  currentStep as resolveCurrentStep,
  type OnboardingStep,
} from '../../stores/soulBirthStore';
import { addRouteChangeListener, getCurrentRouteName } from '../../navigation/navigationRef';
import { fetchExternalFacts } from './externalFacts';
import type { SoulBirthStepProps } from './types';
import { BirthStep } from './steps/BirthStep';
import { FirstWordsStep } from './steps/FirstWordsStep';
import { ConnectDesktopStep } from './steps/ConnectDesktopStep';
import { SettleAeonStep } from './steps/SettleAeonStep';

/**
 * 「外出」路由集合 —— Step 可能把用户带离覆盖层去到的全屏目标(task 3.3 已知缺陷点):
 *   - WorldEngineScanner:BirthStep「拍一张」拍照生成形象。
 *   - PetsSkins:BirthStep「去市场选」皮肤拍卖市场。
 * 当且仅当当前路由停留在这些屏时,挂起的覆盖层保持隐藏;一旦离开(返回任何其它路由,
 * 含 null/容器未就绪)即恢复。如此「仅在外出屏隐藏」的判定从根本上杜绝「永久卡死隐藏」:
 * 这些屏都是临时屏,用户终将离开,离开即恢复(返回 / 回前台双触发,见下)。
 */
const AWAY_ROUTES = new Set<string>(['WorldEngineScanner', 'PetsSkins']);

/**
 * step → Step 组件 的注册表。后续任务只需替换对应文件的实现(导出名/契约不变),
 * 无需改动本 host(Design §2.2「可无缝 drop-in」)。
 */
const STEP_REGISTRY: Record<OnboardingStep, React.ComponentType<SoulBirthStepProps>> = {
  birth: BirthStep,
  first_words: FirstWordsStep,
  connect_desktop: ConnectDesktopStep,
  settle_aeon: SettleAeonStep,
};

export function SoulBirthHost() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isGuest = useAuthStore((s) => s.isGuest);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  const completed = useSoulBirthStore((s) => s.completed);
  const terminated = useSoulBirthStore((s) => s.terminated);
  const replaying = useSoulBirthStore((s) => s.replaying);
  const suspended = useSoulBirthStore((s) => s.suspended);
  const complete = useSoulBirthStore((s) => s.complete);
  const skip = useSoulBirthStore((s) => s.skip);
  const resume = useSoulBirthStore((s) => s.resume);
  const markTerminated = useSoulBirthStore((s) => s.markTerminated);
  const recompute = useSoulBirthStore((s) => s.recompute);
  const bindUser = useSoulBirthStore((s) => s.bindUser);

  // 把持久化的 Soul_Birth 进度绑定到当前登录用户(2026-06 真机 Bug 修复)。
  // MMKV 进度是按安装持久化的:若本机上一账号曾 terminated,新登录用户会被错误抑制。
  // 这里在登录用户变化时调用 bindUser:换了账号 → 为新用户开启全新引导(R1.1);
  // 同一用户 → 保留其 terminated/completed(R1.6/C9)。必须在 active/step 计算「之前」
  // 生效,因此放在最靠前的 effect(状态变更会触发重渲染,下一帧即按新进度门控)。
  useEffect(() => {
    if (isAuthenticated && !isGuest && userId) {
      bindUser(userId);
    }
  }, [isAuthenticated, isGuest, userId, bindUser]);

  // 仅对「已登录、非游客、未终止」的用户激活引导(C3 / C9)。
  const active = isAuthenticated && !isGuest && !terminated;
  // 当前应引导的步骤:第一个未完成;全部完成返回 null(Design Correctness Property 4)。
  const step = active ? resolveCurrentStep(completed) : null;

  // 挂载激活时拉取外部事实并回填一次(skip-earlier-if-later-done,R1.2a)。
  // 失败默认 false 且不阻塞(主线必达 Property 1)。仅在本会话内回填一次。
  // 「重看引导」重放期间(replaying)跳过回填:用户仍持有实例,回填会跳过 birth,
  // 违反 R1.7「从 birth 重新开始」(store.recompute 亦有同样防护,此处顺带省去无谓取数)。
  const didRecompute = useRef(false);
  useEffect(() => {
    if (!active || replaying || didRecompute.current) return;
    didRecompute.current = true;
    let cancelled = false;
    fetchExternalFacts()
      .then((facts) => {
        if (!cancelled) recompute(facts);
      })
      .catch(() => {
        /* 事实拉取整体失败也不阻塞:保持各步骤现状,主线照常推进。 */
      });
    return () => {
      cancelled = true;
    };
  }, [active, replaying, recompute]);

  // 全部步骤完成 → 终止,不再自动挂载(R1.6 / C9)。在 effect 中触发,避免渲染期副作用。
  useEffect(() => {
    if (active && step == null) {
      markTerminated();
    }
  }, [active, step, markTerminated]);

  // 暂挂恢复(修复 task 3.3):仅在挂起期间订阅。用户从「外出」屏(相机/市场)返回时,
  // 导航状态变化 → 检测当前路由已不在 AWAY_ROUTES → resume(),覆盖层在同一步恢复。
  // 双触发兜底(导航返回 + App 回前台)+「仅外出屏隐藏」判定,确保绝不卡死隐藏。
  useEffect(() => {
    if (!suspended) return;

    const maybeResume = () => {
      const route = getCurrentRouteName();
      // 不在外出屏(含 null / 容器未就绪)→ 用户已返回 → 恢复覆盖层。
      if (route == null || !AWAY_ROUTES.has(route)) {
        resume();
      }
    };

    // 1) 导航状态变化:用户 pop 回上层或切到其它屏时触发。
    const unsubNav = addRouteChangeListener(maybeResume);
    // 2) App 回前台兜底:即使错过任何导航事件,回前台也会重新校验,杜绝卡死隐藏。
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') maybeResume();
    });

    return () => {
      unsubNav();
      appSub.remove();
    };
  }, [suspended, resume]);

  // 挂起期间临时让出全屏(返回 null),使目标屏(相机/市场)不被不透明覆盖层遮挡(task 3.3)。
  if (!active || step == null || suspended) return null;

  const StepComponent = STEP_REGISTRY[step];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* key={step} 保证切换步骤时彻底重挂载 Step,避免上一步内部状态串味。 */}
      <StepComponent
        key={step}
        onComplete={() => complete(step)}
        onSkip={skip}
      />
    </View>
  );
}

export default SoulBirthHost;
