# ADR-PET-001: Pet 经济资产暂不上链（Pet Phase 6 P2-5 决策）

- 状态：Accepted
- 日期：2026-05-09
- 关联：`docs/PET_PHASE6_P0-P2_REMEDIATION_PLAN_2026-05-08.zh-CN.md` P2-5
- 上位 PRD：`docs/PRD_PET_PHASE6_PLAN.zh-CN.md`、
  `docs/PRD_PET_MONETIZATION_QUOTA_MODEL.zh-CN.md`

## 背景

Phase 6 P2-5 留有“繁育经济链上化（可选）”的可能性：把皮肤 / 蛋 /
幼崽以 NFT 形式上链，并接入 token metadata、交易凭证与链上归属。
该任务在拆分时即明确标注“链上与非链上方案二选一，不再混合表述”。

## 决策

**Phase 6 范围内不引入链上资产化。** 全部宠物相关资产（皮肤、蛋、
幼崽、成就、能量记录）继续以下列方式存储与流转：

1. **皮肤 / 蛋 / 幼崽**：PostgreSQL 实体（`pet_skins`、`pet_eggs`、
   `pet_breeding_*`），归属字段为 `user_id`。
2. **支付链路**：走 P0-3 落地的 `Order` + payment intent 流程，订单
   `metadata.consumedForSkinInstall` 单次消费。
3. **市场转移**：`marketplace-pet` 模块的内部转账记录，无链上 tx。
4. **成就 / 能量**：纯后端账本（`agent_cost_records`、
   `pet_energy_state`）。

## 理由

1. **产品决策未稳定**：P2-5 原文标注“仅在产品决策确认后”。当前用户
   增长曲线尚未到需要链上资产稀缺性叙事的阶段。
2. **合规复杂度**：跨地区 NFT 合规（尤其是涉及付费购买与二级市场）
   会显著放大法务与税务成本，对 Phase 6 体验闭环优先级是负面回报。
3. **链上读写延迟**：宠物互动（feed / co_play / 能量增益）期望
   sub-second 反馈，链上提交不满足体验目标。
4. **可逆性**：链下方案保留了未来选择（Phase 7+ 可在不破坏现有归属
   的前提下，按 user_id 批量 mint 历史资产）。

## 影响范围

- 后端：所有 pet 相关 entity 维持 `user_id` 单一归属字段。
- 前端：商店、繁育、公开页 UI 不展示链上 tx hash / wallet address。
- 文档：`docs/PRD_PET_PHASE6_PLAN.zh-CN.md` 与
  `docs/PRD_PET_MONETIZATION_QUOTA_MODEL.zh-CN.md` 中的“可选链上化”
  描述视作长期备选项，非 Phase 6 落地范围。

## 重新评估触发条件

如出现以下任一情形，再回头评估上链方案：

1. 月活付费用户 ≥ 10K 且皮肤二级市场流通占比超 15%。
2. 与 Coinbase / 其他链合作方达成正式合作（参考
   `docs/COINBASE_PARTNERSHIP_STRATEGY.md`）。
3. 法务团队已就跨境合规给出绿灯。

## 不做的事

- 不写 NFT mint / 交易 / 元数据生成逻辑。
- 不在 UI 上暴露 wallet 输入或链上 tx 字段。
- 不在 PRD 中保留“链上为主路径”的叙述。
