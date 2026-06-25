# 共建素材 + 公司bug修复 + 高精地图 + agent能力盘点(2026-06-02)

本轮三件事:#1 公司运营bug修复+验证,#2 拍照素材共建(P1+P2),#3 高精地图(P1)+ agent能力评估。

## 公司运营"注资/雇佣跑不通" — 根因找到并修复+prod验证
- **根因(雇佣)**:移动端 AeonCompanyScreen hire 传 `memberUserId: ''`,OrgController.assign 用
  `body.memberUserId ?? this.uid(req)` —— `??` 不拦空串,空串被当 uuid 写 aeon_org_members.member_user_id
  (uuid NOT NULL)→ 雇佣 500 失败。**修复**:controller 改 `trim() ? : uid` 显式回退当前用户。
- **注资**:逻辑本身没问题(fundOrg 写 aeon_ledger_entries,org 余额=分录代数和)。注意:fundOrg 不
  校验/扣减用户真实 AXP 钱包,是 org 独立账本(MVP 设计如此)。
- **验证**:`tests/e2e/aeon-company-flow.smoke.mjs`(自包含,后端机跑)PASS:
  create 201 / fund 200→balance 200 / hire 201 memberUserId 回退当前用户 / clock-in ok / settle 200 paid=0。
  settle paid=0 是正确的(无完成的 KPI 任务);UI 可后续提示"先在任务广场发 KPI 悬赏"。

## #2 拍照素材成为共建素材
- **P1**:world_assets 加 `usage_kind`(character/build_material/decor)+ 迁移 1800500000000(prod RUN)。
  BuildService.listMyBuildableAssets(all?)/setAssetUsageKind;BuildController GET/POST build/my-assets。
  AeonBuildScreen 加「我的素材」分页(默认 all=1 拉全部自有资产),点资产以 sourceAssetId 放置,
  网格用资产缩略图(portraitUrl/styledMeshUrl/meshUrl)渲染。复用现有拍照→3D 管线产出的资产。
- **P2**:BuildService.place 放置功能建筑(linksToKind=room)时自动建 venue 房间 + 回填 linksToId;
  AeonScene 支持显式 roomId 参数;AeonBuild 点功能建筑弹「进入」→ 进该房间场景。
  → "拍照做素材 → 摆出自己的餐厅 → 点进去就是店内场景"闭环。

## #3 高精真实世界地图(P1)
- src/config/mapStyle.ts:从 expo extra 读 `mapTilerKey` / `mapStyleUrl`,配置后 MapLibre 用 MapTiler
  streets-v2 街区级瓦片(key 不入源码);未配置降级 demo 瓦片。AeonMap 用 resolveMapStyleUrl()/defaultMapZoom()。
  → 上线只需在 EAS extra 注入 MapTiler key(或自定义 style.json 接 Mapbox/天地图代理),代码零改。
- 国内合规底图(天地图)+ GCJ-02 坐标转换、商家入驻属后续(见 WORLD_REALWORLD_FEASIBILITY 文档 P2-P4)。

## #3 问题:agent 能力盘点(sub-agent context-gatherer 调查,无修改)
**Q1 agent 能在对话里搜/装/买 skill+商品?→ 是,已全链路接入(不只是 REST)。**
- 工具装配:`/openclaw/proxy/:id/stream`(主)+ `/claude/chat`(影子)→ RuntimeSeamService.buildRuntimeContext
  组装 effectiveTools=[baseTools(preset+installed) + agent_run + MCP工具 + plugin工具]。
- agent 可调工具(preset,默认开,handler 在 skill-executor.service.ts):skill_search/skill_install/
  skill_execute/skill_recommend、search_products/resource_search/create_order/marketplace_purchase、
  get_balance/x402_pay/quickpay_execute、task_search/post/accept/submit、agent_discover/invoke。
- 权限闸:openclaw-proxy resolveRuntimePermissionProfile(commerceBrowse/Purchase/autonomousPayment 等)可按 agent 关。

**Q2 框架支持插件/动态外部工具?→ 部分。MCP 全链路可用;OpenAPI导入半通;plugin实体执行是桩。**
- MCP(可用):POST /mcp-servers 注册 → /discover 拉 tools/list → RuntimeSeam 注入 mcp_<server>_<tool>
  → effectiveOnToolCall 路由到 executeToolCall(JSON-RPC tools/call,支持 bearer/apikey/oauth 鉴权头)。完整。
- OpenAPI 导入(skill/openapi-importer):POST /skills/import-openapi 建 http-executor skill,装了能经
  skill_execute 调,但 executeHttpSkill **不注入 per-skill 鉴权头** → 带鉴权的三方 API 调不通(需补代码)。
- plugin 实体(plugin.service):getPluginProvidedTools 把 plugin_* 注入工具列表,但执行是
  `{ error: 'Plugin tool execution not yet implemented' }` 桩,activatePlugin 只 log。**不能真跑**。

**Q3 "对话里点外卖(对接美团)"现状?→ 技术可达,但只有把美团包成 MCP server 才端到端通。**
- 最可行=把美团 API 包成 MCP server 注册(鉴权支持、agent 可调全通)。OpenAPI 导入能发现/调用但当前
  无法注入三方鉴权。native create_order/marketplace_purchase 只对 Agentrix 自有商品表,够不到美团。
- 支付:自主支付有 x402_pay/quickpay/AgentWalletService/X402Authorization(单笔+日限,agent_cost_records),
  但走 Agentrix 钱包/x402,**付美团仍需美团自己的支付在 MCP/API 工具内处理**。
- 结论:外卖下单"可做但要集成"(包 MCP server),非开箱即用;没有现成美团连接器。
- 关键文件:query-engine/runtime-seam.service.ts、skill/skill-executor.service.ts、
  mcp-registry/mcp-server-registry.service.ts、skill/openapi-importer.service.ts、plugin/plugin.service.ts、
  payment/x402-authorization.service.ts、mcp/agent-wallet.service.ts。

## 后续可补(非本轮)
- plugin 执行桩 → 真执行(让 plugin 声明的 tools 真能调,或统一走 MCP)。
- openapi-importer 的 executeHttpSkill 注入 per-skill 鉴权头(让带 key 的三方 API 直接可用)。
- 公司 settle UI 引导"先发 KPI 悬赏"。

## commits / 部署
- 7ccb1d30b(#2P1+#3P1+公司fix)、51f3e136d(#2P2)。后端 SSH 部署:迁移 1800500000000 已 RUN,pm2 重启稳定 health=200。
- APK branch build/aeon-cobuild-map-2026-06-02(主仓+Claw镜像)。
- 坑:PowerShell 内联 node -e 带 `||`/`=>`/`{}` 必被解析破坏 → 一律写文件 scp 后跑。
