/**
 * Card Renderer — generates share cards as SVG strings.
 *
 * Phase 1 (P1): Pure SVG rendering — no Canvas/Puppeteer needed.
 * The SVG is served directly by the share controller; clients can convert
 * to PNG/JPG by passing through any SVG → raster service or by rendering
 * inline.
 *
 * V5.1 (deferred): Server-side Three.js → animated GIF (3s, 1080×1080)
 * via headless WebGL.
 *
 * Requirements: 7.1, 7.2, 7.6
 */

export interface CharacterCardData {
  name: string;
  category: string;
  level: number;
  battleWins: number;
  battleLosses: number;
  stats: { hp: number; atk: number; def: number; spd: number; int: number };
  styledMeshUrl?: string | null;
}

export interface BattleCardData {
  battleId: string;
  challengerName: string;
  defenderName: string;
  winnerName: string;
  rounds: number;
  date: string;
}

export interface DungeonCardData {
  shareCode: string;
  theme: string;
  difficulty: number;
  creatorName: string;
}

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1080;

const COLORS = {
  bg: '#0a0a0a',
  card: '#1a1a2e',
  accent: '#6c5ce7',
  textPrimary: '#ffffff',
  textSecondary: '#aaaaaa',
  hp: '#4CAF50',
  atk: '#F44336',
  def: '#2196F3',
  spd: '#FFC107',
  int: '#9C27B0',
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Render a character share card as SVG.
 * Returns the SVG string ready to be served as image/svg+xml.
 */
export function renderCharacterCardSvg(data: CharacterCardData): string {
  const top3 = Object.entries(data.stats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const winRate = data.battleWins + data.battleLosses > 0
    ? Math.round((data.battleWins / (data.battleWins + data.battleLosses)) * 100)
    : 0;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${COLORS.bg}"/>
      <stop offset="100%" stop-color="${COLORS.card}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${COLORS.accent}"/>
      <stop offset="100%" stop-color="#5a4bd1"/>
    </linearGradient>
  </defs>
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#bg)"/>

  <!-- Brand mark -->
  <text x="60" y="80" fill="${COLORS.accent}" font-family="system-ui, -apple-system" font-size="32" font-weight="700">Agentrix</text>
  <text x="60" y="115" fill="${COLORS.textSecondary}" font-family="system-ui, -apple-system" font-size="20">World Engine</text>

  <!-- Character name -->
  <text x="${CARD_WIDTH / 2}" y="220" fill="${COLORS.textPrimary}" font-family="system-ui, -apple-system" font-size="72" font-weight="800" text-anchor="middle">${escapeXml(data.name)}</text>

  <!-- Category + Level chips -->
  <rect x="${CARD_WIDTH / 2 - 200}" y="250" width="180" height="50" rx="25" fill="${COLORS.card}"/>
  <text x="${CARD_WIDTH / 2 - 110}" y="284" fill="${COLORS.textPrimary}" font-family="system-ui" font-size="22" text-anchor="middle">${escapeXml(data.category)}</text>

  <rect x="${CARD_WIDTH / 2 + 20}" y="250" width="180" height="50" rx="25" fill="url(#accent)"/>
  <text x="${CARD_WIDTH / 2 + 110}" y="284" fill="${COLORS.textPrimary}" font-family="system-ui" font-size="22" font-weight="600" text-anchor="middle">Lv.${data.level}</text>

  <!-- 3D mesh placeholder area (would embed actual rendered image in V5.1) -->
  <rect x="190" y="350" width="700" height="380" rx="20" fill="${COLORS.card}" opacity="0.5"/>
  <text x="${CARD_WIDTH / 2}" y="540" fill="${COLORS.textSecondary}" font-family="system-ui" font-size="48" text-anchor="middle" opacity="0.4">3D</text>
  <text x="${CARD_WIDTH / 2}" y="600" fill="${COLORS.textSecondary}" font-family="system-ui" font-size="20" text-anchor="middle" opacity="0.6">Open in Agentrix to view in 3D</text>

  <!-- Top 3 stats -->
  <g transform="translate(60 800)">
    ${top3.map((entry, i) => {
      const [statName, statVal] = entry;
      const x = i * 320;
      const color = (COLORS as any)[statName] || COLORS.accent;
      return `
      <rect x="${x}" y="0" width="300" height="120" rx="16" fill="${COLORS.card}"/>
      <rect x="${x}" y="0" width="6" height="120" fill="${color}"/>
      <text x="${x + 30}" y="45" fill="${COLORS.textSecondary}" font-family="system-ui" font-size="20" text-transform="uppercase">${statName.toUpperCase()}</text>
      <text x="${x + 30}" y="100" fill="${COLORS.textPrimary}" font-family="system-ui" font-size="56" font-weight="700">${statVal}</text>
      `;
    }).join('')}
  </g>

  <!-- Battle record -->
  <text x="${CARD_WIDTH / 2}" y="990" fill="${COLORS.textSecondary}" font-family="system-ui" font-size="22" text-anchor="middle">${data.battleWins}W / ${data.battleLosses}L · ${winRate}% win rate</text>

  <!-- CTA -->
  <text x="${CARD_WIDTH / 2}" y="1040" fill="${COLORS.accent}" font-family="system-ui" font-size="20" font-weight="600" text-anchor="middle">Scan real-world objects to create your own at app.agentrix.io</text>
</svg>`;
}

/**
 * Render a battle share card as SVG.
 */
export function renderBattleCardSvg(data: BattleCardData): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${COLORS.bg}"/>
      <stop offset="100%" stop-color="${COLORS.card}"/>
    </linearGradient>
  </defs>
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#bg)"/>

  <text x="60" y="80" fill="${COLORS.accent}" font-family="system-ui" font-size="32" font-weight="700">Agentrix</text>
  <text x="60" y="115" fill="${COLORS.textSecondary}" font-family="system-ui" font-size="20">Battle Replay</text>

  <text x="${CARD_WIDTH / 2}" y="280" fill="${COLORS.textPrimary}" font-family="system-ui" font-size="60" font-weight="800" text-anchor="middle">⚔️ Battle</text>

  <text x="${CARD_WIDTH / 2}" y="420" fill="${COLORS.textPrimary}" font-family="system-ui" font-size="48" font-weight="600" text-anchor="middle">${escapeXml(data.challengerName)}</text>
  <text x="${CARD_WIDTH / 2}" y="490" fill="${COLORS.textSecondary}" font-family="system-ui" font-size="32" text-anchor="middle">VS</text>
  <text x="${CARD_WIDTH / 2}" y="560" fill="${COLORS.textPrimary}" font-family="system-ui" font-size="48" font-weight="600" text-anchor="middle">${escapeXml(data.defenderName)}</text>

  <rect x="${CARD_WIDTH / 2 - 200}" y="660" width="400" height="100" rx="50" fill="${COLORS.accent}"/>
  <text x="${CARD_WIDTH / 2}" y="725" fill="${COLORS.textPrimary}" font-family="system-ui" font-size="36" font-weight="700" text-anchor="middle">🏆 ${escapeXml(data.winnerName)}</text>

  <text x="${CARD_WIDTH / 2}" y="850" fill="${COLORS.textSecondary}" font-family="system-ui" font-size="24" text-anchor="middle">${data.rounds} rounds · ${escapeXml(data.date)}</text>

  <text x="${CARD_WIDTH / 2}" y="1040" fill="${COLORS.accent}" font-family="system-ui" font-size="20" font-weight="600" text-anchor="middle">Watch the full replay in Agentrix</text>
</svg>`;
}

/**
 * Render a dungeon share card as SVG.
 */
export function renderDungeonCardSvg(data: DungeonCardData): string {
  const stars = '★'.repeat(Math.max(1, Math.min(5, data.difficulty))) + '☆'.repeat(5 - Math.max(1, Math.min(5, data.difficulty)));
  const themeIcon = data.theme === 'fire' ? '🔥' : data.theme === 'dream' ? '💫' : data.theme === 'data' ? '💻' : '⬜';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${COLORS.bg}"/>
      <stop offset="100%" stop-color="${COLORS.card}"/>
    </linearGradient>
  </defs>
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#bg)"/>

  <text x="60" y="80" fill="${COLORS.accent}" font-family="system-ui" font-size="32" font-weight="700">Agentrix</text>
  <text x="60" y="115" fill="${COLORS.textSecondary}" font-family="system-ui" font-size="20">Dungeon Invite</text>

  <text x="${CARD_WIDTH / 2}" y="320" font-family="system-ui" font-size="180" text-anchor="middle">${themeIcon}</text>

  <text x="${CARD_WIDTH / 2}" y="500" fill="${COLORS.textPrimary}" font-family="system-ui" font-size="56" font-weight="800" text-anchor="middle">${escapeXml(data.creatorName)}'s Dungeon</text>

  <text x="${CARD_WIDTH / 2}" y="600" fill="${COLORS.textSecondary}" font-family="system-ui" font-size="32" text-anchor="middle">Theme: ${escapeXml(data.theme)}</text>
  <text x="${CARD_WIDTH / 2}" y="670" fill="#FFD700" font-family="system-ui" font-size="48" text-anchor="middle">${stars}</text>

  <rect x="${CARD_WIDTH / 2 - 220}" y="740" width="440" height="120" rx="20" fill="${COLORS.accent}"/>
  <text x="${CARD_WIDTH / 2}" y="790" fill="${COLORS.textSecondary}" font-family="system-ui" font-size="20" font-weight="500" text-anchor="middle" opacity="0.8">SHARE CODE</text>
  <text x="${CARD_WIDTH / 2}" y="840" fill="${COLORS.textPrimary}" font-family="monospace" font-size="44" font-weight="800" letter-spacing="6" text-anchor="middle">${escapeXml(data.shareCode.toUpperCase())}</text>

  <text x="${CARD_WIDTH / 2}" y="1040" fill="${COLORS.accent}" font-family="system-ui" font-size="20" font-weight="600" text-anchor="middle">Enter the code in Agentrix to attempt this dungeon</text>
</svg>`;
}
