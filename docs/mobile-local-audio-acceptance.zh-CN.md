# Mobile 本地音频与 realtime 语音验收清单

本文档对应当前这一轮移动端语音链路的真实交付面，覆盖两条必须区分的路径：

- 本地模型路径：麦克风或实时语音识别先在端侧完成，再进入本地模型，不允许偷偷回退到云端。
- 云端 realtime 路径：通过真实 realtime voice gateway 建立 duplex 会话，验证 final transcript、assistant 回复、barge-in 打断都能在真机上成立。

## 已完成

- 本地音频模型注册已经落到 OTA 元数据，`qwen2.5-omni-3b` 会被前端、本地桥接层、后端 local-only allowlist 一致识别。
- 聊天发送链路已经支持本地 `wav/mp3` 音频附件直接进入 `llama.rn` 多模态输入。
- `useVoiceSession` 的“按住说话”在本地模型选中且设备存在 `@picovoice/react-native-voice-processor` 时，会优先走实时 PCM 麦克风采集，而不是继续依赖 `.m4a/AAC` 文件录音。
- PCM 帧现在会在端侧封成标准 `wav` 文件，并通过现有本地附件路径喂给本地音频模型。
- 本地模型的 duplex 连续语音已经有独立 planner：本地模型选中时不应再默认走云端 realtime socket，而是优先走端侧 live speech / 本地音频路径。
- 云端模型的 duplex 语音仍保留 realtime gateway，会在真机会话里建立 `socket-connected -> session-ready -> final-transcript` 的真实链路。
- 本地模型选中时，如果设备没有可直连的本地麦克风链路，系统会显式阻断，不再偷偷走云端 `/voice/transcribe`。
- 新增了纯逻辑单测，覆盖 PCM 拼接、WAV 头封装和时长估算。
- 真机验收脚本已扩成“本地持麦、本地 duplex、云端 realtime duplex、barge-in、离线本地、云端成本基线”一整套人工验收流。

## 当前验收口径

一轮通过标准不是“有语音按钮”，而是下面七件事连续成立：

1. 下载模型
   - `qwen2.5-omni-3b` 完整包下载完成，并显示音频输入能力。
2. 本地持麦
   - 按住麦克风后，能捕获本地 PCM，而不是只能生成 `.m4a` 后再决定是否上传。
3. 本地 duplex
   - 开启 duplex 后，连续说话仍留在端侧路径；这一轮不能被误判成云端 realtime socket。
4. 本地推理
   - 录音结束后，语音附件以本地 `wav` 形式进入本地模型，AgentChat 返回结果。
5. 云端 realtime 真机会话
   - 切到云端模型后，真机上能建立 realtime gateway 会话，看到 final transcript 和 assistant 回复。
6. 断网验证
   - 关闭 Wi-Fi 和蜂窝网络后，重复一轮录音，仍能完成本地推理。
7. 成本对比
   - 同一口令下，本地路径 API 成本为 `$0`，云端基线路径按 token 使用量可计算出真实美元成本。

## 真机执行方式

- 运行脚本：`scripts/test/mobile-local-audio-acceptance.ps1`
- 脚本会做以下事情：
   - 跑聚焦单测，包括 live speech 会话控制相关用例。
  - 检查 ADB 和真机连接。
  - 可选安装 APK 并启动应用。
  - 分阶段清理并归档 `logcat`。
   - 引导人工完成“下载模型 -> 本地持麦 -> 本地 duplex -> 云端 realtime duplex -> barge-in -> 离线本地 -> 云端基线”。
  - 调用 `backend/scripts/calc-turn-cost.ts` 复用后端定价表计算云端基线成本。
  - 产出一份 `tests/reports/mobile-local-audio-*/report.md` 验收报告。

推荐命令：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test/mobile-local-audio-acceptance.ps1 -TryOfflineToggle
```

如果已经拿到云端基线 token，可直接带入：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test/mobile-local-audio-acceptance.ps1 \
  -TryOfflineToggle \
  -CloudModel claude-sonnet-4-20250514 \
  -CloudInputTokens 1800 \
  -CloudOutputTokens 320
```

## 建议采集证据

- 每个阶段自动保存的 `logcat` 文件。
- `tests/reports/mobile-local-audio-*/report.md`。
- App 内 `Me -> Debug Logs -> Share` 导出的语音诊断文本。
- 断网阶段的录屏或截图。
- 对应的关键诊断建议至少覆盖：
   - 本地持麦：`hold-local-audio-started`、`hold-local-audio-stop`
   - 本地 duplex：`local-duplex-audio-started` 或 `live-speech-final`
   - 云端 realtime：`realtime-voice socket-connected`、`realtime-voice session-ready`、`realtime-voice final-transcript`
   - 云端打断：`voice-session barge-in`

## 距离需求还没完成的事项

下面这些点还没有被当前版本完全满足，不能混进“已经真本地多媒体完成”的口径里：

1. 模型原生语音输出还没打通。
   - 现在已经能把“麦克风输入 -> 本地音频模型理解”做得更真实，也能把云端 realtime gateway 真机会话单独验出来。
   - 回放仍主要依赖 Agentrix 现有本地 TTS 包装层，不是模型自带 vocoder 语音输出。
2. 真机验收仍需要人工操作。
   - 脚本已把本地持麦、本地 duplex、云端 realtime、barge-in、离线与成本基线都标准化，但模型下载、说话、观察回复、导出诊断仍然是人工环节。
3. 本地结果质量还没有形成基准集。
   - 目前脚本只要求“链路能跑通”，还没有落本地持麦、local duplex、cloud realtime duplex 在噪声环境下的量化门槛。
4. 离线首轮进入 AgentChat 的依赖边界还要继续压。
   - 如果会话初始化、鉴权或某些 UI 依赖仍要求联网，断网验证就可能卡在“进会话”而不是“本地推理”本身；而云端 realtime 则天然仍要求在线，不应和离线本地验收混淆。
5. 云端基线 token 的自动抓取还没做。
   - 当前成本对比脚本会复用后端定价表计算真实美元成本，但 token 数字仍需从 usage/cost 面板、日志或后端记录中人工填入。
6. 还没形成固定的语音回归集。
   - 至少还需要一组中文、英文、噪声环境、长句、多停顿样本，覆盖本地持麦、本地 duplex、云端 realtime duplex、barge-in 四种场景，才能把后续回归从“主观感觉”升级为可重复对比。

## 满足“真本地多媒体”所需的剩余工作

如果要把口径从“麦克风可直喂本地音频模型”推进到“真本地多媒体基本完成”，还需要至少补齐下面几项：

1. 落一组固定语音基准集和回归报告模板，至少拆成本地持麦、本地 duplex、云端 realtime duplex、barge-in 四组。
2. 补云端 usage/token 的自动抓取或前端可见展示，避免成本对比还靠人工抄数。
3. 把断网首轮会话初始化依赖继续收缩，确保离线状态下仍能稳定进入本地聊天。
4. 评估并接入模型原生音频输出链路，如果目标里包含“真本地语音对话”，这一项不能长期空缺。
5. 在至少 2 台 Android 真机上复跑同一套验收，确认当前 local duplex 与 cloud realtime duplex 都不是单机偶然成立。