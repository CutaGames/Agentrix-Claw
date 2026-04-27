# Agentrix 7x24 非开发 Agent 自运营启动清单

本文是第 9 章商业化执行与第 10 章自进化机制的落地资产。目标是先让开发以外的 agent 在低风险范围内 7x24 跑起来：自动采集、整理、分析、生成草稿、建立任务队列和审批队列，但不自动做生产部署、数据库变更、主分支/build 分支 push、外部承诺、群发邮件或大额财务动作。

## 启动原则

| 风险等级 | 自动化边界 | 示例 |
|---|---|---|
| 绿色自动 | 只读采集、公开资料整理、内部报告、草稿、去重、归档、低风险 issue triage | 竞品变化、GitHub stars、APK 下载量、社群问题摘要、内容草稿 |
| 黄色待审 | 轻量增长实验、feature branch push、内容发布排期、低预算 API 使用、合作线索跟进草稿 | A/B 文案、内测招募草稿、KOL 回复建议 |
| 红色人工 | 生产部署、DB migration、main/build 分支 push、财务 > $500、对外发布、群发邮件、商务承诺、credential access | 部署、正式官宣、资源申请提交、合作协议、钱包转账 |

## 9+10 合并执行模型

第 9 章回答“怎么商业化”：可销售入口、定价、收费服务、增长漏斗、商户和开发者收益。第 10 章回答“谁持续执行”：agent 团队如何采集信号、生成实验、形成报告、进入审批和复盘。两者要合并成一个 operating loop：

1. Signals：竞品、用户反馈、社交、社群、GitHub、APK 下载、成本、资源机会。
2. Decisions：ops 汇总，ceo 排序，growth/brand/community/media/ecosystem/hunter/treasury 形成可执行任务。
3. Execution：绿色任务自动跑，黄色任务进入审批，红色任务只产出建议和材料。
4. Measurement：每日经营日报、每周实验复盘、每月市场/资源/财务复盘。
5. Learning：把有效任务沉淀为 prompt、runbook、agent 指令和产品实验。

## Day 0 已启动记录

| Agent | 本轮已启动产出 | 可继续自动跑的范围 |
|---|---|---|
| ops | 产出非开发 agent 每小时/每日/每周节奏、自动/审批边界、日报结构 | 每日汇总各 agent 状态、生成经营日报和异常队列 |
| growth | 产出第一周 3 个增长实验：竞品对比内容、ClawLink APK 内测、Agent 团队公开日记 | 采集增长基线、生成实验 brief、整理 UTM 与线索清单 |
| hunter | 产出第一周免费资源目标与监控关键词 | 搜索云额度、LLM credits、grant、accelerator、hackathon，做优先级台账 |

## 每小时循环

| Owner | 自动任务 | 输出 |
|---|---|---|
| ops | 检查 production health、public build run、GitHub/API 可用性、异常变更 | incident queue、status snapshot |
| growth | 采集 GitHub stars、APK 下载、官网/下载入口可用性、渠道点击基线 | growth snapshot |
| media | 搜索 agent economy、personal agent、Agentrix/OpenClaw/Hermes 相关公开讨论 | content opportunity queue |
| community | 汇总 Discord/Telegram/GitHub Issues/Discussions 高频问题 | feedback themes |
| hunter | 轮询 startup credits、AI grant、hackathon、accelerator 关键词 | resource opportunity queue |

## 每日任务清单

| Agent | 今日低风险任务 | 输出物 |
|---|---|---|
| ops | 汇总 health、build、成本、增长、社群、资源机会；标记 blocked/approval 项 | `ops_daily_report_YYYYMMDD.md` |
| growth | 建 Day 0 指标基线；写 3 个实验 brief；整理 lead/channel 清单 | `growth_experiment_briefs_YYYYMMDD.md` |
| media | 生成 3 类内容草稿：产品进展、技术深度、agent economy 观点 | `media_content_drafts_YYYYMMDD.md` |
| community | 归类用户反馈、FAQ 候选、内测群欢迎语和升级规则 | `community_feedback_YYYYMMDD.md` |
| brand | 审核公开文案草稿的定位、语气、禁用表达；维护品牌话术 | `brand_review_YYYYMMDD.md` |
| ecosystem | 收集 MCP、A2A、ERC-8004、X402、SDK/skill marketplace 生态动态 | `ecosystem_digest_YYYYMMDD.md` |
| hunter | 收集免费资源、云额度、LLM credits、grant、hackathon，按价值/成本排序 | `resource_ledger_YYYYMMDD.md` |
| treasury | 只读整理成本、预算、支出机会、bounty/airdrop 低风险机会 | `treasury_snapshot_YYYYMMDD.md` |

## 第一周增长实验

| 实验 | 假设 | 指标 | 配合 agent | 审批 |
|---|---|---|---|---|
| 竞品对标内容 | Agent Economy/个人 agent 用户会搜索对比内容，高质量对标能带来定向流量 | 官网 UV、GitHub star、社交互动 | growth、media、brand、community | 对外发布需人工批准 |
| ClawLink APK 内测 | 移动端个人 agent 体验稀缺，APK 内测能激活早期用户 | APK 下载、内测申请、社群活跃 | growth、media、community、brand | 招募帖、表单上线需人工批准 |
| Agent 团队公开日记 | 11-agent 自运营本身是产品演示，连续公开日志能形成差异化叙事 | 关注增长、订阅、互动 | growth、media、ops、brand | 对外发布需人工批准 |

## Resource Pod 第一周目标

| 类别 | 目标 | 今日动作 |
|---|---|---|
| 云额度 | AWS/GCP/Azure/Vercel/Railway/Render/DigitalOcean | 收集入口、条件、到期日、申请材料 |
| LLM credits | OpenAI、Anthropic、Together、Cohere、Mistral、Hugging Face | 搜索 startup/OSS/trial 计划，记录限制 |
| Grant/基金 | GitHub OSS、Protocol Labs、Filecoin、Solana、AI/OSS grant | 建优先级列表和申请材料缺口 |
| 加速器 | YC Startup School、Techstars、500 Startups、AI/Web3 programs | 收集报名截止时间与要求 |
| Hackathon | Devpost、MLH、ETHGlobal、Gitcoin | 记录奖金、曝光、技术适配度 |

## 日报模板

```markdown
# Agentrix Operating Daily Report - YYYY-MM-DD

## Status
- Production health:
- Public mobile build:
- Desktop release artifacts:
- Active risks:

## Metrics
- Users / activation:
- APK downloads:
- GitHub stars / issues:
- Community activity:
- Content reach:
- Cost / resource usage:

## Agent Outputs
- ops:
- growth:
- media:
- community:
- brand:
- ecosystem:
- hunter:
- treasury:

## Approval Queue
- Red approvals:
- Yellow approvals:

## Tomorrow
- Top 3 tasks:
- Blockers:
```

## 验收标准

- 每日有一份经营日报，至少覆盖 build/health、增长、社群、内容、资源、成本和审批队列。
- 每周至少 3 个增长或产品实验进入草稿、审批或执行。
- Resource Pod 每周至少提交 10 个可申请资源机会，且每项有价值、截止时间、申请条件和审批状态。
- 100% 红色动作只进入审批，不由 agent 自动执行。
- 每个 agent 输出可以回溯到一个指标、一个用户学习目标或一个成本治理目标。