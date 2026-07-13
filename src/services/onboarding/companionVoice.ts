/**
 * companionVoice — Companion_QA 语音播报封装(R9.8,Design §8)。
 *
 * spec:  .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * task:  5.1 移动端 Companion_QA 上下文 + 流式(TTS 播报复用 ttsSpeaker 限频)
 *
 * Companion_QA 朗读助手回复时**复用** §3.4 的 `getOnboardingTtsSpeaker()` 单例,
 * 从而与 first_words / first_task 共享同一会话级:
 *   - 模板音频缓存(同句二次播报不重复合成,R3.8)
 *   - 同会话合成限频闸(连续多次触发播报时限频以控成本,R9.8 / C6)
 *   - 失败/超时降级文字(永不抛错、不卡 UI)
 *
 * 不新建 TTS 引擎、不改 useVoiceSession;仅把 Companion 面板里「朗读这条回复」这一
 * 显式语音入口接到既有的限频播报器上。
 */
import { getOnboardingTtsSpeaker, type SpeakOutcome } from './ttsSpeaker';

export interface SpeakCompanionReplyOptions {
  /** 语言(默认 'zh')。 */
  lang?: string;
  /** 指定音色(可空,后端按语言自动选)。 */
  voice?: string;
  /** 合成/播放失败或被限频时的降级回调(以文字呈现原文)。 */
  onDegrade?: (text: string) => void;
}

/**
 * 朗读一条 Companion 助手回复。永不抛错;返回本次结果
 * (played / cached / throttled / degraded)。重复或高频调用会被
 * ttsSpeaker 的同会话限频闸丢弃并降级(R9.8)。
 */
export async function speakCompanionReply(
  text: string,
  opts: SpeakCompanionReplyOptions = {},
): Promise<SpeakOutcome> {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return 'degraded';
  try {
    return await getOnboardingTtsSpeaker().speak(trimmed, {
      lang: opts.lang ?? 'zh',
      voice: opts.voice,
      onDegrade: opts.onDegrade,
    });
  } catch {
    // ttsSpeaker.speak 本身已吞错,这里只是双保险:绝不向调用方抛错。
    opts.onDegrade?.(trimmed);
    return 'degraded';
  }
}

/** 停止并清空 Companion 语音播放队列(关闭面板 / 用户中断时调用)。 */
export function stopCompanionVoice(): void {
  try {
    getOnboardingTtsSpeaker().stop();
  } catch {
    /* ignore */
  }
}
