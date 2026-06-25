/**
 * ConnectorCatalog — 精选连接器目录(插件库市场化封装的"内容"层)。
 *
 * 一个"连接器"= 把一个外部服务/API 封装成 agent 可一键安装、可在对话里调用的能力。
 * 底层落地为三种 kind:
 *   - 'builtin'    : 平台已内置实现(直接 enable,无需外部 endpoint;鉴权可选)。
 *   - 'openapi'    : 指向一个 OpenAPI spec URL,安装时经 openapi-importer 导入为 http skill。
 *   - 'mcp'        : 指向一个 MCP server url,安装时注册到 mcp-registry。
 *
 * 鉴权需求 authKind 决定"鉴权向导"展示哪种表单:
 *   - 'none'    : 免鉴权(公开 API),一键直接装。
 *   - 'api_key' : 需要 API key(向导收一个 key + 可选 header 名)。
 *   - 'bearer'  : 需要 Bearer token。
 *   - 'oauth'   : 需要 OAuth 跳转(MVP 先占位,标 comingSoon)。
 *
 * status:live=可装可用;beta=可装但不稳;coming_soon=仅展示(投票/预告)。
 *
 * 新增连接器:在 CONNECTORS 追加一项即可;builtin 类需在 ConnectorService 里注册对应执行。
 */

export type ConnectorKind = 'builtin' | 'openapi' | 'mcp';
export type ConnectorAuthKind = 'none' | 'api_key' | 'bearer' | 'oauth';
export type ConnectorStatus = 'live' | 'beta' | 'coming_soon';
export type ConnectorCategory =
  | 'productivity'
  | 'finance'
  | 'travel'
  | 'food'
  | 'shopping'
  | 'info'
  | 'dev'
  | 'social';

export interface ConnectorDef {
  /** 稳定 id(安装/调用键)。 */
  id: string;
  name: string;
  /** 一句话描述(目录卡片 + 给 LLM 的工具描述都用)。 */
  description: string;
  icon: string;
  category: ConnectorCategory;
  kind: ConnectorKind;
  status: ConnectorStatus;
  authKind: ConnectorAuthKind;
  /** api_key 类:建议的请求头名(向导预填)。 */
  authHeaderName?: string;
  /** openapi 类:spec URL。 */
  openapiUrl?: string;
  /** mcp 类:server url。 */
  mcpUrl?: string;
  /**
   * builtin 类:该连接器暴露给 agent 的工具名(已在 ConnectorService 注册执行)。
   * 安装后这些工具对该用户可调。
   */
  builtinTools?: string[];
  /** 是否为"日常生活办事"类(玩法 A 派 agent 出门办事可用)。 */
  reality?: boolean;
  /** 国内可直连(无需 VPN)。 */
  chinaAvailable?: boolean;
  /** 办成一件事奖励的 AXP(玩法 A:真实办事→游戏产出)。 */
  rewardAxp?: number;
  /**
   * oauth 类:provider 标识(如 'google')。同一 provider 多连接器共用凭据/端点配置。
   * 实际授权端点/scope 由 ConnectorOAuthService 内置 provider 表维护,此处为目录侧可选元信息。
   */
  oauthProvider?: string;
  /** oauth 类:请求的最小只读 scope 列表(目录侧展示/审计用)。 */
  oauthScopes?: string[];
}

export const CONNECTORS: ConnectorDef[] = [
  // ── 信息/资讯(公开 API,免鉴权,可作玩法 A 最短闭环样板)──
  {
    id: 'crypto-price',
    name: '加密行情',
    description: '查询加密货币实时价格(BTC/ETH/SOL 等),数据来自 CoinGecko 公开 API。',
    icon: '📈',
    category: 'finance',
    kind: 'builtin',
    status: 'live',
    authKind: 'none',
    builtinTools: ['connector_crypto_price'],
    reality: true,
    chinaAvailable: true,
    rewardAxp: 10,
  },
  {
    id: 'weather',
    name: '天气',
    description: '查询全球城市实时天气(温度/天气状况),数据来自 Open-Meteo 公开 API。',
    icon: '🌦️',
    category: 'info',
    kind: 'builtin',
    status: 'live',
    authKind: 'none',
    builtinTools: ['connector_weather'],
    reality: true,
    chinaAvailable: true,
    rewardAxp: 8,
  },
  // ── 日历/邮箱(OAuth 真实链路,Soul_Birth「办成第一件事」,R6.1)──
  {
    id: 'google-calendar',
    name: 'Google 日历',
    description: '读取你的 Google 日历,念出今天的安排。',
    icon: '📅',
    category: 'productivity',
    kind: 'builtin',
    status: 'live',
    authKind: 'oauth',
    oauthProvider: 'google',
    oauthScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    reality: true,
    rewardAxp: 12,
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: '读取未读邮件数量,帮你盯收件箱。',
    icon: '📧',
    category: 'productivity',
    kind: 'builtin',
    status: 'live',
    authKind: 'oauth',
    oauthProvider: 'google',
    oauthScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    reality: true,
    rewardAxp: 12,
  },
  // ── 国内/Google 不可达兜底(R6.6,不限定地域)──
  {
    id: 'system-calendar',
    name: '系统日历',
    description: '读取本机系统日历的今日日程(无需 Google)。',
    icon: '🗓️',
    category: 'productivity',
    kind: 'builtin',
    status: 'live',
    authKind: 'none',
    reality: true,
    chinaAvailable: true,
    rewardAxp: 12,
  },
  {
    id: 'imap-email',
    name: 'IMAP 邮箱',
    description: '通过 IMAP 连接任意邮箱,统计未读(无需 Google)。',
    icon: '📬',
    category: 'productivity',
    kind: 'builtin',
    status: 'live',
    authKind: 'api_key',
    reality: true,
    chinaAvailable: true,
    rewardAxp: 12,
  },
  // ── 出行(有公开/合作 API,先做"查询"闭环;下单/支付后续)──
  {
    id: 'flight-search',
    name: '机票查询',
    description: '查询航班与报价(需 Amadeus/Skyscanner 等聚合商 API Key)。先查询,下单后续接入。',
    icon: '✈️',
    category: 'travel',
    kind: 'openapi',
    status: 'coming_soon',
    authKind: 'api_key',
    authHeaderName: 'X-API-Key',
    reality: true,
    rewardAxp: 30,
  },
  // ── 生产力(OAuth,先占位)──
  {
    id: 'notion',
    name: 'Notion',
    description: '读写 Notion 页面/数据库,让 agent 帮你整理笔记与文档。',
    icon: '📝',
    category: 'productivity',
    kind: 'mcp',
    status: 'coming_soon',
    authKind: 'oauth',
    reality: false,
    rewardAxp: 15,
  },
  {
    id: 'github',
    name: 'GitHub',
    description: '查询/创建 issue、读 PR,让 agent 协助你的开发工作流。',
    icon: '🐙',
    category: 'dev',
    kind: 'mcp',
    status: 'coming_soon',
    authKind: 'bearer',
    reality: false,
    rewardAxp: 15,
  },
  // ── 外卖(国内无开放下单 API,GUI 兜底;先占位预告)──
  {
    id: 'food-delivery',
    name: '点外卖',
    description: '点外卖下单。国内平台暂无开放 API,将通过桌面 Computer Use 操作网页版兜底。',
    icon: '🍔',
    category: 'food',
    kind: 'builtin',
    status: 'coming_soon',
    authKind: 'none',
    reality: true,
    chinaAvailable: true,
    rewardAxp: 20,
  },
];

export function getConnector(id: string): ConnectorDef | undefined {
  return CONNECTORS.find((c) => c.id === id);
}
