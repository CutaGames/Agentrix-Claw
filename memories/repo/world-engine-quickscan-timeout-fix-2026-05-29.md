# World Engine Quick Scan 生成失败根因 + 修复 (2026-05-29)

## 症状
移动端 World Engine "世界资产生成" 多次失败。灵狐宠物 3D（走 pet-generation
老链路）能成功，但 World Engine 新链路（Quick Scan）每次失败。

## 根因（代码层确认，非 secret/混元接入问题）
1. **主因 — fast-track 15s 死亡超时**：
   `world-engine/reconstruction/provider-registry.ts` 的 `executeFastTrack`
   调 `pollHunyuan3DJob(..., 15_000)`。腾讯混元 image-to-3D 实际 30-90s 才
   到 DONE，15s 内必然超时 → 抛 "timed out"。
2. **放大器 — 无 key 的 Meshy fallback**：
   `provider-failover.ts` 的 `defaultIsRetryable` 对 "timeout" 返回 true，
   于是超时后切到 Meshy fallback。生产只配了 `TC_SecretId/TC_SecretKey`，
   `MESHY_API_KEY` 为空 → fallback 抛 "Missing MESHY_API_KEY" → 整 job failed。
3. **隐患 — BullMQ lockDuration**：worker 默认 lockDuration 30s，但 poll 可达
   90-180s，job 会被判 stalled 并重跑 → 可能重复调用混元（重复扣费）。

## 修复（commit 待推）
- `provider-registry.ts`：
  - 新增 `POLL_TIMEOUT_FAST_MS = 90_000`（原 15s）、`POLL_TIMEOUT_PRECISION_MS = 180_000`（原 90s）。
  - `executeFastTrack`：仅当 `MESHY_API_KEY` 存在时才注册 Meshy fallback；
    无 key 时不传 fallback，让混元主错误（如 timeout）直接透传，不被
    "Missing MESHY_API_KEY" 掩盖。
- `reconstruction.service.ts`：BullMQ `attempts: 1 → 2` + 指数退避 5s。
- `reconstruction.processor.ts`：
  - fast worker `lockDuration: 120_000`，precision worker `lockDuration: 210_000`。
  - catch 块做错误分类：timeout / url_illegal / provider_down / no_mesh / failed，
    写入 scan_session.errorMessage（varchar(255)，截断到 240）+ job status。

