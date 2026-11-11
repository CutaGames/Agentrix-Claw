# DRW Gate B 检查清单（桌面）

Gate B（DRW-8.1）要证明一件事：在 owner 本人的电脑上，从 Web 或手机发出一条指令，由冻结的 Cursor ACP adapter 在同一个 session 里走完 prompt → 权限 → 审批 → terminal → 回执，并且记下来源 SHA、adapter / runtime 版本、device / session 引用。

条件：同一个主人、单机、有人在旁边看着。协议回执不等于成功：terminal 的三个条件和字段都一致才算完成。

按 L3.md 第 4 节，Gate B 在 staging 上验收。桌面从终端启动时设 `AGENTRIX_API_TARGET=staging`，绑定、登录和运行时通道就都连 staging，和正式环境互不影响（REQ-desktop-026）。

## 1. 现在的状态（2026-09-29）

- 绑定已经接好（E32）：在应用里点"绑定这台电脑"就行，不用再手动往钥匙串里放 JWT。原来的两个缺口（没有写入通道凭据的地方、首次绑定没接线）都补上了。
- 桌面可以选连 staging（`AGENTRIX_API_TARGET=staging`）。
- 还差 REQ-desktop-026 的答复：staging 的 API 地址、邀请码门禁怎么放行 `/api/**`、要开的后端开关、owner 的 staging 账号。所以预检现在的退出码是 2。
- 整条流程还没有在真实后端上跑过。

预检：

```bash
cd desktop
node scripts/drw-gate-b-preflight.mjs
```

## 2. 谁做什么

| 步骤 | 谁 | 说明 |
|---|---|---|
| 登录 Cursor（CLI 已装好） | owner（OA-09） | agent 只能用 owner 自己的 Cursor 账号 |
| staging 地址、门禁、开关、owner 账号、canonical tenant | release / backend，owner 批准 | REQ-desktop-026；预检不发网络请求 |
| 桌面应用（带 E32 接线和目标切换的 T5 包） | desktop / coord | 第 3.3 步 |
| 在应用里登录、绑定、跑指令 | owner | 第 3.5–3.6 步 |

## 3. 步骤

### 3.1 Cursor CLI（已装好，只差 owner 登录）

09-29 coord 按官方安装脚本装在了 owner 的 Mac 上：`~/.local/bin/agent`，版本 `2026.09.28-64d2043`；`~/.zshrc` 里加了这一行 PATH，新开的终端能找到它。owner 只需要在新终端里确认并登录：

```bash
command -v agent     # 必须能找到，名字必须就是 agent（命令锁：program "agent"，args ["acp"]）
agent --version
# 然后按 Cursor 文档登录（例如 agent login），用 owner 自己的 Cursor 账号；不共享账号
```

macOS 上安装脚本一般放在 `~/.local/bin/agent`。从访达或 Dock 打开的应用拿不到终端的 PATH，所以第 3.4 步必须从终端启动。

### 3.2 staging 后端（release / backend，owner 批准）

以 REQ-desktop-026 的答复为准。已知要有：

- DRW 的七个开关恰好为 `1`：`DEVELOPER_REMOTE_WORKSPACE_V1_ENABLED`、`DEVELOPER_REMOTE_ACTION_V1_ENABLED`、`DEVELOPER_REMOTE_AUTHORITY_V1_ENABLED`、`DEVELOPER_REMOTE_OUTCOME_V1_ENABLED`、`DEVELOPER_REMOTE_RECEIPT_V1_ENABLED`、`DEVELOPER_RUNTIME_BINDING_V1_ENABLED`、`DEVELOPER_RUNTIME_CHANNEL_V1_ENABLED`。
- E32 这一组：签名凭据 v1、revocation v1、运行时凭据、在线登记（具体开关名由 backend 列）。
- owner 在 staging 上有账号，并且这个账号有 canonical tenant：在 staging 库上跑 `npm run tenant:assign`（默认只读；写入要 `--apply --ack assign-canonical-tenant`）。
- 邀请码门禁不挡 `/api/**`：桌面的 Rust 端不带浏览器 cookie。
- 远程执行的 kill switch `AGENTRIX_REMOTE_MUTATION_COMMANDS_ENABLED` 和 Gate B 无关，保持现状。

### 3.3 拿到桌面应用

需要带 E32 接线（`2ad6bea5`）和目标切换（`10e0054b`）的 T5 版本。上线 2 的内测包没有这两个提交，不能用。

