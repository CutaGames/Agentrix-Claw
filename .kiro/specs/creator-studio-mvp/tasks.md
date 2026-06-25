# Creator Studio MVP — Tasks

---

## Sprint 1: 多形态生成 + 皮肤上架（P0）

### Task 1: 多形态数据模型
- [ ] 1.1 在 `shared/types/` 新增 `PetSkinVariant` 接口
- [ ] 1.2 扩展 `PetSkin` 接口添加 `variants` 和 `hasMultiForm` 字段
- [ ] 1.3 后端 `pet_skin_variants` 表迁移脚本
- [ ] 1.4 后端 `pet-generation` 模块新增 `submitVariant` 方法

### Task 2: PetCreator 多形态 UI
- [ ] 2.1 PetCreatorPanel 生成完成后显示"生成形态变体"卡片
- [ ] 2.2 形态选择器 UI（三个复选框 + 预设 prompt 后缀）
- [ ] 2.3 并行任务进度显示（每个形态独立进度条）
- [ ] 2.4 三形态预览对比视图
- [ ] 2.5 确认绑定按钮 → 调用后端关联 variants 到 skin

### Task 3: 桌面端形态自动切换
- [ ] 3.1 `petSdk.ts` 新增 `getActiveVariant()` 函数
- [ ] 3.2 监听 appMode 变化事件，切换渲染模型
- [ ] 3.3 切换时添加过渡动画（淡入淡出 0.5s）
- [ ] 3.4 浮球状态同步（Living 模式 = 萌态模型）

### Task 4: Marketplace 上架 Modal
- [ ] 4.1 新建 `MarketplaceListingModal.tsx` 组件
- [ ] 4.2 表单字段：标题/描述/定价/族群/标签
- [ ] 4.3 3D 模型预览（复用 PetRenderer）
- [ ] 4.4 提交逻辑 → POST `/api/v1/marketplace/skins/listing`
- [ ] 4.5 成功/失败反馈 toast

### Task 5: WardrobePanel 集成
- [ ] 5.1 每个 SkinCard 添加"上架"按钮（仅自己创建的皮肤）
- [ ] 5.2 点击打开 MarketplaceListingModal
- [ ] 5.3 已上架皮肤显示"已上架"标记 + 市场链接
- [ ] 5.4 多形态皮肤显示形态数量角标

---

## Sprint 2: 海报 + PPT 生成器（P1）

### Task 6: 海报生成引擎
- [ ] 6.1 新建 `desktop/src/services/posterGenerator.ts`
- [ ] 6.2 定义 5 个预设模板（pitch/social/product/holiday/minimal）
- [ ] 6.3 Canvas 2D 渲染管线（文字 + 图片 + 形状）
- [ ] 6.4 从 PetRenderer 截取 3D 模型截图
- [ ] 6.5 导出 PNG/PDF 功能

### Task 7: PosterWorkshop UI
- [ ] 7.1 新建 `desktop/src/components/PosterWorkshop.tsx`
- [ ] 7.2 模板选择器（网格预览）
- [ ] 7.3 内容编辑器（标题/副标题/要点/CTA）
- [ ] 7.4 颜色/字体选择器
- [ ] 7.5 实时预览画布
- [ ] 7.6 导出按钮 + 尺寸选择

### Task 8: PPT 生成引擎
- [ ] 8.1 安装 `pptxgenjs` 依赖
- [ ] 8.2 新建 `desktop/src/services/pptGenerator.ts`
- [ ] 8.3 定义 4 种 slide layout（title/content/two-column/image-full）
- [ ] 8.4 品牌主题配置（颜色/字体/logo）
- [ ] 8.5 生成 .pptx 并保存到本地

### Task 9: PPT Agent 集成
- [ ] 9.1 新建 `desktop/src/services/creatorAgent.ts`
- [ ] 9.2 注册 "generate-ppt" tool 到 Agent 工具列表
- [ ] 9.3 LLM prompt 模板：从用户描述生成 slides JSON
- [ ] 9.4 自动插入萌宠截图到相关 slide
- [ ] 9.5 生成完成后弹出预览 + 保存对话框

### Task 10: CreatorStudioHub 整合
- [ ] 10.1 CreatorStudioHub 添加 Tab：海报 / PPT / 视频(灰色)
- [ ] 10.2 路由到 PosterWorkshop / PPT 预览
- [ ] 10.3 历史记录列表（最近生成的物料）
- [ ] 10.4 右键菜单 RM-5 打开时默认显示最近 Tab
