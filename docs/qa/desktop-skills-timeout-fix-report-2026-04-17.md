# Desktop Skills Timeout 修复测试报告

## 1. 结论

本轮问题的根因已经确认并在代码层修复：`GET /api/skills` 默认返回全量 Skill 实体，包含 `platformSchemas / inputSchema / outputSchema / executor / metadata / permissions / compatibleAgents` 等大 JSON 字段，导致线上接口返回体约 **22MB**，完整收包约 **97 秒**，从而触发桌面 smoke 中 `skills endpoint available` 的 60 秒超时。

当前修复方案已在本地完成并通过编译/单测验证：

- 后端默认将 `GET /api/skills` 改为 `summary` 轻量视图
- 保留 `?view=full` 兼容需要全量字段的旧调用
- 桌面 `/skill` 列表调用显式走 `summary`
- 通用前端 `skillApi.getSkills()` 显式走 `view=full`，避免误伤依赖全量结构的管理/编辑页面

需要注意：**`api.agentrix.top` 目前尚未部署这次修复**。因此，依赖线上接口的桌面 smoke 远端回归，在部署前仍会继续命中旧的超时行为。

## 2. 根因分析

### 2.1 线上现象

对生产接口 `https://api.agentrix.top/api/skills` 的直接探测结果：

- HTTP 状态：`200`
- 传输方式：`Transfer-Encoding: chunked`
- 返回体大小：约 `22,302,731 bytes`
- 完整收包耗时：约 `97.06s`

### 2.2 根因

`backend/src/modules/skill/skill.service.ts` 中原有 `findAll()` 直接 `query.getMany()`，未区分“列表页轻量字段”和“详情页/编辑页全量字段”。

结果是：

- 列表接口一次性带出所有 Skill 的重字段
- 桌面 smoke 只想验证接口可用，却被迫等待超大 JSON 序列化和传输完成
- 桌面 `/skill` 命令本身也只需要 `name/description`，却承担了全量负载

## 3. 代码修复

### 3.1 后端

- `backend/src/modules/skill/skill.controller.ts`
  - `GET /skills` 新增 `view` 查询参数
  - 默认行为改为 `summary`

- `backend/src/modules/skill/skill.service.ts`
  - 新增 `SkillListView = 'summary' | 'full'`
  - 新增 `SKILL_SUMMARY_SELECT_FIELDS`
  - `findAll(status, view)` 在 `summary` 模式下仅选择轻量字段：
    - `id / name / displayName / description / version`
    - `category / layer / valueType / resourceType / source / originalPlatform / status`
    - `pricing / tags / authorId / authorInfo / pluginId`
    - `callCount / rating / humanAccessible`
    - `productId / externalSkillId / imageUrl / thumbnailUrl`
    - `ucpEnabled / x402Enabled / aiPriority / createdAt / updatedAt`
  - `view=full` 保持旧行为，继续返回完整 Skill 实体

### 3.2 桌面

- `desktop/src/components/ChatPanel.tsx`
  - `/skill` 无参列表调用改为 `GET /skills?view=summary`
  - 桌面列 Skill 时不再拉全量 payload

### 3.3 Web SDK 兼容

- `frontend/src/services/skill-api.ts`
  - `getSkills(status, view = 'full')`
  - 现有可能依赖全量字段的前端调用，继续显式取 `full`

### 3.4 回归保护

- 新增单测：`backend/src/modules/skill/skill.service.spec.ts`
  - 验证默认调用会使用 `summary` 选择字段
  - 验证 `view=full` 不做 summary 裁剪
  - 验证 `status` 过滤仍然生效

## 4. 测试结果

### 4.1 本次 `/skills` 修复验证

1. 后端编译
   - 命令：`cd backend && npm run build:nest`
   - 结果：通过

2. 后端单测
   - 命令：`cd backend && npm test -- skill.service.spec.ts --runInBand`
   - 结果：`3 passed / 3 total`

3. 桌面 TypeScript 校验
   - 命令：`cd desktop && ./node_modules/.bin/tsc --noEmit`
   - 结果：通过

4. 桌面完整构建
   - 命令：`cd desktop && npm run build`
   - 结果：**未完成，不属于代码回归**
   - 原因：本机缺失 Rollup 可选依赖 `@rollup/rollup-linux-x64-gnu`
   - 结论：这是本地依赖环境问题，不是本次 `/skills` 修复引入的新错误

### 4.2 之前 tri-tier / 本地推理回归结果

以下结果为同日已完成验证，可视为本次提交前后的基线状态：

1. `tests/e2e/ui/tri-tier-execution.spec.ts`
   - 结果：`9 passed`

2. `tests/e2e/ui/local-ai-ui.spec.ts` + `tests/e2e/ui/voice-ui.spec.ts`
   - 结果：`14 passed, 1 skipped`

3. 桌面 shell smoke
   - 结果：`6 passed, 24 skipped, 1 failed`
   - 失败项：`skills endpoint available`
   - 失败原因：正是本报告修复的 `/api/skills` 超大返回体超时问题

## 5. 当前状态判断

### 已完成

- 根因已定位
- 代码已修复
- 本地编译通过
- 回归单测已补并通过
- 桌面端调用已经切到轻量列表模式

### 未完成

- 生产环境尚未部署该修复
- 因此依赖 `api.agentrix.top` 的桌面 smoke 暂时不会自动转绿
- 本机 `vite build` 仍受 Rollup 可选依赖缺失影响，和本次功能修复无关

## 6. 建议后续动作

1. 部署 backend 到生产，令 `api.agentrix.top/api/skills` 切到默认 `summary`
2. 部署后重跑桌面 smoke，确认 `skills endpoint available` 由红转绿
3. 如需恢复本机桌面完整打包验证，先补齐 `desktop` 的 Rollup 可选依赖，再重跑 `npm run build`
