# DRW Gate B 检查清单（桌面）

Gate B（DRW-8.1）要证明的一件事：在 owner 本人的电脑上，一条从 Web 或手机发出的指令，由冻结的 Cursor ACP adapter 在同一个 session 里完成 prompt → 权限 → 审批 → terminal → 回执，并且记下来源 SHA、adapter / runtime 版本、device / session 引用。

同主人、单机、有人在旁边看着。协议回执不等于成功：terminal 三个条件和字段都一致才算完成。

## 1. 现在的状态（2026-09-28，在 owner 的 Mac 上跑预检）

```bash
cd desktop
node scripts/drw-gate-b-preflight.mjs
```

结果：Cursor CLI 没装；两个运行时开关没设；桌面应用还没构建；钥匙串里没有通道凭据；另有两个已知缺口（第 4 节）。在缺口补上之前 Gate B 跑不通，预检的退出码不会是 0。

## 2. 谁做什么

| 步骤 | 谁 | 说明 |
|---|---|---|
| 装 Cursor CLI、登录 Cursor | owner（OA-09） | agent 只能装在 owner 自己的电脑上 |
| 后端开关、canonical tenant | release / backend，owner 批准 | 先 staging，后生产；预检不发网络请求 |
| 构建、启动桌面应用 | desktop | 这份清单和预检脚本 |
| 首次绑定、通道凭据 | 待定 | 第 4 节，REQ-desktop-012 |

## 3. 步骤

### 3.1 装 Cursor CLI（owner）

按 Cursor 官方文档安装，然后在终端里确认：

```bash
command -v agent     # 必须能找到，名字必须就是 agent（命令锁：program "agent"，args ["acp"]）
agent --version
# 然后按 Cursor 文档登录（例如 agent login），用 owner 自己的 Cursor 账号；不共享账号
```

macOS 上安装脚本一般放在 `~/.local/bin/agent`。从访达或 Dock 打开的应用拿不到终端的 PATH，所以第 3.5 步必须从终端启动。

### 3.2 后端（release / backend，owner 批准）

- 七个开关恰好为 `1`：`DEVELOPER_REMOTE_WORKSPACE_V1_ENABLED`、`DEVELOPER_REMOTE_ACTION_V1_ENABLED`、`DEVELOPER_REMOTE_AUTHORITY_V1_ENABLED`、`DEVELOPER_REMOTE_OUTCOME_V1_ENABLED`、`DEVELOPER_REMOTE_RECEIPT_V1_ENABLED`、`DEVELOPER_RUNTIME_BINDING_V1_ENABLED`、`DEVELOPER_RUNTIME_CHANNEL_V1_ENABLED`。
- owner 账号有 canonical tenant：`npm run tenant:assign`（默认只读；写入要 `--apply --ack assign-canonical-tenant`）。
- 远程执行的 kill switch `AGENTRIX_REMOTE_MUTATION_COMMANDS_ENABLED` 与 Gate B 无关，保持现状。

### 3.3 构建桌面应用（desktop）

```bash
cd desktop
npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund
npm run build                      # 生成 dist/，generate_context! 需要它
cd src-tauri && cargo build -j 2   # 生成 target/debug/agentrix-desktop
```

`core-foundation` 必须停在 0.10.0（E29），不要 `cargo update`。

### 3.4 通道凭据（临时手动做法，缺口 1）

Rust 宿主从钥匙串读通道凭据（service `agentrix.developer_runtime`，account `channel_bearer_v1`，值是 owner 的 Agentrix 登录 JWT）。产品里还没有写入它的地方，Gate B 只能手动放：

```bash
# -w 放在最后、不带值：security 会提示输入，值不会进 shell 历史
security add-generic-password -U -s agentrix.developer_runtime -a channel_bearer_v1 -w
```

- JWT 会过期；过期后后端会拒绝请求，需要重新放。
- 用完删除：`security delete-generic-password -s agentrix.developer_runtime -a channel_bearer_v1`。
- 运行时启用后（两个开关都是 `1` 并且读到了凭据），急停和"撤销本机运行时"也会删除它；没启用时急停不碰钥匙串。
- 不要把值贴进聊天、看板、仓库或截图。

### 3.5 从终端启动

```bash
cd desktop
export DEVELOPER_RUNTIME_CHANNEL_V1_ENABLED=1
export DEVELOPER_ADAPTER_CURSOR_ACP_ENABLED=1
node scripts/drw-gate-b-preflight.mjs    # 除了已知缺口，其余都要"通过"
./src-tauri/target/debug/agentrix-desktop
```

### 3.6 在应用里

1. 这台电脑 → 本机开发运行时：状态应为"已绑定"，显示设备、绑定引用和版本。
2. 点"检查 Cursor agent CLI"：应为"找到了 Cursor agent CLI（还没验证能用）"。
3. 点"信任工作区…"，在系统文件夹选择框里选绑定时的那个工作区；选错会报"所选文件夹和绑定的工作区不一致"。

### 3.7 跑一条指令

1. 在 Web 或手机上对这台电脑的 session 发一条简单指令（例如"列出仓库根目录的文件"）。
2. agent 请求权限时，按 DRW 的审批入口批准（手机或 Web）。
3. 等 terminal 结果，然后查看回执。桌面"事项 → 回执"读的是 Soul Core 的 Action 列表；DRW 的回执会不会出现在这里，要在 Gate B 里确认，确认不了就以 Web 的回执页为准。

## 4. 已知缺口（补上之前 Gate B 跑不通）

1. **通道凭据没有产品写入路径。** 只有 Rust 测试 harness 往钥匙串里写 `channel_bearer_v1`。第 3.4 步是 Gate B 的临时做法，正式做法要定：WebView 登录后交给 Rust 一次，或者由 backend 签发只给这台设备运行时用的短期凭据。
2. **首次绑定没有客户端接线。** `bootstrapRef` 要由 `POST /v1/developer/runtime/binding/bootstraps` 签发，它要求已有 machine 记录和已信任的 workspace 记录，并通过 runtime binding 校验（shell session binding）。这两条记录现在只能由 heartbeat 写入，而 Rust 宿主的 heartbeat 要先有绑定。桌面里也没有输入或接收 `bootstrapRef` 的地方。

两项都发给 coord 和 backend 定（REQ-desktop-012）。

## 5. 要记下的证据（DRW-8.1）

- 源码 SHA（`git rev-parse HEAD`）、桌面版本（0.7.21）、`agent --version` 输出。
- adapter manifest `cursor-acp-local-runtime-manifest-1`，runtime 结果类别 `LOCAL_RUNTIME_UNCERTIFIED`。
- "本机开发运行时"卡片上的设备、绑定引用与版本；session、instruction、回执编号。
- 每一步的时间。

## 6. 顺手做的负向检查（属于 Gate C，不是 Gate B 的通过条件）

- 指令执行中拉下急停：本机开发运行时变为"已撤销"，执行安全 → 急停记录里是"3 秒内生效"。
- 撤销之后再点信任工作区：按钮不可用；重启应用前不能重新绑定。
- 信任工作区选错文件夹：拒绝，原因是工作区不一致。

## 7. 收尾

- 删除钥匙串里的通道凭据（第 3.4 步的删除命令）。
- 关掉终端里的两个环境变量。
- 把第 5 节的证据交给 coord。
