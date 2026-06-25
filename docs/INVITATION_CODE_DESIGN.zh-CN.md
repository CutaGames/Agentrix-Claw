# 邀请码机制：当前实现与多端联动答疑

> Sprint M-P3 配套文档。基于 commit 时仓库快照（2026-05-16）实测代码 + 数据库 schema。
>
> 给运营 / 产品 / 客服参考；用户向解释见 `docs/USER_MANUAL_MOBILE_V4.zh-CN.md` §2。

---

## TL;DR

| 问题 | 答案 |
|------|------|
| 移动端邀请码机制是否仍然有效？ | **有效**。代码路径在生产分支：`InvitationGateScreen` 拦截首次登录；服务端 `POST /invitation/validate` + `POST /invitation/redeem` 验证 + 兑换。 |
| 邀请码有有效期吗？ | **可以有，按需配置**。`invitation_codes` 表有 `expiresAt` 字段，运营生成时可指定。**默认无固定期限**（运营可不设）。过期后状态自动转为 `expired`，验证返回 `valid=false`。 |
| 移动端有邀请码后，扫码就可以拓展到桌面端？ | **可以，但桌面端不再额外要求邀请码**。桌面端 / 网页端通过移动端扫描二维码来登录（QR pairing），获得移动端账号的 token 后直接进入。桌面端没有独立邀请门。 |
| 一个邀请码多端通用？ | **否，邀请码是绑定到"账号开通"的一次性资源**。一个邀请码兑换后，**该账号的所有端共享会员状态**（不需要每端再用一次邀请码），但**邀请码本身**已被消费、不能再被其他账号使用。 |

---

## 1. 当前实现概览

### 1.1 后端

**Entity**（`backend/src/entities/invitation-code.entity.ts`）：

```typescript
@Entity('invitation_codes')
class InvitationCode {
  id: uuid;
  code: string (12 字符，唯一索引);
  batch: string;                     // 例如 "kol-twitter-1"
  status: AVAILABLE | USED | EXPIRED | DISABLED;
  maxUses: number = 1;
  usedCount: number = 0;
  usedByUserId?: uuid;               // 仅当 maxUses=1 时绑定
  usedAt?: Date;
  channel?: string;                  // twitter / discord / kol / friend / official
  expiresAt?: Date;                  // 可选过期时间
  createdBy: string = 'system';
  metadata?: jsonb;
}
```

**Service** 三个核心方法（`backend/src/modules/invitation/invitation.service.ts`）：

- `validateCode(code)` — 不消费，仅检查 `status / expiresAt / usedCount < maxUses`
- `redeemCode(code, userId)` — 同一事务里消费 + 给用户打 `userInvitationStatus=valid` 标
- `userHasValidInvitation(userId)` — 用于 InvitationGate 流程查询

**Endpoints**（`backend/src/modules/invitation/invitation.controller.ts`）：

| Method | Path | Auth | 用途 |
|--------|------|:---:|------|
| POST | `/api/invitation/validate` | Public | 检查码（不消费）|
| POST | `/api/invitation/redeem` | JWT | 兑换码 + 绑定到当前用户 |
| GET | `/api/invitation/status` | JWT | 查询当前用户是否已 redeemed |
| POST | `/api/admin/invitation/generate` | Admin | 批量生成邀请码 |
| GET | `/api/admin/invitation/list` | Admin | 列出所有码 + 状态 |
| GET | `/api/admin/invitation/stats` | Admin | 统计 (total/available/used/expired/disabled) |
| POST | `/api/admin/invitation/:id/disable` | Admin | 禁用某码 |

### 1.2 移动端

**入口**：`src/screens/auth/InvitationGateScreen.tsx`，由 `RootNavigator.tsx` 在 `isAuthenticated && !hasValidInvitation` 时挂载（`auth → invitation gate → onboarding → main`）。

**调用**：`src/services/invitation.service.ts` 三个函数：

- `validateInvitationCode(code)` — 调 `/invitation/validate`
- `redeemInvitationCode(code)` — 调 `/invitation/redeem`
- `checkInvitationStatus()` — 调 `/invitation/status`

**Auth store** 持久化 `hasValidInvitation`，重启 App 不丢。

