# App 版本更新 & 热更新指南

## 概述

Agentrix 移动端（ClawLink）使用服务端驱动的版本检测：
- 用户打开 Settings 即可看到当前版本号
- 服务器有新版本时自动显示红色 **UPDATE** 徽章
- 点击徽章 → 确认弹窗 → 直接下载安装 APK（Android）

---

## 版本号规则

| 环境 | 说明 |
|------|------|
| **内部迭代版本** | 每次 CI 构建递增 buildNumber（60、61、62…），不对外发布 |
| **客户发布版本** | 经测试稳定后，更改 `latestVersion`（如 1.1.0 → 1.2.0）并更新服务器配置 |

> 原则：只有你手动更新 `app.controller.ts` 中的版本号，用户才会看到更新提示。

---

## 发布新版本给客户的完整流程

### 第一步：确认要发布的 APK

CI 每次合并主分支都会构建 APK，产物存放在 GitHub Actions Artifacts（命名格式 `apks-build-XX`）。

确认你要发布的 build 编号后继续。

### 第二步：上传 APK 到服务器

```bash
# 使用已有脚本（需要 /tmp/hq.pem）
# 修改 upload_apk_build70.sh 中的 BUILD_NUMBER，然后运行：
wsl bash /mnt/d/wsl/Ubuntu-24.04/Code/Agentrix/Agentrix-website/upload_apk_build70.sh
```

或手动上传：
```bash
# 1. 下载 artifact（替换 RUN_ID 和 BUILD_NUMBER）
curl -H "Authorization: token <GITHUB_TOKEN>" \
  -L "https://api.github.com/repos/CutaGames/Agentrix/actions/runs/<RUN_ID>/artifacts" \
  | python3 -c "import sys,json; [print(a['id'],a['name']) for a in json.load(sys.stdin)['artifacts']]"

# 2. 下载 zip
curl -H "Authorization: token <TOKEN>" \
  -L "https://api.github.com/repos/CutaGames/Agentrix/actions/artifacts/<ARTIFACT_ID>/zip" \
  -o /tmp/apk.zip && unzip /tmp/apk.zip -d /tmp/apk/

# 3. SCP 到服务器（两个文件名都要更新）
scp -i /tmp/hq.pem /tmp/apk/*.apk ubuntu@18.139.157.116:/home/ubuntu/Agentrix/frontend/public/downloads/clawlink-agent.apk
scp -i /tmp/hq.pem /tmp/apk/*.apk ubuntu@18.139.157.116:/home/ubuntu/Agentrix/frontend/public/downloads/ClawLink-latest.apk
```

服务器存放路径：`/home/ubuntu/Agentrix/frontend/public/downloads/`  
对外 URL：`https://api.agentrix.top/downloads/clawlink-agent.apk`

### 第三步：更新版本元数据

编辑 [backend/src/app.controller.ts](../backend/src/app.controller.ts)（`getAppVersion` 方法）：

```typescript
getAppVersion() {
  return {
    latestVersion: '1.2.0',      // ← 更新此处（语义化版本）
    buildNumber: 75,             // ← 更新此处（CI build 编号）
    apkUrl: 'https://api.agentrix.top/downloads/clawlink-agent.apk',
    minVersion: '1.0.0',         // 强制升级的最低版本（低于此弹强制更新）
    forceUpdate: false,          // true = 不升级不能用（如有严重 bug）
    releaseNotes: '新功能描述',
    releasedAt: '2026-03-08',
  };
}
```

### 第四步：提交 & 部署 backend

```bash
# 本地提交
git add backend/src/app.controller.ts
git commit -m "chore: release v1.2.0 (build-75)"
git push

# 服务器部署（在 WSL 中运行）
wsl -e bash -lc "ssh -i /tmp/hq.pem ubuntu@18.139.157.116 \
  'cd /home/ubuntu/Agentrix && git pull && cd backend && rm -rf dist tsconfig.tsbuildinfo && \
  /usr/bin/npx tsc -p tsconfig.json && pm2 restart agentrix-backend'"
```

---

## 用户如何看到更新

```
SettingsScreen
├── 当前版本: v1.1.0
├── 有新版 → 显示绿色 "Tap to update"
│              + 红色 UPDATE 徽章
└── 点击 → Alert 确认 → Linking.openURL(apkUrl) → 浏览器下载 APK
```

- 检测频率：每 30 分钟刷新（`staleTime: 30min`）
- 仅 Android 显示下载按钮（iOS 走 App Store 更新）
- `forceUpdate: true` 时：Alert 无"取消"选项，用户必须更新

---

## 版本比较逻辑

`compareVersions(latestVersion, currentVersion)` 采用语义化版本（`1.2.0 > 1.1.0`）。  
**内部 build 不影响用户**：只要 `latestVersion` 字段不变，用户就不会看到更新提示。

---

## 关键文件

| 文件 | 用途 |
|------|------|
| [backend/src/app.controller.ts](../backend/src/app.controller.ts) | 版本元数据（每次发布修改这里）|
| [src/screens/SettingsScreen.tsx](../src/screens/SettingsScreen.tsx) | 用户界面：版本显示 + 更新徽章 |
| [upload_apk_build70.sh](../upload_apk_build70.sh) | APK 上传脚本（参考模板）|
| `.github/workflows/build-apk.yml` | CI 构建 APK（`deploy-apk` job 需 `DEPLOY_SSH_KEY` secret）|

---

## 常见问题

**Q: 每次内部 build 都要更新服务器吗？**  
A: 不需要。只需在决定对外发布时上传 APK 并更新 `getAppVersion()`。

**Q: CI 自动部署 APK 如何启用？**  
A: 在 GitHub 仓库 Settings → Secrets → Actions 中添加 `DEPLOY_SSH_KEY`（服务器 `/tmp/hq.pem` 的私钥内容），之后每次构建成功会自动上传。但版本号更新仍需手动修改 `app.controller.ts`。

**Q: 怎样强制所有用户升级？**  
A: 将 `getAppVersion()` 中的 `forceUpdate` 改为 `true`，并设置 `minVersion` 为当前最低可接受版本，然后重新部署 backend。

**Q: 当前服务器上的 APK 是哪个版本？**  
```bash
ssh -i /tmp/hq.pem ubuntu@18.139.157.116 \
  'ls -lh /home/ubuntu/Agentrix/frontend/public/downloads/*.apk'
```
