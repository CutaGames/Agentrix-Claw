/**
 * Global pet layer under the four-zone IA (product doc 5.1 / 5.5, M1 exit
 * condition "全局宠物层受开关控制").
 *
 * 5.1: the floating ball, proactive bubble and voice greeting ignored the IA
 * switch, so old pet behaviour kept popping up in the new IA. 5.5: the ball
 * is off by default; emotion only expresses state. With the four-zone IA on,
 * these global surfaces stay off; the legacy and agent-first IAs keep their
 * current behaviour (rollback path).
 */
export interface GlobalLayerPolicy {
  /** CompanionLayer: floating ball, pet detail sheet, capsules. */
  companionBall: boolean;
  /** MobilePetProactiveBanner: pet greetings / suggestions bubble. */
  proactiveBanner: boolean;
  /** voiceGreetScheduler: morning / evening / comeback voice greetings. */
  voiceGreeting: boolean;
  /** companionHealth watcher: steps / sitting / late-night nudges. */
  healthNudges: boolean;
}

export function globalLayerPolicy(fourZoneIa: boolean): GlobalLayerPolicy {
  if (fourZoneIa) {
    return { companionBall: false, proactiveBanner: false, voiceGreeting: false, healthNudges: false };
  }
  return { companionBall: true, proactiveBanner: true, voiceGreeting: true, healthNudges: true };
}
