# Agentrix 双人群话术参考库 · 2026-05

> 出处:`.kiro/specs/positioning-revision-2026-05/`(产品负责人 4 项决策)
> 主文档:`docs/agentrix-positioning-2026-05.zh-CN.md`(2026-05-24 修订版)
> 适用范围:landing copy / press kit / blog templates / 投资人话术 / 销售脚本
> 撰稿:CEO + Brand + Growth(2026-05-24)
> **本文档不直接驱动 frontend 代码**——`frontend/pages/index.tsx` 与
> `frontend/components/marketing/` 当前以 pet-as-agent GTM 叙事运行,
> 双人群话术作为**参考库**与未来话术升级的素材库,GTM 切换时机另立决策。

---

## 0. 一句话约束(产品负责人决策)

| # | 约束 | 不可妥协 |
|---|------|---------|
| 1 | 用户优先级:**非编程优先(默认 Simple)**,**程序员一键切 Pro** | ✅ |
| 2 | 付费侧:**Unified_Agent_Plan 单一订阅**,**不出独立 Coding Plan SKU** | ✅ |
| 3 | 与 Cursor / VS Code 关系:**协作而非替代**(扩展 + IdeBridge) | ✅ |
| 4 | Simple → Pro 切换:**手动一键 mode picker**,**不做自动检测** | ✅ |

任何与上面 4 条冲突的话术 = 错误,**直接拒绝**。

---

## 1. Hero / 落地页大字 — 双人群版本

| 版本 | 话术 | 适用场景 |
|------|------|---------|
| **A · 双人群通用** | "和 Agentrix 一起,把 idea 做成现实" | landing 主大字、所有人群 |
| **B · 非编程倾斜** | "你说人话,它把事做完——AI 协作伙伴" | 抖音 / 小红书 / 创作者社群 |
| **C · 程序员倾斜** | "Cursor 写代码的时候,Agentrix 在做你不在 IDE 里的事" | HN / GitHub / 程序员博客 |
| **D · 投资人** | "Pet-as-Agent 经济 × Unified_Agent_Plan × 跨端 × 跨工具" | pitch deck cover |

**约束**:A 永远首选,B/C 是变体投放渠道,**D 不进 C2C 落地页**。

---

## 2. 一句话副标题(hero 大字下方那行)

| 版本 | 话术 |
|------|------|
| 默认 | "默认 Simple 模式服务非编程,程序员一键切 Pro 解锁完整 coding 视图" |
| 短版 | "你说人话,它把事做完" |
| 程序员变体 | "把跨工具记忆 / 长任务 / 跨端协作,补在你已有的 Cursor 或 VS Code 上" |

---

## 3. 各人群一句话话术

| 人群 | 话术 |
|------|------|
| **给非技术朋友** | "**ChatGPT 帮你想,Agentrix 帮你做**" |
| **给独立创业者 / 一人公司** | "Notion + Canva + ChatGPT 拼凑卡在落地?Agentrix 把 idea 一路做到能跑、能用、能赚钱" |
| **给产品经理** | "你写 PRD 给 Agentrix,它直接交付,不用排期" |
| **给设计师 / 运营** | "懂一点 HTML / 公式没关系,Agentrix 把'想到'和'做出来'连起来" |
| **给程序员朋友(新版)** | "**Agentrix 让 Cursor / VS Code 多一层**:跨工具记忆 + 跨端协作 + 长任务后台,补在你已有的 IDE 工作流之上" |
| **给独立开发者(新版)** | "你的 Cursor 写完代码就不管了,Agentrix 帮你把'写完之后'的事做了——编译验证、跨端推送、长任务后台、跨工具上下文" |
| **给投资人** | "面向 LLM 时代全人群,**Unified_Agent_Plan 单一订阅覆盖非编程 + 程序员**两边市场。差异化护城河 = 跨端 + 跨工具 + 长任务" |

**注意**:
- "给程序员朋友"行**绝对不能**说"Cursor 是给程序员的,Agentrix 是给所有人的"——这把 Cursor 用户从我们的目标人群里划走了。
- "给非技术朋友"保留原话术 verbatim,这是最强 sound bite,不要重写。

---

## 4. Press kit boilerplate

### 4.1 中文(125 字)

> Agentrix 是面向所有想把 idea 做成现实的人(程序员 + 非编程用户)的 AI 协作伙伴。默认 Simple 模式服务非编程优先,程序员一键切 Pro 解锁完整 coding 视图。我们不与 Cursor / VS Code 在编辑器层正面竞争,而是通过 VS Code / Cursor 扩展 + IdeBridge 协作,把跨工具记忆 / 长任务 / 跨端协作注入你已有的 IDE 工作流。Unified_Agent_Plan 单一订阅覆盖全人群。

