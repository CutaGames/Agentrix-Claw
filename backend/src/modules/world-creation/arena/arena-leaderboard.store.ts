/**
 * ArenaLeaderboardStore — `state.kv:ranks` 排行榜抽象 (design §11.1, R16.4)。
 *
 * 竞技场对局结束时把名次条目 **append** 进沙箱的 `state.kv` (scope=plot, key="ranks")。
 * 运行期排行存于 state.kv，平台据此聚合落 `plot_leaderboards` (赛季制)。本接口把
 * "向 state.kv:ranks 追加名次" 抽象为一个**可注入的 KV store**，使 {@link BattleArenaService}
 * 既能在生产经真实 state.kv/Redis 落库，也能在单元测试用内存实现直接驱动 —— 排行榜更新
 * 不在沙箱内计算，由 host/服务端权威地写入。
 *
 * 默认提供 {@link InMemoryArenaLeaderboardStore}（按 plotId 维护有序榜单），生产可替换为
 * 接 state.kv/Redis 的实现并绑定到 {@link ARENA_LEADERBOARD_STORE} 令牌。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §11.1 Battle Arena 进度与留存钩子
 */

/** DI 令牌：注入一个 {@link ArenaLeaderboardStore} 实现。 */
export const ARENA_LEADERBOARD_STORE = Symbol('ARENA_LEADERBOARD_STORE');

/**
 * 一条排行榜名次条目，append 进 `state.kv:ranks`。纯展示/统计数据，
 * 不含任何所有权凭证；金额/XP 均来自服务端权威计算结果。
 */
export interface LeaderboardRankEntry {
  /** 出战者 id（World_Asset 角色 id 或 Boss id）。 */
  fighterId: string;
  /** 本局结果。 */
  result: 'win' | 'loss';
  /** 由服务端 Battle_Engine 授予的 XP（非沙箱计算）。 */
  xpAwarded: number;
  /** 对手 id。 */
  opponentId: string;
  /** 确定性对局 seed（可重放，R16.3）。 */
  seed: number;
  /** 名次条目产生时间（Unix epoch millis）。 */
  ts: number;
}

/**
 * `state.kv:ranks` 排行榜存储抽象。实现负责把名次条目持久化/读取。
 * 实现可以是同步或异步（返回值统一以 await 兼容）。
 */
export interface ArenaLeaderboardStore {
  /** 向某 Plot 的 `state.kv:ranks` 追加一批名次条目。 */
  appendRanks(
    plotId: string,
    entries: LeaderboardRankEntry[],
  ): Promise<void> | void;

  /** 读取某 Plot 当前 `state.kv:ranks` 榜单（按追加顺序）。 */
  getRanks(plotId: string): Promise<LeaderboardRankEntry[]> | LeaderboardRankEntry[];
}

/**
 * 内存实现：按 plotId 维护一个追加序的名次列表。用于开发/测试与无外部依赖运行；
 * 生产应替换为接 state.kv/Redis 的实现（同样绑定到 {@link ARENA_LEADERBOARD_STORE}）。
 */
export class InMemoryArenaLeaderboardStore implements ArenaLeaderboardStore {
  private readonly ranksByPlot = new Map<string, LeaderboardRankEntry[]>();

  appendRanks(plotId: string, entries: LeaderboardRankEntry[]): void {
    if (!entries || entries.length === 0) return;
    const existing = this.ranksByPlot.get(plotId) ?? [];
    existing.push(...entries);
    this.ranksByPlot.set(plotId, existing);
  }

  getRanks(plotId: string): LeaderboardRankEntry[] {
    return [...(this.ranksByPlot.get(plotId) ?? [])];
  }
}
