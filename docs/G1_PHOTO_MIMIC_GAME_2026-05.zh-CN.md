# G1 · 宠物模仿秀（Photo Mimic Game）设计文档

> 版本：v1.0 · 2026-05-10
> 范围：移动端 + 后端 + AXP 经济钩子
> 上游：[MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05](MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05.zh-CN.md) §6 多人游戏 / Phase 1
> 依赖：PetGenerationModule（已上线）、AxpModule（已上线）、PetCoRaisingModule（已上线）

---

## 1. 产品定义

**一句话**：拍任何东西 → AI 把它变成萌宠 Agent → 朋友投票"谁拍得最像"。

**核心价值**：
- 零门槛（没号也能玩）· 强社交（投票+分享）· 利用现有 PetCreator 杀手级能力
- 与共养 / 贺卡并列为"Phase 1 三大裂变游戏"
- 每周一轮赛季，奖金池用 AXP 发放

**用户心智路径**：
```
看到朋友晒出一张"咖啡杯变小宠"
  → 自己也想试 ➜ 拍一张自己桌上的东西
  → 3 分钟得到一只专属宠
  → 发到赛季榜请大家投票
  → 被投中就赚 AXP + 排行
  → 每周赛季冠军 5000 AXP ≈ $5
  → 想赢 → 拍更好玩的照片 → 继续裂变
```

---

## 2. 核心闭环

### 2.1 参与闭环

| # | 步骤 | 触发的 AXP |
|--:|------|:----------:|
| 1 | 选一个赛季主题（例：本周"桌上的东西"）| — |
| 2 | 拍照 / 选图（手机相册）| — |
| 3 | 可选填 1-2 句说明（"我的马克杯"）| — |
| 4 | 点击"生成模仿宠"→ 走 PetCreator 管线（image → 3D）| — |
| 5 | 生成完成 → 弹 AXP 飘字 | **+30 AXP**（`game_participate`） |
| 6 | 自动上到本周赛季投票榜 | — |
| 7 | 投票期（每赛季 7 天） | 每个用户每日可投 3 票 |
| 8 | 赛季结束 → 结算 | 冠军 **+5000**（`contest_win`）/ Top 10 **+500**（`game_participate`，通过 admin_grant 发放） |

### 2.2 投票闭环（社交引擎）

- 任何登录用户每日可投 3 票（`daily_vote_cap`）
- 投票者投到最终冠军 → 额外 **+20 AXP 伯乐奖**（`game_participate`）
- 匿名投票（防刷）：按用户 userId 去重 + IP 双重约束
- 投票计数 + 用户自己的作品自动屏蔽（不能投自己）

### 2.3 赛季规则

- 每周一 00:00 UTC 开新赛季
- 每赛季 1 个主题（运营配置）
- 作品提交窗口 5 天（周一–周五），投票窗口 7 天（覆盖整周）
- 周日 23:59 UTC 冻结投票 → 次日 Monday 00:30 UTC 自动结算
- 冠军作品置顶"名人堂"7 天

---

## 3. 数据模型

### 3.1 `photo_mimic_seasons`

| 列 | 类型 | 说明 |
|---|------|------|
| id | uuid pk | |
| theme_code | varchar(48) | 唯一主题码（'2026W19_desktop_things'）|
| theme_title_en | varchar(160) | 英文标题 |
| theme_title_zh | varchar(160) | 中文标题 |
| theme_desc_en/zh | text | 描述 |
| submit_open_at | timestamptz | 提交开始 |
| submit_close_at | timestamptz | 提交截止 |
| vote_close_at | timestamptz | 投票截止 |
| settled_at | timestamptz nullable | 结算完成时间 |
| prize_pool_axp | bigint | 冠军+前10+投中者分配池（默认 10000）|
| champion_entry_id | uuid nullable | 结算后回填 |
| status | enum | upcoming / submitting / voting / settled |
| created_at / updated_at | timestamptz | |

### 3.2 `photo_mimic_entries`

| 列 | 类型 | 说明 |
|---|------|------|
| id | uuid pk | |
| season_id | uuid fk | |
| user_id | uuid | 作者 |
| pet_generation_task_id | varchar(96) | 关联 PetGenerationTask.taskId |
| source_image_url | text | 原图（用户拍的实物）|
| generated_model_url | text nullable | AI 生成的 3D/GLB URL |
| generated_thumbnail_url | text nullable | 缩略图 |
| caption | varchar(200) nullable | 用户说明 |
| vote_count | int default 0 | 累计票数（冗余）|
| final_rank | int nullable | 结算后写入（1 = 冠军）|
| axp_rewarded | int default 0 | 累计该条目发放的 AXP |
| status | enum | generating / active / disqualified / archived |
| created_at | timestamptz | |

索引：`(season_id, vote_count DESC)` 用于榜单查询。

### 3.3 `photo_mimic_votes`

| 列 | 类型 | 说明 |
|---|------|------|
| id | uuid pk | |
| season_id | uuid fk | |
| entry_id | uuid fk | |
| voter_user_id | uuid | |
| voted_at | timestamptz | |

唯一约束：`(season_id, entry_id, voter_user_id)` 防重复投同一条目。
业务约束（service 层）：每用户每日 ≤ 3 票（跨 entry）。

---

## 4. API 设计

所有 `/api/v1/games/photo-mimic/*`，JWT-guarded 除非标注 `(public)`。

