# Agent 生产力扩展 + 日常生活服务接入 可行性评估(2026-06-02)

针对用户两个诉求:
1. 像 Codex 那样有个**插件库**对接更多常规插件,提升 agent 生产力。
2. 整理人们**衣食住行**等日常服务,让 agent 能完成(订机票酒店、点外卖、自主交易等)。

本文基于当前代码实况(不夸大),给出现状、缺口、分期落地。

---

## 一、现状:agent 已具备的"干活"底座

- **Computer Use**(桌面):`desktop/src-tauri/src/computer_use/` —— 鼠标/键盘/截屏 + 系统 Chrome(CDP)。
  agent 已能在桌面"看屏幕、点按钮、填表单",这是兜底万能通道(任何没有 API 的网站都能用 GUI 操作)。
- **工具调用循环**:`query-engine/runtime-seam.service.ts` 组装
  `[preset 工具 + 已装 skill 工具 + MCP 工具 + plugin 工具 + agent_run]`,主聊天路径 `/openclaw/proxy/:id/stream`。
- **三种外部能力接入通道**(本轮已全部打通):
  1. **MCP server**:注册→发现→`mcp_*` 工具,agent 可调(支持 bearer/apikey/oauth 鉴权)。
  2. **OpenAPI 导入**:`POST /skills/import-openapi` 把任意 OpenAPI/GPT Action 导成 skill;
     **本轮修复:导入时鉴权头自动烘焙进 executor.headers,带 key 的三方 API 现可直接调通**。
  3. **Plugin**:**本轮修复:plugin 工具从"展示桩"变为真执行**(http 直连 / 路由到 plugin 声明的 MCP server)。
- **自主支付**:`x402_pay` / `quickpay_execute` / `AgentWalletService` / `X402AuthorizationService`
  (单笔 + 日限,写 `agent_cost_records`),受 `autonomousPaymentEnabled` 闸门控制。

**结论**:接入"第三方能力"的三条路已通;agent 调用 + 鉴权 + 支付 + GUI 兜底齐备。差的是 **(a) 一个像样的插件/连接器市场(目录 + 一键装 + 配置鉴权)**,和 **(b) 把日常生活高频服务做成开箱即用的官方连接器**。

---

## 二、插件库(Codex 式连接器市场)— 缺口与落地

### 现状
- 已有 `plugin` 实体 + `marketplace`/`skill` 市场 + `mcp-registry`,但**没有一个聚合的"连接器市场"前端**:
  用户难以发现"有哪些可对接的外部服务"、难以一键安装并填鉴权。
- skill_search 能在对话里搜 skill,但搜的是平台已有 skill,不是"一个精选的第三方连接器目录"。

### 缺口
1. **连接器目录(Connector Catalog)**:精选一批常用第三方(地图、邮件、日历、Notion、GitHub、
   Slack、电商、出行、外卖…),每个登记为一个"连接器"(底层是 MCP server 或 OpenAPI import 模板)。
2. **一键安装 + 鉴权向导**:用户点"连接 Notion"→ 走 OAuth/填 API key → 自动注册成该用户的工具。
3. **凭据保管**:目前 OpenAPI 导入把 apiKey 明文存 executor.headers(MVP 可接受),生产要密钥保管箱。

### 分期
- **P1(1~2 天)**:连接器目录数据模型 + 后端 `GET /connectors`(精选清单,每项指向 MCP/OpenAPI 模板)
  + 一键安装(对 OpenAPI 模板复用 import-openapi;对 MCP 复用 mcp-servers 注册)。
- **P2(2~3 天)**:鉴权向导 UI(api_key 表单 / OAuth 跳转回调)+ 凭据加密存储(替换明文)。
- **P3**:连接器评分/分类/搜索,接入 skill_search 让 agent 也能"推荐你装某连接器"。

---

## 三、衣食住行日常服务 — 盘点 + 接入方式判断

