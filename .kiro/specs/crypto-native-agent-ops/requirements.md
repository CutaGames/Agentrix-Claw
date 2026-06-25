# Requirements Document

> Crypto-Native Agent Ops（滩头专项 · crypto-native 分册）

## Introduction

本专项是 Agentrix 的**滩头点火专项**。核心叙事「一个灵魂 × 多端 × 跨硬件 × 共享记忆与能力」保持为长期北极星
(宠物/灵魂 = 情感陪伴 + 具象化层,贯穿所有用户群);本册在该叙事之下,选择 **crypto-native 重度用户**作为
前期推广用户(容忍不完善、竞争较小),用一个分支叙事拿下首批核心刚性用户:

> 「一个属于你的 AI agent,替你把链上/网页里那些重复、琐碎但有真实金钱价值的活儿在浏览器里**真正干完并交付
> 结果**;干得好的专精 agent 可被雇佣,作者与推广方的收益**自动链上(USDC)分润**。」

**用户群再细分(本册按两个 persona 组织,共享同一能力底座):**
- **散户(普通 web3 用户)= 点火侧。** 需求侧为主,工具单机即有价值(研究/安全/监控/空投),人多、密集可达、靠分佣自传播 → 拿密度与病毒。
- **项目方(协议/团队/KOL/工作室)= 变现锚 + 供给/买方。** 肯付费(增长/获客/转化/上所/数据/反作弊),其花费构成 A2A 需求,让散户的 agent 真能被雇佣赚到钱。紧随散户之后。

**灵魂层对本群做轻:** 对 crypto-native,灵魂/宠物更偏「我的 agent 的身份 / 声誉 / 形象」,而非深度情感陪伴。

**能力路径(基于代码核查):** 可靠路径是**浏览器 CDP 锚定自动化**(DOM 级、确定性);原生 GUI 像素点击单独由需求 4 加固。
变现压在已闭环的**链上结算 + 多跳自动分佣 rail**(BSC testnet,relayer + Commission 合约)。Agent 实体由
`openclaw_instance`(运行时) + `AgentAccount`(经济身份)构成;Agent 团队可复用已有 `agent-team` 模板(provisionTeam)。

## Glossary

- **Soul / Agent**:用户拥有的、可命名、有持续记忆与声誉的 AI 角色实体(`openclaw_instance` 运行时 + `AgentAccount` 经济身份)。
- **散户 / 普通 web3 用户**:个人投资者/degen/farmer,主要消费工具、为自己赚钱。
- **项目方**:协议/团队/KOL/工作室,B2B 买方与供给方,高 LTV。
- **浏览器自动化(CDP)**:经 Chrome DevTools Protocol 的 navigate / evaluate / 选择器点击,DOM 级锚定。
- **结果交付物(Deliverable)**:agent 产出的报告 / 告警 / 监控摘要 / 运营成果等可交付、可计价、可验收的成果。
- **只读 / 写操作**:只读 = 读数据不改状态不花钱;写 = 交易签名/转账/对外发布/提交表单等。
- **分级审批**:按 trust/risk 分级的自动放行 / 策略放行 / 人工确认(红线不可绕过)。
- **A2A 雇佣**:用户雇用他人调好的专精 agent 完成子任务,经服务端权威 + 链上 rail 结算分润。
- **Sybil**:同一主体用多账号/多钱包伪装多用户以套取激励的作弊行为。
- **可行性档**:🟢 agent 基本全自动 / 🟡 agent 协助 + 人确认 / 🔴 主要靠人(agent 仅备料/跟踪)。

---

## Requirements

### 需求 1 —〔底座〕拥有一个「属于我」的 Agent（灵魂,多端框架,本群做轻）

**用户故事:** 作为 crypto-native 用户,我希望创建并拥有一个属于我、有身份与声誉、能记住我偏好与历史的 agent,以便它持续为我服务并对外建立可信形象。

> **现状(已核):** 底座大部分已存在——`openclaw_instance`(运行时 + 技能 hub + `/openclaw/proxy/:id/stream`)+ `AgentAccount`(身份/权限/声誉/限额 schema)。本需求主要是**验证 + 打通 + 前台化**。待补:多端身份一致性、记忆(偏好/关注/历史)、声誉展示。

#### 验收标准
1. WHEN 用户首次进入专项 THEN 系统 SHALL 引导创建一个 Soul/Agent(绑定 OpenClaw 实例 + AgentAccount;命名 + 领域偏好 + 关联钱包)。
2. THE 系统 SHALL 维护持续记忆(偏好、关注的钱包/项目/协议、历史任务与结果)与可展示声誉。
3. WHEN 用户在不同端登录同一账号 THEN 系统 SHALL 呈现同一 Agent 的身份、记忆与能力。
4. IF 某端能力暂不完整 THEN 系统 SHALL 明示该端当前可用能力,不得以「全可用」误导。
5. THE 本群灵魂层 SHALL 以身份/声誉/形象为主,不要求深度情感陪伴特性。

