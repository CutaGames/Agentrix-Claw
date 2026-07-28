/**
 * teamFlags — resolve a national-team name to a country flag image.
 *
 * The odds source (Bet365 / Betfair via the-odds-api) does NOT carry team
 * crests/logos. For the World Cup (national teams) we use public-domain
 * country flags from flagcdn.com keyed by a name→ISO-3166 alpha-2 map.
 * Returns null for unknown names (caller falls back to no flag / initials).
 *
 * Club leagues (non-national) won't match and return null — that's expected;
 * a club-crest provider would be a separate integration.
 */
const NAME_TO_CC: Record<string, string> = {
  // ── World Cup / major national teams (zh + en aliases) ──
  argentina: 'ar', 阿根廷: 'ar',
  brazil: 'br', 巴西: 'br',
  france: 'fr', 法国: 'fr',
  england: 'gb-eng', 英格兰: 'gb-eng',
  spain: 'es', 西班牙: 'es',
  germany: 'de', 德国: 'de',
  portugal: 'pt', 葡萄牙: 'pt',
  netherlands: 'nl', 荷兰: 'nl', holland: 'nl',
  italy: 'it', 意大利: 'it',
  belgium: 'be', 比利时: 'be',
  croatia: 'hr', 克罗地亚: 'hr',
  uruguay: 'uy', 乌拉圭: 'uy',
  mexico: 'mx', 墨西哥: 'mx',
  usa: 'us', 'united states': 'us', 美国: 'us',
  canada: 'ca', 加拿大: 'ca',
  japan: 'jp', 日本: 'jp',
  'south korea': 'kr', korea: 'kr', 韩国: 'kr', 'korea republic': 'kr',
  australia: 'au', 澳大利亚: 'au',
  morocco: 'ma', 摩洛哥: 'ma',
  senegal: 'sn', 塞内加尔: 'sn',
  ghana: 'gh', 加纳: 'gh',
  nigeria: 'ng', 尼日利亚: 'ng',
  cameroon: 'cm', 喀麦隆: 'cm',
  'ivory coast': 'ci', "côte d'ivoire": 'ci', 科特迪瓦: 'ci',
  egypt: 'eg', 埃及: 'eg',
  'south africa': 'za', 南非: 'za',
  switzerland: 'ch', 瑞士: 'ch',
  denmark: 'dk', 丹麦: 'dk',
  poland: 'pl', 波兰: 'pl',
  serbia: 'rs', 塞尔维亚: 'rs',
  wales: 'gb-wls', 威尔士: 'gb-wls',
  scotland: 'gb-sct', 苏格兰: 'gb-sct',
  qatar: 'qa', 卡塔尔: 'qa',
  'saudi arabia': 'sa', 沙特: 'sa', 沙特阿拉伯: 'sa',
  iran: 'ir', 伊朗: 'ir',
  ecuador: 'ec', 厄瓜多尔: 'ec',
  colombia: 'co', 哥伦比亚: 'co',
  chile: 'cl', 智利: 'cl',
  peru: 'pe', 秘鲁: 'pe',
  'costa rica': 'cr', 哥斯达黎加: 'cr',
  tunisia: 'tn', 突尼斯: 'tn',
  turkey: 'tr', türkiye: 'tr', 土耳其: 'tr',
  'new zealand': 'nz', 新西兰: 'nz',
};

function normalize(name: string): string {
  return (name || '').trim().toLowerCase();
}

/** Map a team name to an ISO country code (flagcdn), or null if unknown. */
export function teamCountryCode(teamName: string): string | null {
  const n = normalize(teamName);
  if (!n) return null;
  if (NAME_TO_CC[n]) return NAME_TO_CC[n];
  // partial match (e.g. "Brazil U23", "Korea Republic")
  for (const key of Object.keys(NAME_TO_CC)) {
    if (n.includes(key)) return NAME_TO_CC[key];
  }
  return null;
}

/** Flag image URL (160px) for a team name, or null if no match. */
export function teamFlagUrl(teamName: string): string | null {
  const cc = teamCountryCode(teamName);
  return cc ? `https://flagcdn.com/w160/${cc}.png` : null;
}
