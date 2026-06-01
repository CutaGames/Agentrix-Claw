/**
 * aeonApi — Aeon(永曜城)移动端 API 封装(Task 1.7/1.8 支撑)。
 *
 * 复用现有 `apiFetch`(自动带鉴权/baseURL)。后端契约:
 *   GET  /v1/aeon/plots/epochs        列出纪元 + 解锁状态
 *   POST /v1/aeon/plots/claim         圈地 { lat,lng,epoch?,displayName? }
 *   GET  /v1/aeon/plots               地图 markers(?epoch=)
 *   GET  /v1/aeon/plots/mine          我的地块
 *   GET  /v1/aeon/plots/:id           地块详情
 *   POST /v1/aeon/plots/:id/enter     进入地块(刷新活动)
 *   POST /v1/aeon/rooms               建房间
 *   GET  /v1/aeon/rooms?plotId=       地块的房间
 *   GET  /v1/aeon/rooms/:id           房间详情 + 在场态
 *   GET  /v1/aeon/rooms/:id/can-enter 容量校验
 */
import { apiFetch } from '../api';
import type {
  AeonEpoch,
  AeonEpochInfo,
  AeonPlotDto,
  AeonPlotMarker,
  AeonRoomDto,
  AeonRoomKind,
} from '../../../shared/types/aeon-world';
import type { AeonCharacterSnapshot } from '../../../shared/types/aeon-sync';

// ── 纪元 ────────────────────────────────────────────────────────
export async function listEpochs(): Promise<{ items: AeonEpochInfo[]; active: AeonEpoch }> {
  return apiFetch('/v1/aeon/plots/epochs');
}

