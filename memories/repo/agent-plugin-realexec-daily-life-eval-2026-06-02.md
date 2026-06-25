# plugin真执行 + OpenAPI鉴权 + 公司结算引导 + 日常服务/游戏融合评估(2026-06-02)

## 工程(#2 三件,已部署+验证)
### ① plugin 执行桩 → 真执行
- `plugin.entity` manifest.tools 加 `exec` 绑定:`{type:'http',endpoint,method?,headers?}` 或 `{type:'mcp',mcpServer}`。
- `PluginService.executePluginTool(userId, toolName, args)`:解析 `plugin_<pluginname>_<tool>` →
  http 走 axios(带 manifest 鉴权头,GET/DELETE 用 query)/ mcp 走 `callMcpTool`(JSON-RPC tools/call)。
  无 exec → 明确报错(仅展示)。axios 已 import。
- `runtime-seam.service.ts` effectiveOnToolCall:`plugin_*` 调 executePluginTool(替换
  'Plugin tool execution not yet implemented' stub)。主聊天路径 openclaw-proxy 经 seamContext.effectiveOnToolCall 自动覆盖(已确认 proxy 用 buildRuntimeContext→effectiveOnToolCall)。

### ② OpenAPI 导入鉴权头注入
- `openapi-importer.buildAuthHeaders(authConfig)`:bearer→`Authorization: Bearer`、api_key→自定义头(headerName||X-API-Key);
  导入时烘焙进 `skill.executor.headers`。
- `skill-executor.executeHttpSkill`:发请求带 executor.headers;**GET/DELETE 走 params(query),其余 data(body)**(之前一律 body)。
- 验证:prod 跑 axios echo(httpbin/anything)PASS —— body + auth header 都正确送达回显。证明 http exec + 鉴权头通路 OK。

### ③ 公司结算 UI 引导
- `AeonCompanyScreen.onSettle`:产出 completed=0 时不再干巴巴"发薪0",改弹解释 +「去任务广场」发 KPI 悬赏引导。

## commit / 部署
- `75b34c5a0` → origin。后端 SSH 部署(无迁移,plugin manifest 是 jsonb;build+restart 稳定 health=200)。
- APK branch `build/agent-plugin-fixes-2026-06-02`(主仓+Claw 镜像,CI 触发)。

## 评估文档(#1 + #3)
- `docs/business/AGENT_DAILY_LIFE_SERVICES_EVAL_2026-06-02.zh-CN.md`:
  插件库(连接器市场)缺口=目录+一键装+鉴权向导(导入能力本轮已通);衣食住行盘点表:
  **国内美团/滴滴/淘宝个人代下单 API 基本不开放→Computer Use GUI 兜底;海外(DoorDash/Uber/Booking/Amadeus/Expedia)API 更开放;
  加密自主交易最现实(交易所 API+已有 x402/trading 模块)**。分期:P1 做 5 个有 API 的样板连接器。
- `docs/business/DAILY_LIFE_X_GAME_INTEGRATION_2026-06-02.zh-CN.md`:
  理念=真实办事即游戏内行动。玩法 A「派 agent 出门办事」(agent 控制态+reality-loop 发 aeon_reality_reward AXP+world-news)
  最短可玩闭环;B 服务做成功能建筑(#2 P2 已支持);C 真实代办进任务广场;D 习惯养成(wearable/vitals)。
  桥:reality-loop.service + world-news + 经济层 已就位。

## 关键事实(复用)
- 三条外部能力接入通道现状:**MCP(全通)、OpenAPI 导入(本轮补齐鉴权→可用)、plugin(本轮补齐执行→可用)**。
  做一个"连接器"= 提供 OpenAPI 模板/MCP server 地址 + 鉴权;工程已就绪,缺目录/向导/精选内容。
- 自主支付:x402_pay/quickpay/AgentWallet/X402Authorization(单笔+日限,agent_cost_records),autonomousPaymentEnabled 闸门。
- 坑:node 里 require('axios') 拿到的是 {default}, 要 `_ax.default||_ax`;TS 源码 `import axios from 'axios'` 正常。
