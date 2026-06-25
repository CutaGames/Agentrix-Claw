# 豆包图片生成需求 — Agentrix 桌宠 Sprite Sheet

**用途**：替换桌面浮动宠物的单帧 PNG 为多帧 sprite sheet，实现真实的走路/跳跃/吃饭/睡觉动画。

**风格基调**：可爱 Q 版萌宠（参考现有 `frontend/public/downloads/pets/kitsune-default.png` 的风格）。粉色/紫色调，大眼睛，圆润短肢，无线条粗描边。

---

## 1. 通用要求（所有 Sprite Sheet）

- **格式**：PNG，**透明背景**（alpha channel）
- **方向**：所有帧都朝**右**画（程序会自动镜像翻转为朝左）
- **画风**：与 `kitsune-default.png` 完全一致——同一个角色，同一个色彩 palette
- **单帧尺寸**：256×256 px
- **布局**：所有帧水平**横向**排列在一张图里（horizontal strip）
- **总宽度**：256 × N（N 是帧数）
- **总高度**：256 px
- **无水印、无背景色、无装饰边框**

---

## 2. 需要生成的 6 个 Sprite Sheet

### 2.1 `walk.png` — 走路（6 帧）
- 总尺寸：1536×256 px（256×6）
- 6 帧依次表现：左脚抬→落地→右脚抬→落地→左脚抬→落地（一个完整步态循环）
- 身体随步伐有轻微上下起伏
- 尾巴随节奏摆动
- 头部自然朝前

### 2.2 `idle.png` — 待机（4 帧）
- 总尺寸：1024×256 px
- 4 帧轻微的呼吸 + 偶尔眨眼：
  - F1: 静止站立（眼睛睁开）
  - F2: 胸口微微鼓起（吸气）
  - F3: 静止（眼睛半闭，眨眼中）
  - F4: 胸口收回（呼气）

### 2.3 `sleep.png` — 睡觉（2 帧）
- 总尺寸：512×256 px
- 宠物趴下/蜷缩，眼睛闭合
- F1: 趴姿，肚子鼓起（吸气）
- F2: 趴姿，肚子收回（呼气）
- 程序会在头上额外渲染 💤 emoji，**不要在图里画 zzz**

### 2.4 `sit.png` — 坐着（1 帧）
- 总尺寸：256×256 px
- 单帧静态：宠物端坐着，前肢落地，尾巴自然垂落，眼睛睁开看向前方

### 2.5 `jump.png` — 跳跃（4 帧，单次播放）
- 总尺寸：1024×256 px
- F1: 蹲伏（squat，身体压低，肌肉蓄力）
- F2: 起跳（leap，身体伸展，前肢前伸，后肢蹬地）
- F3: 顶点（peak，身体悬空，四肢自然摊开，表情兴奋）
- F4: 落地（land，前肢先着地，身体弯曲缓冲）

### 2.6 `eat.png` — 吃饭（4 帧）
- 总尺寸：1024×256 px
- 宠物坐着或趴着，正在咀嚼
- F1: 嘴巴张开（准备咬）
- F2: 嘴巴半闭（咬到食物）
- F3: 嘴巴闭合（咀嚼）
- F4: 嘴巴半开（准备下一口）
- 尾巴可以稍微摆动（开心吃东西的样子）
- **不要在图里画食物**——程序会在嘴前渲染 🍖 emoji

---

## 3. 文件命名 + 放置位置

生成后文件命名规则：

```
walk.png
idle.png
sleep.png
sit.png
jump.png
eat.png
```

放置到：

```
desktop/public/pets/sprites/default/walk.png
desktop/public/pets/sprites/default/idle.png
desktop/public/pets/sprites/default/sleep.png
desktop/public/pets/sprites/default/sit.png
desktop/public/pets/sprites/default/jump.png
desktop/public/pets/sprites/default/eat.png
```

放进去后**重新构建桌面端 .exe** 就生效，无需改代码。

---

## 4. 验证方式

放进去之后，启动桌面端，宠物窗口右下角飘出来的小宠物应该：
- 走动时是真实的 6 帧步态循环（不是单图滑动）
- 站着时有 4 帧的呼吸 + 眨眼
- 右键菜单"喂食"后变成 eat 状态，4 帧咀嚼循环
- 偶尔自己跳一下（4 帧 squat→leap→peak→land）

如果某个 sprite 缺失，程序会**自动 fallback** 到现在的单帧 + CSS 动画——不会崩溃。

---

## 5. 进阶（可选 Phase B+）

如果初版效果好，后续可加：

### 5.1 多氏族变体
不同部落（A/B/C/D）的宠物各有 sprite sheet，路径：
```
desktop/public/pets/sprites/clan-A/walk.png
desktop/public/pets/sprites/clan-B/walk.png
...
```
程序会优先加载 clan 特定的 sprite，没有则用 default。

### 5.2 表情变体
为每个 emotion 单独的 idle sprite：
```
idle-happy.png
idle-sad.png
idle-angry.png
...
```
（先做 default 6 个，跑通后再加变体）

### 5.3 节日装饰
- `eat-festival-christmas.png` — 圣诞帽 + 圣诞礼物
- `idle-festival-spring.png` — 红包 + 春节灯笼

---

## 6. 提示词建议（给豆包）

参考 prompt（每个 sprite sheet 单独跑）：

```
Q版可爱萌宠九尾狐，粉色与浅紫色配色，大眼睛，圆润身体，
透明背景PNG。横向排列N帧[走路/待机/睡眠/坐着/跳跃/吃饭]
循环动画，每帧256x256px，所有帧朝右，画风一致，无水印。

风格参考：
- chibi 萌系
- 不要轮廓粗描边
- 柔和上色
- 保持每帧角色姿态一致性（同一只狐狸）

[然后描述具体动作]
```

如果豆包一次出不了 N 帧 sprite sheet，可以：
1. 先单独画 N 张图（每张 256×256，描述 F1/F2/.../FN 的具体动作）
2. 用 Photoshop / 任何图片合成工具横向拼接成一张

或者直接交给我，我可以用 ImageMagick 帮你拼。
