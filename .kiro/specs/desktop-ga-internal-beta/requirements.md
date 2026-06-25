# Desktop GA Sprint G-3 — Internal Beta Requirements

> 把桌面端从 v0.2.0 候选打磨到 GA (`v1.0.0`) 的最后一公里。
> 输入：[../desktop-go-live/requirements.md](../desktop-go-live/requirements.md) 已完成；现在 v0.2.0 在生产，3 个 endpoint 在线，崩溃 / 遥测后端就绪。
> 周期：2026-05-20 → 2026-06-02（约 10 工作日）
> 决策日：2026-05-16
> GA 触发线（同 G-2 锁定）：崩溃率 < 0.5 % / DAU、自动更新成功率 > 95 %、首跑路径 P0 = 0、内测 7 天稳定。

---

## 1. 范围

**Sprint G-3 要做的事**：
1. 内测 100 人的招募 + 分发 + 数据观测
2. 崩溃 / 遥测数据可视化看板（运营自助）
3. VRM 真实资产实装（CDN 上传 .vrm 文件）
4. Windows 代码签名（择一方案）
5. 自动更新灰度上线（v0.2.0 → v0.2.1 OTA 验证）
6. 用户手册 + FAQ + 安装动画

**不在 G-3 范围**：
- 公开发布（v1.0.0）→ G-4
- 微软商店上架 → G-4
- macOS / Linux build → 取决于内测反馈

---

## 2. 用户故事

### US-G3-1：内测招募 + 分发渠道
**作为**产品团队，**我想**通过 Telegram 群 / 官网下载页 / 邀请码三种方式分发 v0.2.0，**以便**在 7 天内拉到 100 个真实用户跑通安装-登录-首次对话路径。

**验收标准：**
- WHEN v0.2.0 setup.exe 上传到 `agentrix.top/downloads/desktop/` THEN 官网新增 `/download` 路径，提供下载按钮 + SmartScreen 引导截图
- WHEN 用户点击下载 THEN 系统 SHALL 记录一条 `desktop_download_initiated` 后端事件（带 utm 参数 / referrer）
- WHEN 7 天后 THEN 后端 `agentrix_desktop.analytics_events` 表里 `desktop_launch` 去重 device_id_hash 数 SHALL ≥ 100（衡量真实安装数）
- WHEN 用户在群里反馈安装问题 THEN 标准 FAQ 单条问题平均响应时间 < 30 分钟（运营保证）
- 验证方式：
  - 下载页打开率 / 点击率（GA 或自建埋点）
  - `agentrix_desktop.crash_records` 按 `app_version='0.2.0'` 聚合
  - `agentrix_desktop.analytics_events` 按 device_id_hash 去重计数

### US-G3-2：运营自助数据看板
**作为**产品团队，**我想**有一个内部页面 `/admin/desktop` 看到崩溃 / 留存 / 漏斗 / 自动更新成功率，**以便**判断是否达到 GA 触发线。

**验收标准：**
- WHEN 管理员访问 `/admin/desktop`（登录 + admin 角色）THEN 系统 SHALL 显示：
  - **崩溃看板**：过去 7 天 / 24 小时崩溃次数（按 app_version 分桶 + 按 fingerprint Top 10）
  - **留存漏斗**：launch → login → onboarding_complete → first_chat 的转化率
  - **自动更新指标**：每日 update check 数 / 实际下载数 / 安装成功数 / 失败原因 Top 5
  - **DAU 估算**：基于 device_id_hash 去重的活跃设备数
- WHEN 数据有趋势变化 THEN 系统 SHALL 显示 `↑/↓` 箭头 + 7 天对比百分比
- WHEN 崩溃率 ≥ 0.5 % THEN 看板顶部 SHALL 高亮红色告警
- 后端：新增 `/api/v1/admin/desktop/dashboard` 聚合接口
- 前端：在现有 web `frontend/` 项目下新增 `/admin/desktop` 页面（复用已有 admin 框架）
- 验证方式：把 v0.2.0 任意 device 的崩溃 / 事件灌进 DB，看板 30s 内反映

### US-G3-3：VRM 资产实装
**作为**最终用户，**我想**首次启动看到真实立体的 3D 灵狐而不是 PNG 图片，**以便**桌面端的卖点（"立体感觉"）能被验证。

**验收标准：**
- WHEN 用户的设备 GPU tier ≥ `vrm-low` (mid GPU) THEN 默认状态 SHALL 加载 `https://agentrix.top/assets/pets/kitsune-default.vrm`
- WHEN 用户切换 Pro 模式 THEN URL 切换到 `kitsune-pro.vrm`，平滑过渡（无空帧）
- WHEN 用户切换 Agent Economy THEN URL 切换到 `kitsune-economy.vrm`
- WHEN VRM 文件 404 / 网络异常 THEN 系统 SHALL 自动降级 PetCanvas PNG（已实装）
- WHEN 用户的 GPU tier 是 `rive-only`（低端机）THEN 跳过 VRM 直接渲染 PNG（已实装）
- VRM 文件源：用 VRoid Studio / glb-to-vrm 工具把 `deliverables/pets_v2/kitsune-{C,pro,economy}.glb` 转换；如时间不够，先把 .glb 文件以 .vrm URL 形式提供，PetVRM 已支持 .glb fallback
- VRM 文件大小目标：每个 < 5 MB（移动端流量友好）
- 验证方式：
  - DevTools Network 看到 `kitsune-*.vrm` 请求 200
  - 切换 Pro 模式时 VRM 加载时间 < 2s
  - 触发情绪 → BlendShape 生效（happy 时灵狐微笑）

