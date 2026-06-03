/**
 * connectorApi — 连接器/插件库移动端 API 封装。
 *
 * 后端契约(v1/connectors):
 *   GET    /v1/connectors            目录(含已安装标记)
 *   GET    /v1/connectors/installed  我已安装
 *   POST   /v1/connectors/install    一键安装(鉴权向导提交 credentials)
 *   DELETE /v1/connectors/:id        卸载
 *   POST   /v1/connectors/:id/run    执行 builtin 连接器(查询)
 *   POST   /v1/connectors/:id/errand 派 agent 办事(办成发 AXP + 世界新闻)
 */
import { apiFetch } from './api';
import type {
  ConnectorCatalogItem,
  ConnectorInstallInput,
  ConnectorInstallResult,
  AgentErrandResult,
} from '../../shared/types/connector';

export async function listConnectors(): Promise<ConnectorCatalogItem[]> {
  const r = await apiFetch<{ items: ConnectorCatalogItem[] }>('/v1/connectors');
  return r.items ?? [];
}

export async function installConnector(input: ConnectorInstallInput): Promise<ConnectorInstallResult> {
  return apiFetch('/v1/connectors/install', { method: 'POST', body: JSON.stringify(input) });
}

export async function uninstallConnector(connectorId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/v1/connectors/${encodeURIComponent(connectorId)}`, { method: 'DELETE' });
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
