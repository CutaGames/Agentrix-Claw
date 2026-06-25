/**
 * Pet Phase 6 S4 — 25 个默认成就。
 * key 不可变（DB 主键）；label/desc 可在常量中演进。
 */
export interface PetAchievementDef {
  key: string;
  labelZh: string;
  labelEn: string;
  descZh: string;
  icon: string; // emoji 兜底，前端可替换
  /** 触发器关键字，service.tryUnlock(userId, trigger, ctx) 用 */
  trigger:
    | 'first_chat'
    | 'first_skin_change'
    | 'first_soul_change'
    | 'intimacy_level' // ctx.level
    | 'consecutive_days' // ctx.days
    | 'memory_count' // ctx.count
    | 'pomodoro_count' // ctx.count
    | 'minigame_score' // ctx.score
    | 'energy_full' // 充能满
    | 'birthday'
    | 'manual';
  threshold?: number;
}

export const PET_ACHIEVEMENTS: PetAchievementDef[] = [
  { key: 'first_meet',       labelZh: '初次相遇',     labelEn: 'First Meeting',    descZh: '与桌宠的第一次对话', icon: '👋', trigger: 'first_chat' },
  { key: 'first_skin',       labelZh: '初次换装',     labelEn: 'First Outfit',     descZh: '第一次换皮肤',       icon: '👗', trigger: 'first_skin_change' },
  { key: 'first_soul',       labelZh: '灵魂选择',     labelEn: 'Soul Chosen',      descZh: '第一次选择灵魂',     icon: '✨', trigger: 'first_soul_change' },
  { key: 'intimacy_lv_1',    labelZh: '熟络',         labelEn: 'Acquainted',       descZh: '亲密度 Lv 1',        icon: '🌱', trigger: 'intimacy_level', threshold: 1 },
  { key: 'intimacy_lv_3',    labelZh: '默契搭档',     labelEn: 'Buddy',            descZh: '亲密度 Lv 3',        icon: '🤝', trigger: 'intimacy_level', threshold: 3 },
  { key: 'intimacy_lv_5',    labelZh: '夜聊伙伴',     labelEn: 'Night Companion',  descZh: '亲密度 Lv 5',        icon: '🌙', trigger: 'intimacy_level', threshold: 5 },
  { key: 'intimacy_lv_8',    labelZh: '生日记得',     labelEn: 'Birthday Remember',descZh: '亲密度 Lv 8',        icon: '🎂', trigger: 'intimacy_level', threshold: 8 },
  { key: 'intimacy_lv_10',   labelZh: '挚友',         labelEn: 'Best Friend',      descZh: '亲密度 Lv 10',       icon: '💖', trigger: 'intimacy_level', threshold: 10 },
  { key: 'days_3',           labelZh: '三日陪伴',     labelEn: '3-Day Streak',     descZh: '连续 3 天互动',      icon: '📅', trigger: 'consecutive_days', threshold: 3 },
  { key: 'days_7',           labelZh: '一周伙伴',     labelEn: '7-Day Streak',     descZh: '连续 7 天互动',      icon: '🗓️', trigger: 'consecutive_days', threshold: 7 },
  { key: 'days_30',          labelZh: '老朋友',       labelEn: '30-Day Friend',    descZh: '连续 30 天互动',     icon: '🏆', trigger: 'consecutive_days', threshold: 30 },
  { key: 'days_100',         labelZh: '百日同行',     labelEn: '100-Day Together', descZh: '连续 100 天互动',    icon: '👑', trigger: 'consecutive_days', threshold: 100 },
  { key: 'memory_10',        labelZh: '回忆收藏家',   labelEn: 'Memory Keeper',    descZh: '相册积累 10 条',     icon: '📸', trigger: 'memory_count', threshold: 10 },
  { key: 'memory_50',        labelZh: '时光博物馆',   labelEn: 'Time Museum',      descZh: '相册积累 50 条',     icon: '🏛️', trigger: 'memory_count', threshold: 50 },
  { key: 'pomodoro_1',       labelZh: '番茄初体验',   labelEn: 'First Pomodoro',   descZh: '完成第 1 个番茄钟',  icon: '🍅', trigger: 'pomodoro_count', threshold: 1 },
  { key: 'pomodoro_10',      labelZh: '专注高手',     labelEn: 'Focus Master',     descZh: '完成 10 个番茄钟',   icon: '🎯', trigger: 'pomodoro_count', threshold: 10 },
  { key: 'pomodoro_50',      labelZh: '工作狂人',     labelEn: 'Workaholic',       descZh: '完成 50 个番茄钟',   icon: '💼', trigger: 'pomodoro_count', threshold: 50 },
  { key: 'minigame_first',   labelZh: '游戏初战',     labelEn: 'First Game',       descZh: '玩第一个迷你游戏',   icon: '🎮', trigger: 'minigame_score', threshold: 1 },
  { key: 'minigame_high',    labelZh: '高分玩家',     labelEn: 'High Scorer',      descZh: '迷你游戏 100+ 分',   icon: '🏅', trigger: 'minigame_score', threshold: 100 },
  { key: 'energy_full',      labelZh: '元气满满',     labelEn: 'Full Energy',      descZh: '能量首次充满',       icon: '⚡', trigger: 'energy_full' },
  { key: 'birthday_pet',     labelZh: '宠物生日',     labelEn: "Pet's Birthday",   descZh: '陪宠物过生日',       icon: '🎉', trigger: 'birthday' },
  { key: 'birthday_user',    labelZh: '主人生日',     labelEn: "Owner's Birthday", descZh: '生日收到祝福',       icon: '🎁', trigger: 'birthday' },
  { key: 'evolution_1',      labelZh: '初次进化',     labelEn: 'First Evolution',  descZh: '解锁进化形态 1',     icon: '🦋', trigger: 'manual' },
  { key: 'evolution_2',      labelZh: '二段进化',     labelEn: 'Second Evolution', descZh: '解锁进化形态 2',     icon: '🐉', trigger: 'manual' },
  { key: 'soul_collector',   labelZh: '灵魂收藏家',   labelEn: 'Soul Collector',   descZh: '体验 5 个灵魂',      icon: '🌌', trigger: 'manual' },
];

export function findAchievementDef(key: string): PetAchievementDef | undefined {
  return PET_ACHIEVEMENTS.find((a) => a.key === key);
}
