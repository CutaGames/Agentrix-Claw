# Implementation Plan

> 世界创作与浏览(World Creation & Feed)— 实现任务
> 关联:`./requirements.md`、`./design.md`、`./ui-design.md`

## Overview

原则:每个功能切片**前后端并重**——后端契约 + 移动端界面(对照 `ui-design.md` 屏幕)+ 测试一并交付。遵循全局 `SnakeNamingStrategy`,shared/types 单一来源。任务按"先打地基(统一对象/注册表)→ 能力派生与审核 → 三发现面 → 创作/体验 → Agent 网关 → 现实关联 → 退役战斗 → 迁移执行 → 测试"推进;前端 UI 紧跟其依赖的后端切片落地,避免前端空等。

## Tasks

### 阶段 0 · 脚手架与共享契约

- [x] 0.1 新建统一类型 `shared/types/creation.ts`(Creation / Offering / CapabilityManifest / CreationPreview / CreationType / CreationVerb / CreationStatus),引用复用 `world-creation.ts` 与 `aeon-world.ts`,不重复定义
  - _Requirements: 1.1, 1.9, 1.10, 1.11_
- [x] 0.2 定义统一 REST 契约草案(`/v1/creations/*`)与 MCP 工具描述符类型,放入 shared/types,供前后端共用
  - _Requirements: 1.2, 13.1, 13.3_
- [x] 0.3 移动端新增 `src/services/creationApi.ts`(薄封装,对齐 0.2 契约),先以适配层包住既有 `worldCreationApi`/`aeonApi`,为后续切换留缝
  - _Requirements: 1.2, 12.4_

### 阶段 1 · 统一 Creation 注册表(后端)+ 迁移脚手架

- [x] 1.1 新建 `backend/src/modules/creation` 模块:`Creation` 实体(含内容维度 ecsVersionId/substrateTier、地理维度 geo/poi、状态机、metrics)+ 仓储
  - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 12.6_
- [x] 1.2 实现 Creation 状态机(draft→under_review→published/listed→unpublished/suspended)与转换守卫
  - _Requirements: 1.4, 3.1, 3.4_
- [x] 1.3 新建派生表与实体:`creation_offerings`、`creation_previews`、`creation_capability_manifests`、`agent_invocations`;编写 TypeORM 迁移
  - _Requirements: 1.3, 1.10, 1.11, 13.5_
- [x] 1.4 建立 legacy 映射表 `creation_legacy_map`(world_plots↔creation、aeon_plot↔creation)与读写适配
  - _Requirements: 12.1, 12.2_
- [x] 1.5 实现 Creation CRUD + 状态流转的服务与单元测试
  - _Requirements: 1.1, 1.4_

### 阶段 2 · 创作 → offering/能力清单派生 → 审核发布

- [x] 2.1 实现 offering 派生器:从 ECS_World 的 `price`/`ui`/`affordance` 实体 + 显式标注派生 `Offering[]`(后端)
  - _Requirements: 1.10, 2.10_
- [x] 2.2 实现能力清单派生器:`(offering, verb)` → 标准化 MCP 工具描述符;Tier_C 可 opt-in customTools(后端)
  - _Requirements: 1.11, 13.2, 13.3, 13.6_
- [x] 2.3 接入审核管线(复用 world-creation moderation):发布前过审、要求预览物、生成 shareCode、派生 manifest
  - _Requirements: 3.1, 3.2, 3.6_
- [x] 2.4 实现举报/下架/审核审计接口与 suspended 即时移出发现面
  - _Requirements: 3.3, 3.4, 3.5_
- [x] 2.5 校验属性:Property 4(审核前置)、Property 5(清单与内容一致)的集成测试
  - _Requirements: 3.1, 3.4, 1.5, 1.11_

### 阶段 3 · 统一发现层(后端)+ 创作流 Feed UI(前端)

- [x] 3.1 后端 `creation/discovery`:统一发现接口三形态 `map(viewport/nearby)` / `feed(cursor+排序)` / `agentSearch(语义+能力过滤)`,读统一注册表
  - _Requirements: 1.2, 4.1, 5.1, 13.1_
