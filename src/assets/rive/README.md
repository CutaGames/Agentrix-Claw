# Rive 动画资源目录

> Sprint 2 · Task 2.3 — Placeholder asset directory

## 目录说明

此目录用于存放 Pet Companion 的 Rive 2D 动画文件（`.riv`）。

当前实现使用 **渐变圆 + Emoji** 作为占位，等待设计师制作真实 `.riv` 文件后替换。

## 文件命名规范

```
pet_clan_{CLAN}_{EMOTION}.riv
```

### Clan 标识（6 族群）

| Clan | 名称 | 渐变色 |
|------|------|--------|
| A | Office | #3B82F6 → #06B6D4 (blue → cyan) |
| B | Life | #22C55E → #10B981 (green → emerald) |
| C | Learn | #A855F7 → #8B5CF6 (purple → violet) |
| D | Play | #F97316 → #EAB308 (orange → yellow) |
| E | Web3 | #EC4899 → #F43F5E (pink → rose) |
| F | Family | #14B8A6 → #0EA5E9 (teal → sky) |

### Emotion 标识

| Emotion | Emoji | 描述 |
|---------|-------|------|
| happy | 😊 | 开心 |
| excited | 🤩 | 兴奋 |
| sleepy | 😴 | 困倦 |
| thinking | 🤔 | 思考 |
| sad | 😢 | 难过 |
| neutral | 😐 | 平静 |
| calm | 😌 | 放松 |
| focused | 🧐 | 专注 |

### 示例文件名

```
pet_clan_A_happy.riv
pet_clan_A_excited.riv
pet_clan_B_sleepy.riv
pet_clan_D_thinking.riv
...
```

## 设计规范

- **画布尺寸**: 512×512 px（组件会自动缩放）
- **帧率**: 60fps
- **循环**: 所有动画应设为无限循环
- **State Machine**: 每个 .riv 文件应包含一个名为 `emotion` 的 State Machine
  - Input: `emotion_intensity` (number 0-3)
  - States: idle → active → peak
- **导出格式**: Rive 格式 v7+（兼容 rive-react-native 8.x）

## 加载方式

组件 `PetRiveRenderer.tsx` 使用以下方式加载：

```tsx
import { RiveView } from 'rive-react-native';

<RiveView
  resourceName={`pet_clan_${clan}`}
  artboardName={emotion}
  style={{ width, height }}
  autoplay
/>
```

## 临时方案

在 `.riv` 文件就绪前，`PetRiveRenderer` 组件会自动降级为：
1. **渐变圆** — 使用 clan 对应的渐变色
2. **Emoji** — 使用 emotion 对应的表情
3. **呼吸动画** — React Native Animated 缓动模拟

这确保了 UI 在没有真实动画资源时仍然美观且功能完整。