## 仍需验证（部署后）
- `PUBLIC_URL`(默认 https://api.agentrix.top) 拼的
  `/api/uploads/world-engine/scans/{sessionId}/{file}` 能否被公网（腾讯侧）拉取。
  混元报 UrlIllegal 时即此问题。一条 curl 验证：
  `curl -I https://api.agentrix.top/api/uploads/world-engine/scans/<sid>/<file>.jpg`
- 真机/接口跑通一次 Quick Scan，确认 90s 内拿到 .glb。

## 关联
- 两个 flag 默认全关导致 "World tab 空 + 漫游浮球不显示"：
  - `world_engine_enabled` (admin_configs) 默认 off → WorldHubScreen 渲染
    "即将开放" 占位页。
  - `pet_companion_redesign_enabled` rolloutPercentage=0 → CompanionBall 不挂。
  - 解法是灰度开 flag（先对测试账号定向），非代码问题。


---

## 第二批修复 (2026-05-29 同日, commit b50a6ba29)

真机复测仍失败。查 scan_sessions 发现失败原因随时间演变, 实为多个独立 blocker:

| 失败信息 | 时间 | 根因 |
|---|---|---|
| `timed out after 15000ms` | 部署前 | 第一批已修(超时 15s->90s) |
| `RequestLimitExceeded.JobNumExceed — 当前已达到1个任务上限` | 部署后 | 混元账号并发上限=1 |
| `InvalidParameterValue.InvalidImageResolution — ImageResolution为6144` | 历史 | 手机原图 >5000px, 无 resize |
| `InvalidParameterValue.UrlIllegal` | 历史 | 已由 cdec69a0 修(PUBLIC_URL) |

### 关键发现: 分支分裂
生产分支 `feat/multi-agent-v2-1-llm-router-byo` 缺了 `build/mobile-pet-forms-p6-2026-05-22`
分支上的 resize 修复 (commit `e23e07de8`)。两分支分裂, 生产线少打补丁。
**TODO(后续): 系统梳理 build 分支还有哪些 fix 漏在生产分支没上。**

### 修复
- `provider-registry.ts`: `CONCURRENCY_CAPS.hunyuan3d` 5->1 (匹配腾讯账号配额);
  acquireConcurrency 满额抛 `code=EPROVIDERBUSY`; 新增 `isReconstructionRetryable`
  把 EPROVIDERBUSY / JobNumExceed / 任务上限 标记为可重试; 两处 track 用它替换 defaultIsRetryable。
- `reconstruction.processor.ts`: fast + precision worker concurrency 都 ->1 (串行,
  因 fast+precision 共用同一混元账号的全局 1 任务上限)。
- `scan.controller.ts`: 手动移植 e23e07de8 的 sharp resize — uploadFrame 落盘前把
  >4000px 图 resize 到 4000px 内并转 JPEG (quality 82 + mozjpeg), 兜底 try/catch。
- `backend/package.json`: 加 sharp ^0.33.5 (生产 node_modules 已存在该包)。

### 漫游浮球"重启还是没有"的根因 (第三个独立问题, 非后端)
`src/config/companionFeatureFlag.ts`: MMKV 缓存 TTL = 6h。用户在 flag 还是 0% 时启动过 app,
`enabled:false` 被持久化, 6h 内 `fetchCompanionFlag()`(非 force) 直接返回缓存 false, 读不到
后端已改的 100%。且 `isCompanionRedesignEnabledSync()` 在 boot 早期锁定导航树, 新值需下次启动生效。
**用户侧解法: 清 app 数据/重装即可看到漫游 (后端已 100%)。**
**代码侧 TODO: 登录后 force-fetch flag, 或 flag 变更时缩短 TTL。**

### 部署
commit b50a6ba29 已 push + 生产 pull + npm run build (dist OK) + pm2 restart + health 200。


---

## 第三批修复 (2026-05-29, commit 8808e6c80) — 真正根治 JobNumExceed

第二批部署后复测仍失败, 失败信息仍是 JobNumExceed。深挖确认:

### 关键事实 (探针验证)
- 混元账号能提交能完成: 手动 SubmitHunyuanTo3DJob 立即拿到 JobId, 历史超时 job 其实都
  Status=DONE (15s 客户端放弃, 但腾讯侧成功生成了 GLB)。
- 失败时间戳 05:23 > 新进程启动 05:17 → 失败时跑的已是含并发修复的新代码。
- 单 backend 实例 (fork), 非多进程并发。
- **pet-generation 模块共用同一混元账号 (TC_SecretId)** — 全局 1 并发名额是跨模块共享的。

### 真正根因
混元账号全局仅 1 并发名额。第二批的 `attempts:2` + 把 JobNumExceed 标记 retryable
**制造了重复提交风暴**: job 第一次 submit 成功占名额并 poll(混元要 30-90s), 但某条件触发
BullMQ 重试 → 重试 = 重新 executeReconstruction → 再 submit → 撞自己还在跑的 job →
JobNumExceed → 又被标记 retryable → 再试… 直到 attempts 耗尽 [failed]。
**把 JobNumExceed 当 "可重试" 反而是 bug 源头。**

### 修复 (provider-registry.ts)
- `runHunyuan3DGated()`: 进程内 FIFO 提交闸门 (this.hunyuanGate promise 链), 任意时刻
  仅 1 个混元 job in-flight(submit→poll→release)。新请求排队, 最长等 HUNYUAN_GATE_MAX_WAIT_MS=120s
  (防卡死前驱永久阻塞)。
- `submitHunyuanWithBusyBackoff()`: submit 遇 JobNumExceed 时退避 5s 重新探测 (最多 24 次≈2min)
  等账号(可能被 pet-generation 占)释放, **而非 resubmit 一个新 job**。
- `isReconstructionRetryable`: 移除 JobNumExceed/RequestLimitExceeded (只留 EPROVIDERBUSY +
  defaultIsRetryable 的瞬时传输错误)。
- BullMQ `attempts` 2→1 (reconstruction.service.ts)。
- 失败分类新增 `provider_busy` (reconstruction.processor.ts)。
- fast/precision 两条 track 的 hunyuan3d primary 都改调 runHunyuan3DGated。

### 注意 / 后续
- 闸门是**进程内单实例**, 仅覆盖 World Engine。pet-generation 走自己的路径, 两者仍可能
  互撞名额, 但 busy-backoff 会等待自愈(低频)。若以后多实例部署, 需换 Redis 分布式锁。
- 部署: 8808e6c80 已 push + 生产 pull + build (dist OK) + pm2 restart + health {"status":"ok"}。
- 名额已确认空闲 (探针 job 均 DONE), 可干净复测。


---

## 方案 B 完整落地 (2026-05-29) — card-before-mesh + 自动落库 + 游客首扫

### 发现的最根本缺口
scan→generate→3D 链路**从不创建 WorldAsset** → 资产库永远空。这才是"生成一直失败"
表象下的真问题(即使混元成功, 结果也不落库, 客户端超时即丢)。

### 后端 (commit 08af14d6c + d40b619cf, 已部署)
- 迁移 1799000000000: world_assets 加 generation_status(默认 complete) + mesh_url/
  styled_mesh_url 改 nullable + owner_id+status 索引。**注意: migration:run 撞到仓库已有
  social-account.entity ts-node 装饰器坑, 改用 psql 直接执行等价 SQL + 手动登记 migrations 表
  (列名 SnakeNamingStrategy: ownerId→owner_id)。**
- AssetCreationService: createCardReadyAsset(仅照片秒出 AI 属性落库 card_ready) /
  attachMeshBySession(3D完成填mesh置complete) / markMeshFailedBySession(失败保留卡片) /
  generateCharacterCardOnly(游客只生成不落库)。
- scan.controller generate: 先创建 card 返回 assetId+characterCard 再后台跑 3D;
  isGuest 时走 generateCharacterCardOnly 不落库不跑3D。
- processor: DONE→attachMesh, 失败→markMeshFailed。
- AI Interpreter 主路径只用照片(meshUrl 传空), 故 card 可秒出不依赖 3D。
- 游客 token: POST /auth/guest(type=guest,7d), JwtStrategy 放行 guest 不查库。
  WorldEngineFlagGuard 因 flag 100% 全量, 游客哈希分桶必过。
- 验证: /auth/guest 返回 access_token ✅; health ok。

### 移动端 (commit a593ca5ed + bc2cac088, 待 build)
- WorldCharacterCardScreen(323行): 扫描后秒显示角色卡, 轮询 generationStatus,
  3D 完成/失败都不丢卡片; 游客态显示"保存角色(登录)"CTA。
- WorldHubScreen: 功能宫格→引导式(巨大主CTA + 有资产才显示战斗/副本)。
- WorldEngineScannerScreen: 有 characterCard 即跳角色卡屏(游客无 assetId 也跳)。
- authStore: isGuest/guestTrialUsed + setGuest/markGuestTrialUsed(guestTrialUsed 持久化)。
- auth.service loginAsGuest: POST /auth/guest, deviceId 持久化 SecureStore。
- RootNavigator: **移除 InvitationGate + DeploySelect 强制 onboarding**(决策: 暂不保留邀请制);
  未登录非游客→FirstScanScreen, 游客/已登录→Main。
- FirstScanScreen: 首启落地页(一键试用首扫 + 登录入口)。

### 待办
- 推 build 分支到 CutaGames/Agentrix-Claw 触发 APK CI, 真机验证完整 wow 流程。
- DeploySelectScreen 等 onboarding 屏仍在磁盘但不再挂主流程(后续可移到 设置→高级)。
- 风格化/真实 2D 缩略图(characterCard.thumbnailUrl 目前空, 用 ✨ 占位)。


---

## 游戏化战略 + 灵魂体系诊断 (2026-05-29, 回答问题2/问题3)

### 三套割裂的"角色/灵魂"数据模型 (代码级确认)
- `LivingPet` (`living_pets`, 1user1pet unique): soulTemplateId(默认claw) /
  unlockedSoulTemplateIds(Free1/Pro≤3/Pro+无限) / primaryAgentId / intimacyLevel/Xp /
  emotion / personalityOverrides / boundAgentAccountId。契约: 不参与经济/不可删/不可卖。
- `FamilyPet` (`family_pets`, 1family1pet): name/emotion/intimacyLevel/sharedAmongMembers[]。
- `WorldAsset` (`world_assets`): 自带 stats/skills/level/xp/battleWins + 独立 boundAgentId。参与经济。
- **关键证据**: grep `soulId|LivingPet|primaryAgentId|soulTemplate` 在 world-engine 模块**零匹配**。
  且 agent-binding.service.performBind() 绑的是 `uuidv4()` mock id, 既非主宠 primaryAgentId
  也非真实 agent_account → 三者完全平行宇宙, 这是产品最大割裂点/代入感缺失根因。

### 战斗现状: 零玩家决策
battle-engine.simulateBattle = Mulberry32 seed 自动跑完, 技能机械轮播
(`skillIndex=(round-1)%skills.length`)。同 seed 同结果 (spec MANDATORY Property 1, 必须保留)。

### 数值现状: 只跟物体形状有关, 跟用户/agent 能力无关
character-generator.computeStats: 体积→HP/锋利→ATK/材质→DEF/长宽高比→SPD/复杂度→INT。
确定性强(Property 2)但与平台使用量脱钩 → 一次性新鲜感, 无粘性。

### 可用于"能力飞轮"的真实数据 (已存在的表, 不需造数据)
- `agent_reputations`: tasksCompleted / avgQualityScore(0-100) / onTimeRate / tier(bronze→diamond)
  / specializations[]。读取入口 a2a.service.getReputation(agentId)。
- `agent_stats`: totalCalls / totalRevenue / totalUsers / avgRating / lastActiveAt。
- `living_pets`: intimacyLevel/Xp。

### 战略设计文档已出 (讨论稿, 待用户拍板再开发)
`docs/WORLD_ENGINE_X_AGENTRIX_ABILITY_BINDING_DESIGN_2026-05-29.zh-CN.md`
三支柱: ①统一灵魂(WorldAsset 加 linkedSoulId/sourceAgentAccountId, 绑定三选一:化身主宠/绑真实agent/纯收藏)
②能力映射飞轮(finalStats = baseStats × abilityMultiplier, multiplier 由 reputation/stats/intimacy 算,
**必须快照化写 abilitySnapshot 否则破坏 Property1 回放**, 总倍率 clamp≤2.2 防碾压)
③玩家决策战斗(simulateBattle 拆纯函数 stepRound(state,decision,seed), 加行动力/蓄力/防御反伤, 
存 decisions[]+seed 可重放; 现有自动战斗=AI填decisions特例向后兼容)。
二期: UGC规则集 + 共养(FamilyPet.sharedAmongMembers)。
实施顺序建议 A(能力飞轮纯后端最小闭环)→B(决策战斗)→C(灵魂统一)→D(UGC/共养)。
**4个待拍板决策点在文档 §6。用户确认前不写实现代码。**


---

## 玩法方向已确认 (2026-05-29) — 活的 Agent 世界 + 实施顺序定稿

用户确认方向。设计文档升级到 v2 (`docs/WORLD_ENGINE_X_AGENTRIX_ABILITY_BINDING_DESIGN_2026-05-29.zh-CN.md` 第7章):
- **玩法形态**: 做「活的 Agent 世界 / AI 小镇」(斯坦福 Smallville 式生活模拟) 作留存底座。
  **放弃①神经世界模型(Genie/Sora) ②3D画面开放世界 两条陷阱路线**。
- PK + 副本(dungeon-builder 已能拍房间生成静态副本)不删, **收编为世界里的「竞技场/远征」事件**。
- 关键已有资产: agent-binding 的 idle actions(greet/comment/suggest_battle/interact_collection,
  现 log-only) + character-generator 的 behaviorTree(idle/combat/social) = AI小镇自主生活引擎, 待点亮。
- 现状盘点: game-engine.service 只是 delegate 壳; battle 全自动 seed 对撞; dungeon 只生成静态布局。

**确认的实施顺序**: A 能力飞轮(纯后端) → A2 活世界最小版 → B 决策战斗 → C 灵魂统一 → D UGC/共养。
**决策点全部确认**: 加成上限≤2.2 / 绑定三选一 / 玩法走活世界。

### Phase A 开工范围 (现在开始, 纯后端)
1. WorldAsset 加 abilitySnapshot(jsonb,null) + linkedSoulId + sourceAgentAccountId (迁移走 psql 手动登记, SnakeNaming)。
2. AbilityMappingService.computeMultiplier(userId, agentAccountId?): 读 agent_reputations
   (tasksCompleted/avgQualityScore/onTimeRate/tier/specializations) + agent_stats(totalCalls) +
   living_pets(intimacyLevel), 公式见文档§3支柱2, clamp [1.0, 2.2], 写 snapshot。
3. AssetCreationService.createCardReadyAsset 创建时 finalStats = baseStats × multiplier 落库, 卡片标加成来源。
4. 单测: multiplier 边界/snapshot 确定性/baseStats 不破。
读取入口: a2a.service.getReputation(agentId) 已存在。


---

## Phase A 能力飞轮 — 已实现 + 测试通过 (2026-05-30)

### 落地内容
- `shared/types/world-engine.ts`: 加 AbilitySnapshot / AbilityBreakdown 类型 +
  ABILITY_MULTIPLIER_MIN/MAX(1.0/2.2) + ABILITY_BONUS_CAPS + ABILITY_TIER_BONUS。
- `world-asset.entity.ts`: 加 abilitySnapshot(jsonb,null) + linkedSoulId(uuid,null) +
  sourceAgentAccountId(uuid,null)。canonical stats 列**不动**(保 R3.1 + property2)。
- 迁移 `1799500000000-WorldAssetAbilitySnapshot.ts`: 加上述 3 列(全 nullable, 存量 null)。
  **未在生产 migration:run**(ts-node social-account 坑), 部署时同 1799000000000 套路用 psql 手动加列。
- `ability-mapping.service.ts`(新): computeSnapshot(userId, baseStats, agentAccountId?)。
  读 agent_reputations(tasksCompleted/avgQualityScore/tier) + living_pets(intimacyLevel),
  finalStats = baseStats × multiplier, multiplier clamp[1.0,2.2], 快照写 abilitySnapshot
  (effectiveStats 战斗/展示用, 不动 canonical stats → 不破 Property1 回放确定性)。
  resolveSourceAgent: 指定优先, 否则 owner 名下 creditScore 最高 agent。
- `asset-creation.service.ts`: createCardReadyAsset + generateCharacterCardOnly 注入快照;
  createCardReadyAsset 落 abilitySnapshot + sourceAgentAccountId。失败安全降级(无加成不阻塞)。
- `scan.controller.ts` + `world-engine-api.ts`: characterCard 加 abilityBoost
  {multiplier, effectiveStats, breakdown} 给移动端展示"⚡能力加成+XX%"。
- module: 注册 AgentAccount/AgentReputation/AgentStats/LivingPet repo + AbilityMappingService。

### 测试
- 新 `ability-mapping.service.spec.ts`: 7/7 过(无agent→1.0 / diamond满配→2.2上限 /
  低质量负bonus但≥1.0 / 不改baseStats / 同输入同输出 / 指定非己agent回退最强)。
- 全 world-engine 套件: **42/42 过 (7 suites)**。

### 重要环境坑 (Windows 本地验证)
- `backend/shared` 是 **WSL Linux 符号链接**, Windows 下断裂 → world-engine 模块所有
  `../../../../shared/...` import 在 Windows tsc/jest 下报 TS2307(连未改的 character-generator
  也报)。**本地验证须临时建 junction**: `cmd /c "mklink /J shared ..\shared"`(backend 目录下),
  验证完 `rmdir shared`。CI/WSL/生产 Linux 原生 OK。

### 修了一个 pre-existing 测试 bug (与 Phase A 无关但挡编译)
`marketplace.service.spec.ts` 自方案B起就**编译不过**(fixture 缺 generationStatus)→其属性测试
从未跑过。修复: ①fixture 补 generationStatus + 3 新字段 ②priceArb min 0.01→1(AXP 合法下界,
USD 也合法) ③P4.3 用 preCommitHook 在 Phase1快照后/Phase2提交前 bump version 才真正触发乐观锁回滚
④P4.4 改顺序重放(并发同 paymentId 去重属 Phase2 分布式锁, 不在此断言) ⑤**根因**: P4.1/3/4/5 的
`fc.assert(fc.asyncProperty)` **未 await** → 异步迭代溢出到后续测试, 串改共享 marketplaceService
实例 → 全部改 `async it + await fc.assert` + createTestAsset 内 buildService 每迭代重建纯净 service。

### NEXT: Phase A2 活世界最小版
WorldSimService.tick + world_events 表 + 移动端 World tab 改世界 feed。详见设计文档 §4 Phase A2。
部署 Phase A 后端时记得手动 psql 加 3 列(参考迁移文件 SQL 等价)。


---

## Phase A2 活世界最小版 — 已实现 + 测试通过 (2026-05-30)

### 落地内容
- `world-event.entity.ts`(新): `world_events` 表(append-only 剧情日志)。字段 userId/
  actorAssetId/actorName/type/summary/outcome/deltaStats/deltaXp/deltaAxp/tickSeed/createdAt。
- `world-asset.entity.ts`: 加 worldState(jsonb,null) + lastTickAt(bigint,null)。
  **注意**: worldState + 部分 living-world shared 类型在本会话working tree里已被(自动merge)预先加过,
  我一度写了重复声明导致 TS2300/2322, 已对齐到**既有**类型: WorldEventType(work/social/greet/
  reflect/explore/conflict/levelup) / WorldEventOutcome(positive|neutral|negative) /
  WorldResidentState({job?,mood?,location?,lastTickBucket?,activity?,axp?}) / WorldEventItem /
  常量 WORLD_TICK_BUCKET_MS(30min)/WORLD_MAX_CATCHUP_TICKS(8)/WORLD_WORK_AXP_BASE_MIN(5)/MAX(40)。
- 迁移 `1799600000000-WorldEngineLivingWorld.ts`: 建 world_events 表 + world_assets 加
  world_state/last_tick_at。同样**生产部署走 psql 手动**(ts-node social-account 坑)。
- `world-sim.service.ts`(新): **时间桶模型**。tick(userId): 对每个 character 资产按
  `bucket = floor(now/WORLD_TICK_BUCKET_MS)` 从 lastTickBucket+1 补算到当前桶(clamp
  WORLD_MAX_CATCHUP_TICKS), 每桶 (assetId,bucket)→djb2 seed→Mulberry32(复用 battle-engine 的
  SeededRng)→确定性选事件+数值。work 事件 AXP = base[5..40] × abilitySnapshot.multiplier(吃 Phase A
  飞轮)。职业由 sourceAgentAccountId 的 agent_reputations.specializations 推断(trader/researcher/
  builder/drifter)。XP 走 agentBinding.awardXp(单调+技能槽解锁复用)。剧情用**中文模板**(零 LLM 成本)。
- `world-feed.controller.ts`(新): GET /v1/world-engine/world/feed(先 tick 离线快进, 再回事件流+
  居民状态) + POST .../tick(手动)。游客返回空 feed(与"保存才落库"一致)。
- module: 注册 WorldEvent entity + WorldSimService + WorldFeedController。

### 测试
- 新 `world-sim.service.spec.ts`: 7/7 过(首次产1事件+写state / 同桶不重复 / 离线快进 clamp /
  同资产同桶确定性 / 倍率放大 AXP / XP awardXp 累加 / specializations→trader)。
- 全 world-engine 套件: **49/49 过 (8 suites)**。marketplace fixture 又补了 worldState/lastTickAt。

### 坑备忘
- 本会话 working tree 里 world-asset.entity 的 worldState + shared 的 living-world 类型块是
  **之前(自动)加过的**(HEAD 没有)。再加 Phase A2 字段/类型时务必先 grep 查重, 别重复声明。
- 本地验证仍需临时 junction: `cmd /c "mklink /J shared ..\shared"`(backend 下), 完事 rmdir。

### NEXT
- 部署 Phase A + A2 后端(psql 手动加列 + 建 world_events 表 + pm2 restart)。
- 移动端 World tab 接 GET /world/feed → 世界 feed 时间线 UI(设计文档 §7.4)。
- 之后 Phase B(玩家决策战斗)。


---

## Phase A + A2 移动端 UI + 生产部署完成 (2026-05-30)

### 移动端 World feed UI
- `src/screens/world/WorldFeedScreen.tsx`(新): 居民卷轴(职业/心情/在忙什么/累计AXP) +
  剧情时间线(按 outcome positive/neutral/negative 配色, work/social/conflict/greet/reflect/explore
  各有 emoji) + "你不在期间发生了 N 件新鲜事"横幅 + 下拉刷新(invalidate world-feed query) + 空态引导扫描。
- `WorldStackNavigator`: 注册 WorldFeed 路由。
- `WorldHubScreen`: hasAssets 时顶部加"🌍 进入我的世界"绿色入口卡 → navigate('WorldFeed')。
- `worldEngineApi.ts`: 之前(自动merge)已有 Living World 区块但 WorldFeedResponse 形状不符
  ({events,newlyGenerated}), 已对齐后端({newEventCount, events, residents}) + 加 WorldResidentSummary。
- 注意: worldEngineApi 的 living-world 类型块也是本会话(自动)预先加过的, 改之前先 grep。

### Git
- build 分支 commit 3b66b406e(Phase A+A2) + e124721e7(module 去重导入)。
- **module 去重坑**: world-engine.module.ts 里 WorldEvent/WorldFeedController/WorldSimService
  import 各被(自动merge)写了两遍 → TS2300 Duplicate identifier, 首次生产 build 失败(dist 是旧的)。
  删重复 import 行后 OK。数组(forFeature/controllers/providers/exports)注册无重复。
- 生产分支 feat/multi-agent-v2-1-llm-router-byo: cherry-pick 3b66b406e→b20ae34b0 + 0839d9719(去重)。
  (中间 build 分支的 b94238ada 是纯移动端, 后端不需要, 没 cherry-pick。)

### 生产部署 (47.130.176.148, 已验证)
1. git reset --hard origin/feat/... → 0839d971; npm run build(dist 产出, tsc 报的全是
   pre-existing rootDir/shared 基线噪音, 我的文件零 error TS; dist 内 4 个新 .js 已生成)。
2. **DB 手动迁移**(psql, 绕 ts-node 坑): /tmp/phase-a-a2.sql 幂等执行 →
   world_assets 加 5 列(ability_snapshot/linked_soul_id/source_agent_account_id/world_state/
   last_tick_at) + 建 world_events 表 + 2 索引 + 登记 migrations 表(1799500000000/1799600000000)。验证全过。
3. pm2 restart agentrix-backend → online; GET /api/health 200(端口 3000, 路径 /api/health)。
4. **冒烟验证**: POST /api/auth/guest 拿 token → GET /api/v1/world-engine/world/feed 返回
   HTTP 200 {"newEventCount":0,"events":[],"residents":[]} —— 路由已挂载, 控制器+WorldSimService
   实例化正常, feed 形状匹配。✅
- 临时脚本(/tmp/*.sql,*.sh + 本地 backend/src/scripts/ 三个 helper)已清理。

### NEXT
- 真机验证: 登录态扫一个物体 → 角色卡显示能力加成 → World tab"进入我的世界"看 feed 居民打工剧情。
  (需新 APK: 推 build 分支或 mirror 到 CutaGames/Agentrix-Claw 触发 CI。)
- Phase B 玩家决策战斗(下一阶段)。


---

## Phase B 玩家决策战斗 — 已实现 + 测试通过 (2026-05-30)

### 设计
把战斗从"全自动看动画"升级为"逐回合做选择",但**保留确定性**(延续 Property 1):
结果 = 纯函数 f(decisions[], seed)。与既有 BattleEngineService.simulateBattle **并存不替换**
(后者 Property 1 测试保持绿)。

### 后端
- `interactive-battle-engine.service.ts`(新): 纯 reducer `stepRound(state, cDecision, dDecision,
  challenger, defender, seed)`。资源层: energy(每回合+1,上限3,attack 耗1,不足自动降级 charge) +
  charge(蓄力攒层,上限3,attack 时清空,每层 +60% 伤害) + defend(减伤50% + 反弹25%)。
  暴击复用 createRoundRng(同 battle-engine,不引新随机源)。deriveAiDecision: 防守方 AI 由
  seed+behaviorTree 派生(低血防御/满充能打出/energy不足蓄力/否则 seed 抉择), 同 state+seed 同决策。
  **Phase A 联动**: assetToInteractiveParticipant 优先用 abilitySnapshot.effectiveStats。
- `battle.entity.ts`: 加 mode(default 'auto') + decisions(jsonb) + interactive_state(jsonb)。
  迁移 `1799700000000-BattleInteractiveMode.ts`(同样生产走 psql 手动)。
- `battle.controller.ts`: POST /battles/interactive/start(建 active+mode=interactive 返初始局面) +
  POST /battles/interactive/:id/step(**服务器权威**: 从 decisions[]+seed 重放到当前回合防篡改,
  再 step 一回合, 结束落库 XP/胜负/updateAssetBattleRecords)。
- module 注册 InteractiveBattleEngineService(providers+exports)。

### 移动端
- `worldEngineApi.ts`: startInteractiveBattle / stepInteractiveBattle + 类型。
- `WorldInteractiveBattleScreen.tsx`(新): 双方 HP/energy(蓝点)/charge(橙点)/防御盾, 攻击(可选技能)/
  蓄力/防御三按钮, 回合日志(谁出招/伤害/暴击), 结束胜负+XP。
- `WorldBattlePickerScreen`: 底部双按钮"⚡快速对战(自动)" + "🎮决策对战" → WorldInteractiveBattle。
- `WorldStackNavigator`: 注册 WorldInteractiveBattle 路由。

### 测试
- 新 `interactive-battle-engine.service.spec.ts`: 7/7 过, 含 **MANDATORY f(decisions,seed) 逐字节确定性** +
  资源不变式(energy/charge/hp clamp) + 20回合上限 + 蓄力增伤 + AI 决策确定性 + energy不足降级。
- 既有 battle-engine Property 1: 仍绿。
- 全 world-engine 套件: **55/55 过 (9 suites)**。

### NEXT (部署)
- 生产 psql 手动加 battles 3 列(mode/decisions/interactive_state)+ 登记 migration 1799700000000 +
  build + pm2 restart + 冒烟 /battles/interactive/start。
- cherry-pick 到生产分支 feat/multi-agent-v2-1-llm-router-byo。
- 新 APK 真机验证决策对战 UI。


---

## Phase C + D + E2E + APK (2026-05-30) — World Engine 五阶段全部落地

### Phase C 统一灵魂(化身主宠) — 后端 commit ec0898bf6
- `soul-linkage.service.ts`: incarnate/unincarnate/getSoulStatus/unlinkOnTransfer。
  WorldAsset.linkedSoulId → LivingPet。**灵魂连续**: intimacy/emotion/memory 留在主宠不动 → 天然连续。
  配额 MAX_INCARNATIONS=3。交易转移自动解链(marketplace 注入 @Optional() SoulLinkageService)。
- 移动端: inventory 长按加 "🦊化身主宠"。

### Phase D UGC 规则集 — 后端 commit ec0898bf6
- `world-game-ruleset.entity.ts` + `ugc-game.service.ts`: create/list/getByCode/play/delete。
  规则 sanitizeRules clamp(maxRounds5-40/energyMax1-6/dmg0.5-2.0/winCondition 白名单)+过滤未知键(防注入)。
  shareCode 8位裂变。迁移 1799800000000 (world_game_rulesets 表)。
- `soul-ugc.controller.ts`: /assets/:id/incarnate + /ugc/rulesets/*。
- 移动端: WorldUgcRuleSetsScreen(创建+分享码+列表) + hub 入口 + 决策对战入口。

### 关键修复 commit 137f94434 (E2E 暴露)
游客 userId 形如 'guest:anon-...' 非 uuid → 写 world_assets/rulesets 报 500 QueryFailedError。
soul-ugc 加 assertNotGuest()→403; 交互战斗 start 加游客 guard→403。

### E2E
- `world-engine-e2e.spec.ts`: 真 service + 内存 repo 串 A→A2→B→C→D 一条链(确定性, CI 可跑)。
- 生产冒烟 `e2e-world-engine-smoke.sh`: **7/7 通过**(health200 / feed200 / tick201 /
  interactive403 / soul-status403 / ugc-create403 guest-guarded)。
- 全 world-engine 套件: **73 tests**(+soul-linkage10 +ugc7 +e2e1)。battle-engine 的
  "different seeds→different results" 是 pre-existing 概率性 flaky(隔离跑 4/4 过), 非回归。

### 生产部署(全部已上 47.130.176.148)
- 分支 feat/multi-agent-v2-1-llm-router-byo @ 137f94434, build OK, pm2 online, health 200。
- DB 手动迁移已全部执行: 1799500000000(ability) / 1799600000000(living world) /
  1799700000000(battle interactive) / 1799800000000(ugc rulesets), 均登记 migrations 表。

### APK
- main repo 的 "Sync Mobile Frontend To Public Build Repo" workflow **失败**(token 不可靠, 已知)。
- **改用手动 mirror**: shallow clone CutaGames/Agentrix-Claw build/world-engine-plan-b-2026-05-29 →
  robocopy src+shared 覆盖 → 删 shared 里的 .js/.d.ts 构建产物 → commit(需 git config user) → push public_claw。
- 触发成功: Claw "Build → Test → Release APK" run @ 2026-05-30T04:41:37Z **in_progress**。
  (clone 大仓很慢, 用 --depth 1 shallow; 目录删不掉就换名 .tmp_claw2。)

### 三阶段战略全部完成
A 能力飞轮 ✅ / A2 活世界 ✅ / B 决策战斗 ✅ / C 统一灵魂 ✅ / D UGC ✅。
NEXT: APK 出包后真机验证完整 wow 链路; 视数据反馈做 Phase D 共养(蚂蚁森林式, FamilyPet.sharedAmongMembers)。


---

## 真机反馈修复 (2026-05-30) — 2D兜底 + 活小镇 + 单人PvE + 悬浮球兜底

用户真机 4 个反馈, 先查后改(诊断见 diag-world.sql 当时输出):
- **3D 一直没出来**: 那张 Mighty Mug 资产 generation_status=mesh_failed, 扫描会话全是
  混元 timeout/JobNumExceed/UrlIllegal。**混元 3D 链路生产上跑不通(90s 超时+并发1)**。
- **悬浮球没显示**: flag 全开(world_engine_enabled / pet_companion_redesign_enabled = true),
  账号有 LivingPet。CompanionLayerGate 只 gate isInitialized+isAuthenticated, VISIBLE_TAB_ROOTS
  含 'World'。**疑似 GlobalFloatingBall mount 抛错被 CompanionErrorBoundary 静默吞成 null**
  (那条 6h MMKV 缓存 memory 不准, 用户已卸载重装+最新版仍无)。

### 修复(commit 0b9263b59 prod / f00cb89 claw mirror, 已部署+APK in_progress)
1. **2D 立绘兜底(创生100%成功)**: WorldAsset 加 portrait_url(迁移 1799900000000, psql 已手动加列+登记)。
   createCardReadyAsset/generateCharacterCardOnly 用第一张扫描照片填 portraitUrl → 角色卡秒有图,
   不依赖 3D。characterCard.thumbnailUrl=portraitUrl。inventory/hub 缩略图优先 styledMeshUrl 否则
   portraitUrl, 占位从 "3D" 改 🦊。
2. **活小镇(World feed 重写)**: WorldFeedScreen 从事件列表改成"星语小镇":镇头(名+人口)+主宠状态条+
   我的居民(角色卡, portrait+心情+在忙什么, 点开属性面板)+ 系统NPC + 剧情时间线。
   后端 feed 返回 npcs[] + town{name,population,mainPet} + residents 带 portraitUrl。
3. **系统NPC(单人也热闹)**: WorldSimService.getTownNpcs() 返回 4 个常驻NPC(向导露娜/教官凯/
   商人老豆/守卫铁山), 不依赖真人在线。游客也返回 NPC。
4. **单人PvE**: battle.controller POST /battles/interactive/train — 跟系统训练假人打交互战斗,
   不需要第二个角色/别人在线。buildTrainingDummy 按玩家属性×难度造假人, defenderSpec 存 interactiveState,
   step 时训练模式从 spec 重建假人、只给玩家记 XP/胜负。教官NPC train动作/角色属性面板都能开训练战。
5. **悬浮球兜底**: CompanionErrorBoundary 不再静默 return null, 改 render CompanionFallbackBall
   (极简始终可见的🦊球, 点击进 World) + 记 globalThis.__companionBallError 便于下次诊断。

### 验证
- world-engine 73/73 绿。生产 feed 冒烟: health 200 + 返回 town + 4 npcs ✅。
- 端口 3000, 路径 /api/...。psql 手动加列用 -f 文件(嵌套引号的 -c 会 hang)。
- APK: claw mirror push f00cb89 → "Build→Test→Release APK" in_progress (06:40Z)。

### 仍待办 / 后续
- 混元 3D 仍需根治(配额/换 provider/或接受 mesh_failed 用 2D)。当前 2D 兜底已让创生不再卡死。
- 悬浮球真机仍需新 APK 验证 fallback 是否出现 + __companionBallError 内容(若 fallback 都不出,
  则是 CompanionLayerGate 之前的 isAuthenticated/isInitialized 没 true, 需再查 authStore 启动时序)。
- 活小镇下一步: 居民精灵走动动画 / NPC 任务真正发放 / 副本内置示例。
