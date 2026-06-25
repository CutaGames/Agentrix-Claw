# Creator Studio MVP — Design

---

## 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│ Desktop App (Tauri 2.0 + React)                              │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ PetCreator   │  │ Creator      │  │ Marketplace  │      │
│  │ Panel        │  │ Studio Hub   │  │ Listing      │      │
│  │ (多形态)     │  │ (海报/PPT)   │  │ (上架)       │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│  ┌──────▼──────────────────▼──────────────────▼───────┐     │
│  │              CreatorService (新增)                    │     │
│  │  - generateVariants()                               │     │
│  │  - generatePoster()                                 │     │
│  │  - generatePPT()                                    │     │
│  │  - listSkin()                                       │     │
│  └──────────────────────┬─────────────────────────────┘     │
│                         │                                    │
└─────────────────────────┼────────────────────────────────────┘
                          │ HTTP / WebSocket
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend (NestJS)                                             │
│                                                              │
│  pet-generation module ──→ Meshy / 腾讯混元3D               │
│  marketplace module ────→ PostgreSQL (listings)              │
│  creator-tools module ──→ 图像生成 API / PPT 模板           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 模块 1：多形态萌宠生成

### 数据模型扩展

```typescript
// shared/types/pet-skin.ts — 扩展
interface PetSkinVariant {
  id: string;
  skinId: string;           // 父皮肤 ID
  mode: 'living' | 'pro' | 'economy';  // 对应形态
  modelUrl: string;         // .glb CDN URL
  vrmUrl?: string;          // .vrm CDN URL (auto-rigged)
  thumbnailUrl: string;     // 预览图
  prompt: string;           // 生成时使用的 prompt
  createdAt: string;
}

interface PetSkinV2 extends PetSkin {
  variants: PetSkinVariant[];  // 0-3 个变体
  hasMultiForm: boolean;       // 是否有多形态
}
```

### 后端 API 扩展

```
POST /api/v1/pet-generation/submit-variant
Body: {
  parentSkinId: string;
  mode: 'living' | 'pro' | 'economy';
  promptModifier: string;   // 追加到原始 prompt 的形态描述
}
Response: { taskId: string; estimatedSeconds: number; }
```

### 前端流程（PetCreatorPanel 扩展）

```
用户在 PetCreator 生成基础模型
    ↓
生成完成后，弹出"生成形态变体？"卡片
    ↓
用户选择要生成的形态（可多选）：
  □ 萌态 (Living) — 默认已有
  □ 专家态 (Pro) — "同一角色，站直，周围有光符数据流"
  □ 商人态 (Economy) — "同一角色，戴小帽，手持金币"
    ↓
后端并行提交 N 个生成任务
    ↓
进度条显示每个形态的生成状态
    ↓
全部完成 → 预览三形态 → 确认绑定
```

### 桌面端形态切换逻辑

```typescript
// desktop/src/services/petSdk.ts — 扩展
function getActiveVariant(skin: PetSkinV2, appMode: AppMode): string {
  if (!skin.hasMultiForm) return skin.modelUrl;
  
  const modeMap: Record<AppMode, PetSkinVariant['mode']> = {
    'living-agent': 'living',
    'pro-mode': 'pro',
    'economy-panel': 'economy',
  };
  
  const variant = skin.variants.find(v => v.mode === modeMap[appMode]);
  return variant?.modelUrl || skin.modelUrl; // fallback to base
}
```

---

## 模块 2：皮肤上架到 Marketplace

### 前端组件

```
WardrobePanel
  └── SkinCard (每个皮肤)
        └── [上架到市场] 按钮
              ↓ 点击
        MarketplaceListingModal (新组件)
          ├── 标题输入
          ├── 描述输入 (Markdown)
          ├── 定价 (AXP 数量 / USD)
          ├── 族群分类 (A-F dropdown)
          ├── 标签 (多选: cute / cool / fantasy / sci-fi / ...)
          ├── 3D 预览 (复用 PetRenderer)
          └── [提交上架] 按钮
                ↓
          POST /api/v1/marketplace/skins/listing
```

### 后端 API（已有，确认接口）

```typescript
// POST /api/v1/marketplace/skins/listing
interface ListSkinRequest {
  skinId: string;
  title: string;
  description: string;
  price: number;           // AXP 数量
  priceCurrency: 'AXP' | 'USD';
  clan?: string;           // A-F
  tags?: string[];
  includeVariants: boolean; // 是否包含多形态变体
}

// Response
interface ListSkinResponse {
  listingId: string;
  status: 'pending_review' | 'approved' | 'rejected';
  marketUrl: string;       // Web 端市场链接
}
```

---

## 模块 3：海报生成器

### 架构

```
CreatorStudioHub
  └── PosterWorkshop (新 Tab)
        ├── TemplateSelector (5+ 模板)
        ├── ContentEditor
        │     ├── 标题/副标题
        │     ├── 正文要点
        │     ├── CTA 文案
        │     └── 品牌色选择
        ├── PetModelCapture (从 3D 模型截图)
        └── ExportPanel
              ├── 尺寸选择 (1080×1920 / A4 / 自定义)
              └── 导出 PNG / PDF
```

### 技术实现

