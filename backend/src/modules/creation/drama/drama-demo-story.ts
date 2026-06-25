import type { DramaStory } from '../../../../shared/types/drama';

/**
 * 内置 demo 互动剧《心动信号》——3 集、分支、多结局,作为:
 *   1) 生成失败时的兜底(保证"生成"一步永远闭环可玩);
 *   2) 种子脚本写入的 demo 内容。
 *
 * 设计:手机竖屏微短剧,强情绪、快反转;bg 用 emoji/渐变关键字(无真人视频/图床);
 * 第 1 集免费,2/3 集分别 50/100 AXP 解锁。每条路径都抵达 ending。
 */
export function buildDemoDramaStory(title = '心动信号'): DramaStory {
  return {
    title,
    synopsis: '一条匿名短信,打乱了林夏的深夜。是恶作剧,还是有人在暗中守护?',
    startSceneId: 's1',
    episodes: [
      { episode: 1, title: '第 1 集 · 匿名短信', unlockCostAxp: 0 },
      { episode: 2, title: '第 2 集 · 雨夜追踪', unlockCostAxp: 50 },
      { episode: 3, title: '第 3 集 · 真相揭晓', unlockCostAxp: 100 },
    ],
    scenes: [
      // ── 第 1 集(免费) ──
      { id: 's1', episode: 1, bg: 'night', speaker: '旁白', text: '深夜十一点,林夏的手机突然亮起。', next: 's2' },
      { id: 's2', episode: 1, bg: 'night', speaker: '未知号码', text: '“别回家。今晚有人在等你。”', next: 's3' },
      {
        id: 's3', episode: 1, bg: 'night', speaker: '林夏', text: '谁?恶作剧吗……我该怎么办?',
        choices: [
          { id: 'c1', label: '回拨过去问清楚', next: 's4a' },
          { id: 'c2', label: '装作没看见,直接回家', next: 's4b' },
        ],
      },
      { id: 's4a', episode: 1, bg: 'night', speaker: '旁白', text: '电话刚接通,对面只有沉重的呼吸声,然后挂断。', next: 's5' },
      { id: 's4b', episode: 1, bg: 'rain', speaker: '旁白', text: '楼道的灯坏了。黑暗里,似乎有个身影一直跟着你。', next: 's5' },
      { id: 's5', episode: 1, bg: 'rain', speaker: '神秘人', text: '“我说过,别回家。”一个低沉的声音在身后响起。', next: 's6' },
      { id: 's6', episode: 1, bg: 'rain', speaker: '旁白', text: '林夏猛地回头——而真相,藏在下一集。', next: 'gate2' },
      // 集间闸口:提示解锁第 2 集(前端在进入 episode>已解锁 时拦截并弹解锁)。
      { id: 'gate2', episode: 1, bg: 'sunset', speaker: '旁白', text: '【第 1 集完】解锁第 2 集,继续这场雨夜追踪。', next: 's7' },

      // ── 第 2 集(50 AXP) ──
      { id: 's7', episode: 2, bg: 'rain', speaker: '陆沉', text: '“跟我走,他们马上就到。”他递来一把伞。', next: 's8' },
      {
        id: 's8', episode: 2, bg: 'rain', speaker: '林夏', text: '我凭什么相信一个陌生人?',
        choices: [
          { id: 'c3', label: '相信他,跟着走', next: 's9a' },
          { id: 'c4', label: '挣脱,跑向人多的便利店', next: 's9b' },
        ],
      },
      { id: 's9a', episode: 2, bg: 'office', speaker: '陆沉', text: '“你父亲三年前的案子,并没有结束。”', next: 's10' },
      { id: 's9b', episode: 2, bg: 'cafe', speaker: '旁白', text: '便利店的暖光下,你发现玻璃倒影里——他就站在门口,笑着。', next: 's10' },
      { id: 's10', episode: 2, bg: 'office', speaker: '陆沉', text: '“发短信的人,不是我。是想保护你的另一个人。”', next: 'gate3' },
      { id: 'gate3', episode: 2, bg: 'sunset', speaker: '旁白', text: '【第 2 集完】最后的真相,只差一步。', next: 's11' },

      // ── 第 3 集(100 AXP) ──
      { id: 's11', episode: 3, bg: 'night', speaker: '旁白', text: '档案袋摊开。那条短信的发送人,竟是三年前“失踪”的母亲。', next: 's12' },
      {
        id: 's12', episode: 3, bg: 'night', speaker: '林夏', text: '妈妈一直都在保护我……我该公开真相,还是保护她?',
        choices: [
          { id: 'c5', label: '公开真相,哪怕危险', next: 's13a' },
          { id: 'c6', label: '隐藏真相,守住母亲', next: 's13b' },
        ],
      },
      { id: 's13a', episode: 3, bg: 'sunset', speaker: '旁白', text: '真相震动全城。母亲归来那天,雨过天晴。【结局 A · 光明】', ending: true },
      { id: 's13b', episode: 3, bg: 'night', speaker: '旁白', text: '你烧掉了档案。有些守护,注定无声。【结局 B · 静默】', ending: true },
    ],
  };
}
