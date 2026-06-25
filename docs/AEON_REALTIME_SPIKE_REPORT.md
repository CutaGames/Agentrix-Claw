# Aeon 实时同步 Spike — 评估报告(Go/No-Go)

> spec: `.kiro/specs/agentrix-world/` · Task 0.6 · 状态:**待在 WSL/CI 跑实测后填写结果与决策**
> 本报告是 Phase 0 门禁的产物。在填入实测数据并给出 go/no-go 前,**不得进入大规模房间建造(Phase 1 之后)**。

## 1. 目的与判据

验证 Aeon 实时多人共同在场同步的可行性,把最大新架构风险前置。

**通过判据(全部满足 = go):**
- 20 并发(真人+agent 合计)单房间,位置/状态同步 **p95 端到端延迟 ≤ 300ms**(任意 60s 窗口)。
- 服务器成本在 20 / 100 并发投影下可接受。
- 压测过程不崩(无内存泄漏/句柄耗尽/网关异常退出)。

**任一不满足 = no-go** → 触发异步兜底(Room 降级为非实时共同在场:事件流快照/轮询),并在 `design.md` 记录决策。核心价值闭环本就要求可纯异步完成,no-go 不致命。

## 2. 被测组件(Phase 0 已实现)

| 组件 | 路径 | 说明 |
|---|---|---|
| 同步契约 | `shared/types/aeon-sync.ts` | 跨端单一来源(SSoT),含消息 schema + 常量 |
| `/aeon` 网关 | `backend/src/modules/aeon/realtime/aeon-realtime.gateway.ts` | Socket.IO 命名空间 `/aeon`,JWT 握手,房间 join/leave/move/control/chat/心跳,断线宽限扫描 |
| 在场态服务 | `backend/src/modules/aeon/realtime/room-presence.service.ts` | 内存房间在场态 + 容量 + 心跳 + 全量快照 + 断线收集 |
| Redis adapter | `backend/src/modules/aeon/realtime/aeon-redis.adapter.ts` | 多实例 fan-out(lazy require,REDIS_URL 缺失则单实例降级) |
| 模块注册 | `backend/src/modules/aeon/aeon.module.ts` + `app.module.ts` | 已注册进 AppModule |
| 压测脚本 | `backend/scripts/aeon-spike-loadtest.mjs` | 20 并发 60s 负载 + 回环延迟测量 + 带宽统计 |

## 3. 启用步骤(在 WSL / CI 真实环境)

### 3.1 单实例延迟验证(先做,验证 p95)

```bash
# 后端正常启动(AeonModule 已注册,/aeon 网关随之就绪;单实例无需 Redis)
cd backend && npm run build && pm2 restart agentrix-backend   # 或本地 npm run start:dev

# 准备 20 个测试用户 JWT,写入 tokens.json(JSON 数组)
#   可用现有登录接口或测试签发脚本生成

# 安装 client 依赖(若缺)并跑压测
npm i -D socket.io-client
AEON_WS=https://api.agentrix.top \
AEON_TOKEN_FILE=./tokens.json \
AEON_ROOM=spike-room-1 \
AEON_N=20 AEON_DURATION_S=60 AEON_HZ=10 \
node scripts/aeon-spike-loadtest.mjs
```

### 3.2 多实例 fan-out 验证(再做,验证 Redis adapter)

1. 安装依赖:`npm i ioredis @socket.io/redis-adapter`
2. 在 `backend/src/main.ts` bootstrap 内(创建 app 后、`app.listen` 前)加入:
   ```ts
   const { AeonRedisIoAdapter } = await import('./modules/aeon/realtime/aeon-redis.adapter');
   const aeonAdapter = new AeonRedisIoAdapter(app);
   await aeonAdapter.connectToRedis();   // 读 REDIS_URL
   app.useWebSocketAdapter(aeonAdapter);
   ```
3. 设 `REDIS_URL=redis://...`,起 ≥2 个后端实例(PM2 cluster 或多端口),压测脚本把 20 参与者分散连到不同实例,确认同房广播跨实例可达。

> 注意:`useWebSocketAdapter` 全局生效,会同时影响现有网关(/ws /presence 等)——这是期望行为(它们也借此获得多实例能力)。上线前需回归现有实时功能。

## 4. 实测结果(2026-05-31,生产 nginx `wss://api.agentrix.top/aeon`)

> 实测环境:生产后端 `agentrix-backend`(单实例,PM2),客户端经 nginx 公网 WSS;
> 20 个测试 JWT(服务器 JWT_SECRET 签发),60s,每参与者 10Hz。脚本 `aeon-spike-loadtest.mjs`。
> 注:localhost:3001 直连 socket.io 因全局前缀/重定向不可用(现有 /ws 网关同样如此),
> 故走真实客户端路径(nginx wss),与生产一致。

### 4.1 单实例延迟(20 并发)

| 指标 | 实测 | 目标 | 结果 |
|---|---|---|---|
| 延迟样本数 | 439,337 | — | — |
| 单程延迟 p50 | 11.5 ms | — | — |
| 单程延迟 p95 | **33.5 ms** | ≤ 300ms | **PASS ✅(~9x 余量)** |
| 单程延迟 p99 | 54.5 ms | — | — |
| 每参与者均带宽 | ≈ 90.7 KB/s | — | — |
| 过程是否崩溃 | 否 | 否 | PASS ✅ |

（5 并发预热:p50=3ms / p95=19ms / p99=23ms,亦 PASS。）

### 4.2 成本投影

| 并发 | 带宽投影 | 备注 |
|---|---|---|
| 20 | ≈ 1.8 MB/s | MVP 单房间上限,完全可接受 |
| 100 | ≈ 9 MB/s | 多房间/多实例参考;单实例带宽尚可,CPU/连接数需 100 并发时复测 |

### 4.3 多实例 fan-out

- Redis adapter 挂载:**未在本轮验证**(单实例已满足 MVP 20 并发门禁)。代码就绪
  (`aeon-redis.adapter.ts`),多实例扩展待真实需要(>单实例容量)时按 §3.2 步骤启用 + 复测。

## 5. 传输选型记录

- **首选并已实现:Socket.IO**(复用现有 6 网关的鉴权/房间/重连模式,团队已熟)。
- WebRTC(P2P/SFU)作为对照项**未实现**——MVP 不引入(运维复杂、移动端不稳)。若 Socket.IO 在 100 并发成本不可接受,再评估 SFU。

## 6. Go / No-Go 决策

- **决策:** ✅ **GO**(采用实时轨)
- **依据:** §4 实测 — 20 并发 60s,单程延迟 p95=33.5ms(目标 ≤300ms,约 9 倍余量),
  439k 样本,全程不崩,带宽可接受。生产 nginx 路径已验证 `/aeon` 连接 + JWT 鉴权正常。
- **若 NO-GO 的兜底(本轮未触发):** Room 降级为异步共同在场。该兜底代码路径仍保留
  (移动端 `aeonRealtimeClient` 在 socket.io 不可用时 `isDegraded=true`,场景屏退回 REST 轮询)。
- **决策人 / 日期:** 自动化 spike + 工程判断 / 2026-05-31

## 7. 结论对设计的影响

- GO → Phase 1 房间引擎走 `/aeon` 实时同步;`AeonRoom` 在场态走内存+Redis。
- NO-GO → Phase 1 房间引擎走异步快照;实时同步层保留代码但不启用,待后续优化再评估。
- 无论结果:`shared/types/aeon-sync.ts` 契约保留(异步轨也复用其角色/身份字段)。