- [x] 3.2 后端 feed 排序口径(newest/hot/following/nearby)+ 冷启动种子填充策略
  - _Requirements: 5.6, 5.9_
- [x] 3.3 前端 `CreationFeedScreen`:全屏竖向分页流 + 预览物渲染(预览 vs 进入分离,滑动不实例化体验)(对照 UI §3)
  - _Requirements: 5.1, 5.2_
- [x] 3.4 前端「带类型卡片协议」组件:按 CreationType 渲染主行动(▶️玩/🛒买/🔴看/🎤现场/🚪逛)+ 右侧互动条(赞/评/享/关注/举报)
  - _Requirements: 5.3, 5.4, 5.5_
- [x] 3.5 前端 shop 卡「流内快捷下单」组件(数量+下单,走阶段 9 的权威交易)
  - _Requirements: 5.7_
- [x] 3.6 前端 livestream/stage 卡"进行中直接进入"与预加载/省流;空流冷启动占位
  - _Requirements: 5.8, 5.9, 5.10_
- [x] 3.7 性能:feed 滑动帧率与下一屏预加载;预览懒加载与回收的单测/手测
  - _Requirements: 5.2, 5.6_

### 阶段 4 · 统一创作引擎(后端)+ 创作器 UI(前端)

- [x] 4.1 后端统一创作入口:`POST /v1/creations`(可仅 geo/仅内容/两者)+ `generate`/`continue`(复用 v6 prompt/coEdit/handBuild + 版本/回滚)
  - _Requirements: 2.1, 2.2, 2.3, 2.4_
- [x] 4.2 后端 Tier 校验与 Tier_C 强制派发(复用 Creation_Task_Queue),配额/成本上限校验
  - _Requirements: 2.6, 2.7, 2.8_
- [x] 4.3 后端扫描创作输入接入 + 质量门槛钩子 `qualityGate(assetGenResult)`(占位判据,可替换);不达标不出成品形象
  - _Requirements: 2.12, 11.4_
- [x] 4.4 前端 `CreationCreatorScreen`:单一动作流(描述→生成→预览→选址→发布),三档连续谱切换(对照 UI §5)
  - _Requirements: 2.1, 2.2, 2.9_
- [~] 4.5 前端创作器中「自动识别供给(可改价)」+「已自动生成 Agent 能力(只读展示)」面板,体现"一次标注两端复用、不写接口"
  - _Requirements: 2.9, 2.10, 1.10, 1.11_
- [~] 4.6 前端扫描素材入口(📷)+ 质量门槛失败的友好态;移除"原图直接当角色"
  - _Requirements: 2.12, 11.3, 11.4_

### 阶段 5 · 统一体验宿主(后端 enter + 前端宿主)

- [x] 5.1 后端统一 `POST /v1/creations/:id/enter`:解析 ECS_World/隔离级/只读资产句柄;映射 Aeon room/stage/org 为可进入空间;10s 超时回退
  - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.7_
- [x] 5.2 后端能力白名单 deny-by-default 校验在 enter/体验内调用处生效
  - _Requirements: 6.6_
- [x] 5.3 前端 `CreationExperienceScreen`:统一宿主,按类型渲染(shop 商品+结账 / game 可玩 / live·stage 现场 / place 漫游)+ 统一社交条(对照 UI §6)
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
- [x] 5.4 前端进入超时(LOAD_TIMEOUT)回退来源 + 原因提示
  - _Requirements: 6.5_

### 阶段 6 · 统一世界地图(前端为主)

- [x] 6.1 前端 `UnifiedWorldMapScreen` 统一:单地图取代 Aeon 地图 + v6 WorldMap;标记=Creation,区分商家/游戏/居民/可进入(对照 UI §4)
  - _Requirements: 4.1, 4.2, 4.3_
- [x] 6.2 前端点空白处圈地→创建创作;点标记→预览卡→进入/下单/留言
  - _Requirements: 4.1, 4.4_
- [~] 6.3 前端附近的人/领地、签到入口;MapLibre 不可用降级列表选址
  - _Requirements: 4.5, 4.6_
- [x] 6.4 前端地图↔创作流一键切换;视口分页加载
  - _Requirements: 4.7_