### 需求 2 —〔底座〕浏览器锚定的链上/网页操作能力

**用户故事:** 作为用户,我希望 agent 在浏览器里可靠读取链上浏览器、DeFi 面板、社区与资讯站点的数据并执行操作,以便它真正干活而非只给建议。

#### 验收标准
1. THE 系统 SHALL 通过受控 Chrome(隔离 profile + CDP)执行导航、JS 求值、选择器读取与点击。
2. WHEN agent 需从页面提取数据 THEN 系统 SHALL 用 DOM/选择器/JS 锚定方式获取,而非像素坐标猜测。
3. WHEN 浏览器操作失败 THEN 系统 SHALL 返回结构化失败原因并允许重试或降级。
4. THE 系统 SHALL 记录每次浏览器操作的可审计轨迹。

### 需求 3 —〔底座〕任务编排与无人值守(分级审批)

**用户故事:** 作为用户,我希望低风险任务无人值守自动跑,只有高风险动作才打断我,以便它真能替我干活。

#### 验收标准
1. THE 系统 SHALL 按 trust/risk 分级:只读(自动)/ 中风险(策略+预算放行)/ 高风险(人工确认)/ 红线(永久拒绝)。
2. WHEN 任务仅含只读操作 THEN 系统 SHALL 在会话/任务授权范围内无人值守执行,不逐步打断。
3. WHEN 动作涉及交易签名 / 转账 / 新收款地址 / 不可逆提交 / 对外发布 THEN 系统 SHALL 强制人工确认。
4. THE 用户 SHALL 能为某任务/会话设定自动放行范围与预算上限,超出即回落人工确认。
5. THE 红线 SHALL 不可被任何 UI 或策略绕过。

### 需求 4 —〔底座〕桌面 Computer Use 加固(原生 GUI 三弱点)

**用户故事:** 作为用户,我希望 agent 在原生桌面应用里也能可靠定位并操作 UI 元素、聚焦目标窗口,以便能力不局限于浏览器。

#### 验收标准
1. THE 系统 SHALL 提供坐标 grounding:基于 OS 无障碍树(Windows UI Automation / macOS AX)提取可交互元素并以 set-of-marks 供模型按元素选择;画布类应用降级到 OCR/图标检测。
2. WHEN agent 需点击某元素 THEN 系统 SHALL 通过元素标识映射坐标,而非要求模型猜像素。
3. THE 系统 SHALL 提供可用的窗口聚焦(Windows SetForegroundWindow / macOS activate)并正确报告 is_active。
4. THE 原生 GUI 的点击/输入 SHALL 接入需求 3 的分级审批。
5. WHILE grounding 对某应用不可用 THE 系统 SHALL 明示降级状态而非静默猜测坐标。

### 需求 5 —〔底座〕变现:USDC 结算 + 链上自动分佣

**用户故事:** 作为用户/创作者,我希望按结果用 USDC 付费雇用专精 agent,且作者与推广方自动分到钱,以便形成自传播的经济闭环。

#### 验收标准
1. WHEN 用户雇用专精 agent 完成任务 THEN 系统 SHALL 经服务端权威定价并支持 USDC 结算(复用 relayer + Commission 合约 rail)。
2. WHEN 一笔成交涉及推荐/执行/作者多方 THEN 系统 SHALL 按血缘/协作协议自动多跳分佣(链上一次性提交)。
3. THE 系统 SHALL 保留 AXP 作为 App 内工具积分层,与 USDC 结算层并存且边界清晰。
4. THE 每笔结算与分佣 SHALL 产生可审计记录(金额、各方、交易哈希/凭据)。
5. THE 系统 SHALL NOT 引入投机代币 / P2E 机制。

### 需求 6 —〔底座〕安全与合规红线

**用户故事:** 作为用户,我希望专项在追求自动化的同时守住安全与合规底线,以便我敢把钱包和任务交给它。

#### 验收标准
1. THE 系统 SHALL 默认只读优先;任何资金/交易类写操作必须人工确认(见需求 3)。
2. THE 系统 SHALL NOT 为用户提供多钱包 sybil 薅空投/批量刷量/刷假互动/wash trading/无披露付费喊单等违反 ToS 的滥用能力(红线)。
3. THE 系统 SHALL 对私钥/助记词等机密最小暴露,不在日志/回包回显密钥值。
4. WHERE 涉及竞猜/下注类玩法 THE 系统 SHALL 先做地区限制与法务确认,默认关闭。
5. THE 系统 SHALL 为所有自动化动作保留可审计轨迹以便事后追责。