// ── 地块 ────────────────────────────────────────────────────────
export async function claimPlot(input: {
  lat: number;
  lng: number;
  epoch?: AeonEpoch;
  displayName?: string;
}): Promise<AeonPlotDto> {
  return apiFetch('/v1/aeon/plots/claim', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listPlotMarkers(epoch?: AeonEpoch): Promise<AeonPlotMarker[]> {
  const qs = epoch ? `?epoch=${encodeURIComponent(epoch)}` : '';
  const r = await apiFetch<{ items: AeonPlotMarker[] }>(`/v1/aeon/plots${qs}`);
  return r.items ?? [];
}

export async function listMyPlots(): Promise<AeonPlotDto[]> {
  const r = await apiFetch<{ items: AeonPlotDto[] }>('/v1/aeon/plots/mine');
  return r.items ?? [];
}

export async function getPlot(id: string): Promise<AeonPlotDto> {
  return apiFetch(`/v1/aeon/plots/${id}`);
}

export async function enterPlot(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/v1/aeon/plots/${id}/enter`, { method: 'POST' });
}

// ── 房间 ────────────────────────────────────────────────────────
export async function createRoom(input: {
  plotId: string;
  kind?: AeonRoomKind;
  displayName?: string;
  capacity?: number;
  config?: Record<string, unknown>;
  orgId?: string | null;
}): Promise<AeonRoomDto> {
  return apiFetch('/v1/aeon/rooms', { method: 'POST', body: JSON.stringify(input) });
}

export async function listRoomsByPlot(plotId: string): Promise<AeonRoomDto[]> {
  const r = await apiFetch<{ items: AeonRoomDto[] }>(
    `/v1/aeon/rooms?plotId=${encodeURIComponent(plotId)}`,
  );
  return r.items ?? [];
}

export interface AeonRoomWithPresence extends AeonRoomDto {
  occupancy: number;
  occupants: AeonCharacterSnapshot[];
}

export async function getRoomWithPresence(id: string): Promise<AeonRoomWithPresence> {
  return apiFetch(`/v1/aeon/rooms/${id}`);
}

export async function canEnterRoom(
  id: string,
): Promise<{ ok: boolean; capacity: number; occupancy: number }> {
  return apiFetch(`/v1/aeon/rooms/${id}/can-enter`);
}

// ── 建造系统(Phase 4 / R10)────────────────────────────────────
import type {
  AeonBuildItemDto,
  AeonBuildPlacement,
  AeonBuildCatalogItem,
  AeonNewsItem,
  AeonLeaderboardEntry,
} from '../../../shared/types/aeon-world';

export async function getBuildCatalog(): Promise<AeonBuildCatalogItem[]> {
  const r = await apiFetch<{ items: AeonBuildCatalogItem[] }>('/v1/aeon/build/catalog');
  return r.items ?? [];
}

export async function listBuildItems(plotId: string): Promise<AeonBuildItemDto[]> {
  const r = await apiFetch<{ items: AeonBuildItemDto[] }>(
    `/v1/aeon/plots/${encodeURIComponent(plotId)}/build`,
  );
  return r.items ?? [];
}

export async function placeBuildItem(plotId: string, p: AeonBuildPlacement): Promise<AeonBuildItemDto> {
  return apiFetch(`/v1/aeon/plots/${encodeURIComponent(plotId)}/build`, {
    method: 'POST',
    body: JSON.stringify(p),
  });
}

export async function moveBuildItem(
  plotId: string,
  itemId: string,
  patch: { x?: number; y?: number; rotation?: number },
): Promise<AeonBuildItemDto> {
  return apiFetch(`/v1/aeon/plots/${encodeURIComponent(plotId)}/build/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function removeBuildItem(plotId: string, itemId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/v1/aeon/plots/${encodeURIComponent(plotId)}/build/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
  });
}

// ── 世界新闻 + 排行榜(Phase 4 / R14.5)─────────────────────────
export async function listWorldNews(epoch?: AeonEpoch, limit = 30): Promise<AeonNewsItem[]> {
  const qs = `?limit=${limit}${epoch ? `&epoch=${encodeURIComponent(epoch)}` : ''}`;
  const r = await apiFetch<{ items: AeonNewsItem[] }>(`/v1/aeon/news${qs}`);
  return r.items ?? [];
}

export async function getLeaderboard(limit = 10): Promise<AeonLeaderboardEntry[]> {
  const r = await apiFetch<{ items: AeonLeaderboardEntry[] }>(`/v1/aeon/news/leaderboard?limit=${limit}`);
  return r.items ?? [];
}

// ── 异步收件箱(Phase 4 / R13.4)────────────────────────────────
export interface AeonInboxItemView {
  id: string;
  kind: string;
  title: string;
  body: string;
  refId?: string;
  createdAt: number;
  read: boolean;
}

export async function getInbox(unreadOnly = false): Promise<{ items: AeonInboxItemView[]; unreadCount: number }> {
  return apiFetch(`/v1/aeon/inbox${unreadOnly ? '?unread=true' : ''}`);
}

export async function markInboxRead(ids?: string[]): Promise<{ ok: boolean; unreadCount: number }> {
  return apiFetch('/v1/aeon/inbox/read', { method: 'POST', body: JSON.stringify({ ids }) });
}

// ── 填场 opt-out(Phase 4 / R13.7)──────────────────────────────
export async function setFillOptOut(optOut: boolean): Promise<{ optOut: boolean }> {
  return apiFetch('/v1/aeon/reality/fill-optout', { method: 'POST', body: JSON.stringify({ optOut }) });
}

// ── 任务/悬赏(Aeon 核心经济循环:发任务 → 接单 → 交付 → 验收放款）────────
export interface AeonTaskDto {
  id: string;
  title: string;
  description?: string;
  kind: string; // 'bounty' | 'job' | ...
  rewardAmount: number;
  rewardCurrency?: string;
  state: string; // 'open' | 'in_progress' | 'awaiting_verify' | 'completed' | ...
  initiatorUserId: string;
  acceptorUserId?: string | null;
  plotId?: string | null;
  createdAt: string;
}

/** 浏览开放任务(可按 kind 过滤)。 */
export async function listOpenTasks(kind?: string): Promise<AeonTaskDto[]> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  const r = await apiFetch<{ items: AeonTaskDto[] }>(`/v1/aeon/tasks${qs}`);
  return r.items ?? [];
}

/** 发布一个悬赏/任务。 */
export async function postTask(input: {
  title: string;
  description?: string;
  kind?: string;
  rewardAmount: number;
  plotId?: string;
}): Promise<AeonTaskDto> {
  return apiFetch('/v1/aeon/tasks', { method: 'POST', body: JSON.stringify(input) });
}

/** 接单。 */
export async function acceptTask(id: string): Promise<AeonTaskDto> {
  return apiFetch(`/v1/aeon/tasks/${id}/accept`, { method: 'POST' });
}

/** 提交交付物。 */
export async function submitTask(id: string, deliverable: Record<string, unknown>): Promise<AeonTaskDto> {
  return apiFetch(`/v1/aeon/tasks/${id}/submit`, { method: 'POST', body: JSON.stringify({ deliverable }) });
}

/** 验收通过并放款。 */
export async function verifyTask(id: string): Promise<AeonTaskDto> {
  return apiFetch(`/v1/aeon/tasks/${id}/verify`, { method: 'POST' });
}
