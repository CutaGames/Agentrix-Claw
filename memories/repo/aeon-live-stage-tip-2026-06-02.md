# Aeon 现场活动/脱口秀直播厅 + 舞台原语 + AXP 打赏(社交场所 Step 2)— 已发并验证 2026-06-02

## 做了什么
在已验证的 /aeon 实时房间之上落地 **Stage 原语**(R22 未来范围的最小可玩实现):
全服直播厅(脱口秀/现场活动),房间 id `aeon-live-main`(舞台房间约定前缀 `aeon-live-`)。
- 角色:host(主持)/ speaker(台上嘉宾)/ audience(观众)。首个进场真人自动成 host。
- 上台:观众 `stage_raise_hand` → host 收到 `stage_hand_raised` 广播 → host `stage_invite`
  → 目标变 speaker(char_upsert.stageRole 同周期广播,R3.4)。
- 下台:speaker 自己 / host 请其 `stage_leave_stage`。
- 打赏:观众 `stage_tip{targetCharId,amount}` → **真实 AXP 流转**(扣打赏者 spend→入发言者 earn)
  → 全场 `stage_tip` 广播(amount + totalToTarget 本场人气榜)。
- 弹幕复用 chat 事件。身份铁律 R3:台上/弹幕/打赏都带 ✋🤖 徽章,agent 代发/代打赏带 attribution。

## 关键实现 / 文件
- `shared/types/aeon-sync.ts`:`AeonStageRole`、snapshot.stageRole、客户端 4 事件
  (stage_raise_hand/stage_invite/stage_leave_stage/stage_tip)、服务器事件
  (stage_hand_raised/stage_tip);常量 STAGE_MAX_SPEAKERS=6、STAGE_TIP_MIN=1/MAX=5000。
- `backend/.../realtime/stage.service.ts`(新):舞台态内存(host/speakers/举手队列/本场打赏累计)
  + `settleTip`(AxpService.spend('aeon_stage_tip')→earn('aeon_stage_tip'),先扣后加;
  禁自打赏;额度 1~5000 整数)。host 离场自动让位首个 speaker。
- 网关:join 分配舞台角色;新增 4 个 stage case;**handleClientEvent 必须 async**
  (stage_tip 内有 await,否则编译出的 .js 在顶层 await 报 SyntaxError → 后端 boot 崩溃循环!
  这次踩了:第一次部署 pm2 restart 后 crash-loop,uptime 0s,error log
  "await is only valid in async functions"。修复 commit 02be8d1f)。
- `room-presence.service.ts`:`applyStageRole`。断线/leave/sweepStale 都调 handleStageDeparture。
- `axp.constants.ts`:注册 `aeon_stage_tip` 到 EARN + SPEND 两个 set(无 daily cap)。
- `aeon.module.ts`:StageService 注册(AxpModule 已导出 AxpService,可直接注入)。
- 移动端 `src/screens/aeon/AeonLiveStageScreen.tsx`(新):台上区(host/嘉宾+🎁人气)/举手/
  host 举手队列审批/打赏弹窗(10/50/100/500)/弹幕。入口:AeonScene 行动栏 🎤 chip +
  AeonPlaza 顶部「进直播厅」横幅。路由 AeonLiveStage 注册。

## 验证(prod 实测)
- `tests/e2e/aeon-stage-tip.smoke.mjs`(2-client 全流程):**PASS** —
  handRaised✓ bBecameSpeaker✓ tipBroadcast✓ amount=50 total=50。
- AXP 账本实测:host A 余额 0→50(earn 50 aeon_stage_tip),tipper B 1575→1525(spend 50)。
  → 打赏是真钱包流转,不是假数值。
- 后端 health=200、unstable restarts=0 稳定运行。
- APK CI(Agentrix-Claw run 26802148308,build/aeon-live-stage-2026-06-02):build-apk job
  success(step18 JS bundle = 真 JSX 门 ✓、step22 上传 ✓、step23 Release ✓)。可发版 APK 已产出。

## commit / branch
- `95f4f9956`(feat 主体)+ `02be8d1fa`(async crash 修复)→ origin/feat/multi-agent-v2-1-llm-router-byo。
- APK branch `build/aeon-live-stage-2026-06-02`(主仓 + Claw 镜像)。
- 后端已 SSH 部署(pull→build→pm2 restart),dist 含 `async handleClientEvent`。

## 复用要点 / 坑
- **网关任何 @SubscribeMessage 处理器内用 await,方法必须 async**——tsc 转 commonjs 后顶层
  await 直接 SyntaxError 崩溃,getDiagnostics 不一定报(它按 TS 语义看是 OK 的),只有运行时炸。
  以后在网关加 await 务必确认方法签名是 async。
- 生成两个真实用户 token + 种 AXP 余额做跨用户测试:`.tmp_apk/stage-smoke-prep.js`(pg + 读 .env
  DB_* + jsonwebtoken 签 JWT_SECRET;打赏者挑 user_axp_balances 余额 ≥100 的)。
- 舞台态纯内存(同 RoomPresenceService),重启即清空——MVP 可接受;长期活动需落库。