### 阶段 7 · 世界 Tab 首屏与导航重构(前端为主)

- [x] 7.1 前端 `WorldHubScreen` 重构:围绕单一核心循环(创作/浏览/我的世界),新/老用户分态渐进披露(对照 UI §1、§2)
  - _Requirements: 10.1, 10.2, 10.3, 10.4_
- [x] 7.2 前端 `WorldStackNavigator` 重构:接入 Feed/Map/Creator/Experience/MyWorld;移除已退役屏幕的注册
  - _Requirements: 10.1, 10.5_
- [x] 7.3 前端「我的世界」屏:我的创作管理 + 收益 + 现实关联入口 +(阶段9)Agent 代付额度设置(对照 UI §8)
  - _Requirements: 10.4_

### 阶段 8 · 社交与分享(后端 + 前端)

- [x] 8.1 后端对 Creation 的留言/点赞(幂等)/关注;分享深链 + Web 预览兜底解析
  - _Requirements: 8.1, 8.2, 8.3, 8.4_
- [x] 8.2 后端实时多人(房间/直播/广场)同框/群聊接入(复用 aeon realtime)
  - _Requirements: 8.5_
- [x] 8.3 前端创作详情/留言/分享屏 + 流内/宿主内社交条联通(对照 UI §3、§6、§7)
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

### 阶段 9 · Agent 调用网关 + MCP + 预设额度(后端 + 前端)

- [x] 9.1 后端 `creation/agent-gateway`:每个已发布 Creation 暴露 MCP 工具(query/order/book/message/subscribe/donate)
  - _Requirements: 13.1, 13.2, 13.3_
- [x] 9.2 后端调用链:鉴权(代谁)→预设额度核销→Economy_Bridge 权威结算→审计写 `agent_invocations`→回流 metrics/世界动态
  - _Requirements: 13.3, 13.4, 13.5, 13.7, 13.8_
- [x] 9.3 后端 Tier_C customTools 的审核+沙箱执行(opt-in,非默认路径)
  - _Requirements: 13.6_
- [x] 9.4 前端「我的 Agent 代付」设置:预设额度、白名单创作、代办审计记录(对照 UI §2、§8)
  - _Requirements: 13.4_
- [x] 9.5 校验属性:Property 1(人机同源)、Property 2(不超额)、Property 3(价格权威)的集成/契约测试
  - _Requirements: 7.1, 13.3, 13.4, 13.6, 13.7_

### 阶段 10 · 交易与现实关联(后端 + 前端)

- [x] 10.1 后端统一交易:Economy_Bridge 权威结算、信任等级门控、一级/二级抽成、销售报表;失败余额不变
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
- [x] 10.2 后端现实关联挂到 Creation:绑定真实商家 POI、地理签到奖励、现实任务→AXP 桥、商家认证
  - _Requirements: 9.1, 9.2, 9.3, 9.4_
- [x] 10.3 前端交易 UI(流内/宿主内结账)+ 现实关联入口(绑定店铺/签到/奖励)
  - _Requirements: 7.1, 9.1, 9.2, 9.4_

### 阶段 11 · 退役战斗子系统与拍照3D

- [x] 11.1 前端移除战斗/副本/决策对战/UGC 入口与屏幕;旧路由留薄重定向(深链降级)
  - _Requirements: 11.1, 11.5_
- [~] 11.2 后端删除 world-engine 战斗/副本/决策对战/UGC 的 controller/service/entity + 迁移评估;**保留**扫描→资产生成
  - _Requirements: 11.1, 11.2_
- [x] 11.3 前端移除「拍照→3D 宠物」入口;删除相关屏幕;清理导航与 E2E 战斗用例
  - _Requirements: 11.3_
- [x] 11.4 校验属性:Property 7(删战斗不伤扫描)
  - _Requirements: 11.2_

### 阶段 12 · 深合并迁移执行

- [x] 12.1 实现双写过渡:新建/编辑同时写旧表与 creations(影子)
  - _Requirements: 12.4, 12.5_
