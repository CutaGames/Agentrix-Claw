# 公司注资/雇佣修复 + 拍照做素材打通 + 现实×游戏关联/会议室语音评估(2026-06-02)

## #3 公司运营修复(prod 部署)
- **注资按钮无反应根因**:onFund 用 `Alert.prompt`(iOS-only),Android 上是 no-op → 点了没反应。
  **修复**:替换为跨平台 Modal(预设 50/100/500/1000 + 自定义输入)。submitFund 调 fundCompany。
- **雇佣只显示主宠根因**:onHire 只用 `authStore.activeInstance`(=主宠)。
  **修复**:openHire 调 `getMyInstances()`(/openclaw/instances)列出用户**所有 agent**,Modal 选择 + 自定义工资;
  空时兜底 user.openClawInstances / activeInstance。submitHire 用所选 agentInstanceId。
- 文件:`src/screens/aeon/AeonCompanyScreen.tsx`(fund/hire 双 Modal + getMyInstances)。

## #2 拍照→建材打通(之前没打通的根因 + 修复)
- **根因**:CameraScanScreen 走 `/v1/pet-generation/scan` 建的是**宠物**,不进 `world_assets`;
  而 AeonBuild「我的素材」查的是 `world_assets`(owner_id) → 拍照创生的东西不会出现在建材里。done 屏也只有"设主宠/NFT"。
- **修复(直达路径)**:`BuildService.createBuildMaterialFromPhoto` + `POST /v1/aeon/build/my-assets/from-photo`:
  一张照片直接落一个 `usage_kind=build_material` 的轻量 WorldAsset(generationStatus=card_ready,
  portraitUrl=照片,category 借 'weapon' 占位,无需 3D/AI Interpreter)。
  移动端 AeonBuild「我的素材」加「📷 拍照做素材」:ImagePicker 选图 → `uploadChatAttachment` 得 publicUrl →
  createBuildMaterialFromPhoto → 加入列表+选中 → 点格子摆放。
- **prod 验证 PASS**:from-photo 201 usageKind=build_material,my-assets 列表查到。
- 文件:`backend/.../aeon/build/build.service.ts` + `build.controller.ts`,`src/services/aeon/aeonApi.ts`,
  `src/screens/aeon/AeonBuildScreen.tsx`。

## #1 现实×游戏关联 + #4 会议室语音(评估文档)
`docs/business/REALWORLD_GAME_LINK_AND_VOICE_2026-06-02.zh-CN.md`:
- 关联玩法(双向,非单向发币):A 现实数据→游戏形态(天气同步领地天气 / 健康步数→宠物成长领地解锁 / 作息→状态);
  B 游戏经营→现实行动(公司现实 KPI 任务 / agent reverse-call 通知);C 现实资产→游戏资产(拍照做素材,已打通);
  D 行情/事件→游戏经济;E 群体现实成就→全服世界事件。推荐先做 A-天气同步(weather 连接器已有)。
- **会议室语音**:`/voice` 网关是 **1:1(用户↔AI)STT→LLM→TTS,非多人群组语音**;Aeon 房间走 `/aeon` 仅文字。
  真群组语音需 WebRTC+SFU(LiveKit/mediasoup)= 大工程。
  **三档**:L1 语音转文字发言(按住说话→STT→/aeon 房间广播文字,复用两网关,1~2天,推荐先做);
  L2 AI 语音主持 TTS 播报;L3 真群组语音(WebRTC SFU,大版本)。

## commit / 部署
- `c7612203c`(#2+#3 修复)→ origin。后端 SSH 部署(无迁移,usage_kind 已存在;build+restart 稳定 health=200)。
- APK branch `build/company-material-fix-2026-06-02`(主仓+Claw 镜像)。

## 坑
- `Alert.prompt` 仅 iOS,跨平台输入一律用 Modal+TextInput。
- 拍照创生(pet-generation)≠ world_assets;两条资产体系。建材走 world_assets(usage_kind)。
