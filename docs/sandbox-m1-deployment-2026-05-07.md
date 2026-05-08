# Sandbox M1（Docker）— 部署 & 验证报告

> 日期：2026-05-07  
> 范围：P0-#2 Cloud Sandbox / Computer-Use 底座的最小可用版

---

## 1. 已交付

### 1.1 后端代码
- 新模块目录：`backend/src/modules/sandbox/`
  - `docker-sandbox.service.ts` — 基于 `dockerode` 的 spawn / exec / fsRead / fsWrite / destroy 编排器
  - `docker-sandbox.service.spec.ts` — 单元测试 **6/6 通过**（mock dockerode）
  - `tools/sandbox-shell-exec.tool.ts` — `sandbox_shell_exec`（riskLevel 2）
  - `tools/sandbox-fs-read.tool.ts` — `sandbox_fs_read`（riskLevel 0, readOnly）
  - `tools/sandbox-fs-write.tool.ts` — `sandbox_fs_write`（riskLevel 1）
  - `sandbox.controller.ts` — 新增 7 个端点（保留 legacy `/execute`）
  - `sandbox.module.ts` — 注册新 providers + TypeOrmModule.forFeature
- 实体：`backend/src/entities/sandbox-instance.entity.ts`（表 `sandbox_instances`）
- 迁移：`backend/src/migrations/1784000000000-CreateSandboxInstances.ts`

### 1.2 工具自动注册
3 个工具通过 `@RegisterTool()` + DiscoveryService 自动注册到 `ToolRegistryService`，
**自动出现在两条 chat 链路中**：
- `/openclaw/proxy/:id/stream`
- `/claude/chat`

### 1.3 REST 端点（全局前缀 `/api`）
| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/sandbox/health` | ❌ | docker daemon 诊断 |
| POST | `/api/sandbox/spawn` | ✅ JWT | 创建容器 |
| POST | `/api/sandbox/:id/exec` | ✅ JWT | 执行 shell |
| POST | `/api/sandbox/:id/fs/read` | ✅ JWT | 读文件 |
| POST | `/api/sandbox/:id/fs/write` | ✅ JWT | 写文件 |
| GET | `/api/sandbox/list` | ✅ JWT | 列出当前用户实例 |
| DELETE | `/api/sandbox/:id` | ✅ JWT | 销毁容器 |
| POST | `/api/sandbox/execute` | ✅ JWT | **legacy V3 mock**（保留兼容）|

---

## 2. 容器默认配置（安全基线）

| 项 | 值 |
|---|---|
| 镜像 | `alpine:3.20`（可通过 `SANDBOX_DEFAULT_IMAGE` 环境变量覆盖）|
| 网络 | **NetworkDisabled = true**（防 SSRF / 数据外发）|
| 内存 | 256 MB（Memory + MemorySwap 一致）|
| CPU | 512 CpuShares |
| TTL | 600s，到期自动 destroy（进程内 setTimeout，重启后失效）|
| WorkDir | `/workspace` |
| 输出截断 | stdout+stderr 共 64 KB |
| FS 读上限 | 默认 64 KB |

---

## 3. 生产环境验证（47.130.176.148, 2026-05-07 11:01 UTC）

完整 e2e smoke 脚本运行结果：

```text
=== HEALTH ===
{"available":true,"info":{"serverVersion":"29.2.1","memTotal":16552304640}}

=== SPAWN ===
{"success":true,"sandboxId":"ecc40b9a-...","containerId":"a1444e9666bc...",
 "image":"alpine:3.20","status":"running","limits":{"ttlSec":600,"memoryMb":256,"cpuShares":512}}

=== EXEC (echo hello-from-sandbox && uname -a && id) ===
{"success":true,"exitCode":0,
 "stdout":"hello-from-sandbox\nLinux a1444e9666bc 6.17.0-1010-aws ... x86_64 Linux\nuid=0(root) ...",
 "durationMs":57,"truncated":false}

=== FS WRITE (25 bytes) ===
{"success":true,"bytes":25,"path":"/workspace/hi.txt"}

=== FS READ ===
{"success":true,"content":"agentrix m1 sandbox works","bytes":25,"truncated":false}

=== DESTROY ===
{"success":true}
```

**所有 6 个端点全部成功。**

---

## 4. 部署关键事实（操作手册）

| 项 | 值 |
|---|---|
| 服务器 | `47.130.176.148`（Singapore, agentrix.top）|
| SSH | `ssh -i C:\Users\15279\Desktop\hq.pem ubuntu@47.130.176.148` |
| 后端目录 | `/home/ubuntu/Agentrix/backend` |
| PM2 进程 | `agentrix-backend`（id 1, 监听 **0.0.0.0:3000**）|
| API 全局前缀 | **`/api`**（curl `/sandbox/health` 会 404，必须 `/api/sandbox/health`）|
| Docker | 29.2.1，socket `/var/run/docker.sock`（ubuntu 用户可访问）|
| DB env 变量名 | `DB_HOST` / `DB_USERNAME` / `DB_PASSWORD`（**不是** `DATABASE_*`）|
| JWT 签发 | `JwtStrategy.validate` 会用 `payload.sub` 在 `users` 表查用户，必须真实 UUID |

### 标准部署流程
```bash
ssh -i ~/hq.pem ubuntu@47.130.176.148
cd ~/Agentrix
git pull --ff-only origin <branch>
cd backend
npm install --legacy-peer-deps          # 仅依赖变化时
npm run build                            # 会先试 nest build → fallback 到 tsc（正常）
npm run typeorm -- migration:run -d dist/config/data-source.js
pm2 restart agentrix-backend --update-env
curl http://127.0.0.1:3000/api/sandbox/health   # 验证
```

---

## 5. 已知限制（M1 不做，留给 M2+）

- 无自定义镜像构建管线（仅 `alpine:3.20`）
- TTL 用进程内 `setTimeout`，PM2 重启会丢失计时器，可能产生孤儿容器
  - **对策**：需后续加 nightly reaper（cron 扫描 `agentrix.sandbox=true` label 的过期容器）
- `fs.write` 走 JSON + base64，单次实用上限约 64KB；大文件需后续走 multipart
- `exec` stdout 缓冲在内存（64KB 截断），无流式
- 无 GPU / 额外 mount / 网络 egress 白名单
- 76 个 npm 安全告警（继承自仓库已有依赖，非本次新增）

---

## 6. git 提交

- 分支：`v3-p0-w1-presence-contracts`
- 主提交：`5c0023e4` — `feat(sandbox): real Docker sandbox (M1) with shell/fs tools + REST`
- 文件变更：12 个文件，+1506 行
