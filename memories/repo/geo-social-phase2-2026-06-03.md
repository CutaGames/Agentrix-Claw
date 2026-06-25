# 地理社交 Phase 2:国内合规底图 + 附近的人 + 签到连续/排行 + 商家POI入驻(2026-06-03)

## 做了什么(4 项,全 prod 验证)
### 1. 国内合规底图(天地图 + GCJ-02 坐标转换)
- shared `aeon-world.ts`:`wgs84ToGcj02` / `gcj02ToWgs84`(中国境外原样返回)。
- `src/config/mapStyle.ts`:支持 `extra.tiandituKey` → 构造天地图 raster style(vec_w + cva_w 注记两层,GCJ-02);
  优先级 tiandituKey > mapStyleUrl > mapTilerKey > demo。新增 `resolveMapStyle()`(可返回内联 style 对象)、
  `mapBaseIsGcj02()`。AeonMap 渲染时 `toBase()` 把 GPS(WGS84)→GCJ02 投影;点选(GCJ02)→WGS84 存库。
  → 配 tiandituKey 后国内地图不再有数百米偏移。**当前 app.json 用 mapTilerKey(全球 WGS84);要国内合规改填 tiandituKey。**

### 2. 附近的人(在场玩家按 GPS 聚合)
- `GeoPresenceService`(内存,TTL 5min,sweep):report/clear/nearby。隐私:nearby 只返回**距离**不返回精确坐标。
- `PlotService.reportAndFindPeople`(上报+查一次往返)/`clearPresence`。
- `POST plots/nearby-people`(上报我的位置+查附近在线玩家,排除自己)、`POST plots/presence/clear`(退出清除)。
- AeonMap 进屏上报 + 顶部"附近 N 人在线"条 + 列表"附近的人"卡片;退屏 useEffect cleanup 调 clearGeoPresence。
- **两用户实测:A 上报、B 上报同点 → A 在 nearby-people 看到 B(A_sees_B=true)。**

### 3. 签到连续天数 + 打卡排行
- `checkIn` 算 `computeStreakDays`(全局连续签到日,从今天往前逐日查 aeon_plot_checkins,断了即停,最多 60 天)+
  连续加成(每多一天 +5 AXP,封顶 50);返回 streakDays。
- `checkinLeaderboard(days,limit)`:GROUP BY user 的签到次数/distinct 地块数 + 每人 streak;`GET plots/checkin/leaderboard`。
- AeonMap「🏆 打卡榜」(真地图 FAB 左下 + 列表模式 banner)→ Modal 列榜(🥇🥈🥉 + 次数·地块·连续天数)。

### 4. 商家 POI 入驻(地块绑真实店铺)
- `aeon_plots.poi` jsonb 列 + 迁移 `1800800000000`(prod RUN)。`AeonPlotPoi` 类型。
- `PlotService.bindPoi`(仅 owner,记 name/category/address/merchantUserId,verified=false 待审)。`POST plots/:id/poi`。
- markers/nearby DTO 带 poiName/poiCategory;AeonMap 商家用 🏪 橙色标记(pinShop)区分居民地。
- AeonPlotVisit:owner 看到「🏪 入驻商家/编辑店铺」→ Modal(店名/类目/地址);owner 卡显示 🏪 店名。

## 验证(prod PASS)
- `tests/e2e/geo-social-2.smoke.mjs`(两用户):A_sees_B=true、poi 冒烟小馆 + marker.poiName、streak=1、leaderboard≥1。
- 之前 `geo-social.smoke.mjs`(claim/nearby/checkin+AXP)仍 PASS。
- 后端迁移 1800800000000 RUN,health=200 稳定。

## commit / 部署
- `cce23916f`(主体)+ `2327f50ea`(test)→ origin。后端 SSH 部署(迁移 RUN + build + restart)。
- APK branch `build/geo-social-2-2026-06-03`(主仓+Claw 镜像)。

## 坑 / 提示
- NestJS POST 默认返回 **201** 不是 200(冒烟断言别写死 200)。
- nearby-people 是内存态,重启清空、多实例需 Redis fan-out(后续)。
- 天地图 token 申请:console.tianditu.gov.cn;要国内合规把 app.json extra.mapTilerKey 换成 tiandituKey。
- PowerShell 内联 node -e 带 ||/=>/{} 必被破坏 → 写文件 scp 跑;require('axios') 需 .default。