| 方法 | 路径 | 用途 |
|-----|------|-----|
| GET | `/seasons/current` (public) | 当前活跃赛季 |
| GET | `/seasons/:id/leaderboard` (public) | 赛季榜（分页 20） |
| POST | `/entries` | 提交作品：`{ season_id, source_image_url, caption, provider? }` → 触发 PetGeneration + 记录 entry + 发 +30 AXP |
| GET | `/entries/:id` (public) | 单条详情（用于分享 landing） |
| GET | `/entries/mine` | 我的参赛历史 |
| POST | `/votes` | 投票：`{ entry_id }` → 检查 daily cap + 去重 + vote_count++ |
| GET | `/votes/mine/today` | 今日已投数 + 剩余票数 |

返回体统一包 `{ ok: true, data: ... }` 风格（和 AxpController 一致）。

---

## 5. 前端实现

### 5.1 路由

Plaza · 玩乐段 Feed 顶部加一张 banner：

```tsx
<SectionCard
  emoji="📸"
  title="宠物模仿秀 · 本周「桌上的东西」"
  body="拍张照 → AI 造一只专属宠 · 冠军奖 5000 AXP"
  cta="参赛"
  onPress={() => navigation.navigate('PhotoMimic')}
/>
```

### 5.2 屏

| 屏 | 路径 | 职责 |
|---|-----|-----|
| `PhotoMimicSeasonScreen` | `plaza/play/photo-mimic` | 当前赛季头图 + 规则 + 榜单 Top 20 + 我的作品入口 + "拍一张"按钮 |
| `PhotoMimicSubmitScreen` | `plaza/play/photo-mimic/submit` | 拍照/选图 + caption 输入 + provider 选择（默认 Meshy）+ 提交 |
| `PhotoMimicEntryScreen` | `plaza/play/photo-mimic/entry/:id` | 单条作品详情 + 大图 + 投票按钮 + 分享海报（复用 P1 PosterShareCard）|

### 5.3 AXP 交互

- 提交成功 → `showAxpToast({ amount: 30, emoji: '📸', reason: '宠物模仿秀参赛奖励' })`
- 投票成功 → toast "已投票 · 本日剩 X 票"
- 结算日推送：app-level 通知 "您的作品获得第 N 名，+XXX AXP 已入账"

### 5.4 空态 / 失败态

- 当前赛季尚未开放 → "下一轮赛季 X 月 X 日开启"
- PetGeneration 失败 → 条目状态 = disqualified，显示 "生成失败 · 已返还参与奖 AXP"

---

## 6. AXP 经济边界

| 事件 | source key | 金额 | 是否进 prize_pool | 风险 |
|------|-----------|-----:|:----:|-----|
| 参赛 | `game_participate` | 30 | 否（平台出）| daily_cap=5 防自我刷 |
| 冠军 | `contest_win` | 5000 | 是 | 每赛季 1 次 |
| Top 10 | `game_participate`（admin_grant）| 500 | 是 | 每赛季 ≤ 10 次 |
| 伯乐（投中冠军）| `game_participate` | 20 | 是 | 单赛季最多 100 人受惠 |

**prize pool 上限**：`5000 + 500*9 + 20*100 = 11500 AXP`
**平台额外补贴**：`30 * 每赛季参与人数`

→ 10k MAU，每赛季 500 人参与：`30 * 500 + 11500 = 26500 AXP / week ≈ $26.5`，一年 `$1.4k`，完全可接受。

---

## 7. 实现拆分

### 7.1 后端（3 个文件 + 1 migration）

| 文件 | 职责 |
|------|------|
| `backend/src/entities/photo-mimic-season.entity.ts` | `photo_mimic_seasons` |
| `backend/src/entities/photo-mimic-entry.entity.ts` | `photo_mimic_entries` |
| `backend/src/entities/photo-mimic-vote.entity.ts` | `photo_mimic_votes` |
| `backend/src/modules/photo-mimic/photo-mimic.service.ts` | 核心业务（提交、投票、结算）|
| `backend/src/modules/photo-mimic/photo-mimic.controller.ts` | REST 端点 |
| `backend/src/modules/photo-mimic/photo-mimic.module.ts` | Module 定义 |
| `backend/src/migrations/1787000000000-PhotoMimicGameG1.ts` | 3 表 + 索引 |
| `backend/src/modules/photo-mimic/photo-mimic.settle.task.ts` | @Cron weekly 结算任务（先做 manual admin endpoint，cron 后置）|

### 7.2 前端（2 个文件）

| 文件 | 职责 |
|------|------|
| `src/services/photoMimic.api.ts` | API client（fetchCurrentSeason / leaderboard / submit / vote）|
| `src/screens/plaza/PhotoMimicSeasonScreen.tsx` | 3 合 1（赛季头 + 榜单 + 提交跳转）|

两步走：先做一屏 MVP（赛季头 + 榜单 + 提交），如 demo 通过再拆 SubmitScreen / EntryScreen 精细化。

---

## 8. 非目标（Phase 2 再做）

- ❌ 短视频/动画作品（只支持单张图 Phase 1）
- ❌ 赛季自动回放动画
- ❌ 跨赛季积分榜
- ❌ 投票者组队（PvP team mode）
- ❌ NFT 化冠军作品（可做但需合约联调，搁置）

---

## 9. 回归测试点

- L1：`photoMimicConstants.test.ts`（奖池数额、daily_cap）
- L2：smoke `/v1/games/photo-mimic/seasons/current` 返回 200
- L3：Maestro `16-photo-mimic.yaml`（进屏 → 看到"参赛"按钮 → 截图）
- 手工：提交 → 查榜 → 投票 → 确认 AXP 到账

---

*Agentrix Mobile Games · 2026-05-10*
