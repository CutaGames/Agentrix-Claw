/**
 * Cross-Device Presence(跨端 presence)跨端契约 — 移动端、桌面端、后端共用。
 *
 * 对应 soul-companion-onboarding 设计 §7(Requirement 8):同一 Claw_Instance
 * 在不同终端(移动/桌面)的在线/活跃状态,实时同步并对用户可见。
 *
 * 这是**轻量实时在线态**模型(`{ device, online, lastSeen }`),由后端
 * `backend/src/modules/presence/presence.service.ts` 的内存 TTL map 产出、
 * `presence.controller.ts` 返回、移动端 `src/services/presence.service.ts` 与桌面端消费。
 * 后端服务当前就地定义了同形状类型并标注「应迁移到 shared/types」——本文件即该
 * single source of truth(≥2 端使用,按 AGENTS.md 落 `shared/types/`)。
 *
 * NOTE(命名):后端另有一个**持久化设备注册表**实体也叫 `DevicePresence`
 * (`backend/src/entities/device-presence.entity.ts`,字段 userId/deviceId/isOnline),
 * 与本文件是**不同概念**。本文件的 `DevicePresence` 专指 soul-companion 跨端
 * 实时在线快照,故单独成文件、不并入 `agentrix-presence.ts`(后者是 5 端 SSoT 的
 * 另一套 surface/trust 模型)以避免歧义。
 */

/** 终端类型(移动 / 桌面)。设计 §7.1。 */
export type PresenceDevice = 'mobile' | 'desktop';

/**
 * 某实例单个终端的对外在线视图。设计 §7.1:`{ device, online, lastSeen }`。
 * 与后端 `PresenceService.query()` 返回的元素形状一一对应。
 */
export interface DevicePresence {
  device: PresenceDevice;
  /**
   * 是否在线。读取即时叠加心跳 ttl:即便服务端 sweep 尚未跑到,
   * 超时端也呈现为离线(R8.6)。
   */
  online: boolean;
  /** 最近一次心跳的 epoch 毫秒。 */
  lastSeen: number;
}

/**
 * presence 推送 / 查询负载:某实例当前各端在线快照。
 * 后端经现有 WS 通道以 `presence:update` 事件下发(5s 内同步,R8.4),
 * 客户端订阅后据此更新设备列表 UI。
 */
export interface PresenceUpdate {
  userId: string;
  instanceId: string;
  presences: DevicePresence[];
}

/** WS 事件名:presence 状态变化广播。客户端订阅此事件接收 `PresenceUpdate`。 */
export const PRESENCE_UPDATE_EVENT = 'presence:update' as const;

/**
 * 心跳上报请求体:`POST /v1/presence/heartbeat`(设计 §7.2)。
 *   - instanceId:要上报在线的 Claw_Instance。
 *   - device:本端类型(移动端固定 'mobile',桌面端 'desktop')。
 *   - ttlSec:可选心跳有效期(秒);省略走后端默认值(30s)。
 */
export interface PresenceHeartbeatRequest {
  instanceId: string;
  device: PresenceDevice;
  ttlSec?: number;
}

/**
 * 心跳上报 / 查询的响应体。`POST /v1/presence/heartbeat` 与
 * `GET /v1/presence/:instanceId` 均返回此形状:实例 id + 各端在线快照。
 */
export interface PresenceSnapshot {
  instanceId: string;
  presences: DevicePresence[];
}