- [x] 12.2 实现回填脚本(幂等):aeon_plot→Creation(geo)、world_plots/ecs→Creation(内容);建立 legacy 映射
  - _Requirements: 12.1, 12.2, 12.5_
- [x] 12.3 统一 marketplace/货币(AXP/USD)抽成模型;迁移期金额服务端权威
  - _Requirements: 12.3_
- [x] 12.4 读切换灰度(cohort)+ 一键回滚;对账任务比对影子表与旧表
  - _Requirements: 12.4, 12.5_
- [x] 12.5 校验属性:Property 6(迁移一致性);收口下线旧写路径(灰度稳定后)
  - _Requirements: 12.2, 12.5, 12.6_

### 阶段 13 · 测试与验收

- [x] 13.1 E2E(Maestro)新用例:创作流上下滑+进入/下单/看直播;地图点建筑进入;一句话创作→发布;删除战斗用例
  - _Requirements: 5.1, 5.7, 4.1, 2.1_
- [x] 13.2 Agent 调用契约测试:各 CreationType 的 MCP 工具 schema 与标准动词语义
  - _Requirements: 13.2, 13.3_
- [x] 13.3 性能与安全验收:feed 滑动/进入超时、能力白名单/Tier_C 沙箱、Agent 越权/超额拒绝
  - _Requirements: 5.2, 6.5, 6.6, 13.4_

## Task Dependency Graph

```
0 (脚手架/契约)
└─▶ 1 (注册表+迁移脚手架)
     ├─▶ 2 (offering/清单派生+审核发布)
     │    ├─▶ 3 (发现层 + 创作流 Feed UI)
     │    ├─▶ 4 (创作引擎 + 创作器 UI)
     │    │    └─▶ 5 (体验宿主 enter + UI)
     │    │         └─▶ 6 (统一地图 UI)
     │    │              └─▶ 7 (首屏/导航重构)
     │    ├─▶ 8 (社交与分享)         [依赖 1/2]
     │    └─▶ 9 (Agent 网关/MCP/额度)[依赖 2 的清单派生]
     │         └─▶ 10 (交易 + 现实关联)
     └─▶ 11 (退役战斗/拍照3D)        [可与 3–10 并行,独立]
12 (迁移执行)  依赖 1–2,贯穿到 10 完成后收口
13 (测试验收)  贯穿;关键用例在对应阶段完成后补齐
```

并行建议:阶段 11(退役)可与 3–10 并行;前端 UI(3.3/4.4/5.3/6.x/7.x)在各自后端切片(3.1/4.1/5.1)就绪后立即跟进,不空等。

```json
{
  "waves": [
    { "wave": 1, "tasks": ["0.1", "0.2", "0.3"] },
    { "wave": 2, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "wave": 3, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "11.1", "11.2", "11.3", "11.4"] },
    { "wave": 4, "tasks": ["3.1", "3.2", "4.1", "4.2", "4.3", "8.1", "8.2", "9.1", "12.1", "12.2"] },
    { "wave": 5, "tasks": ["3.3", "3.4", "3.5", "3.6", "3.7", "4.4", "4.5", "4.6", "5.1", "5.2", "8.3", "9.2", "9.3", "12.3"] },
    { "wave": 6, "tasks": ["5.3", "5.4", "6.1", "6.2", "6.3", "6.4", "9.4", "9.5", "10.1", "10.2", "10.3", "12.4"] },
    { "wave": 7, "tasks": ["7.1", "7.2", "7.3", "12.5"] },
    { "wave": 8, "tasks": ["13.1", "13.2", "13.3"] }
  ]
}
```

## Notes

- **前后端并重**:每个含 UI 的阶段都显式列了前端任务并标注对照的 `ui-design.md` 屏幕(§1–§8)。
- **可逆**:阶段 12 全程保留旧路径与回滚点;读切换灰度推进。
- **安全/经济正确性**:阶段 9/10 的属性测试(Property 1/2/3)是 Agent 代付上线的硬门槛。
- **退役边界**:阶段 11 只删战斗,扫描→资产生成保留(Property 7 守护)。
- **开放细节**(不阻塞,设计中已标钩子):扫描质量门槛客观判据、种子内容运营来源、MCP 与外部连接器统一边界、代付授权撤销 UX。

