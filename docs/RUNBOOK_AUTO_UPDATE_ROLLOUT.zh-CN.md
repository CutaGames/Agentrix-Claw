# Auto-Update Rollout Runbook（桌面端灰度发布手册）

> 适用于 Sprint G-3 起的所有桌面端版本发布。
> Owner：DevOps / 产品。
> 紧急联系：Telegram 群 `#desktop-incidents`。

---

## 0. 出发前检查清单

发布新版本之前必须确认：

- [ ] 新版本已通过完整 CI（vitest 67+ / jest 21+ / Tauri build）
- [ ] 新版本本地装机测试通过（GA Gate Demo 12 步）
- [ ] 已生成 ed25519 签名 `.sig` 文件（CI 自动产出）
- [ ] 已上传到 `agentrix.top/downloads/desktop/Agentrix Desktop_<version>_x64-setup.exe`
- [ ] CHANGELOG 已写完
- [ ] 客服 / 运营了解新版本的 P0/P1 改动（可能引发的支持问题）

---

## 1. 灰度阶段

| 阶段 | 时间 | rollout_percent | 行为 |
|------|------|----------------:|------|
| **Day 0** | 发布日 | 10 | 仅约 10% 用户收到通知 |
| **Day 1-3** | 观测 | 10 | 监控崩溃率 / 安装成功率 / 留存 |
| **Day 4** | 评估 | → 50 | 通过则扩大；不通过则修复发 patch |
| **Day 5-6** | 观测 | 50 | 持续监控 |
| **Day 7** | 全量 | → 100 | 全量发布 |

---

## 2. 发布步骤（Day 0）

### 2.1 INSERT 新版本到 releases 表

通过 SSH 连接生产数据库：

```bash
ssh -i C:\Users\15279\Desktop\hq.pem ubuntu@47.130.176.148
```

打开 psql：

```bash
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USERNAME -d $DB_DATABASE
```

执行：

```sql
-- 替换 <version> / <signature> / <notes> 为真实值
INSERT INTO agentrix_desktop.releases (
  version, channel, target, arch,
  url, signature, notes_md,
  rollout_percent, is_active, pub_date
) VALUES (
  '0.2.1',
  'stable',
  'windows',
  'x86_64',
  'https://agentrix.top/downloads/desktop/Agentrix Desktop_0.2.1_x64-setup.exe',
  '<ed25519 signature 来自 CI artifact>',
  E'## v0.2.1\n\n- 修复 G-2 内测反馈的 P0/P1\n- xxx',
  10,
  TRUE,
  NOW()
);
```

### 2.2 关闭老版本（可选；保留以便回滚）

**推荐保留 v0.2.0 active**，因为灰度期间 90% 用户仍需要看到 v0.2.0 manifest 返回 204（即"我已是最新"）。仅在确认 v0.2.1 全量后才关老版本：

```sql
-- Day 7 全量后再执行
UPDATE agentrix_desktop.releases
SET is_active = FALSE
WHERE version = '0.2.0' AND target = 'windows' AND arch = 'x86_64';
```

### 2.3 验证

5 分钟后用真实客户端验证：

```bash
# 用客户端模拟（hash 落在 0-9 桶）
curl -H "User-Agent: TestDevice123" \
     "https://api.agentrix.top/api/desktop/update/windows/x86_64/0.2.0"

# 期望：
# - 命中 10% 桶 → 200 + manifest（version=0.2.1）
# - 未命中 → 204
```

记录 5 个不同 fingerprint 的实测结果到 `tests/reports/AUTO_UPDATE_BETA_REPORT.md`。

---

## 3. 监控（Day 1-3）

### 3.1 数据看板

打开 `agentrix.top/admin/desktop?days=1`，重点看：

- **自动更新成功率**：`installed / available` 必须 > 90%
- **崩溃率**：v0.2.1 不能比 v0.2.0 高
- **失败原因 Top 5**：识别系统性问题

### 3.2 自动告警

`scripts/daily-internal-beta-report.ts` cronjob 9 AM 跑：
- 崩溃率超 0.5% → Telegram 推
- 自动更新成功率 < 90% → Telegram 推
- 退出码 1 → cron 自动重发邮件

### 3.3 用户反馈

在 Telegram 群关注：
- "卡在下载" → 通常是网络
- "安装失败" → 可能 antivirus 拦截
- "新功能不工作" → 提交 issue

---

## 4. 扩大灰度（Day 4 / Day 7）

确认指标正常后：

```sql
-- Day 4: 10% → 50%
UPDATE agentrix_desktop.releases
SET rollout_percent = 50
WHERE version = '0.2.1' AND target = 'windows' AND arch = 'x86_64';

-- Day 7: 50% → 100%
UPDATE agentrix_desktop.releases
SET rollout_percent = 100
WHERE version = '0.2.1' AND target = 'windows' AND arch = 'x86_64';

-- Day 7 同时关闭老版本
UPDATE agentrix_desktop.releases
SET is_active = FALSE
WHERE version = '0.2.0' AND target = 'windows' AND arch = 'x86_64';
```

---

## 5. 紧急回滚

如果发现 v0.2.1 严重 bug（崩溃率 > 1% / 安装成功率 < 70% / 用户反馈系统性问题）：

### 5.1 立即停止灰度

```sql
-- 把 v0.2.1 设为非 active
UPDATE agentrix_desktop.releases
SET is_active = FALSE
WHERE version = '0.2.1' AND target = 'windows' AND arch = 'x86_64';

-- 重新打开 v0.2.0
UPDATE agentrix_desktop.releases
SET is_active = TRUE
WHERE version = '0.2.0' AND target = 'windows' AND arch = 'x86_64';
```

### 5.2 通知用户

- Telegram 群发：「v0.2.1 暂停发布，已升级用户继续使用即可」
- 已升级用户**无法**自动回滚（Tauri updater 不支持降级）；需手动卸载旧装新版本

### 5.3 修复 + 重发

1. 在 main 修 P0
2. 发 v0.2.2
3. 走完整发布流程（10% → 50% → 100%）
4. 写复盘报告 `tests/reports/AUTO_UPDATE_INCIDENT_<date>.md`

---

## 6. 完成后清理

灰度结束后：

- [ ] 把 v0.2.0 setup.exe 移到归档目录 `agentrix.top/downloads/desktop/archive/`
- [ ] 更新官网 `/download` 页指向 v0.2.1
- [ ] 用户手册 §B 加 v0.2.1 行
- [ ] release notes 发到 Discord / Telegram

---

## 7. 触发条件汇总

| 信号 | 行动 |
|------|------|
| 崩溃率 > 0.5% | 暂停灰度，调查崩溃 Top 1 |
| 安装成功率 < 90% | 暂停灰度，看失败原因 Top 5 |
| 同 fingerprint 一天 > 100 次 | 可能是退出循环 → 紧急排查 |
| 任意 P0 用户反馈 | 暂停灰度，开会决定 |
| Day 4 指标全绿 | 扩到 50% |
| Day 7 指标全绿 | 扩到 100% |
| 任意时间发现关键 bug | 立即回滚（§5） |

---

## 8. 联系人

| 角色 | 责任 |
|------|------|
| **发布经理** | 执行 SQL，监控指标 |
| **客服** | 监听用户反馈 |
| **运维** | 服务器 / DB / DNS |
| **产品** | 决定是否暂停 / 扩大 |
| **CEO** | 关键决策 |