### 4.2 英文(120 words)

> Agentrix is the AI collaboration partner for everyone who wants to turn ideas into reality — both programmers and non-coders. Default Simple mode serves non-technical users first; programmers switch to Pro mode with one click for the complete coding surface. We don't compete with Cursor or VS Code at the editor layer — instead, our VS Code / Cursor extensions and IdeBridge two-way protocol inject Agentrix's unique cross-tool memory, long-running task execution, and cross-device collaboration into your existing IDE workflow. Single Unified Agent Plan subscription, no separate coding tier required.

---

## 5. Blog post 开头模板

### 5.1 技术博客(给程序员)

```markdown
# 我用了 Cursor 三年。然后我装了 Agentrix。

Cursor 改变了"写代码"。但写代码只占程序员每天 30% 的时间。

剩下 70% 在哪?
- 在 Chrome 看文档
- 在 Notion 改 PRD
- 在 Slack 回 PM
- 在 Office 改竞品分析
- 等 CI 跑完
- 等部署完
- 在手机上 review PR

Cursor 在这 70% 里**完全不在场**。

Agentrix 不取代 Cursor。它**记住**你在 Cursor 里写了什么,然后跨 Chrome / Notion /
Slack / Office 跟着你跑——就是程序员一直缺的那个"跨工具上下文记忆 + 长任务后台"。
```

### 5.2 创作者博客(给非技术)

```markdown
# 我没有学会写代码,但我做出了我的 SaaS。

ChatGPT 让我想清楚我要什么。
Notion 让我画清楚结构。
Canva 让我设计漂亮。
但我**做不出来**。

直到我用 Agentrix。

我说人话:"帮我做一个能让用户付费订阅我心理学课程的网站,Stripe 付款,Claude
对话答疑,部署到 Vercel,域名我已经买好了。"

它做完了。
```

---

## 6. 投资人话术速查

| 一句话 | 用法 |
|--------|------|
| "AI 协作伙伴,不是 AI IDE" | 立刻拉开与 Cursor 的赛道差异 |
| "Unified_Agent_Plan 单一订阅,覆盖全人群" | 解释为何不切独立 Coding Plan |
| "Coding_Plan_Revenue 仍是行业核心盈利来源,我们用 Pro Mode 承载" | 不放弃程序员市场的明文承诺 |
| "差异化护城河 A_Path:跨工具 / 长任务 / 跨端 / 人话交付 / Living Pet" | 5 件事一组 |
| "C_Path 协作伴侣:VS Code / Cursor 扩展 + IdeBridge 双向桥接" | 程序员触达策略 |
| "Simple 默认,程序员手动切 Pro,不做自动检测" | 体验决策的成熟度 |

---

## 7. 禁用话术(已被本次定位修订移除的旧版本)

| ❌ 禁用 | ✅ 替代 | 禁用理由 |
|--------|--------|---------|
| "面向不会写代码的人的 AI 协作伙伴"(单独使用) | "面向所有想把 idea 做成现实的人(程序员 + 非编程用户)的 AI 协作伙伴" | 把程序员从目标人群划走 |
| "Cursor 是给程序员的,Agentrix 是给所有人的" | "Agentrix 让 Cursor / VS Code 多一层(扩展 + IdeBridge)" | 让 U4/U5 程序员看到觉得"我不是被欢迎的" |
| "我们不出 VS Code 扩展" | "VS Code / Cursor 扩展是 C_Path 主形态(P3 sprint 上线)" | 与新路线图直接冲突 |
| "我们做的是 AI IDE" | "我们做的是 AI 协作伙伴" | 避免被分类到 Cursor 同一档 |
| "代码生成工具" | "把 idea 做成现实的伙伴" | 太工具化,失去伙伴感 |
| "全自动开发" | "陪你做事,关键时刻你确认" | 夸大,违背 approval 三层 |
| "L2 risk approval needed"(对外) | "需要你确认一下" | 工程化术语对用户毫无意义 |
| "context tokens used 75%"(对外) | "对话长度:约 3/4 满"或不显示 | 同上 |
| "只服务非编程用户" | "默认非编程友好,程序员一键切 Pro 模式" | 双人群定位的硬约束 |
| "独立 Coding Plan / Pro Coder Plan" | "Unified_Agent_Plan 通过 Pro Mode 解锁 coding 体验" | 与 §6.4 商业模型冲突 |

---

## 8. i18n 结构化片段(供未来 frontend / mobile 直接消费)