### 需求 7 —〔底座〕完善并打通 AgentAccount 经济身份层

**用户故事:** 作为平台,我希望 agent 的经济身份(钱包/限额/信用/链上身份/认证)真实打通并自动维护,以便 agent 能作为可信经济主体被授权、被雇佣、被结算。

> **现状(已核):** ✅ 身份/状态门控/限额 schema/信用读取已通;🟡 `recordSpending`/`updateCreditScore` 有方法+端点但**疑似未接到真实成交事件**,额度日/月**重置任务缺失**,capabilities→工具门控、defaultAccountId 绑定待确认;🔴 MPC/外部钱包真实绑定、ERC-8004/EAS 链上身份存证、publicKey/API 认证签发**基本未落地**。本需求把 🟡/🔴 补齐。

#### 验收标准

**A 组 — 额度联动(自动记账)** 〔🟡 字段:usedTodayAmount/usedMonthAmount/totalTransactions/totalTransactionAmount/successful·failedTransactions〕
1. WHEN 一笔真实支付/任务结算在任一路径(payment / agent_hire_escrow / commission)完成 THEN 系统 SHALL 自动调用 `recordSpending(agentId, amount, success)`,不依赖手动端点。
2. WHEN `recordSpending` 写入 THEN 系统 SHALL 同步累计交易统计(total / successful / failed / totalTransactionAmount)。
3. IF PermissionEngine 因 status 或限额拒绝某动作 THEN 系统 SHALL NOT 调用 `recordSpending`(只对真实成交记账)。
4. THE 记账 SHALL 幂等:同一结算事件不重复计数;结算与记账间失败 SHALL 保持账实一致(回滚或补偿)。

**B 组 — 额度定时重置** 〔🟡 现状:resetDaily/MonthlyLimits 方法在,但无 @Cron 调用,且未参照 limitResetDate/时区〕
5. THE 系统 SHALL 通过定时调度(@Cron)按日重置 `usedTodayAmount`、按月重置 `usedMonthAmount`。
6. THE 重置 SHALL 依据 `limitResetDate` 与统一时区(建议 UTC,口径待定),而非全表无差别即时归零。
7. IF 某次重置 cron 漏跑 THEN 下次运行 SHALL 基于 `limitResetDate` 容错补偿(判断是否已过期未重置)。

**C 组 — 信用评分自动更新** 〔🟡 现状:updateCreditScore 方法+端点在,被读取,但无自动调用方〕
8. WHEN agent 成交/履约成功 THEN 系统 SHALL 自动调用 `updateCreditScore` 加分并记录原因。
9. WHEN agent 任务失败 / 被争议 / 被退款 THEN 系统 SHALL 自动减分并记录原因。
10. THE `creditScore` SHALL 限制在 0–1000,`creditScoreUpdatedAt` 同步更新。
11. THE 系统 SHALL 据 creditScore / 行为更新 `riskLevel`(low/medium/high/critical)。

**D 组 — 钱包绑定** 〔🔴 现状:仅 fallback 显示,无真实创建/绑定〕
12. WHEN 用户为 agent 启用托管钱包 THEN 系统 SHALL 创建 MPC 钱包并写入 `mpcWalletId`,真实可用于结算。
13. WHEN 用户绑定外部钱包 THEN 系统 SHALL 校验地址归属(签名验证)后写入 `externalWalletAddress`。
14. THE `defaultAccountId` SHALL 与资金 `Account` 双向关联且一致。
15. IF 钱包创建/绑定失败 THEN 系统 SHALL 回滚,使 agent 保持「无钱包可用」安全态,不部分写入。

**E 组 — 链上身份存证** 〔🔴 现状:x402 只消费 erc8004SessionId,无写回;EAS/onchain 无写入侧〕
16. WHEN 用户为 agent 启用链上身份 THEN 系统 SHALL 执行 ERC-8004 注册并写回 `erc8004SessionId`/`sessionExpiry`/`onchainRegistrationTxHash`/`registrationChain`。
17. THE 系统 SHALL 支持 EAS attestation 并写回 `easAttestationUid`,且可被第三方验证。
18. IF 链上注册失败/超时 THEN 系统 SHALL 降级为「链下身份」并明示,不阻塞 agent 基本功能。

**F 组 — 密钥签发与验签** 〔🔴 现状:apiSecretHash select:false;AgentAccount 侧签发/验签未落地〕
19. WHEN agent 激活 THEN 系统 SHALL 生成密钥对,写入 `publicKey` + `apiKeyPrefix`,`apiSecretHash` 仅存哈希。
20. WHEN agent 代付/被外部调用携带签名 THEN 系统 SHALL 用 `publicKey` 验签,失败即拒绝并审计。
21. THE API secret 明文 SHALL 仅在签发时一次性返回,不可再次读取。

