/**
 * companionContext — Companion_QA 上下文构造器(R9.3,Design §8)。
 *
 * spec:  .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * task:  5.1 移动端 Companion_QA 上下文 + 流式
 *
 * 收敛任务(不新建对话引擎):为每次提问附带「当前终端 + 当前场景 + 当前任务态」,
 * 使回答具备上下文感知(R9.3)。本模块只负责**采集并打包**这些上下文;实际流式发送
 * 仍走既有 `streamProxyChatSSE` / `streamDirectClaude`(realtime.service)。
 *
 * payload 形态(Design §8):`{ device, scene/route, 当前任务态 }`。这里把它放进 chat
 * 请求的可选 `context` 字段(后端 `ChatMessageDto` / `UnifiedChatRequestDto` 已支持
 * 可选 `context?: Record<string, any>`,两条 chat 路径 `/openclaw/proxy/:id/stream` 与
 * `/claude/chat` 共用同一 `RuntimeSeamService`,因此该字段被安全接收并透传)。
 *
 * 设计为非 React 可调用(读 store 用 getState、读路由用共享 navigationRef),
 * 因为浮球 / 会话气泡挂在导航器之外,拿不到 hook 上下文。
 */
import { getCurrentRouteName } from '../navigation/navigationRef';
import { useSoulBirthStore, currentStep } from '../stores/soulBirthStore';

/** 终端类型(本端固定 mobile)。 */
export type CompanionDevice = 'mobile' | 'desktop' | 'wearable';

/** 引导任务态快照(供回答感知用户处于诞生引导的哪一步)。 */
export interface CompanionTaskState {
  /** 是否处于首跑引导主线中(未终止即视为在引导)。 */
  onboardingActive: boolean;
  /** 当前应引导的步骤(第一个未完成);全部完成或已终止为 null。 */
  onboardingStep: string | null;
  /** 首跑引导是否已终止(完成或跳过)。 */
  onboardingTerminated: boolean;
}

/** Companion_QA 随提问携带的上下文(R9.3)。 */
export interface CompanionChatContext {
  /** 提问所在终端。 */
  device: CompanionDevice;
  /** 当前场景 / 路由名(如 WorldHub / Plaza / AgentChat)。 */
  scene: string | null;
  /** 与 scene 等价的路由标识(预留嵌套路由扩展)。 */
  route: string | null;
  /** 当前任务态(引导步骤等)。 */
  taskState: CompanionTaskState;
}

/**
 * 采集当前 Companion_QA 上下文。永不抛错:任何子项采集失败都降级为 null/默认值,
 * 绝不阻断提问主线(与 Error Handling「外部依赖失败不卡主线」一致)。
 */
export function buildCompanionChatContext(
  device: CompanionDevice = 'mobile',
): CompanionChatContext {
  let scene: string | null = null;
  try {
    scene = getCurrentRouteName();
  } catch {
    scene = null;
  }

  let taskState: CompanionTaskState = {
    onboardingActive: false,
    onboardingStep: null,
    onboardingTerminated: false,
  };
  try {
    const s = useSoulBirthStore.getState();
    const step = currentStep(s.completed);
    taskState = {
      onboardingActive: !s.terminated && step !== null,
      onboardingStep: step,
      onboardingTerminated: s.terminated,
    };
  } catch {
    /* store 未就绪/桩环境:保留默认值 */
  }

  return { device, scene, route: scene, taskState };
}

/**
 * 把 Companion_QA 上下文合并进 chat 请求的 `context` 字段,保留调用方已有的
 * `context`(如 `sessionId` / `enableComputerUse` / `maxTokens`),companion 上下文
 * 仅做附加,不覆盖已存在的同名键以外的语义。
 */
export function withCompanionContext(
  existing: Record<string, any> | undefined,
  device: CompanionDevice = 'mobile',
): Record<string, any> {
  const companion = buildCompanionChatContext(device);
  return {
    ...(existing ?? {}),
    device: companion.device,
    scene: companion.scene,
    route: companion.route,
    taskState: companion.taskState,
  };
}
