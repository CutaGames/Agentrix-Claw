# Aeon 公共广场 + 实时群聊(社交场所 Step 1)— 已发 2026-06-02

## 做了什么
全服公共广场:不绑定地块的全服虚拟实时房间 + 实时群聊。这是用户要的"公共场所/
多人社交"两阶段计划的 Step 1(Step 2 = 现场活动/脱口秀+舞台角色+AXP 打赏,未做)。

- **新增** `src/screens/aeon/AeonPlazaScreen.tsx`:
  - 固定房间 `PUBLIC_PLAZA_ROOM_ID = 'aeon-public-plaza'`(虚拟房间,网关纯内存在场,
    不需要 DB room FK —— 已确认 handleJoin 接受任意 roomId 字符串)。
  - 复用 `connectAeonRoom`(已验证的 /aeon 客户端,内部自带心跳)。
  - 在场头像条(room_state/char_upsert/char_leave)+ 聊天气泡流(chat 事件)。
  - 身份铁律 R3:头像/消息按 badge 标 ✋🤖🤖✋🟣;agent 消息显示 attribution 归因。
  - 自己发的消息靠服务器广播回显(broadcast 含发送者),`fromCharId===activePet.id`
    判定为"我的",无需乐观回显。
  - 降级:socket.io 不可用 → handle.isDegraded → 明确提示"实时聊天不可用",不假装能发。
- **入口**:AeonScene 行动栏首位 🎪 chip;AeonMap 真地图模式右下 FAB / 列表模式顶部 banner。
- **路由**:WorldStackNavigator 注册 `AeonPlaza: undefined`。

## 关键事实(复用/避免重复踩坑)
- 后端**无需改动**:`aeon-realtime.gateway.ts` 的 `handleClientEvent` 早已处理
  `case 'chat'` → `broadcast(roomId, {t:'chat',fromCharId,text,attribution,serverTs})`。
  attribution 仅当发送者 `isAgentDriven` 时设(`由 X 的 agent 执行`)。
- 房间容量 `AEON_SYNC.ROOM_CAPACITY_MVP = 20`(预发够用;后续公共广场要扩容/分房需改)。
- WS 解析:`src/config/env.ts` production wsBase = `wss://api.agentrix.top` → namespace `/aeon`。
- chat 客户端事件形状:`{t:'chat', text, scope:'proximity'|'room'}`;广场用 `scope:'room'`。

## 验证
- getDiagnostics 4 文件全 clean。
- **APK CI**(CutaGames/Agentrix-Claw run 26800472114, branch build/aeon-plaza-2026-06-01):
  build-apk job 的 step 18「Build public release APK」(含 Metro/Hermes JS bundle = 真 JSX 门)
  ✅ success;step 22 上传下载服务器 ✅、step 23 Create GitHub Release ✅。**可发版 APK 已产出**。
  (Maestro x86_64 UI test job 不是构建门,常 flaky。)
- 新增 2-client chat 冒烟脚本 `tests/e2e/aeon-plaza-chat.smoke.mjs`(同 presence smoke 模式;
  在后端机 backend 目录 + socket.io-client 跑:`node ... <wsBase> <jwtA> <jwtB>`,
  A 应收到 B 的 chat,退出码 0=PASS)。presence 已在 Task 7 验证 PASS,chat 走同一广播路径。

## commit / branch
- commit `69e610c65`(origin/feat/multi-agent-v2-1-llm-router-byo)。
- APK branch `build/aeon-plaza-2026-06-01`(主仓 + Agentrix-Claw 镜像)。

## 下一步(Step 2,未做)
现场活动/脱口秀:舞台角色(主持/观众)、上麦/发言队列、AXP 打赏。可在广场房间上加
"活动"层(同一 /aeon 房间 + 事件类型扩展),或专门的 event room。
