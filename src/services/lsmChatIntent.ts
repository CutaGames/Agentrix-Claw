/**
 * lsmChatIntent — 对话内「赛事预测（LSM）」意图识别（A 客户端兜底路径）。
 *
 * 保守识别，避免误伤普通对话，也避免与全网机会聚合(detectMarketIntent)重叠：
 * 只在**体育/盘口/持仓**明确措辞时命中。命中则由 AgentChatScreen 本地调 lsmApi 直出
 * LsmCards（不进 LLM），作为 B（LLM 工具）之外的确定性兜底 + 秒回加速。
 *
 * 纯函数、无副作用，便于 node 单测。
 */
export type LsmIntent =
  | { matched: false }
  | { matched: true; kind: 'markets'; query: string }
  | { matched: true; kind: 'positions' };

const POSITIONS_RE = /(我的持仓|我的单|我的下注|我下的注|我的仓位|持仓|my\s+positions|my\s+bets|my\s+orders)/i;
// 体育/盘口关键词（LSM 专属，区别于聚合的泛化 prediction 品类）。
const SPORTS_RE = /(世界杯|世界盃|盘口|赛事|球赛|比赛|滚球|足球|世界杯赔率|world\s*cup|match(es)?|fixture|kickoff)/i;
const ACTION_RE = /(找|搜|搜索|看看|看下|有什么|有哪些|推荐|列出|来点|下注|投注|买|list|show|find|browse|bet)/i;

/** 从文本粗提联赛/关键词 query（用于客户端过滤展示，后端仍返回全部 live）。 */
function extractQuery(text: string): string {
  const m = text.match(/(世界杯|world\s*cup|欧冠|英超|西甲|德甲|意甲|法甲|nba|欧洲杯)/i);
  return m ? m[1] : '';
}

export function detectLsmIntent(raw: string): LsmIntent {
  const text = (raw || '').trim();
  if (!text) return { matched: false };

  // 持仓查询优先。
  if (POSITIONS_RE.test(text)) return { matched: true, kind: 'positions' };

  // slash：/盘口 /赛事 /世界杯 /下注
  const slash = text.match(/^\/(盘口|赛事|世界杯|下注|bet|match(es)?)\s*(.*)$/i);
  if (slash) return { matched: true, kind: 'markets', query: (slash[3] || '').trim() };

  // 明确体育盘口措辞：体育词命中 且（含动作词 或 直接就是盘口/世界杯）。
  if (SPORTS_RE.test(text) && (ACTION_RE.test(text) || /^(世界杯|盘口|滚球|球赛|赛事)/.test(text))) {
    return { matched: true, kind: 'markets', query: extractQuery(text) };
  }
  return { matched: false };
}

/** 客户端按 query 过滤盘口（匹配队名/联赛，大小写不敏感）；query 空则原样返回。 */
export function filterMarketsByQuery<T extends { homeTeam: string; awayTeam: string; league?: string | null }>(
  markets: T[],
  query: string,
): T[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return markets;
  const hit = markets.filter(
    (m) =>
      m.homeTeam?.toLowerCase().includes(q) ||
      m.awayTeam?.toLowerCase().includes(q) ||
      (m.league || '').toLowerCase().includes(q),
  );
  // 过滤后为空则回退全部（避免"0 盘口"体验，与 web 工具的空回退一致）。
  return hit.length ? hit : markets;
}