**G 组 — 能力门控与回调** 〔🟡 现状:工具门控疑似走 instance/skill 侧,双源待统一〕
22. THE `capabilities`(MCP tools)SHALL 与该 agent 实际可调用工具集真实绑定;未声明的工具调用 SHALL 拒绝(声明即门控)。
23. THE 系统 SHALL 确立 AgentAccount.capabilities 与 openclaw_instance/skill 侧门控的**单一权威来源**,消除双源冲突。
24. WHEN 配置 `callbacks` THEN 系统 SHALL 在相应事件投递 webhook 并记录投递结果。

**H 组 — 前台可信展示**
25. THE Agent 详情 SHALL 展示钱包/限额/信用/链上身份/能力的真实状态,未落地项标「未启用」而非空占位误导,且与后端字段一致。

> **QA 待决/风险:** ① MPC 托管方案与供应商未定;② 链上身份是否上主网、用哪条链(默认 BSC testnet)待复核;③ 额度重置时区口径待定;④ capabilities 双源权威需在 design 前定;⑤ 密钥管理与轮换安全策略待定。

### 需求 8 —〔散户〕链上研究 / 尽调报告(只读优先,首个垂直活儿)

**用户故事:** 作为散户,我希望对一个 token/钱包/合约/项目下达一句话指令,agent 跨多源自动汇总成结构化尽调报告,以便省下手动翻十几个站点。

> **合格交付物验收清单(合格判定 = 以下全部满足):**
>
> **A. 必备内容(齐全)**
> 1. 标的标识:名称 / 合约地址 / 链 / 项目方。
> 2. 基础信息:类别、上线时间、市值/FDV、流通量/总量、官网+社媒+文档链接。
> 3. 链上活动摘要:持币地址数、Top holders 集中度、流动性、近期交易/活跃度、合约验证状态。
> 4. 风险信号:合约权限(mint/owner/可暂停/可升级代理)、蜜罐/rug 信号、大额解锁、可疑授权、审计状态。
> 5. 关键链接:区块浏览器、DEX/CEX、官方渠道、审计报告(若有)。
> 6. 结论:风险评级 + 一句话摘要。
>
> **B. 真实性与质量(门槛)**
> 7. 每条关键数据附**可核来源链接**;缺失项标「未获取」,**严禁编造**。
> 8. 标注**数据采集时间**;报告内数字**自洽不矛盾**;风险信号**指向具体链上证据**。
> 9. 结构化、可快速阅读;在**可接受时延内**完成(阈值待定,建议 ≤ 5 分钟)。
>
> 任一 A 类必备项缺失,或违反任一 B 类门槛(尤其编造数据)→ 判**不合格**。

#### 验收标准
1. WHEN 用户提供研究目标 THEN agent SHALL 跨预设数据源采集并产出结构化报告(含来源链接)。
2. THE 报告 SHALL 覆盖上方验收清单 A 类全部必备内容,并标注采集时间。
3. THE 此类任务 SHALL 默认仅使用只读浏览器操作。
4. WHEN 报告完成 THEN 系统 SHALL 将其作为可保存、可分享、可复用的交付物落库(归属该 Agent)。
5. IF 某数据源不可达 THEN agent SHALL 跳过并标注缺失,不得编造数据。
6. WHEN 报告产出 THEN 系统 SHALL 依据「合格交付物验收清单」判定合格与否,任一必备项缺失或违反真实性门槛即判不合格。

### 需求 9 —〔散户〕监控与告警

**用户故事:** 作为散户,我希望 agent 持续监控我的持仓/关注列表/治理提案/解锁与空投窗口/安全异常,达到条件时通知我。

#### 验收标准
1. WHEN 用户设定监控目标与触发条件 THEN 系统 SHALL 周期性执行只读检查并在条件满足时推送告警。
2. THE 监控类型 SHALL 至少覆盖:价格/清算/脱锚、治理提案、代币解锁、空投资格/领取窗口、授权与安全异常。
3. THE 告警 SHALL 通过多端(至少桌面 + 移动)送达 Agent 所有者。
4. THE 监控任务 SHALL 可暂停、修改、删除,并展示上次检查时间与结果。

### 需求 10 —〔散户〕安全防护(高刚需获客钩子)

**用户故事:** 作为散户,我希望 agent 帮我盯住钱包安全、签名前先模拟、发现并一键撤销危险授权,以便少被骗局/授权害到钱。

#### 验收标准
1. THE 系统 SHALL 扫描钱包的代币/合约授权并标注高风险项,支持引导撤销(撤销交易需人工签名确认)。
2. WHEN 用户即将签署交易 THEN 系统 SHALL 提供交易模拟/解读(资产变动、目标合约风险)供决策。
3. THE 系统 SHALL 对目标地址/合约/域名做骗局与风险检查并给出明确提示。
4. THE 安全检查 SHALL 以只读为主,不代用户执行资金操作。

