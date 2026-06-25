# 连接器/插件库 + 玩法A闭环(派 agent 办真事→AXP)— 已发并 prod 验证 2026-06-02

## 做了什么(两件用户诉求合一)
1. 插件库市场化封装:**目录 + 一键装 + 鉴权向导**。
2. 玩法 A 最短闭环:**对话里/游戏里派 agent 办成一件真事 → 游戏里产出 AXP**,prod 跑通。

## 后端 ConnectorModule(`backend/src/modules/connector/`)
- `connector-catalog.ts`:精选连接器目录。kind=builtin/openapi/mcp;authKind=none/api_key/bearer/oauth;
  status=live/beta/coming_soon。**live 样板**:`crypto-price`(CoinGecko 公开 API)、`weather`(Open-Meteo),
  免鉴权可玩,reality=true + rewardAxp。coming_soon 占位:flight-search/notion/github/food-delivery。
- `user-connector.entity.ts` + 迁移 `1800600000000-UserConnectors`(user_connectors,(user_id,connector_id) 唯一)。**prod RUN**。
- `connector.service.ts`:
  - catalog(userId)含已装标记;install:openapi→`openapiImporter.importFromUrl`(鉴权头烘焙)、
    mcp→`mcpRegistry.registerServer`+`discoverTools`、builtin→直接 enable;uninstall。
  - runBuiltin(crypto/weather);**runErrand**=玩法A:跑 builtin → `reality.rewardFromReality(userId, rewardAxp, ...)`
    发 `aeon_reality_reward` AXP 入全局钱包 + WorldNews 写城市新闻。
- `connector.controller.ts` `v1/connectors`:catalog / installed / install / :id(DELETE) / :id/run / :id/errand。
- 注册进 app.module(ConnectorModule)。

## agent 工具(对话里可派 agent 办事)
- `skill-executor.service.ts` 注册 `connector_run`(查询不发奖)、`connector_errand`(办成发 AXP+新闻)内部 handler;
  注入 ConnectorService 用 `@Inject(forwardRef(()=>ConnectorService))`。
- **循环依赖处理**:ConnectorModule imports `forwardRef(()=>SkillModule)`,SkillModule imports `forwardRef(()=>ConnectorModule)`。
  prod 重启验证 boot 干净(health=200,unstable restarts=0)—— forwardRef 双向 OK。
- 登记进 `agent-preset-skills.config.ts`(connector_run/connector_errand,enabledByDefault)→ LLM 可见可调。

## 移动端
- `src/services/connectorApi.ts`:listConnectors/installConnector/uninstallConnector/runConnector/runConnectorErrand。
- `src/screens/aeon/ConnectorHubScreen.tsx`:目录(按 category 分组,状态/已装标记)+ 一键装 + 鉴权向导
  (api_key/bearer secureTextEntry 表单)+「派 agent 去办」(crypto→coin、weather→city 参数)→ 弹"办成赚 N AXP"。
- 入口:AeonScene 行动栏 🔌 连接器 chip。注册 ConnectorHub 路由。shared/types/connector.ts 跨端契约。

## 验证(prod 实测 PASS)
`tests/e2e/connector-errand.smoke.mjs`(自包含,后端机跑):
- catalog 200 count=6 hasCryptoLive=true;install 201;run 201 "BITCOIN = 69350 USD -4.44% (24h)"(真实数据);
- errand 201 reward=10 bridged=true;**钱包余额 50→60 delta=10** —— AXP 真入账。
- 即"对话里派 agent 办成真事 → 游戏产出 AXP" 端到端成立。

## commit / 部署
- `dc47b5615` → origin。后端 SSH 部署(迁移 1800600000000 RUN,build+restart 稳定 health=200)。
- APK branch `build/connector-hub-2026-06-02`(主仓+Claw 镜像,CI run 26817118242)。

## 后续可扩
- OAuth 向导(notion/github 需要);凭据加密(现 credentials 明文 jsonb,MVP)。
- 更多 live 连接器(机票查询接 Amadeus key、加密下单接交易所 testnet)。
- 玩法 A 进阶:AeonScene 里 agent 角色"外出办事"动画离场(现在是连接器页弹窗);把 errand 入口也放进对话框快捷。
- 坑:PowerShell 内联 node -e 带 `||`/`=>`/`{}` 必被破坏 → 一律写文件 scp 跑。require('axios') 需 `.default||_ax`。
