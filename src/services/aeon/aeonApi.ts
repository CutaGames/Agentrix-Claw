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
  AeonNearbyPlot,
  AeonNearbyPerson,
  AeonCheckinResult,
  AeonCheckinLeaderEntry,
  AeonRoomDto,
  AeonRoomKind,
  AeonEventDto,
  AeonEventCreateInput,
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

// ── 地理社交(基于实时 GPS)──────────────────────────────────────
export async function listNearbyPlots(input: {
  lat: number;
  lng: number;
  radiusM?: number;
}): Promise<AeonNearbyPlot[]> {
  const qs = `?lat=${input.lat}&lng=${input.lng}${input.radiusM ? `&radiusM=${input.radiusM}` : ''}`;
  const r = await apiFetch<{ items: AeonNearbyPlot[] }>(`/v1/aeon/plots/nearby${qs}`);
  return r.items ?? [];
}

export async function checkInPlot(plotId: string, lat: number, lng: number): Promise<AeonCheckinResult> {
  return apiFetch(`/v1/aeon/plots/${plotId}/checkin`, {
    method: 'POST',
    body: JSON.stringify({ lat, lng }),
  });
}

/** 附近的人(上报我的位置 + 查附近在线玩家)。 */
export async function findNearbyPeople(input: {
  lat: number;
  lng: number;
  radiusM?: number;
  clan?: string;
  plotId?: string | null;
}): Promise<AeonNearbyPerson[]> {
  const r = await apiFetch<{ items: AeonNearbyPerson[] }>('/v1/aeon/plots/nearby-people', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return r.items ?? [];
}

/** 退出地图:清除我的实时位置。 */
export async function clearGeoPresence(): Promise<{ ok: boolean }> {
  return apiFetch('/v1/aeon/plots/presence/clear', { method: 'POST' });
}

/** 签到打卡排行。 */
export async function checkinLeaderboard(days = 30): Promise<AeonCheckinLeaderEntry[]> {
  const r = await apiFetch<{ items: AeonCheckinLeaderEntry[] }>(`/v1/aeon/plots/checkin/leaderboard?days=${days}`);
  return r.items ?? [];
}

/** 商家入驻:把地块绑定真实 POI。 */
export async function bindPlotPoi(
  plotId: string,
  poi: { name: string; category?: string; externalPoiId?: string | null; storeUrl?: string | null; address?: string | null },
): Promise<AeonPlotDto> {
  return apiFetch(`/v1/aeon/plots/${plotId}/poi`, { method: 'POST', body: JSON.stringify(poi) });
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

// ── 现场活动/演出排期(社交场所 Step 3)──────────────────────────
export async function listAeonEvents(plotId?: string): Promise<AeonEventDto[]> {
  const qs = plotId ? `?plotId=${encodeURIComponent(plotId)}` : '';
  const r = await apiFetch<{ items: AeonEventDto[] }>(`/v1/aeon/events${qs}`);
  return r.items ?? [];
}

export async function getAeonEvent(id: string): Promise<AeonEventDto> {
  return apiFetch(`/v1/aeon/events/${id}`);
}

export async function createAeonEvent(input: AeonEventCreateInput): Promise<AeonEventDto> {
  return apiFetch('/v1/aeon/events', { method: 'POST', body: JSON.stringify(input) });
}

export async function rsvpAeonEvent(id: string): Promise<{ rsvped: boolean; rsvpCount: number }> {
  return apiFetch(`/v1/aeon/events/${id}/rsvp`, { method: 'POST' });
}

export async function cancelAeonEvent(id: string): Promise<AeonEventDto> {
  return apiFetch(`/v1/aeon/events/${id}/cancel`, { method: 'POST' });
}

// ── 共建素材(#2:用户自有 World_Asset 作为建材)─────────────────────
export interface AeonBuildableAsset {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  usageKind: string;
  category: string;
}

export async function listMyBuildableAssets(all = false): Promise<AeonBuildableAsset[]> {
  const qs = all ? '?all=1' : '';
  const r = await apiFetch<{ items: AeonBuildableAsset[] }>(`/v1/aeon/build/my-assets${qs}`);
  return r.items ?? [];
}

export async function setAssetUsageKind(
  assetId: string,
  usageKind: 'character' | 'build_material' | 'decor',
): Promise<{ id: string; usageKind: string }> {
  return apiFetch(`/v1/aeon/build/my-assets/${assetId}/usage`, {
    method: 'POST',
    body: JSON.stringify({ usageKind }),
  });
}

/** 用一张照片(已上传得到的公网 URL)创建建材资产(#2 自己准备素材建造)。 */
export async function createBuildMaterialFromPhoto(input: {
  name?: string;
  imageUrl: string;
  usageKind?: 'build_material' | 'decor';
}): Promise<AeonBuildableAsset> {
  return apiFetch('/v1/aeon/build/my-assets/from-photo', {
    method: 'POST',
    body: JSON.stringify(input),
  });
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

// ── 现实任务奖励 → 世界 AXP(R20.1 / soul-birth R4.4,§4)──────────
/**
 * 现实办成事 → 世界 AXP 奖励(后端 RealityLoopService.rewardFromReality)。
 *   - `amount`:发放的 AXP 数量。
 *   - `reason`:人类可读理由(进收件箱/世界新闻,不含敏感内容)。
 *   - `refId`:**幂等键**;后端按 refId 去重,固定串(如 `soul-birth-first-task-{userId}`)
 *     保证「一次性」发放(R4.4 / Correctness Property 8)。
 * 返回是否桥接到全局钱包 + 最新余额(钱包跳动可视化用)。
 */
export async function rewardFromReality(input: {
  amount: number;
  reason: string;
  refId?: string;
}): Promise<{ bridged: boolean; balance?: number }> {
  return apiFetch('/v1/aeon/reality/reward', { method: 'POST', body: JSON.stringify(input) });
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

// ── 地块留言板(地图社交)────────────────────────────────────────
export interface AeonPlotMessageDto {
  id: string;
  plotId: string;
  authorUserId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

/** 列出某地块的留言。 */
export async function listPlotMessages(plotId: string, limit = 50): Promise<AeonPlotMessageDto[]> {
  const r = await apiFetch<{ items: AeonPlotMessageDto[] }>(`/v1/aeon/plots/${plotId}/messages?limit=${limit}`);
  return r.items ?? [];
}

/** 在地块留言。 */
export async function postPlotMessage(plotId: string, body: string): Promise<AeonPlotMessageDto> {
  return apiFetch(`/v1/aeon/plots/${plotId}/messages`, { method: 'POST', body: JSON.stringify({ body }) });
}

/** 我收到的留言(我所有地块上的访客留言)。 */
export async function listMyPlotMessages(limit = 50): Promise<AeonPlotMessageDto[]> {
  const r = await apiFetch<{ items: AeonPlotMessageDto[] }>(`/v1/aeon/plots/messages/inbox?limit=${limit}`);
  return r.items ?? [];
}

// ── 虚拟公司 / 组织运营(Aeon 经济:开公司 → 注资 → 雇 agent → 打卡 → 结算发薪)──
export interface AeonOrgDto {
  id: string;
  ownerUserId: string;
  name: string;
  kind: string;
  roomId?: string | null;
  axpLedgerBalance?: string;
  createdAt: string;
}

export interface AeonOrgMemberDto {
  id: string;
  orgId: string;
  memberUserId: string;
  agentInstanceId?: string | null;
  role: string; // owner | agent_employee | human_member
  wageAxpPerPeriod: number;
  status: string; // active | withdrawn
  createdAt: string;
}

/** 我的公司列表。 */
export async function listMyCompanies(): Promise<AeonOrgDto[]> {
  const r = await apiFetch<{ items: AeonOrgDto[] }>('/v1/aeon/orgs/mine');
  return r.items ?? [];
}

/** 创建公司(需指定建在哪块地)。 */
export async function createCompany(input: { name: string; plotId: string }): Promise<AeonOrgDto> {
  return apiFetch('/v1/aeon/orgs', { method: 'POST', body: JSON.stringify(input) });
}

/** 公司详情。 */
export async function getCompany(orgId: string): Promise<AeonOrgDto> {
  return apiFetch(`/v1/aeon/orgs/${orgId}`);
}

/** 公司成员名册。 */
export async function listCompanyMembers(orgId: string): Promise<AeonOrgMemberDto[]> {
  const r = await apiFetch<{ items?: AeonOrgMemberDto[] } | AeonOrgMemberDto[]>(`/v1/aeon/orgs/${orgId}/members`);
  return Array.isArray(r) ? r : (r.items ?? []);
}

/** 注资公司账本(AXP)。 */
export async function fundCompany(orgId: string, amount: number): Promise<{ balance: number }> {
  return apiFetch(`/v1/aeon/orgs/${orgId}/fund`, { method: 'POST', body: JSON.stringify({ amount }) });
}

/** 雇佣 agent 员工到工位。 */
export async function hireAgentEmployee(
  orgId: string,
  input: { memberUserId: string; agentInstanceId: string; wageAxpPerPeriod?: number },
): Promise<AeonOrgMemberDto> {
  return apiFetch(`/v1/aeon/orgs/${orgId}/employees`, { method: 'POST', body: JSON.stringify(input) });
}

/** agent 员工打卡上岗。 */
export async function clockInMember(orgId: string, memberId: string): Promise<{ ok: boolean; roomId: string | null }> {
  return apiFetch(`/v1/aeon/orgs/${orgId}/members/${memberId}/clock-in`, { method: 'POST' });
}

/** agent 员工下岗。 */
export async function clockOutMember(orgId: string, memberId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/v1/aeon/orgs/${orgId}/members/${memberId}/clock-out`, { method: 'POST' });
}

/** 周期结算(产出达标发薪)。 */
export async function settleMember(orgId: string, memberId: string): Promise<{ paid: number; output: { attempted: number; completed: number } }> {
  return apiFetch(`/v1/aeon/orgs/${orgId}/members/${memberId}/settle`, { method: 'POST' });
}
