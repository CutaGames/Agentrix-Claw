/**
 * connectorApi — 连接器/插件库移动端 API 封装。
 *
 * 后端契约(v1/connectors):
 *   GET    /v1/connectors                          目录(含已安装标记)
 *   GET    /v1/connectors/installed                我已安装
 *   POST   /v1/connectors/install                  一键安装(鉴权向导提交 credentials)
 *   DELETE /v1/connectors/:id                      卸载
 *   POST   /v1/connectors/:id/run                  执行 builtin 连接器(查询)
 *   POST   /v1/connectors/:id/errand               派 agent 办事(办成发 AXP + 世界新闻)
 *   GET    /v1/connectors/:id/oauth/authorize-url  生成 OAuth 授权跳转 URL + 签名 state(R6.2)
 *   GET    /v1/connectors/:id/readout              当天日程/未读读取(R4.3/R6.5)
 *   DELETE /v1/connectors/:id/oauth                撤销 OAuth 授权(R6.7)
 */
import { apiFetch } from './api';
import type {
  ConnectorCatalogItem,
  ConnectorInstallInput,
  ConnectorInstallResult,
  AgentErrandResult,
  CalendarEmailReadout,
} from '../../shared/types/connector';

export async function listConnectors(): Promise<ConnectorCatalogItem[]> {
  const r = await apiFetch<{ items: ConnectorCatalogItem[] }>('/v1/connectors');
  return r.items ?? [];
}

/** 我已安装的连接器(用于 OAuth 回调后检测安装是否落库,§4 first_task 成功判定)。 */
export async function listInstalledConnectors(): Promise<ConnectorCatalogItem[]> {
  const r = await apiFetch<{ items: ConnectorCatalogItem[] }>('/v1/connectors/installed');
  return r.items ?? [];
}

export async function installConnector(input: ConnectorInstallInput): Promise<ConnectorInstallResult> {
  return apiFetch('/v1/connectors/install', { method: 'POST', body: JSON.stringify(input) });
}

export async function uninstallConnector(connectorId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/v1/connectors/${encodeURIComponent(connectorId)}`, { method: 'DELETE' });
}

// ── OAuth 授权链路(R6.2 / R6.7,§5.3 / §5.5)────────────────────────────────

/**
 * 取 OAuth 连接器的授权跳转 URL + 签名 state(R6.2)。
 * 前端拿到 url 后用 WebBrowser 打开 provider 授权页;回调由后端校验 state 并落库。
 * 后端未配置 provider 凭据(或不支持 OAuth)时抛描述性错误 → 调用方应降级到兜底连接器。
 */
export async function getOAuthAuthorizeUrl(
  connectorId: string,
): Promise<{ url: string; state: string }> {
  return apiFetch(`/v1/connectors/${encodeURIComponent(connectorId)}/oauth/authorize-url`);
}

/** 撤销 OAuth 授权:删令牌 + 卸载连接器 + best-effort 通知 provider(R6.7)。 */
export async function revokeOAuth(connectorId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/v1/connectors/${encodeURIComponent(connectorId)}/oauth`, { method: 'DELETE' });
}

// ── 当天日程/未读读取(R4.3 / R6.5,§5.4)──────────────────────────────────

export interface ReadoutQuery {
  /** 计算「今日」边界的时区偏移(UTC 以东分钟数,如北京/新加坡 480)。 */
  tzOffsetMinutes?: number;
  /** system-calendar:端侧本地读取后回传的今日计数。 */
  clientCount?: number;
  /** system-calendar:端侧本地读取的事件标题(可选,供 TTS;不写日志,R6.8)。 */
  clientItems?: string[];
}

/**
 * 读取某连接器的当天概览(今日日程数 / 未读邮件数)(R4.3/R6.5)。
 * 失败由调用方按「可重试或可跳过」处理,不阻塞主线(R4.6)。
 */
export async function readoutToday(
  connectorId: string,
  query: ReadoutQuery = {},
): Promise<CalendarEmailReadout> {
  const params = new URLSearchParams();
  if (query.tzOffsetMinutes != null) params.set('tzOffsetMinutes', String(query.tzOffsetMinutes));
  if (query.clientCount != null) params.set('clientCount', String(query.clientCount));
  if (query.clientItems) for (const item of query.clientItems) params.append('clientItems', item);
  const qs = params.toString();
  return apiFetch(
    `/v1/connectors/${encodeURIComponent(connectorId)}/readout${qs ? `?${qs}` : ''}`,
  );
}

export async function runConnector(connectorId: string, args: Record<string, unknown>): Promise<{ summary: string; data: Record<string, unknown> }> {
  return apiFetch(`/v1/connectors/${encodeURIComponent(connectorId)}/run`, {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function runConnectorErrand(connectorId: string, args: Record<string, unknown>): Promise<AgentErrandResult> {
  return apiFetch(`/v1/connectors/${encodeURIComponent(connectorId)}/errand`, {
    method: 'POST',
    body: JSON.stringify(args),
  });
}