### 1.3 桌面端 / 网页端

**全无邀请码逻辑**：`grep -r 'invitation' desktop/src/ frontend/` 返回 0 处对邀请码 API 的调用。

桌面端 / 网页端通过以下方式登录：

1. 邮箱 + 验证码（直接用账号体系）
2. 钱包登录
3. **扫码登录（与移动端配对）**

第 3 种是**多端联动**的关键路径：见 §3。

---

## 2. 有效期与状态机

### 2.1 状态转移

```
       generate
          ↓
     [AVAILABLE]
       ↙        ↘
   redeem      expire (cron 或下次 validate 时检查)
       ↓        ↓
    [USED]   [EXPIRED]
       
  admin disable
       ↓
  [DISABLED]
```

转移规则：

| From | Trigger | To |
|------|---------|----|
| AVAILABLE | `redeem()` 成功 | USED（如 `usedCount >= maxUses`）/ AVAILABLE（如还有名额） |
| AVAILABLE | `validate()` 时发现 `expiresAt < now` | 自动写为 EXPIRED |
| AVAILABLE | admin disable | DISABLED |
| USED | — | 终态 |
| EXPIRED | — | 终态 |

### 2.2 默认有效期

| 字段 | 默认 |
|------|------|
| `expiresAt` | **null（无固定期限）** |
| `maxUses` | 1（一次性） |

> ⚠️ 运营在生成邀请码时可显式指定 expiresAt（DTO 接受 ISO 8601 字符串）。如不指定则没有时效。

### 2.3 推荐运营配置

| 场景 | maxUses | expiresAt | 说明 |
|------|:-----:|------|------|
| 内部测试 | 1 | null | 一对一发放，不过期 |
| KOL 活动 | 100-500 | 7-30 天 | 单链接多人复用，限时拉新 |
| 公开早鸟 | 50-100 | 14 天 | 限量限时 |
| 客服补码 | 1 | null | 用户找客服补的临时码 |
| 渠道追溯 | N | 长期 | 不限时但 `channel` 字段记录来源 |

---

## 3. 多端联动详解

### 3.1 当前实际流程

#### 场景 1：用户先装移动端

```
1. 用户 A 装 Android App
2. 邮箱 / OAuth 登录 → 触发 InvitationGate
3. 输入邀请码 ABCD-XXXX-1234 → /invitation/redeem → 状态变 USED
4. 完成 onboarding → 进入主界面
5. 用户 A 同时打开桌面端 (Agentrix.exe)
6. 桌面端 LoginPanel → 选 "📱 扫码登录"
7. 桌面显示 QR (https://agentrix.top/pair?session=xxx&platform=desktop)
8. 用户 A 在 Mobile 顶部 📷 扫码 → 自动调 confirmDesktopPairWithApiBase()
9. 桌面端拿 token → 进入主界面（无邀请门）
```

✅ 桌面端**自动复用** Mobile 已 redeemed 的邀请状态。

#### 场景 2：用户先装桌面端（绕过路径）

```
1. 用户 B 装桌面端
2. 桌面端不要邀请码 → 直接邮箱 / 钱包登录
3. 用户 B 现在拥有"无邀请码"的账号
4. 用户 B 装 Mobile App
5. Mobile 用同一账号登录 → /invitation/status 返回 hasInvitation=false
6. Mobile 拦在 InvitationGate
```

⚠️ **当前漏洞**：用户可以先装桌面端绕开邀请门。如果运营严格执行邀请制，应该在桌面端也加一道。

### 3.2 桌面端是否应该加邀请门？

**当前态**：没加。理由：
- 桌面端定位是"已有 Mobile 用户的扩展工作台"，绝大多数用户从 Mobile 起步
- 减少桌面端首次门槛，提升内测体验
- 邀请门主要起"流量控制 + 来源追踪"作用，Mobile 上做一道就够了

**反向论点**（如果运营要严控）：
- 桌面端可以独立分发（GitHub / 官网下载），不一定经过 Mobile
- 可考虑在桌面 LoginPanel 加一个 InvitationCodeStep，复用 `/invitation/validate` API

> 决策：**当前保持桌面端无邀请门**。如果将来公开发布前需要严控，2 小时工作量加桌面端的拦截。

