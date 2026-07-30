/**
 * 互动剧(Interactive Short Drama)— 跨端单一契约。
 *
 * 定位(见 docs 短剧市场评估):不做真人视频短剧(资本陷阱),而做
 * **AI 生成的分支叙事互动剧**(图文 + 选择 + 多结局),复用创作流 / WebView /
 * AXP 经济。一个互动剧 = 一个 `type='game'` 的 Creation,其可玩包 `engine='drama-vn'`,
 * `html` 列存放本 `DramaStory` 的 JSON(免新表)。
 *
 * 闭环:生成(LLM→JSON / 模板兜底)→ 播放(场景流)→ 选择(分支)→
 * AXP 解锁(后续集,服务端权威扣费 + entitlement 持久化)→ 打赏(复用 tip)。
 *
 * 命名 camelCase(后端 TypeORM 全局 SnakeNamingStrategy 仅作用于列,本 JSON 不入列)。
 */

/** 一个选择分支:点击后跳到 `next` 指向的场景。 */
export interface DramaChoice {
  /** 选项 id(场景内唯一)。 */
  id: string;
  /** 按钮文案(人读)。 */
  label: string;
  /** 选择后跳转到的场景 id。 */
  next: string;
}

/**
 * 一个剧情场景(一屏):背景 + 说话人 + 正文 +(选择 或 线性 next 或 结局)。
 * 视觉走轻量(emoji/渐变 key 或 AI 图 URL),手机竖屏优先,杜绝真人视频(成本陷阱)。
 */
export interface DramaScene {
  /** 场景 id(故事内唯一)。 */
  id: string;
  /** 所属集号(1 起;决定是否需要解锁)。 */
  episode: number;
  /** 背景:emoji 或 '渐变key' 或 https 图片 URL(可空)。 */
  bg?: string;
  /** 说话人名字(可空,旁白时不填)。 */
  speaker?: string;
  /** 正文台词/旁白。 */
  text: string;
  /** 选择分支(>=2 时为分叉点;缺省则看 next/ending)。 */
  choices?: DramaChoice[];
  /** 线性推进:无 choices 时跳到的下一场景(可空)。 */
  next?: string;
  /** 是否结局场景(到此本条线结束)。 */
  ending?: boolean;
}

/** 一集的元信息(标题 + 解锁价)。第 1 集 unlockCostAxp 必须为 0(免费试看)。 */
export interface DramaEpisode {
  /** 集号(1 起,连续)。 */
  episode: number;
  /** 集标题。 */
  title: string;
  /** 解锁该集所需 AXP(第 1 集为 0;服务端权威以此扣费)。 */
  unlockCostAxp: number;
}

/** 一部互动剧的完整故事(存于 bundle.html 的 JSON)。 */
export interface DramaStory {
  /** 剧名。 */
  title: string;
  /** 一句话简介(可空)。 */
  synopsis?: string;
  /** 起始场景 id。 */
  startSceneId: string;
  /** 分集元信息(含解锁价)。 */
  episodes: DramaEpisode[];
  /** 全部场景(扁平;用 id 互相跳转)。 */
  scenes: DramaScene[];
}

/** 当前用户对某互动剧的解锁状态。 */
export interface DramaState {
  /** 已解锁的集号(第 1 集恒含)。 */
  unlockedEpisodes: number[];
}

/** 解锁某集的响应(服务端权威)。 */
export interface UnlockEpisodeResponse {
  ok: boolean;
  /** 本次解锁的集号。 */
  episode: number;
  /** 解锁后全部已解锁集号。 */
  unlockedEpisodes: number[];
  /** 本次实际扣除的 AXP(已解锁/免费集为 0)。 */
  chargedAxp: number;
}