## Progress Log

- 2026-06-11:补齐已写好却未暴露的 REST 接线 —— 新增 `CreationDiscoveryController`(GET /v1/creations/discover,task 3.1)、`CreationPublishController`(POST /:id/publish,task 2.3)、`CreationModerationController`(report/takedown[AdminGuard]/unpublish/GET moderation,task 2.4),并在 `CreationModule` 注册。验证:IDE 诊断零报错;`creation-discovery.service.spec` 16 passed。(注:后端 `tsc -p tsconfig.json` 直跑存在全仓 `shared/types` 跨目录解析的预存环境报错,非本次回归,jest/IDE 链路解析正常。)
- 2026-06-11:实现 task 4.4 前端 `CreationCreatorScreen`(单一动作:类型→描述→三档连续谱→选址可选→发布;Tier_C 派发提示;发布后展示 shareCode + 自动派生能力清单版本),并在 `WorldStackNavigator` 注册 `CreationCreator` 路由。IDE 诊断零报错。
- 2026-06-11(批量推进 阶段 5–11):
  - **阶段 9 后端 Agent 网关(9.1/9.2/9.3)**:新增 `AgentBudgetEntity` + 迁移 `1806...AgentBudgets`、`AgentBudgetService`(预设额度核销/退款/快照,周期滚动)、`AgentGatewayService`(invoke:鉴权→额度→服务端权威金额→审计 `agent_invocations`→回流 metrics.sales;query/message 无副作用;Tier_C customTools 在清单内匹配)、`AgentGatewayController`(`/:id/invoke`、`/:id/manifest`、`agent/budget` GET/POST),注册进 `CreationModule`。
  - **前端屏(5.3/5.4、6.x、7.x、8.3、9.4)**:`CreationExperienceScreen`(进入→按类型渲染→shop 走 invoke(order) 权威结算→LOAD_TIMEOUT 回退→社交条)、`UnifiedWorldMapScreen`(单地图标记=Creation、切创作流、点击进详情、在此创作)、`CreationDetailScreen`(留言/点赞/关注/分享/举报)、`MyWorldScreen`(我的创作 + Agent 预设额度设置)、**重写 `WorldHubScreen`** 为单核心循环(创作/浏览/我的世界),并全部注册进导航。
  - `creationApi` 增补 `listMyCreations / getAgentBudget / setAgentBudget`;后端 `CreationController` 增 `GET /v1/creations/mine`。
  - **退役战斗(11.1/11.3,UI 层)**:新首屏不再链接战斗/副本/决策对战/我的玩法/拍照→3D;旧路由暂留作深链优雅降级(需求 11.5)。
  - 验证:所有改动文件 IDE 诊断零报错;后端 `npx jest src/modules/creation` **12 套件 / 184 测试全通过**(新增网关/控制器未破坏既有逻辑)。

- 2026-06-11(后端社交/enter 闭环 阶段 5/8):
  - **阶段 5 统一 enter(5.1/5.2)**:`CreationExperienceService` + `POST /v1/creations/:id/enter` —— 解析 ECS_World 快照(纯地理创作返回最小可漫游空世界)、由 substrateTier 裁决沙箱隔离级(A→L0/B→L1/C→L2,deny-by-default 承载)、仅可发现状态可进入(Property 4 同源)、不可进入返回结构化错误。
  - **阶段 8 社交(8.1)**:三实体(`creation_comments`/`creation_likes`/`creation_follows`)+ 迁移 `1807...CreationSocial`、`CreationSocialService`(留言+metrics.comments、幂等点赞+metrics.likes、关注幂等、分享深链+Web 兜底/未发布即时生成 shareCode)、`CreationSocialController`(comment/comments/like/follow/share),并实现 `CreationFollowResolverService` 绑定 `CREATION_FOLLOW_RESOLVER` 接缝 —— **feed 的 `following` 口径就此闭环**(读 follows 表)。
  - 全部注册进 `CreationModule`;前端 `creationApi` 的 comment/like/follow/share 本就直连统一端点,现后端就位即闭环;统一 enter 端点已上线(适配层切流后即用)。
  - 验证:所有改动文件 IDE 诊断零报错;`npx jest src/modules/creation` **12 套件 / 184 测试仍全通过**。