### 需求 11 —〔散户〕空投发现与合法协助领取

**用户故事:** 作为散户,我希望 agent 帮我发现我可能有资格的空投、提醒领取窗口,并在我确认下协助完成合法领取,以便不错过应得的空投。

#### 验收标准
1. THE 系统 SHALL 基于用户钱包发现潜在空投资格,并提供资格检查与领取窗口/截止提醒。
2. WHEN 用户合法获得资格并选择领取 THEN agent SHALL 准备/导航/填好领取流程,且领取交易由用户签名确认。
3. WHERE 涉及完成项目要求的合法任务以参与 THE 系统 SHALL 仅以单一真实身份协助,写操作需人确认。
4. THE 系统 SHALL NOT 提供多钱包批量刷量/sybil 薅空投能力(见需求 6 红线)。

### 需求 12 —〔散户〕Auto-Earn（三条腿）

**用户故事:** 作为散户,我希望我的 agent 在我睡觉时也能合法地赚钱,以便资产/能力产生被动收益。

#### 验收标准
1. **被雇佣赚钱(核心):** WHEN 他人/agent 付费调用我挂出的专精 agent THEN 系统 SHALL 以 USDC 结算并按需求 5 自动分佣到我。
2. **合法空投收益:** THE 系统 SHALL 支持需求 11 的合法空投发现/协助领取作为用户自身收益。
3. **自主策略(保留 / 高风险 / 待复核):** WHERE 用户授权 agent 执行做市/挖矿/完成项目任务等链上策略 THE 系统 SHALL 归入高风险档——资金/交易/签名一律人工确认,设预算上限,明确「非投资建议」免责;默认关闭,开放范围与合规待复核。
4. THE 系统 SHALL 为每笔 auto-earn 收益与扣费保留可审计记录。

### 需求 13 —〔项目方 · S0 建设期〕立项与上线准备交付包(P0)

**用户故事:** 作为项目方,我希望 agent 在建设期帮我把文档、品牌社媒、赛道研究、审计协调等基础工作做出可交付成果,以便快速就绪。

#### 验收标准
1. THE 系统 SHALL 产出可交付物:litepaper/tokenomics 草稿(必备章节清单覆盖)、赛道/竞品定位报告。
2. THE 系统 SHALL 协助搭建并配置品牌社媒矩阵(X/TG/Discord/落地页)至「上线可用」状态。
3. THE 系统 SHALL 维护审计/服务商对接清单与进度跟踪。
4. THE 涉及对外发布/账号操作的写动作 SHALL 接入分级审批。

### 需求 14 —〔项目方 · S1 增长期〕社区冷启动与增长交付包(P0 核心)

**用户故事:** 作为项目方,我希望 agent 帮我把社区从零做起来——增长、内容、KOL、活动、审核,并按可量化标准交付,以便低成本获客与转化。

> **共同前提(适用全部交付包):**
> - **账号授权前提:** WHERE 涉及项目方自有社媒/社区账号的写操作,THE 系统 SHALL 先取得显式授权(OAuth/委托),未授权时仅允许只读分析与草稿产出。
> - **能力路径:** 浏览器 CDP 锚定为主;像素点击降级见需求 4。
> - **分级审批锚点(对应需求 3):** 只读/采集 = 🟢;对外发布/批量互动/名单导出 = 🟡(策略+预算放行,新模板首发人确认);KOL 谈判/报价/签约/对外承诺 = 🔴 人确认;买粉/机器人/假互动/无披露喊单/多钱包 sybil = 红线拒绝(对应需求 6,不可绕过)。
> - **真实增长口径:** 所有「增长」指标 SHALL 仅统计平台原生、未被标记为 bot/spam 的真实账户行为;依赖刷量达成的指标 SHALL 判不达标并拒绝执行。

#### 验收标准

**交付包 A — 社媒增长运营(定时发布 + 互动)** 〔🟢 采集/排期;🟡 发布/互动〕
1. WHEN 项目方提供发布排期与内容来源 THEN 系统 SHALL 在授权账号按排期定时发布,每条对外发布前 SHALL 经 🟡 审批(预算/频率上限内放行,新模板首发人确认)。
2. THE 系统 SHALL 按口径量化交付周报:粉丝净增 =(周末−周初)粉丝数;曝光 = 平台原生 impressions;互动率 =(赞+评+转+藏)/曝光(窗口 7 天,两位小数)。
3. THE 增长报告 SHALL 标注采集时间与来源,缺失标「未获取」,SHALL NOT 编造或估算。
4. IF 任一指标的达成路径需买粉/机器人/刷量 THEN 系统 SHALL 拒绝并按红线记录。
5. THE 互动 SHALL 仅以项目方单一真实账号执行,单账号单平台日互动量 SHALL 不超项目方设定且不超平台 ToS 上限;触顶即停并告警。
6. THE 计费 SHALL 为订阅(周期发布/互动配额),按 `user_subscription_usage` 计量。

