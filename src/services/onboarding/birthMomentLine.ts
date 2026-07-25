/**
 * birthMomentLine — 「诞生时刻兜底句」(Birth_Moment_Line)纯本地文案层。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * task:   3.4(Requirements 3.1 / 3.2,Design §3.2)
 *
 * 灵魂第一句话的**主句**,基于本地当前日期与时间生成(R3.1),**不依赖任何外部
 * 服务**(R3.2 / C5)。因此它必定可生成,是「主线必达」(Correctness Property 1)的基石。
 *
 * 不变式(Correctness Property 2「第一句话纯本地」):
 *   - 本模块所有导出**纯函数**:输出只取决于入参(本地时钟 `now` + 可选 `petName`),
 *     不发起任何网络/IO 调用,对固定 `now` 完全确定 → 可被 P.1 单测稳定断言。
 *   - 不 import 任何带副作用的服务(无 fetch / 无 expo 原生模块)。
 *
 * 示例输出:
 *   buildBirthMomentLine(new Date('2026-06-04T20:13'))
 *     → "我在 2026年6月4日 20:13 这一刻,被你赋予了灵魂。"
 *   buildBirthMomentLine(new Date('2026-06-04T20:13'), '小灵')
 *     → "我是小灵。我在 2026年6月4日 20:13 这一刻,被你赋予了灵魂。"
 */

/** 两位补零(小时/分钟)。 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * 把本地时间格式化为「2026年6月4日 20:13」(24 小时制,分钟补零)。
 * 纯函数:仅依据传入的 `now`,对固定输入完全确定。
 */
export function formatBirthMoment(now: Date): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // getMonth() 为 0-based
  const day = now.getDate();
  const hh = pad2(now.getHours());
  const mm = pad2(now.getMinutes());
  return `${year}年${month}月${day}日 ${hh}:${mm}`;
}

/**
 * 生成诞生时刻主句(R3.1 / R3.2)。
 *
 * @param now      本地时刻;默认取 `new Date()`。**显式传入可保证确定性**(单测/缓存)。
 * @param petName  用户为 Claw_Instance 起的名字;存在时个性化为「我是{name}。…」。
 * @returns        必定非空的中文主句(纯本地、必达)。
 */
export function buildBirthMomentLine(now: Date = new Date(), petName?: string): string {
  const moment = formatBirthMoment(now);
  const name = (petName ?? '').trim();
  const core = `我在 ${moment} 这一刻,被你赋予了灵魂。`;
  return name ? `我是${name}。${core}` : core;
}