- 方式 A（推荐）：CI 从集成分支打的 T5 内测包。把 `Agentrix Desktop.app` 拖进"应用程序"。第一次打开如果提示"已损坏"或"无法验证开发者"，按包里 README 的说明处理（`xattr -cr`，或者在"系统设置 → 隐私与安全性"里点"仍要打开"）。
- 方式 B：从源码构建。这台 Mac 上很慢，要先和 coord 说一声，让它暂停别的任务：

  ```bash
  cd desktop
  npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund
  npm run build                      # 生成 dist/，generate_context! 需要它
  cd src-tauri && cargo build -j 2   # 生成 target/debug/agentrix-desktop
  ```

  `core-foundation` 必须停在 0.10.0（E29），不要 `cargo update`。

### 3.4 从终端启动

第一次先把 staging 门禁的值放进钥匙串（值找 release 要，REQ-desktop-026）。`-w` 放在最后、不带值：`security` 会提示输入，值不会进 shell 历史。

```bash
security add-generic-password -U -s agentrix-staging-gate -a staging-key -w
```

- 应用只在 `AGENTRIX_API_TARGET=staging` 时读它，只给 `stg.agentrix.top` 的请求带上（请求头 `X-Agentrix-Staging-Key`）；连生产时不读、不带。
- 放进去以后要重启应用才生效。第一次读的时候 macOS 可能问"agentrix-desktop 想要使用钥匙串"，点"始终允许"。

然后启动：

```bash
cd desktop
export AGENTRIX_API_TARGET=staging
export DEVELOPER_RUNTIME_CHANNEL_V1_ENABLED=1
export DEVELOPER_ADAPTER_CURSOR_ACP_ENABLED=1
node scripts/drw-gate-b-preflight.mjs    # 除了已知缺口和"还没绑定"，其余都要"通过"

# 方式 A：
"/Applications/Agentrix Desktop.app/Contents/MacOS/agentrix-desktop"
# 方式 B：
./src-tauri/target/debug/agentrix-desktop
```

三个变量只在启动时读一次，改了要重启应用。`AGENTRIX_API_TARGET` 只认 `staging` 这一个值，写错了就连生产，预检会报"未通过"。

### 3.5 在应用里登录、绑定

1. 用 owner 的 staging 账号登录。
2. 左栏"这台电脑" → "绑定这台电脑"。这一块要写着"这次启动连的是 staging（…）"。没有这句话就说明没连 staging，停下，回第 3.4 步。
   - 整块都看不到：应用先问过 staging，签名凭据的开关（`TRUST_CORE_DEVICE_SIGNING_CREDENTIAL_V1_ENABLED`）没开，或者没问到，这一块就不显示（E73）。这时什么都没建，把情况告诉 release。
3. 填一个电脑名（会显示在设备列表里），点"绑定这台电脑"。
4. 弹出的系统文件夹选择框（"Select trusted workspace"）里，选 Gate B 要用的仓库目录。
   - 这就是绑定的工作区，也是被信任的工作区。
   - 取消选择也能绑定，但开发者运行时不会接上。这时这一块会出现"重新接上开发者运行时"，点它再选一次；绑定不会重建。应用重启以后也是点这个按钮。
5. 结果应该是"已绑定，开发者运行时也已接上"，状态行显示设备 `dev_…` 和绑定到期时间（最长 24 小时）。
   - 失败时会显示"没有完成：…"和服务端的错误码。把错误码记下来交给 coord。
   - 已经做完的步骤记在钥匙串里（不含登录凭据），下次点会从没做完的那一步接着做。
6. macOS 可能弹"agentrix-desktop 想要使用钥匙串中的机密信息"。原因是内测包只有 ad-hoc 签名，每换一个版本钥匙串都会重新问。点"始终允许"。
7. 本机开发运行时：状态应为"已绑定"，显示设备、绑定引用和版本。点"检查 Cursor agent CLI"，应为"找到了 Cursor agent CLI（还没验证能用）"。

### 3.6 跑一条指令

1. 在 staging 的 Web 或手机上，对这台电脑的 session 发一条简单指令，例如"列出仓库根目录的文件"。
2. agent 请求权限时，按 DRW 的审批入口批准（手机或 Web）。
   - 如果审批发到了这台电脑（L2 / L3），会弹一次系统确认框。点确定以后，桌面用设备密钥签名。