**交付包 B — 内容 / meme 生产** 〔🟢〕
7. WHEN 项目方提供品牌调性与主题 THEN 系统 SHALL 产出可保存/分享的内容日历(默认 ≥4 周,每周条目 ≥ 设定最小频次)。
8. THE 系统 SHALL 为每个发布位产出配套素材(文案+图/meme 占位),标注主题/计划时间/平台。
9. THE 内容 SHALL NOT 含无披露付费喊单/价格承诺/收益保证;对外发布走交付包 A 的 🟡 审批。
10. THE 计费 SHALL 为订阅(条/周)。

**交付包 C — KOL 发现 / 外联 / CRM** 〔🟢 发现/CRM;🟡 外联;🔴 谈判/报价〕
11. WHEN 项目方提供赛道/受众画像 THEN 系统 SHALL 产出去重+真实性核验的 KOL 名单,每条含:账号、粉丝量、近 30 天均互动率、相关性标签、可核来源。
12. THE 真实性核验 SHALL 标注疑似刷粉信号(粉丝/互动比异常、互动率低于阈值);疑似造假项标记而不计入「合格 KOL」;按唯一标识去重。
13. WHEN 项目方批准外联 THEN 系统 SHALL 经 🟡 审批触达并记 CRM:触达数=唯一外联条数;回复率=回复数/触达数;转化合作数=进入合作状态数。
14. IF 进入报价/佣金/签约/对外承诺 THEN 系统 SHALL 转 � 人确认,agent 仅备料跟踪,SHALL NOT 自动签约。
15. THE 计费 SHALL 为按结果(合格 KOL 条数/转化合作数)或订阅,二选一。

**交付包 D — Quest / 活动(Galxe/Zealy)** 〔🟢 核验;🟡 配置上线〕
16. WHEN 项目方提供活动目标与任务清单 THEN 系统 SHALL 配置活动,配置上线为 🟡 人确认(防错误条件/奖励)。
17. THE 系统 SHALL 交付活动核验报告:合格参与者=完成必做任务且过反 sybil 的唯一参与者;完成率=合格/总参与者;列出被排除者及依据。
18. THE 反 sybil 校验 SHALL 复用需求 15 的只读链上分析,仅识别标记,SHALL NOT 反向用于制造 sybil,SHALL NOT 自动处置奖励发放(由项目方决定)。
19. THE 计费 SHALL 为按结果(合格参与者数)。

**交付包 E — 社区审核 + 情绪日报** 〔🟢 监控/草稿;🟡 清理动作〕
20. WHILE 监控开启 THE 系统 SHALL 持续巡检指定频道,识别垃圾/诈骗/违禁并记录;删除/封禁等清理写动作 SHALL 经 🟡 审批(批量封禁人确认)。
21. THE 系统 SHALL 按日产出情绪日报:响应时间=违规出现到处置(中位数+P90);清理量=当日处置条数(按类型);情绪=正/中/负占比+主要话题。
22. THE 计费 SHALL 为订阅(频道数/周期)。

**交付包 F — 白名单 / 候补名单收集** 〔🟢 采集;🟡 导出〕
23. WHEN 项目方开启名单收集 THEN 系统 SHALL 采集去重报名信息,产出合格 leads 名单;合格 lead=字段完整且过去重与基础真实性校验。
24. THE 系统 SHALL 量化交付:合格 leads 数、去重剔除数、可疑数及依据;名单导出为 🟡 审批(防外泄)。
25. THE 计费 SHALL 为按结果(合格 leads 数)。

**全局合规**
26. THE 所有增长动作 SHALL 遵守需求 6 红线,SHALL NOT 被任何配置或策略绕过。

> **QA 待决/风险:** ① 平台封号/限流风险——频率上限默认值与免责待定;② Galxe/Zealy 是否提供可编程接口或仅 DOM 自动化,待技术核实;③ 刷粉/互动行业阈值、响应时间 P90 目标、各真实性检测阈值均待项目方按平台基线设定;④ KOL 真实影响力无权威数据源,核验为信号级非保证。

### 需求 15 —〔项目方 · 贯穿层〕监控、反作弊与数据报告交付包(P0)

**用户故事:** 作为项目方,我希望 agent 持续监控我的协议/金库/治理与舆情,识别 sybil 作弊,并定期出数据报告,以便及时决策、公平发放激励。

