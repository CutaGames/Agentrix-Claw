# 移动端桌宠形态用户手册

> Sprint P-6 ship — 2026-05-22
> 适用版本: Mobile build ≥ v4.x with pet forms

## 简介

Agentrix 移动端的右下角悬浮球(GlobalFloatingBall)从 v4.x 开始使用
**13 形态精灵系统**(实际启用 12 个,移除桌面端独有的 `cu-mouse`)。
和桌面端桌宠保持视觉与交互一致,无论你在桌面还是手机,看到的都是同一只
小狐狸,情绪与状态同步切换。

## 你会看到的形态

| 形态 | 触发场景 | 视觉特征 |
|---|---|---|
| **idle**(常态) | 悬浮球静止时 | 待机循环动画 |
| **listen**(聆听) | 长按悬浮球 / 系统语音唤醒 | 耳朵竖起 |
| **talk**(说话) | AI 流式回复进行中 | 张嘴动画 |
| **sleep**(睡眠) | 后端推送情绪 = tired/sleepy | 闭眼鼾声 |
| **alert**(警告) | 高风险审批 / 手表手腕触发 | 红色高亮 |
| **pro-done**(完成) | 任务完成 / AXP 升级 / 小游戏成功 | 庆祝特效 |
| **eat / jump / sit / walk** | 暂未在悬浮球触发(预留) | — |

> 注:`pro-thinking` 和 `pro-typing` 在桌面端是 Pro Mode 工作台专属;
> 移动端没有 Pro Mode,所以这两个状态自动降级显示为 `talk`。
>
> `cu-mouse`(Computer Use 跟随光标)在移动端完全不存在,因为系统
> 不允许在 iOS / Android 上模拟鼠标点击。

## 触发关系一览

```
用户行为                      → 形态
────────────────────────────────────────────
聊天发送消息                  → speaking → done(完成时)
长按悬浮球 / 唤醒词           → listening
AI 思考(Pro Mode 降级)       → speaking
后端推送 emotion=tired        → sleep
后端推送 emotion=focused      → speaking
高风险审批弹出                → approval
手表 wrist-tap 触发审批       → approval(4 秒)
小游戏触发等级提升            → done(1.5 秒)
```

## 后端联动

后端 `pet-companion-engine` 通过 `presence:pet.state` 频道推送主宠
emotion。移动端 `bootPetModeAdapters({ token, deviceId })` 在登录时
启动一个独立的 socket.io 连接,把 emotion 翻译成对应的形态:

| 后端 emotion | 形态 |
|---|---|
| focused, excited | speaking |
| tired, sleepy | sleep |
| concerned, sad, angry | idle(保留 alert 给真实审批弹窗) |
| happy, love, calm | idle |

设计原则:**本地动作优先**。例如你正在和 AI 聊天(speaking),即使
后端这一刻推 `emotion=tired`,本地不会把形态切到 sleep — 等本地
speaking 状态结束,emotion 才生效。

## 关掉形态系统

如果你完全不想看到悬浮球:
- 设置 → 隐藏悬浮球(toggle)

如果只想关掉精灵动画(回到旧版 "AX" 文字 mark):
- v4.x 不支持降级;升级到带 sprite 系统的版本之后强制启用。

## 故障排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 悬浮球永远是 idle 不切换 | `bootPetModeAdapters` 未启动 / socket 连接失败 | 重启 App;检查网络 |
| 庆祝特效不出现 | 小游戏的 `level_up` 字段后端没回 true | 检查 `submitMinigameScore` 返回值 |
| 沙雕速度过快 / 帧率异常 | RN 渲染层在低端设备掉帧 | 关闭其他后台应用 |

## 跨平台对照

| 平台 | 悬浮球 | 形态系统 | 备注 |
|---|---|---|---|
| 桌面 | 200×240 桌宠小窗口 + Pro Mode 标题栏头像 | 13 形态全开 | 含 Computer Use cu-mouse |
| 移动 | 48×48 屏幕浮球 | 12 形态(去 cu-mouse) | thinking/typing 降级到 talk |
| 手表 | 复杂表盘头像 | 静态情绪图标 | 仅 happy/sad/excited/tired 4 种 |
| 玩具 | RGB LED + 屏幕 emoji | 6 基础情绪 LED 配色 | 通过 MQTT 同步 |

## 相关文档

- [PET_FORMS_DESIGN_v5.zh-CN.md](./PET_FORMS_DESIGN_v5.zh-CN.md) — 桌面端形态产品设计
- [PET_FORMS_QUICK_REFERENCE.zh-CN.md](./PET_FORMS_QUICK_REFERENCE.zh-CN.md) — 13 形态触发对照表
- [PET_FORMS_MOBILE_MIRROR_PLAN_v6.zh-CN.md](./PET_FORMS_MOBILE_MIRROR_PLAN_v6.zh-CN.md) — Sprint P-6 实施规划
