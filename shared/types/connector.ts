/**
 * Connector(连接器/插件库)跨端契约 — 移动端、桌面端、后端共用。
 *
 * 连接器 = 把外部服务封装成 agent 可一键装、对话里可调的能力。本文件定义目录项 DTO、
 * 安装请求/结果、以及"派 agent 出门办事"(玩法 A)的执行结果形状。
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

/** 目录项(含该用户是否已安装)。 */
export interface ConnectorCatalogItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: ConnectorCategory;
  kind: ConnectorKind;
  status: ConnectorStatus;
  authKind: ConnectorAuthKind;
  authHeaderName?: string;
  reality?: boolean;
  chinaAvailable?: boolean;
  rewardAxp?: number;
  /** 该用户是否已安装(列表按用户填充)。 */
  installed?: boolean;
  enabled?: boolean;
}

/** 安装请求:credentials 按 authKind 填(none 可空)。 */
export interface ConnectorInstallInput {
  connectorId: string;
  credentials?: {
    apiKey?: string;
    headerName?: string;
    token?: string;
  };
}

export interface ConnectorInstallResult {
  ok: boolean;
  connectorId: string;
  installed: boolean;
  message: string;
  /** 安装后该用户新增的可调工具名(供 UI 提示)。 */
  tools?: string[];
}

/** 玩法 A:派 agent 出门办一件真事的结果(用于游戏内呈现 + 发 AXP)。 */
export interface AgentErrandResult {
  ok: boolean;
  connectorId: string;
  /** 给玩家看的一行结果(冒泡 + 城市新闻)。 */
  summary: string;
  /** 结构化数据(可选,客户端按需展示)。 */
  data?: Record<string, unknown>;
  /** 本次办成事发放的 AXP(真实办事→游戏产出)。 */
  rewardAxp: number;
  /** AXP 是否成功入全局钱包。 */
  bridged: boolean;
  /** 钱包最新余额(bridged 时有)。 */
  balance?: number;
}

export const CONNECTOR_ERRAND_DEFAULT_REWARD = 10;