#### 验收标准
1. THE 系统 SHALL 周期性监控项目方指定的协议指标、金库地址、治理提案,异常时告警。
2. WHEN 项目方提供参与者地址/活动数据 THEN 系统 SHALL 基于链上行为输出 sybil/作弊风险评分与可疑簇 + 判定依据(只读分析,不替项目方处置;不得反向用于作弊)。
3. THE 系统 SHALL 提供 FUD/情绪监控与响应草稿。
4. THE 系统 SHALL 按时产出可保存/可分享的运营与数据报告(KPI 看板)。

### 需求 16 —〔项目方 · S2/S3 辅助〕上所 / 做市 / BD / 融资 / 治理（agent 辅助,非交付)

**用户故事:** 作为项目方,我希望 agent 在交易所对接、做市、合作 BD、对外融资、治理等关系/法务密集的事项上替我备料、外联、跟踪,以便提效;但我理解这些最终靠人推进。

#### 验收标准
1. THE 系统 SHALL 提供 CEX/Launchpad 上所的**申请材料准备、提交辅助与状态跟踪**,并明示「最终决策/关系/法务靠人」。
2. THE 系统 SHALL 提供 DEX 上线与流动性/做市的**监控看板**(不代执行 wash trading 等违规拉量,见需求 6)。
3. THE 系统 SHALL 提供合作/集成 BD 与对外融资(IR)的**线索发现、外联草稿、CRM 跟踪**;签约/谈判/法务为 🔴 需人。
4. THE 系统 SHALL 提供治理提案起草/摘要与投票动员辅助。
5. THE 本需求所有事项 SHALL 标注为「agent 辅助」,交付物为备料/外联/跟踪记录,而非承诺结果(如「保证上所」)。

### 需求 17 —〔项目方〕可订阅 / 可租赁的定制 Agent 团队（按结果付费)

**用户故事:** 作为项目方,我希望订阅或租用一个预配置好的定制 agent 团队(按生命周期阶段覆盖我的需求),它们协作交付成果,我按订阅/租期/结果付费,以便不必自己搭建调试多个 agent。

> **现状(已核):** 大部分为已有积木——`agent-team` 模板 `provisionTeam`(批量建 AgentAccount+Instance+资金账户)、多 agent 编排(`multi-agent-collaboration-2026-06` + `worktree_lanes` + `agent_tasks` 父/子)、按结果托管(`agent_hire_escrow`)、租赁(`pet_rental_leases` 可复用)、订阅计量(`user_subscription_usage`)。

#### 验收标准

**A 组 — 团队组建与定制** 〔依赖:AgentTeamTemplate / provisionTeam〕
1. THE 系统 SHALL 允许项目方从 AgentTeamTemplate(visibility=public/official)选模板,或基于交付包(需求 13–16)组合团队蓝图(如「冷启动增长团队包」)。
2. WHEN 项目方 provisionTeam(templateId|slug + teamNamePrefix + roleOverrides)THEN 系统 SHALL 批量创建 AgentAccount + OpenClawInstance + 资金 Account 并绑为一个团队。
3. THE 团队规模 SHALL 支持 1–20 角色;roleOverrides SHALL 仅允许白名单字段(model/capabilities/approvalLevel/spendingLimits)覆盖,不得越权扩权。
4. IF provision 中途失败 THEN 系统 SHALL 回滚已创建成员,不留半成品团队。
5. THE 每个成员 SHALL 继承其 AgentRoleDefinition 的 approvalLevel 与 spendingLimits(对接需求 7)。

**B 组 — 订阅生命周期** 〔依赖:user_subscription_usage〕
6. WHEN 项目方订阅团队 THEN 系统 SHALL 按周期分配配额(任务数/用量)并经 `user_subscription_usage` 计量。
7. WHILE 订阅有效 THE 系统 SHALL 在配额内放行任务;超配额 SHALL 告警并按策略(暂停 / 超额计费,口径待定)处理。
8. WHEN 周期结束 THEN 系统 SHALL 按设置自动续费 / 降级 / 取消。
9. WHEN 取消或降级且有进行中任务 THEN 系统 SHALL 按宽限期完成或冻结(口径见 QA),不丢失已交付成果。

**C 组 — 租赁生命周期** 〔依赖:pet_rental_leases + RentalScheduler〕
10. WHEN 项目方租用团队 THEN 系统 SHALL 按 durationDays 创建租约(startsAt/endsAt/status),租期内团队归租方调度。
11. WHEN 租期到期 THEN RentalScheduler SHALL 回收团队(status=expired)并停止为租方服务。
12. THE 系统 SHALL 支持续租(延长 endsAt);IF 租期内成员故障 THEN 系统 SHALL 补偿(延租或退款,口径待定)。