```yaml
# YAML 版 — 直接 import 到 i18n
zh:
  positioning:
    hero:
      default: "和 Agentrix 一起,把 idea 做成现实"
      nonCoder: "你说人话,它把事做完——AI 协作伙伴"
      programmer: "Cursor 写代码的时候,Agentrix 在做你不在 IDE 里的事"
    subtitle:
      default: "默认 Simple 模式服务非编程,程序员一键切 Pro 解锁完整 coding 视图"
      short: "你说人话,它把事做完"
      programmer: "把跨工具记忆 / 长任务 / 跨端协作,补在你已有的 Cursor 或 VS Code 上"
    pitch:
      nonTech: "ChatGPT 帮你想,Agentrix 帮你做"
      pm: "你写 PRD 给 Agentrix,它直接交付,不用排期"
      programmer: "Agentrix 让 Cursor / VS Code 多一层:跨工具记忆 + 跨端协作 + 长任务后台,补在你已有的 IDE 工作流之上"
      indieDev: "Cursor 写完代码就不管了,Agentrix 帮你把'写完之后'的事做了"
      investor: "面向 LLM 时代全人群,Unified_Agent_Plan 单一订阅覆盖非编程 + 程序员两边市场"
en:
  positioning:
    hero:
      default: "Turn your ideas into reality with Agentrix"
      nonCoder: "Just say it. Agentrix gets it done."
      programmer: "Cursor writes code. Agentrix runs everything else."
    subtitle:
      default: "Simple mode for non-coders by default. Programmers switch to Pro with one click."
      short: "Say it in plain words. Agentrix does the rest."
      programmer: "Cross-tool memory, long-running tasks, and cross-device handoff — added on top of your Cursor or VS Code."
    pitch:
      nonTech: "ChatGPT helps you think. Agentrix helps you build."
      pm: "Hand the PRD to Agentrix. It delivers — no engineering queue."
      programmer: "Agentrix gives Cursor / VS Code one more layer: cross-tool memory, cross-device collaboration, long-running tasks — on top of your existing IDE workflow."
      indieDev: "Cursor stops once the code is written. Agentrix handles what comes after."
      investor: "AI partner for the LLM era — both coders and non-coders. Unified Agent Plan: single subscription for both markets."
```

```json
// JSON 版 — 直接 import 到 React i18next 之类
{
  "positioning": {
    "hero": {
      "default.zh": "和 Agentrix 一起,把 idea 做成现实",
      "nonCoder.zh": "你说人话,它把事做完——AI 协作伙伴",
      "programmer.zh": "Cursor 写代码的时候,Agentrix 在做你不在 IDE 里的事",
      "default.en": "Turn your ideas into reality with Agentrix",
      "nonCoder.en": "Just say it. Agentrix gets it done.",
      "programmer.en": "Cursor writes code. Agentrix runs everything else."
    }
  }
}
```

---

## 9. 销售对话脚本(对接客户/合作方时)

### 9.1 客户问 "你们和 Cursor 区别是什么?"

> "Cursor 是给程序员在 IDE 里写代码用的;**Agentrix 不在编辑器里和 Cursor 卷,而是把程序员离开 IDE 之后的事——跨 Chrome / Office / Notion 的上下文、合上电脑后的长任务、跨端的同步——补在 Cursor 之上**。我们也出 VS Code / Cursor 扩展,把 Agentrix agent 注入你的 IDE chat 面板,所以你不用换工具。"

### 9.2 客户问 "我不会写代码,你们能用吗?"

> "**完全可以。我们的默认就是 Simple 模式,完全不让你看到代码、diff、tier router 这些工程化概念**。你只要说人话,Agentrix 把事做完——做完后给你人话总结 + 自动验证 + 截图。`ChatGPT 帮你想,Agentrix 帮你做`,就是这个意思。"

### 9.3 客户问 "你们出独立的 coding plan 吗?"

> "**不出**。我们采用 Unified_Agent_Plan 单一订阅,覆盖所有人。Coding 的高阶能力——raw diff、IDE 桥接、`@symbol` mention、Plan/Agent/Ask 切换——都在 **Pro Mode** 里,**通过 mode picker 一键切换**,不需要重新付费。"

### 9.4 客户问 "你们是不是要做 IDE?"

> "**不是。**我们明确否决了'做新 IDE'路径(B_Path)——做不过 Cursor + 用户也不在编辑器里。我们的护城河在'编辑器之外':跨工具记忆、长任务、跨端、人话交付、Living Pet 灵魂经济。"

---

## 10. 引用 / SSOT

- 主决策出处:`docs/agentrix-positioning-2026-05.zh-CN.md`(2026-05-24 修订版)
- Spec 工作流:`.kiro/specs/positioning-revision-2026-05/{requirements.md, tasks.md}`
- 校验脚本:`desktop/scripts/validate-positioning.mjs`(12/12 PASS)
- 修订 commit:`f93365552`

如本文档与 positioning 主文档冲突,**以主文档为准**。
本文档作为话术工具书,**修订时同步主文档变更**。