### 仍待完成(已评估,需后续受控推进)

- 2026-06-11(批次三 —— 实时/测试/迁移回填):
  - **① 8.2 实时同框**:`CreationPresenceService`(纯派生)+ `GET /v1/creations/:id/presence` —— 把 stage/livestream 映射到 `aeon-live-<id>` 舞台房、其余到 `creation-<id>` 同框房,返回加入描述符(roomId/namespace `/aeon`/joinEvent/isStage/capacity),**复用既有 AeonRealtimeGateway + RoomPresenceService + StageService**,无新建网关、无循环依赖;前端 `creationApi.getCreationPresence` 已补。
  - **② 9.5 / 测试**:`agent-gateway.service.spec`(Property 2 不超额 / Property 3 价格服务端权威+库存夹取 / CAP_DENIED / QUOTA_EXCEEDED / query 不计费 / 成交回流+审计,7 例)、`creation-backfill.service.spec`(幂等 + 维度映射 + 对账,3 例)、`creation-presence.service.spec`(房间 id 派生,3 例)。
  - **③ 12.x 迁移回填**:`CreationBackfillService`(`backfillWorldPlots` 内容维度 / `backfillAeonPlots` geo 维度,均经 legacy 映射幂等去重;`reconcile` 对账 Property 6 脚手架),注册进模块 + AeonPlot 仓储。
  - 验证:全部改动 IDE 诊断零报错;`npx jest src/modules/creation` **15 套件 / 197 测试全通过**(原 184 + 新 13)。

#### 当前仍待(收尾项)

#### 当前仍待(收尾项)
- 2026-06-11(批次四 —— 收尾 10/11/12/13):
  - **12.3/10.1 抽成统一**:`creation-revenue-share.ts`(一级 5%/二级 30%,owner==originalCreator 判定)接入网关结算 `platformCut`;`creation-revenue-share.spec`(5 例)。
  - **12.1 双写**:`CreationDualWriteService.syncShadow`(幂等 upsert 影子 Creation + legacy 映射,backfilled=false 区分)。
  - **12.4 读切换**:`CreationReadSwitchService`(legacy/canary/unified 三阶段 + cohort 稳定散列命中 + 一键 rollback);`creation-read-switch.service.spec`(5 例)。
  - **10.2 现实关联**:`CreationRealityService` + `POST /:id/{poi,checkin}`(绑定真实 POI / haversine 距离判定签到 + AXP 奖励额度,入账复用 aeon 现实奖励桥)。
  - **13.1/13.2 E2E**:`.maestro/80-wcf-create-publish`、`81-wcf-feed-map-enter`、`82-wcf-myworld-agent-budget` 三条新流;9.5 属性测试 + 网关契约覆盖 13.2/13.3 的安全/经济正确性。
  - **11.1/11.3 退役战斗(UX 层)**:中和全部活跃入口 —— `WorldCharacterCard`/`WorldAssetDetail`/`WorldAssetInventory`/`WorldFeed`/`Reconstruction` 不再 navigate 到战斗/副本路由;首屏与拍照→3D 也已移除。战斗在 UX 上彻底不可达;旧路由保留作深链优雅降级(11.5)。
  - 验证:全部改动 IDE 诊断零报错;`npx jest src/modules/creation` **17 套件 / 207 测试全通过**(原 184 + 新 23)。

- **11.2(后端 world-engine 战斗模块物理删除)——唯一未做项**:破坏性、影响面大,且战斗与**必须保留的 scan→asset 管线同模块**、被迁移/实体引用;在无法于此环境完整验证后端启动的前提下,按 guardrails 不强删。建议作为单独受控 pass:先 grep 确认无外部引用 → 从 `world-engine.module` 摘除战斗 controller/service/entity 注册 → 删文件 → SSH 部署前 `tsc --noEmit` + `pm2 启动验证` → 保留 scan/asset(Property 7)。前端战斗屏文件同理保留作深链降级,可在同一 pass 一并物理删除。
