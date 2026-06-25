# 永曜城 · 真实世界共建可行性评估(2026-06-02)

针对用户提出的三个方向。#1(活动排期/并行直播厅)已开发上线,本文档评估 #2、#3,
给出"现有能力 / 缺口 / 分期落地"的工程判断,不夸大、不画饼。

---

## #2 用户用现实拍照素材参与共建("自己的餐厅自己准备素材自己建造")

### 结论:可行,且大部分底座已就绪。这是从"摆官方预制件"升级到"真共建"的关键一步。

### 现有能力(已在仓库、可直接复用)
- **拍照 → 3D/2.5D 资产管线已存在**:`backend/src/modules/world-engine/`
  - `ScanController` + `ReconstructionService` + `ProviderRegistry`,Provider:Hunyuan3D / Meshy /
    Tencent-3D,且支持用户 BYO key。
  - "card-before-mesh"策略:先出 2.5D 卡片(便宜、秒级),需要时再升 3D 网格(贵、分钟级)。
  - 产物落 `world_assets`,带封面图/网格 URL/类目。
- **建造系统已支持放置"用户自有资产"**:`AeonBuildItem.sourceAssetId`(非空即放用户 World_Asset),
  `AeonBuildPlacement.sourceAssetId` 已是契约字段。BuildService.place 已处理。
- 审核:`world-engine/services/moderation.service.ts`(NSFW/版权)已在扫描链路上。

### 缺口(要做的增量,不是从零)
1. **"建材"语义**:目前扫描资产默认是"角色/宠物/战斗资产"。需给资产加一个用途标签
   (character / build_material / decor),让餐厅桌椅、招牌、食物模型能被识别为可摆放建材。
   → 加 `world_assets.usage_kind` 列(迁移)+ 扫描时可选"这是用来建造的"。
2. **建造目录里露出"我的素材"**:`AeonBuildScreen` 现在只显示官方 catalog(emoji/预制件)。
   需加一个"我的资产"分页,拉 `world_assets`(usage_kind=build_material)缩略图,点了就以
   sourceAssetId 放置。后端 `listMyBuildableAssets` 接口。
3. **场景渲染用资产贴图**:scene/build 网格目前对 sourceAssetId 项用 📦 占位。需用资产封面图渲染
   (移动端已有 PetSpriteImage/Image 能力,换 source 即可)。
4. **餐厅=功能建筑**:把"餐厅"做成一个 Room kind(已有 venue/market)+ 一栋功能建筑
   (linksToKind='room'),点进去就是用户用自己素材布置的店内场景。这部分骨架已全有,只需接线。

### 成本/风险
- 3D 重建有真实成本(按 provider 计费)。已有方案:默认走便宜的 2.5D 卡片,3D 仅 BYO-key 或订阅用户;
  这条策略已在 world-engine 落地(WORLD_ENGINE_3D_ENABLED gate)。
- 内容审核必须卡在"资产可被他人看到"之前(餐厅是公共可访问的)。moderation 已在扫描链,
  需确保建材类资产也过审。

### 分期建议
- P1(1~2 天):usage_kind 列 + 扫描标记 + AeonBuild"我的素材"分页 + 资产贴图渲染。→ 用户能摆自己拍的东西。
- P2(2~3 天):餐厅/店铺作为功能 Room,点建筑进店内场景;店内可放菜单/商品(接 #3 商家)。

---

## #3 真实高精世界地图 + 真实商家在游戏中开店入驻

### 结论:地图技术可行(换瓦片源即可);"真实商家入驻"是中大型工程,但商业模块底座已存在,适合分期。

### 地图层(技术上最容易)
- 现状:`AeonMapScreen` 已用 **MapLibre**(`@maplibre/maplibre-react-native`),plot 已存真实 `lat/lng`,
  当前用的是免费 demo 瓦片(`demotiles.maplibre.org`,只有国家轮廓)。
- 升级到"能看到城市街区"只需换商业矢量瓦片源:**MapTiler / Mapbox / 天地图(国内合规)**。
  MapLibre 直接吃它们的 style.json,代码改动量小(换 `mapStyle` URL + key)。
- 高精带来的真实问题:
  - **成本**:商业瓦片按调用量计费(MapTiler/Mapbox 有免费额度,上量要付费)。
  - **合规**:中国大陆地图有测绘资质 + 坐标偏移(GCJ-02/火星坐标)要求,落地国内须用合规底图(天地图/高德)
    并做坐标系转换。海外可直接 Mapbox/MapTiler。
  - plot 网格量化(`toGridCell`,现 3 位小数≈110m 街区级)在高精下要调精度,避免"一栋楼一块地"过密。

### 真实商家入驻(商业 + 运营工程)
- 现有底座(可复用,不用重写):
  - **merchant 模块**:`backend/src/modules/merchant/`(MerchantProfile/客户/自动履约/对账/结算规则)。
  - **marketplace / product / order / payment**:完整下单、支付(Stripe/x402/Transak)、佣金、退款链路。
  - **合规闸门**:`aeon/economy/compliance-gate.service.ts` + KYC 模块(开店涉及真钱必过)。
  - **Org 原语**:商家在永曜城就是一个挂在 plot 上的 Org/店铺(功能建筑 linksTo)。
- 缺口:
  1. 商家认领真实坐标的店铺地块(POI → plot 绑定);需防"抢注真实地址"——要认证商家身份(营业执照/POI 归属)。
  2. 店铺 Room 模板(菜单/货架/下单)把 marketplace 商品挂进店内场景。
  3. 线上下单 → 线下履约/核销(已有 merchant 自动履约 + 核销服务可对接)。
  4. 反滥用 + 法务:真实商家 = 真实交易 = 平台责任,需要商户协议、纠纷处理、税务(已有 tax 模块)。

### 分期建议
- P1(0.5 天):换高精瓦片源(海外 MapTiler/Mapbox key),让地图"能看到街区"。先解决"看起来真"。
- P2(国内):接合规底图(天地图)+ 坐标系转换。仅在确定要做国内市场时投入。
- P3(中型):商家认证 + POI→plot 绑定 + 店铺 Room 模板;复用 merchant/marketplace。
- P4(大型):线上下单→线下履约闭环 + 商户协议/纠纷/税务。属正式商业化阶段,需产品+法务+商务一起推。

### 一句话判断
地图"变高精"是小事(换源 + 合规底图);"真实商家真实交易"是把已有商业模块接进世界的中大型工程,
技术上不缺关键件,缺的是认证/合规/履约的运营闭环 —— 适合在核心玩法跑通、有真实用户后再正式投入。