### US-G3-4：Windows 代码签名（终于做了）
**作为**最终用户，**我想**双击安装包不会被红色 SmartScreen 拦截，**以便**有信任感地完成安装。

**验收标准：**
- WHEN v0.2.1+ 的安装包被签名 THEN `signtool verify /pa setup.exe` SHALL 返回 0
- WHEN Windows 11 用户首次双击 THEN SmartScreen SHALL 通过或显示蓝色 "More info"（而非红色拦截）
- WHEN 在 100 台测试设备上分发 THEN 红色拦截率 SHALL < 30 %（首次发版预期 SmartScreen 名声需要积累，目标降到 G-4 < 10 %）
- 选型决策：
  - **方案 A** Azure Trusted Signing — $9.99/月，Microsoft 直接背书，仅 Windows
  - **方案 B** EV 代码签名证书（DigiCert）— $300-500/年，硬件 token，跨平台
  - 推荐：先 Azure，6 个月后视效果决定是否买 EV
- CI 集成：GitHub Actions `build-desktop.yml` 增加签名 step（secrets：`AZURE_SIGNING_KEY` 或 `EV_CERT_PFX_BASE64`）
- 验证方式：
  - 文件属性 → "数字签名" 标签页显示发行者
  - 在 5 台干净 Windows 11 上手测拦截率

### US-G3-5：自动更新灰度上线
**作为**已安装 v0.2.0 用户，**我想**收到 v0.2.1 的更新提示并平滑升级，**以便**验证自动更新链路真的可用。

**验收标准：**
- WHEN 我们发布 v0.2.1（修 G-2 内测 P0/P1 bug）THEN 通过 INSERT 到 `agentrix_desktop.releases` 表 + `rollout_percent = 10` 启动 10% 灰度
- WHEN 灰度 3 天稳定（崩溃率不升 + 安装成功率 > 90%）THEN UPDATE `rollout_percent = 100` 全量
- WHEN 用户已在 v0.2.1 THEN GET update endpoint SHALL 返回 204
- WHEN 用户在 v0.2.0 但 hash 不在 10% 桶 THEN GET update SHALL 返回 204（不显示通知）
- WHEN 用户在 v0.2.0 且 hash 在 10% 桶 THEN GET update SHALL 返回 manifest，前端通知 + 下载 + 安装 + 重启全流程
- WHEN 安装失败 THEN 用户 SHALL 看到错误 toast，但 v0.2.0 仍可用（不能砖机）
- 灰度发布运行手册（runbook）放在 `docs/RUNBOOK_AUTO_UPDATE_ROLLOUT.zh-CN.md`
- 验证方式：
  - 内部测试机（10 台）打 hash 标签验证 10% 桶
  - 监控 `desktop_update_available` / `desktop_update_installed` / `desktop_update_failed` 三个事件
  - 7 天后 `installed / available > 90 %` 视为成功

### US-G3-6：用户手册 v2
**作为**新装机用户，**我想**有一份图文并茂的用户手册解释每个 UI 元素和功能，**以便**不用问群也能上手。

**验收标准：**
- WHEN 文档发布 THEN `docs/USER_MANUAL_DESKTOP_V4.zh-CN.md` SHALL 涵盖：
  - 安装 + SmartScreen 引导
  - 首次启动 / 登录 / Onboarding
  - 浮球（萌态/专家态/商人态）+ 右键 12 个菜单项
  - Pro Mode 标题栏 18+ 按钮
  - 输入区（语音 / 附件 / Tier 切换 / Mode 切换）
  - 25 个可打开面板（衣柜 / 灵魂 / Creator / Memory / Wiki / MCP …）
  - 9 个全局快捷键
  - 隐私设置（遥测 opt-in）
  - 自动更新流程
  - FAQ + 故障排除
- WHEN 文档大于 30 KB THEN 拆分多个章节文件 + 主入口 README
- 长截图 / 标注图 至少 30 张（下个 sprint 让设计师补）
- 文档先写文字版本 + 占位 `[图片：xxx]`
- 验证方式：
  - 让 3 个内测用户读文档自助安装 + 上手，无需问问题
  - 收集"读文档没解决"的问题列表，回流到 FAQ

### US-G3-7：FAQ + 故障排除
**作为**遇到问题的用户，**我想**有一份 FAQ 直接搜索我的问题，**以便**不用等运营回复。