```typescript
// desktop/src/services/posterGenerator.ts

interface PosterTemplate {
  id: string;
  name: string;
  category: 'pitch' | 'social' | 'product' | 'holiday' | 'minimal';
  layout: PosterLayout;    // 元素位置定义
  defaultColors: string[];
}

interface PosterContent {
  title: string;
  subtitle?: string;
  bullets?: string[];
  cta?: string;
  petScreenshot?: string;  // base64 from PetRenderer
  logo?: string;
  colors: { primary: string; secondary: string; bg: string; };
}

async function generatePoster(
  template: PosterTemplate,
  content: PosterContent,
  size: { width: number; height: number }
): Promise<Blob> {
  // 1. 创建 OffscreenCanvas
  // 2. 按 template.layout 排列元素
  // 3. 渲染文字 (Canvas 2D API)
  // 4. 插入 petScreenshot
  // 5. 导出为 PNG Blob
}
```

### AI 辅助

用户可以说"帮我生成一张路演海报"，LLM 自动：
1. 根据上下文生成文案
2. 选择合适模板
3. 从当前主宠截图
4. 调用 generatePoster()
5. 弹出预览 + 导出

---

## 模块 4：PPT 生成器

### 技术方案

**方案 A（推荐）：基于 pptxgenjs 库**

```typescript
// desktop/src/services/pptGenerator.ts
import PptxGenJS from 'pptxgenjs';

interface SlideContent {
  title: string;
  bullets?: string[];
  image?: string;          // base64
  chart?: ChartData;
  layout: 'title' | 'content' | 'two-column' | 'image-full';
}

async function generatePPT(
  slides: SlideContent[],
  theme: PPTTheme
): Promise<ArrayBuffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: '16:9', width: 10, height: 5.625 });
  
  for (const slide of slides) {
    const s = pptx.addSlide();
    // 根据 layout 类型排列元素
    s.addText(slide.title, { x: 0.5, y: 0.3, fontSize: 28, bold: true });
    if (slide.bullets) {
      s.addText(slide.bullets.map(b => ({ text: b, options: { bullet: true } })), 
        { x: 0.5, y: 1.5, fontSize: 16 });
    }
    if (slide.image) {
      s.addImage({ data: slide.image, x: 5, y: 1, w: 4, h: 3 });
    }
  }
  
  return await pptx.write({ outputType: 'arraybuffer' });
}
```

### LLM 集成

```
用户: "帮我做一份 Agentrix 路演 PPT，10 页"
    ↓
LLM 生成结构化 JSON:
{
  "slides": [
    { "title": "问题", "bullets": ["AI 助手同质化...", "..."], "layout": "content" },
    { "title": "解决方案", "bullets": [...], "image": "pet_screenshot", "layout": "two-column" },
    ...
  ]
}
    ↓
pptGenerator.generatePPT(slides, brandTheme)
    ↓
保存到桌面 + 弹出预览
```

---

## 模块 5：视频生成（P2，后续迭代）

### 技术方案

```
VideoStudioPanel
  ├── ScriptEditor (LLM 生成分镜)
  ├── SceneGenerator (调用 Kling/Runway API)
  ├── VoiceoverGenerator (TTS)
  └── Compositor (FFmpeg WASM 合成)
```

暂不在本 spec 的 P0 范围内，Phase 2 实现。

---

## 实现计划

### Sprint 1（Week 1）— P0 核心

| 任务 | 文件 | 工作量 |
|------|------|:------:|
| 多形态数据模型 | `shared/types/pet-skin.ts` | 2h |
| 后端 variant API | `backend/src/modules/pet-generation/` | 4h |
| PetCreator 变体 UI | `desktop/src/components/PetCreatorPanel.tsx` | 6h |
| 形态切换逻辑 | `desktop/src/services/petSdk.ts` | 3h |
| 上架 Modal 组件 | `desktop/src/components/MarketplaceListingModal.tsx` | 6h |
| WardrobePanel 上架按钮 | `desktop/src/components/WardrobePanel.tsx` | 2h |

### Sprint 2（Week 2-3）— P1 创作工具

| 任务 | 文件 | 工作量 |
|------|------|:------:|
| 海报模板系统 | `desktop/src/services/posterGenerator.ts` | 8h |
| PosterWorkshop UI | `desktop/src/components/PosterWorkshop.tsx` | 8h |
| PPT 生成引擎 | `desktop/src/services/pptGenerator.ts` | 6h |
| PPT Agent 指令 | `desktop/src/services/creatorAgent.ts` | 4h |
| CreatorStudioHub 整合 | `desktop/src/components/CreatorStudioHub.tsx` | 4h |

### Sprint 3（Week 4+）— P2 视频

后续迭代，不在本 spec 范围。

---

## 依赖

| 依赖 | 状态 | 备注 |
|------|:----:|------|
| PetCreator 后端 | ✅ 已有 | Meshy + 腾讯混元3D |
| Marketplace 后端 API | ✅ 已有 | `/api/v1/marketplace/skins/listing` |
| pptxgenjs npm 包 | 需安装 | `npm i pptxgenjs` |
| Canvas 2D (海报) | ✅ 浏览器内置 | OffscreenCanvas |
| 图像生成 API (海报背景) | 可选 | DALL-E 3 / SD |
| 视频生成 API | P2 | Kling / Runway |