3. 等 terminal 结果，然后查看回执。
   - 桌面"事项 → 回执"读的是 Soul Core 的 Action 列表。DRW 的回执会不会出现在这里，要在 Gate B 里确认。
   - 确认不了，就以 Web 的回执页为准。

## 4. 已知缺口和限制

1. **staging 已开放**（OA-56，09-29 19:31）：地址 `https://stg.agentrix.top`。socket.io 和 CORS 预检怎么过门禁还在等 release 答复（REQ-desktop-026）；在那之前，聊天推送、在线状态这类走 socket 的功能在 staging 上可能连不上。绑定和运行时通道走 Rust，不受影响。
2. **绑定不会自动续期。** 开着开发者运行时的时候，运行时凭据每 30 分钟自动刷新；没开的时候，交付台"让电脑先备一份"用到它时再刷新，过期了就用本人的登录重新签一张（`463b9952`）。绑定本身最长 24 小时，到期后要重新点一次"绑定这台电脑"，还要登录着。续期（`supersedesBindingRef`）排在 D5 之后。
3. **没有在真实后端上跑过。** 生产的开关都关着；原生确认框也没在真机上点过。第一次跑时每一步都记时间和结果。

## 5. 要记下的证据（DRW-8.1）

- 源码 SHA（内测包的版本信息或 `git rev-parse HEAD`）、桌面版本、`agent --version` 输出。
- 目标：staging，以及它的地址。
- adapter manifest `cursor-acp-local-runtime-manifest-1`，runtime 结果类别 `LOCAL_RUNTIME_UNCERTIFIED`。
- "绑定这台电脑"里的设备 `dev_…` 和绑定到期时间；"本机开发运行时"卡片上的绑定引用与版本；session、instruction、回执编号。
- 每一步的时间。

## 6. 顺手做的负向检查（属于 Gate C，不是 Gate B 的通过条件）

- Cursor 也受急停管（`e35fd4cb`）：在"我的 AI 们"里给 Cursor 点"开启保护"，拉下急停，然后在 Cursor 的 Agent 里让它跑一条命令（例如 `ls`）。应该被拦下，提示"Agentrix 急停已拉下"；解除急停后再试，应该照常走 Cursor 自己的确认。结果和 Cursor 版本号一起记下来。
- 指令执行中拉下急停：本机开发运行时变为"已撤销"；执行安全 → 急停记录里是"3 秒内生效"；急停拉着时不能绑定，也不能签审批。
- 撤销之后再点信任工作区：按钮不可用。
- 信任工作区选错文件夹：拒绝，原因是"工作区不一致"。
- 让电脑先备一份（D5 第 2 片，`01764759`；要本机模型）：staging 上准备一张测试模式、已付款的付费问答，在"分身 → 接单与交付"里点"让电脑先备一份"。应该出现草稿和"这份是电脑备的，请看过再交付"；改一个字，这句提示消失；交付仍要勾选"我看过了"。拉下急停再点，应该提示"急停拉着，电脑不备稿"，订单的 version 不变。记下订单编号、每次的 version 和本机模型名。
- 不设 `AGENTRIX_API_TARGET` 重启一次："绑定这台电脑"那一块不再提 staging，状态是生产那边的（没在生产上绑定过就是"还没有绑定"），因为生产和 staging 的钥匙串条目分开存；staging 的登录状态也不会带过来。

## 7. 收尾

- 在应用里退出登录：这会吊销运行时凭据，并删掉本机 token。
- 需要的话，在 staging 的"我的 → 设备"里解绑这台电脑。
- 删除钥匙串里 staging 的条目。只删 `agentrix.developer_runtime.staging`，正式环境的条目不动：

  ```bash
  security delete-generic-password -s agentrix.developer_runtime.staging -a enrollment_v1
  security delete-generic-password -s agentrix.developer_runtime.staging -a device_dst_v1
  security delete-generic-password -s agentrix.developer_runtime.staging -a channel_bearer_v1
  security delete-generic-password -s agentrix.developer_runtime.staging -a runtime_id_v1
  security delete-generic-password -s agentrix.developer_runtime.staging -a device_identity_p256_v1
  ```

- 删掉本机的"电脑备过的草稿"记录（只有订单编号、version 和摘要，没有正文）：`~/Library/Application Support/top.agentrix.desktop/developer_runtime/order_runtime_drafts.staging.json`。
- 需要的话删掉门禁的值：`security delete-generic-password -s agentrix-staging-gate -a staging-key`。
- 关掉终端里的三个环境变量。
- 把第 5 节的证据交给 coord。
