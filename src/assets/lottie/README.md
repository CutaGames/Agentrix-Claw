# Lottie 动画资源目录

> Alternative animation format using `lottie-react-native`

## 概述

Lottie 可作为 Rive 的中间替代方案。相比 Rive：
- ✅ 更多免费资源（LottieFiles.com 有 100,000+ 免费动画）
- ✅ After Effects 设计师更熟悉
- ✅ 文件体积小（JSON 格式）
- ❌ 不支持 State Machine（需要手动切换动画）
- ❌ 交互性不如 Rive

## 安装

```bash
npx expo install lottie-react-native
```

## 使用方式

```tsx
import LottieView from 'lottie-react-native';

<LottieView
  source={require('../assets/lottie/pet_clan_A_happy.json')}
  autoPlay
  loop
  style={{ width: 180, height: 180 }}
/>
```

## 免费 Lottie 动画资源

### 主要来源

- **LottieFiles.com** — https://lottiefiles.com/free-animations
  - 100,000+ 免费动画
  - 支持直接下载 .json 格式
  - 大部分为 CC-BY 或免费商用

- **IconScout Lottie** — https://iconscout.com/lottie-animations
  - 精选高质量动画

- **LordIcon** — https://lordicon.com/
  - 图标风格动画，适合 UI 元素

### 各族群推荐搜索词

#### Clan A (Office) — 办公 / 专业

| 搜索词 | 说明 |
|--------|------|
| `robot assistant` | 机器人助手 |
| `office worker` | 办公人物 |
| `business character` | 商务角色 |
| `AI bot` | AI 机器人 |
| `secretary` | 秘书 |
| `computer work` | 电脑工作 |

推荐风格：简洁线条、蓝色调、专业感

#### Clan B (Life) — 生活 / 自然

| 搜索词 | 说明 |
|--------|------|
| `plant growing` | 植物生长 |
| `nature spirit` | 自然精灵 |
| `butterfly` | 蝴蝶 |
| `garden` | 花园 |
| `leaf animation` | 树叶动画 |
| `eco friendly` | 环保 |

推荐风格：有机形状、绿色调、流动感

#### Clan C (Learn) — 学习 / 知识

| 搜索词 | 说明 |
|--------|------|
| `book reading` | 读书 |
| `wizard` | 巫师 |
| `owl` | 猫头鹰 |
| `magic spell` | 魔法 |
| `graduation` | 毕业 |
| `brain thinking` | 大脑思考 |

推荐风格：神秘感、紫色调、漂浮粒子

#### Clan D (Play) — 游戏 / 娱乐

| 搜索词 | 说明 |
|--------|------|
| `game character` | 游戏角色 |
| `pixel art` | 像素艺术 |
| `joystick` | 游戏手柄 |
| `trophy winner` | 奖杯 |
| `arcade` | 街机 |
| `superhero` | 超级英雄 |

推荐风格：弹跳感、橙黄色调、活力十足

#### Clan E (Web3) — 区块链 / 数字

| 搜索词 | 说明 |
|--------|------|
| `phoenix fire` | 凤凰火焰 |
| `blockchain` | 区块链 |
| `crypto` | 加密货币 |
| `digital bird` | 数字鸟 |
| `neon glow` | 霓虹发光 |
| `cyber` | 赛博 |

推荐风格：发光效果、粉红色调、粒子特效

#### Clan F (Family) — 家庭 / 温馨

| 搜索词 | 说明 |
|--------|------|
| `teddy bear` | 泰迪熊 |
| `cute cat` | 可爱猫咪 |
| `family` | 家庭 |
| `hug` | 拥抱 |
| `sleeping animal` | 睡觉动物 |
| `cozy` | 温馨 |

推荐风格：柔软圆润、青色调、温柔呼吸

## 文件命名规范

```
pet_clan_{CLAN}_{EMOTION}.json
```

示例：
```
pet_clan_A_happy.json
pet_clan_A_excited.json
pet_clan_B_sleepy.json
pet_clan_D_thinking.json
```

## 集成到 PetRiveRenderer

当 Lottie 文件就绪后，可在 `PetRiveRenderer.tsx` 的 `RiveRenderer` 函数中
添加 Lottie 作为第二层 fallback：

```
Fallback chain: VRM 3D → Rive 2D → Lottie 2D → Gradient+Emoji
```

## 注意事项

1. **文件大小**：保持每个 .json 文件 < 100KB（移动端性能）
2. **帧率**：导出时设为 60fps
3. **循环**：确保动画设为无限循环
4. **颜色**：使用各族群对应的渐变色系
5. **许可证**：商用前确认每个文件的许可证类型