每类服务,接入方式优先级:**官方/聚合 API > MCP 封装 > Computer Use(GUI 兜底)**。
真实交易/支付几乎都要解决：身份(KYC)、商户对接、合规、各家自己的支付。

| 类别 | 典型服务 | 有无公开 API | 推荐接入 | 难点 |
|---|---|---|---|---|
| 行-打车 | 滴滴/Uber | Uber 有 API;滴滴企业版有 | OpenAPI import / MCP | 国内滴滴个人下单 API 不开放→GUI 兜底 |
| 行-机票 | 携程/去哪儿/Skyscanner/Amadeus | Amadeus/Skyscanner 有开放 API | OpenAPI import | 支付+改签退票复杂;聚合 API 有资质门槛 |
| 行-酒店 | Booking/携程/Expedia | Expedia/Booking 有合作 API | OpenAPI import / 聚合商 | 需商务合作账号;佣金结算 |
| 食-外卖 | 美团/饿了么/DoorDash | 美团/饿了么个人下单 API **不开放**;DoorDash 有 | MCP 封装 + GUI 兜底 | 国内外卖无开放下单 API→只能 GUI 或商家版 API |
| 食-订餐 | OpenTable/大众点评 | OpenTable 有;点评有限 | OpenAPI import | 同上 |
| 衣-电商 | 淘宝/京东/Amazon | Amazon SP-API(卖家);淘宝客;平台自有 | 平台 marketplace + 联盟 | 个人代下单 API 普遍不开放 |
| 住-生活缴费 | 水电煤/话费 | 支付宝/微信生活号、运营商 | MCP 封装 | 强实名+支付,合规重 |
| 自主交易 | 加密/股票 | 交易所 API 成熟(币安等);券商有限 | 已有 trading/x402 模块 | 加密相对易;证券强监管 |

### 关键现实判断(诚实)
- **国内三大高频(美团外卖、滴滴打车、淘宝下单)个人代下单 API 基本不开放**。能做的是:
  (a) Computer Use GUI 兜底(agent 在桌面/手机操作 App 网页版,真能下单但脆、慢、要登录态);
  (b) 等商家版/企业版 API 或聚合商合作。
- **海外对应服务(DoorDash、Uber、Booking、Amadeus、Expedia)API 更开放**,优先做海外或有 API 的。
- **自主交易里加密货币最现实**:交易所 API 成熟 + 平台已有 x402/wallet/trading 模块,闭环最短。

### 分期
- **P1**:做 3~5 个"有公开 API 且能真闭环"的连接器作样板:天气、日历、Amadeus 机票查询(只查不付)、
  加密行情/下单(币安测试网)、邮件发送。证明"对话里让 agent 办事"端到端跑通。
- **P2**:接 1 个真支付闭环(加密交易 via x402/交易所,或海外外卖 DoorDash sandbox),跑通"agent 自主花钱办成一件事"。
- **P3**:Computer Use 兜底模板化(为美团/淘宝这类无 API 的,做"GUI 操作录制→可复用脚本"),
  把脆的 GUI 自动化变成相对稳的"连接器"。

---

## 四、本轮已交付(支撑上面的底座)
- plugin 真执行(http/mcp)+ OpenAPI 导入鉴权头注入 + GET/DELETE 查询参数修正 → **三方带鉴权 API 现可被 agent 调通**。
- 这意味着:做一个"连接器"现在等于"提供一个 OpenAPI 模板或 MCP server 地址 + 鉴权" —— 工程上已就绪,缺的是目录/向导/精选内容。

## 五、建议优先级
1. 连接器目录 + 一键装 + 鉴权向导(P1/P2)—— 这是"插件库"的核心,且复用已通的导入能力。
2. 5 个有 API 的样板连接器(P1)—— 证明价值,衣食住行各挑一个能真闭环的。
3. 加密自主交易闭环(P2)—— 最短的"agent 自主花钱"闭环,展示杀手锏。
4. Computer Use 兜底模板化(P3)—— 攻克国内无 API 的高频服务。