**验收标准：**
- WHEN FAQ 发布 THEN `docs/FAQ_DESKTOP.zh-CN.md` 至少包含 20 条常见问题：
  - 安装类：SmartScreen / 杀毒拦截 / 安装路径
  - 启动类：黑屏 / 卡 splash / 网络问题
  - 登录类：邮箱 OTP 收不到 / 钱包连不上
  - 浮球类：被遮挡 / 拖到屏幕外 / 多显示器问题
  - 对话类：模型选错 / 流式中断 / 工具卡住
  - 萌宠类：3D 加载失败 / 切换无反应
  - 经济类：AXP 不增加 / 余额不显示
  - 自动更新类：下载失败 / 安装失败
  - 隐私类：怎么关遥测 / 怎么删数据
- WHEN 用户问的问题不在 FAQ THEN 运营 SHALL 24h 内补充新条目
- 验证方式：FAQ markdown 渲染成功 + 锚点链接可用

### US-G3-8：内测 7 天稳定性观测
**作为**产品团队，**我想**确认内测期间的稳定性指标达到 GA 触发线，**以便**有信心进入 G-4 公开发布。

**验收标准：**
- WHEN 内测 7 天结束 THEN 以下指标 SHALL 达成：
  - 崩溃率 < 0.5 % / DAU
  - 自动更新成功率 > 95 %（`installed / available`）
  - 漏斗 launch → login 转化率 > 60 %（部分用户安装后不登录视为正常）
  - 漏斗 onboarding → first_chat 转化率 > 70 %（已登录的应该会试一次对话）
- WHEN 任一指标未达成 THEN 团队 SHALL 召开 root cause 会议，决定是延期 G-4 还是发 v0.2.2 修复后再观测 7 天
- 验证方式：管理员看板（US-G3-2）每日刷新

---

## 3. 非功能需求

| 类别 | 指标 | G-2 完成时 | G-3 目标 |
| --- | --- | --- | --- |
| 内测用户数 | 不重复 device_id_hash | 0 | ≥ 100 |
| 崩溃率 | 崩溃次数 / DAU | 未测 | < 0.5 % |
| 自动更新成功率 | installed / available | 0 | > 95 % |
| SmartScreen 通过率 | 首次安装无红屏 | 100 % 红屏 | < 30 % 红屏 |
| 用户手册覆盖率 | UI 元素被文档覆盖 | 0 % | > 80 % |
| FAQ 覆盖率 | 用户问题在 FAQ 找到 | 0 | > 70 % |

---

## 4. 依赖

- **后端**：
  - 新接口 `/api/v1/admin/desktop/dashboard`（聚合查询）
  - `/api/v1/desktop/download/track` 记录下载意图（utm 来源）
- **前端 web**：
  - 新页面 `/admin/desktop`（仅 admin 可见）
  - 新页面 `/download`（公开下载页，含 SmartScreen 引导）
- **资产**：
  - `kitsune-default.vrm` / `kitsune-pro.vrm` / `kitsune-economy.vrm` 上传到 CDN
- **CI**：
  - GitHub Actions 签名集成
  - Release artifact 同时 INSERT 到 `agentrix_desktop.releases`
- **运营**：
  - Telegram 群 / Discord 群分发渠道
  - 内测用户问卷（7 天后填写）

---

## 5. 风险

| 风险 | 概率 | 缓解 |
| --- | --- | --- |
| 100 个内测用户拉不到 | 中 | 兜底走 Twitter / 公众号；放低到 50 也能算成功，但延一周再发 G-4 |
| 崩溃率超过 0.5 % | 中 | 灰度发 v0.2.2 修复，重启 7 天观测；崩溃 Top 1 在哪先看 fingerprint |
| Azure Trusted Signing 申请慢 | 中 | 同步申请 EV cert 兜底；G-3 实在不行就推到 G-4 |
| VRM 资产质量问题（穿模 / 表情怪）| 中 | 美术过两遍 + Discord 内测组先看；最差 fall back 到 PNG |
| 数据看板 SQL 慢 | 低 | 索引已加；如果聚合 > 1s，加 materialized view |

---

## 6. 验收 Demo（Sprint G-3 完成）

1. 100 台真实设备的 device_id_hash 出现在 `agentrix_desktop.analytics_events` 表
2. 管理员访问 `/admin/desktop` 看到完整数据看板
3. 双击 v0.2.1 setup.exe 在 5 台 Win 11 不出现红色 SmartScreen
4. v0.2.0 → v0.2.1 OTA 灰度 100% 完成，成功率 > 95%
5. 用户手册 + FAQ + 安装动画上线 `agentrix.top/help`
6. 7 天内测稳定性指标全部达成 → 进入 G-4

---

## 7. 关键决策（待你确认）

| 议题 | 默认决策 | 备选 |
| --- | --- | --- |
| 内测分发主渠道 | Telegram + 邀请码 | + Twitter / 公众号 |
| 数据看板放哪 | web `frontend/` `/admin/desktop` | 单独的运维 dashboard |
| 代码签名方案 | Azure Trusted Signing（先用） | 申请 EV cert 兜底 |
| 用户手册载体 | markdown 文件 + 官网渲染 | Notion 公开页 / GitBook |
| FAQ 维护 | docs/ markdown + 官网搜索 | Discord channel pinned |
| VRM 资产源 | VRoid Studio 转换 | 直接复用 .glb fallback |