**D 组 — 按结果付费托管** 〔依赖:agent_hire_escrow,24h 争议窗口〕
13. WHEN 项目方按结果雇用团队 THEN 系统 SHALL 预留(reserve)托管金额 agreedUsd。
14. WHEN 团队交付并验收通过 THEN 系统 SHALL release 金额 = min(agreedUsd, actualCostUsd)。
15. THE release 后 SHALL 有争议窗口 disputeWindowEndsAt(默认 24h),窗口内项目方可发起争议。
16. WHEN 发起争议 THEN 系统 SHALL 进入仲裁(当前为 admin 仲裁,主体待定),裁定 release 或 refund。
17. IF 窗口内无争议 THEN 系统 SHALL 最终释放给团队/成员;WHEN refund THEN 退回项目方并记录。

**E 组 — 团队协作编排** 〔依赖:agent_tasks 父/子 + worktree_lanes〕
18. WHEN 团队收到任务 THEN 系统 SHALL 拆为子任务(agent_tasks 父/子)分派给对应角色,并复用 worktree_lanes 隔离上下文。
19. THE 系统 SHALL 跨角色汇总子任务成果为一个团队级交付物。
20. WHERE 团队成员中途替换 THE 系统 SHALL 保持任务连续性与审计可追溯。

**F 组 — 成果交付与验收**
21. THE 团队交付物 SHALL 可审计、可保存/分享,验收标准沿用对应交付包(需求 13–16)的量化口径。
22. WHEN 交付不达验收标准 THEN 系统 SHALL 标记不合格并触发重做 / 争议流程。

**G 组 — 计量与可见**
23. THE 系统 SHALL 按 `user_subscription_usage` 计量团队用量与交付,并对项目方提供透明看板(区分订阅/租赁/按结果三种口径)。
24. THE 看板 SHALL 展示:已用/剩余配额、进行中/已交付任务、结算与分佣记录。

**H 组 — 多跳分佣** 〔对接需求 5〕
25. WHERE 团队成员为他人创作/调优的专精 agent THE 系统 SHALL 结算时按需求 5 向作者/推广方多跳分佣(链上一次提交),并产生可审计记录。

**I 组 — 权限红线与团队级预算** 〔继承需求 3 / 6〕
26. THE 团队所有动作 SHALL 继承需求 3 分级审批与需求 6 红线,不可绕过。
27. THE 系统 SHALL 支持团队级支出预算上限,优先于单成员限额;触顶即停并告警。

> **QA 待决/风险:** ① 三种计费能否在同一团队混用、切换边界未定;② 争议仲裁主体(admin / 去中心化)待定;③ 团队定价模型与 SLA 待定;④ 超配额策略(暂停 vs 超额计费)待定;⑤ 订阅到期/租期内有进行中任务的处理宽限期待定;⑥ pet_rental_leases 复用到 agent 租赁是否需扩展、escrow 与链上结算(需求 5/7)的打通为前置依赖。

### 需求 18 — 北极星与验证门槛

**用户故事:** 作为团队,我希望用真实结果而非 DAU 判断专项是否成立,以便快速验证或转向。

#### 验收标准
1. THE 北极星 SHALL 为「本周产生真实结果交付/真实收入的 Agent 数」,而非单纯活跃数。
2. THE 系统 SHALL 按以下三指标度量首个垂直活儿(需求 8 尽调)的可靠性,依据其「合格交付物验收清单」判定:
   - **自主完成率**(全程无人工救场即交付合格 / 总尝试)≥ **80%**;
   - **质量合格率**(交付物经人工抽检判为合格 / 已交付)≥ **90%**;
   - 自主完成率为核心生死线指标,质量合格率防「跑完了但报告是垃圾」。
3. WHEN 上述阈值与首批付费/分享信号达成 THEN 专项 SHALL 进入扩张(下一保龄球瓶);否则先修能力或换活儿。
4. THE 系统 SHALL 记录冷启动漏斗(创建 Agent → 跑首个任务 → 拿到合格交付 → 付费/分享)。

---

## 交付阶段 / 优先级（Phasing）

- **P0(滩头先做):** 散户 = 需求 8(尽调)+ 9(监控)+ 10(安全防护)+ 12.1(被雇佣赚钱);项目方 = 需求 13(S0)+ 14(S1 增长)+ 15(贯穿监控/反作弊/报告)。底座 = 需求 1–7 中支撑上述的部分(浏览器锚定、分级审批、结算分佣、AgentAccount 打通)。
- **P1(滩头验证后):** 需求 11(空投协助)、16(S2/S3 辅助:上所/做市/BD/融资/治理)、17(订阅/租赁 Agent 团队产品化)、4(桌面 GUI 加固)。
- **待复核 / 缓做:** 需求 12.3(自主策略)。