### 3.3 一个邀请码"多端通用"语义

#### "多端通用" 的两种解读

**解读 A**：一个邀请码可以在多个端各激活一次（Mobile + Desktop + Web 三次）
- ❌ **不支持**。`maxUses=1` 时邀请码只能被一个账号 redeem。

**解读 B**：一个用户用邀请码激活后，所有端共享该状态
- ✅ **支持**。`hasValidInvitation` 是账号级字段，所有端通过同一账号登录后都享受邀请状态。

> 这是**正确的设计**——邀请码绑定的是账号，账号是多端通用的。

### 3.4 邀请码 + 推荐人体系联动

在 `referral` 模块（`/api/v1/referral`）中：
- 邀请码可附带 referrer userId（在 metadata 里）
- 兑换时给推荐人发 `referral_signup` AXP（默认 +500）
- 这部分逻辑在 `redeemCode()` 内部触发

> 当前实现里 metadata 字段是预留的，**实际推荐 AXP 发放需要前端在 redeem 请求里附 referrer**。这是 Sprint M-P3 可补的小工作。

---

## 4. 已知限制 / 下个 Sprint 改进项

### P2

1. **桌面 / 网页缺独立邀请门**：影响渠道追溯精度。如果产品判断需严控，2h 工作量。
2. **Referrer 联动需补**：邀请码 redeem 时不会自动发推荐 AXP，需要前端在 body 里带 `referrerCode`。
3. **找回机制缺失**：用户码丢了只能找客服。可加 "凭注册邮箱重发" 流程（`/invitation/recover`）。

### P3

4. **批量过期清理 cron 缺失**：`expiresAt < now` 的码状态在 `validate()` 时被惰性更新，没有定时批清理（不影响正确性，仅影响 stats 实时性）。
5. **Admin UI 缺批量导出 CSV**：`frontend/pages/admin/invitation.tsx` 已有列表，但批量导出未实现。
6. **i18n 完整度**：`InvitationGateScreen` 的报错文案仅中英两种，未含日 / 韩 / 越（V4 PRD 提到 SE Asia 优先）。

---

## 5. 答疑速查表（用户向）

| 用户提问 | 标准回复 |
|---------|---------|
| 邀请码丢了怎么办？ | 联系 `growth@agentrix.top` 或客服补码（运营批次审核 1 个工作日） |
| 邀请码会过期吗？ | 看你拿到的码：KOL 活动码通常 7-30 天；内部一对一码不过期 |
| 我换手机要重新输码吗？ | **不要**。邀请码绑定账号，登同一账号自动恢复 |
| 我换账号要重新输码吗？ | **要**。新账号必须有自己的邀请码 |
| 桌面端 / 网页端要邀请码吗？ | **不要**，从已有 Mobile 账号扫码登录即可 |
| 我朋友能用我的码吗？ | 看码类型：一次性码不能；KOL 活动码可以（看 `maxUses` 上限） |
| 我能给朋友发我的码吗？ | 一次性码已激活后失效；KOL 码会显示剩余可用次数 |
| 邀请码无效，怎么办？ | 大小写不敏感，但请去掉首尾空格；如仍提示无效，可能已被禁用 / 过期，联系客服补码 |

---

## 附：邀请码生成示例

```bash
# 管理员生成 100 个 KOL 邀请码，30 天有效，每码 100 人可用
curl -X POST https://api.agentrix.top/api/admin/invitation/generate \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "count": 100,
    "batch": "kol-twitter-2026-06",
    "channel": "twitter",
    "maxUses": 100,
    "expiresAt": "2026-07-15T23:59:59Z"
  }'
```

```bash
# 用户兑换
curl -X POST https://api.agentrix.top/api/invitation/redeem \
  -H "Authorization: Bearer USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "code": "ABCD-XXXX-1234" }'
```

---

**最后更新**：2026-05-16（commit 待补）
**相关文档**：
- 用户手册 §2：`docs/USER_MANUAL_MOBILE_V4.zh-CN.md`
- 后端实现：`backend/src/modules/invitation/`
- 前端入口：`src/screens/auth/InvitationGateScreen.tsx`
