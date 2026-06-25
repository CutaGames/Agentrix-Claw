# Aeon 活动排期/预约 + 并行直播厅(社交场所 Step 3)— 已发并验证 2026-06-02

## 做了什么
在 Step 2 直播厅(单房间 aeon-live-main)之上加"活动"调度层:
- 一场 **Event** = 有主题/时间/主办方的现场活动(脱口秀/分享会/拍卖/演唱会/聚会)。
- **每场活动派生独立实时房间 `aeon-live-<eventId>`** → 天然并行多厅(parallel halls),
  与 StageService 的 `aeon-live-` 前缀识别对齐,多场活动同时进行互不串场。
- **预约(RSVP)**:幂等切换,人数展示 + 开演提醒基础。
- **派生状态**:scheduled / live(开演前 10min ~ 结束/开演后 1h)/ ended / cancelled。
- 活动可选挂 `plotId`/`buildItemId` —— 为"地图建筑点进即活动现场"预留(舞台建筑 stage-dome
  的 linksToKind='stage' 已存在;后续把 event 挂到 buildItem 即闭环)。

## 文件 / 实现
- `shared/types/aeon-world.ts`:AeonEventDto/CreateInput/Kind/Status、AEON_EVENTS 常量、
  `aeonEventRoomId(id)`。
- `backend/.../entities/aeon-event.entity.ts` + `aeon-event-rsvp.entity.ts`(RSVP 唯一 (event,user))。
- `backend/.../event/event.service.ts`:CRUD + toggleRsvp + statusOf 派生 + listUpcoming(时间窗
  Between)+ decorate(批量填 rsvpCount/rsvpedByMe)。liveCount 取自 RoomPresenceService.occupancy。
- `backend/.../event/event.controller.ts`:`v1/aeon/events`(GET 列表/详情、POST 创建/:id/rsvp/:id/cancel)。
- 迁移 `1800400000000-AeonEvents.ts`(aeon_events + aeon_event_rsvps)。**已在 prod RUN**(178→179)。
- aeon.module.ts 注册实体/EventService/EventController。
- 移动端 `src/screens/aeon/AeonEventsScreen.tsx`(新):活动列表 + 预约(乐观)+ live「进入现场」→
  AeonLiveStage(roomId=event.roomId)+ 办活动表单(类型/标题/简介/开场预设)+ 常驻主厅入口。
- `AeonLiveStageScreen` 支持 route.params.roomId/title(每场活动独立厅);默认 aeon-live-main。
- 入口:AeonScene 🎤→AeonEvents、AeonPlaza 顶部横幅→AeonEvents。AeonEvents 路由注册。

## 验证(prod 实测)
- 自包含 events API 冒烟(`.tmp_apk/events-smoke-all.js` 模式;后端机跑):**PASS** —
  create 201 status=live room=aeon-live-<uuid>;list 查到;RSVP 切换 count=1;
  detail rsvpedByMe=true count=1。
- 后端 health=200 / unstable restarts=0 稳定。
- APK CI(Agentrix-Claw,branch build/aeon-events-2026-06-02,run 26806483414):build-apk 进行中
  →需确认 step18/22/23 success(详见后续)。

## commit / branch
- `01899fa41` → origin/feat/multi-agent-v2-1-llm-router-byo。后端已 SSH 部署(pull+build+migrate+restart)。
- APK branch `build/aeon-events-2026-06-02`(主仓 + Claw 镜像)。

## 坑 / 提示
- 跨多个独立 ssh 调用传 JWT 给 curl 会 401(token 在 PowerShell 变量里转义/换行被破坏)。
  正确做法:写一个自包含 node 脚本(读 .env JWT_SECRET 签 token + 直接发 http 请求)scp 上去一次跑完。
- listUpcoming 用 typeorm Between(from,to);from = now - GRACE_LIVE_AFTER_MS 保证刚结束的也短暂可见。

## 三件用户提的方向(本轮只做了 #1,#2/#3 给了评估见 docs/business/WORLD_REALWORLD_FEASIBILITY_2026-06-02.zh-CN.md)
- #1 活动排期/并行厅:DONE(本条)。地图建筑挂活动 = buildItem.linksToKind='stage' + event.buildItemId,接线点已留。
- #2 用户拍照素材成为共建素材:可行,复用现有 world-engine 拍照→3D(ScanController/ReconstructionService/
  Hunyuan3D/Meshy)+ build_items.sourceAssetId 已支持放置自有资产。缺的是"建材语义"(把扫描资产标为
  建筑/家具类目 + 在 AeonBuild 目录里展示用户自有资产)。
- #3 真实高精地图 + 真实商家入驻:地图层已是 MapLibre(可换高精商业瓦片源如 MapTiler/Mapbox),
  plot 已存真实 lat/lng。商家入驻 = 复用现有 merchant/marketplace 模块 + 把 Org/店铺挂到 plot。
  合规闸门(compliance-gate)已在。属中大型工程,评估文档列了分期。
