# AI 视频 / 3D 生成 Provider 市场调研（2026-05）

> 用于 Agentrix 平台的多 provider 路由设计依据。
> 数据来源：fal.ai / Replicate / Runway / Luma / Pika 官方定价页、腾讯云/阿里云 API 文档、HuggingFace。

---

## 一、视频生成 Provider 清单（13 家）

| # | Provider 代号 | 厂商 | 接入方式 | 计费 | 单价 (USD, 5s/720p 基准) | 时长 / 分辨率 | 输入模式 | 强项 | 免费额度 | 中国可用 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `veo-3` | Google | Vertex AI / fal.ai | per-second | $0.40/s | 3s @ 720p | text | 影视感、4K | 无 | 否（需 VPN） |
| 2 | `kling-v2.6-pro` | Kuaishou | 官方 / fal.ai | per-second | $0.07/s | 14s @ 1080p | text + image | 动作流畅、国风 | 试用 | ✓ |
| 3 | `runway-gen4` | Runway | 官方 / Replicate | per-credit | ~$0.10/s | 4–10s @ 1080p | text + image | 物理精确、相机控制 | 限免 | 否 |
| 4 | `luma-dream-machine` | Luma Labs | 官方 API | 订阅 | $30–90/月 | 5s @ 1080p | text + image | 真实光影 | $30 入门 | 否 |
| 5 | `pika-v2.5` | Pika | 官方 API | 订阅 | $8–76/月 | 5–25s | text + image + edit | 动漫、快速 | 80 credit/月 | 部分 |
| 6 | `wan-v2.5` | 阿里 / OSS | fal.ai / Replicate | per-second | $0.05–0.25/s | 20s @ 720p | text + image | 开源便宜 | HF Space | ✓ |
| 7 | `hailuo-v2.3` | MiniMax | 官方 | token | ~¥0.006/s (~$0.0008) | 6s @ 1080p | text + image | 动态强、多语言 | 限免 | ✓ |
| 8 | `seedance-v2.0` | ByteDance | Replicate / 官方 | per-run | ~$0.03–0.08/s | 5–10s @ 1080p | 多模态 | 高质量 | Replicate 试用 | ✓ |
| 9 | `happy-horse-v1.0` | 阿里通义 | Replicate | per-second | $0.02–0.05/s | 3–15s @ 1080p | text + image | 快速经济 | Replicate | ✓ |
| 10 | `cogvideox` | 智谱 | HuggingFace | 自部署 | $0 + GPU | 可变 | text | 开源、可微调 | 完全开源 | ✓ |
| 11 | `hunyuan-video` (vclm) | 腾讯 | 官方 vclm API ✅ | 按次 | 见控制台 | 5s @ 720p | text + image | 国内优化 | 试用 | ✓ |
| 12 | `ltx-video` | LTX | HuggingFace | 自部署 | $0 + GPU | 可变 @ 768p | text | 长视频 | 完全开源 | ✓ |
| 13 | `mochi-v1` | Genmo | GitHub / fal.ai | per-second | ~$0.05/s | 可变 | text + image | 多格式 | OSS | ✓ |

---

## 二、3D 模型生成 Provider 清单（8 家）

| # | Provider 代号 | 厂商 | 接入方式 | 计费 | 单价 (USD/模型) | 输出 | 输入 | 强项 | 免费 | 中国可用 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `tripo3d-v3-ultra` | Tripo AI | 官方 API | credit | $11.94–139.9/月 | GLB/OBJ + 贴图 | text + image | 高质量、快 | 有 free tier | ✓ |
| 2 | `triposr` | Stability + Tripo | HuggingFace | 自部署 | $0 + GPU | GLB/OBJ/PLY | image | 快速准确 | 完全开源 | ✓ |
| 3 | `trellis-image-large` | Microsoft | GitHub OSS | 自部署 | $0 + GPU | Gaussian / Mesh | text + image | 多格式可编辑 | 完全开源 | ✓ |
| 4 | `hunyuan3d-v1.0` (ai3d) | 腾讯 | 官方 ai3d API ✅ | 按次 | 见控制台 | GLB/OBJ | image | 中文优化 | 试用 | ✓ |
| 5 | `meshy-v5-standard` | Meshy | 官方 API | credit | $0.05–0.15/模型 | GLB/OBJ/FBX | text + image | 纹理细节 | 有限免 | ✓ |
| 6 | `rodin-gen2` | Hyper3D | 官方 API | credit | 需咨询 | GLB/OBJ | text + image | 实时预览 | 需咨询 | ✓ |
| 7 | `instantmesh` | 阿里 | HuggingFace | 自部署 | $0 + GPU | OBJ/GLB | image | 多视图快速 | 完全开源 | ✓ |
| 8 | `csm-pro` | Common Sense Machines | 官方 API | 需咨询 | 需咨询 | GLB/USD/FBX | text + image | 工业级精准 | 需咨询 | ✓ |

---

## 三、分层路由建议

### 视频
- 🆓 **Free**: HuggingFace Spaces (Wan/LTX)、Pika Free 80c/月、Replicate $5 试用
- 💰 **Budget** (<$0.05/s)：Wan 2.5、Happy Horse、自部署 HunyuanVideo
- 🔥 **Standard** ($0.05–0.20/s)：**Kling 2.6 Pro**、Seedance、**Runway Gen-4**、Pika Pro
- 💎 **Premium** (>$0.20/s)：Luma、**Veo 3**；Hailuo（国内极便宜，但归 Premium 是因质量）

### 3D
- 🆓 Trellis、TripoSR、Hunyuan3D（已接入✅）、InstantMesh
- 💰 Meshy 中端、Tripo3D Pro
- 🔥 Tripo3D Advanced、Rodin Gen2
- 💎 CSM、Tripo3D Premium

---

## 四、Agentrix 接入优先级

### Phase 1（第 1-2 周）TOP 5
1. **Replicate**（聚合 84+ 模型，统一 API）⭐⭐⭐⭐⭐
2. **fal.ai**（Veo3/Kling/Wan，低延迟）⭐⭐⭐⭐⭐
3. **MiniMax Hailuo**（国内最便宜）⭐⭐⭐⭐
4. **自部署 Wan 2.5 / HunyuanVideo**（长期成本）⭐⭐⭐⭐
5. **Pika / Luma**（订阅型 UX 好）⭐⭐⭐

### Phase 2（第 3-4 周）
- Runway Gen-4、Tripo3D、Bedrock

---

## 五、风险点

| 风险 | 缓解 |
|---|---|
| Runway/Pika/Veo 中国不可用 | 国内用户路由 MiniMax/阿里/腾讯 |
| Sora 未开放 API | 用 Veo 3 替代，别押注 Sora |
| 不同 provider 审核策略差异 | 建中间层（阿里云/腾讯云 Content Safety） |
| 价格波动 | 与主要 provider 签年度框架；多 provider fallback |
| 国内 API 政治敏感内容 | 国内 provider 默认开启 strict 审核 |

---

## 六、当前已接入

| 类型 | Provider | 状态 |
|---|---|---|
| 视频 | `hunyuan` (Tencent vclm) | ✅ 已接入（2026-05-07 修复 endpoint） |
| 视频 | `fal` | 🟡 框架在，无 key |
| 视频 | `hf` | 🟡 框架在 |
| 3D | `hunyuan3d` (Tencent ai3d) | ✅ 已接入 |

其余 provider 在 Provider Registry 中以 **`coming_soon`** 状态展示，方便用户预览选择。

---

*报告基于 2026 年 5 月公开数据。具体 API 价格以 provider 当时报价为准。*
