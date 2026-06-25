# 基于地理位置的社交玩法 + 高精地图 key 接入(2026-06-03)

## 做了什么
1. **高精地图 key 接入**:`app.json` extra.mapTilerKey = "Zhuyc4mco01wIrd8qd96"。
   `mapStyle.ts` 已有逻辑 → MapLibre 自动用 MapTiler streets-v2 街区级瓦片。**需 EAS rebuild**(APK CI 全 prebuild 会编进去)。
2. **地理社交(基于实时 GPS)**:
   - shared `aeon-world.ts`:AeonNearbyPlot/AeonCheckinResult + AEON_GEO 常量
     (NEARBY_DEFAULT_RADIUS_M=5000、CHECKIN_RADIUS_M=300、CHECKIN_REWARD_AXP=15)+ `haversineMeters()`。
   - 后端 `PlotService.findNearby`(经纬度边界框预筛 → Haversine 精算 → 距离升序,带 distanceM/mine)+
     `checkIn`(实测坐标在地块 300m 内,每地块每用户每天一次,发 aeon_reality_reward 15 AXP via RealityLoop)。
   - `AeonPlotCheckin` 实体 + 迁移 `1800700000000`(aeon_plot_checkins,(plot,user,day) 唯一防刷)。**prod RUN**。
   - `PlotController`:`GET v1/aeon/plots/nearby?lat&lng&radiusM`、`POST v1/aeon/plots/:id/checkin`。
     ⚠️ nearby 字面路由放在 :id 之前。
   - 移动端 `AeonMapScreen`:进屏 `expo-location` 定位 → 地图 centerCoordinate 居中 + 蓝点 me 标记;
     「📍 在我的位置圈地」(就近圈地,真地图 FAB + 列表模式按钮);列表模式「附近的领地」(距离 + 签到按钮)。
     expo-location 已是依赖、app.json 已有 expo-location plugin + ACCESS_FINE_LOCATION 权限。

## 验证(prod 实测 PASS)
`tests/e2e/geo-social.smoke.mjs`:claim 201 → nearby found dist=0 mine=true → checkin reward=15 bridged=true →
第二次 alreadyToday=true reward=0 → **钱包 60→75 delta=15**。即"到访真实地点领地→签到→真 AXP 入账" 闭环成立。

## commit / 部署
- `fb5fa7d56` → origin。后端 SSH 部署(迁移 1800700000000 RUN,build+restart 稳定 health=200)。
- APK branch `build/geo-social-2026-06-03`(主仓+Claw 镜像,CI 触发)。**这个 APK 才会真正用上 MapTiler 街区地图**
  (key 在 app.json,prebuild 编进 native)。装上后地图从 demo 瓦片(国家轮廓)变成街区级。

## 地理社交现在有的玩法链路
圈地(可就近圈/点地图/输坐标)→ 地图 markers 带地主名 + 我的位置蓝点 → 附近的领地(按距离)→
拜访(看地主/留言/私信)→ 进领地(2.5D 场景/建造/公司/活动)→ 到访签到得 AXP。

## 后续可扩
- 国内合规底图(天地图 + GCJ-02 坐标转换),否则国内定位会有偏移。
- "附近的人"(在场玩家按 GPS 聚合,不只地块)。
- 签到连续天数/打卡排行;地块绑真实 POI(商家入驻)。

## 坑
- MapTiler key 放 app.json extra,**不进源码硬编码**;换 key/底图只改配置 + rebuild。
- 地理签到/附近都要实测 GPS;expo-location 权限被拒时静默降级到坐标/列表模式,不阻断。
