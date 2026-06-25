# Agentrix 合约安全审计报告（更新版）

**审计日期**: 2026年1月15日  
**审计版本**: v1.1  
**适用范围**: 2026年1月10日后重写版本  
**合约清单**: Commission.sol, PaymentRouter.sol, AutoPay.sol, X402Adapter.sol, ERC8004SessionManager.sol, AuditProof.sol

---

## 一、执行摘要

本报告基于 1.10 之后最新合约实现进行更新。重点关注多链部署（BNB-USDT / BASE-USDC）、签名验证、分账精度、授权支付模型、批量执行 Gas 风险与紧急控制。

| 严重程度 | 数量 | 结论 |
|---------|------|-----|
| 🔴 Critical | 3 | 必须修复后才能上主网 |
| 🟠 High | 5 | 发布前必须修复 |
| 🟡 Medium | 7 | 建议修复或补充测试 |
| 🔵 Info | 6 | 建议优化 |

**结论**: 当前版本不建议直接上主网。建议先完成 Critical/High 级别修复，并完成多链稳定币精度兼容测试与回归测试。

---

## 二、审计范围与方法

**范围**:
- 资金流与分账路径（Commission、PaymentRouter）
- 授权支付与自动扣款（AutoPay、ERC8004SessionManager）
- X402 会话与签名验证（X402Adapter）
- 任务审计与放款（AuditProof）

**方法**:
- 逻辑审计：状态机、权限控制、异常路径
- 安全审计：重入、签名伪造、授权绕过、ERC20 兼容
- 经济审计：分账精度、手续费残留、资金冻结
- 多链适配：USDT/USDC decimals、RPC/链特性

---

## 三、关键风险与修复建议（最新版本）

### C-01: AutoPay 授权支付模型不一致
**影响**: 资金无法正常转移或产生错误资金来源假设。  
**建议**: 统一为 ERC20 `transferFrom` 模式，并明确 `grant` 与付款来源是用户钱包。

### C-02: X402Adapter 签名验证不足
**影响**: 允许伪造签名执行付款。  
**建议**: 使用标准签名验证（EIP-712 或 EIP-191），对 `sessionId`、`amount`、`recipient`、`expiry` 等字段做哈希签名校验。

### C-03: Commission 与稳定币兼容性问题
**影响**: USDT 等非标准 ERC20 可能导致 `transferFrom` 失败但不 revert。  
**建议**: 全部使用 SafeERC20，所有 `transfer`/`transferFrom` 统一为 `safeTransfer`/`safeTransferFrom`。

---

### H-01: PaymentRouter `withdraw` 缺少 `nonReentrant`
**影响**: 潜在重入风险。  
**建议**: 添加 `nonReentrant` 并保留 Checks-Effects-Interactions。

### H-02: Commission 分账精度残留
**影响**: 分账总额与 `totalAmount` 不一致导致资金滞留。  
**建议**: 最后一笔使用 `totalAmount - distributed`，保证全量分配。

### H-03: ERC8004SessionManager 批量执行 Gas 风险
**影响**: 批量调用可能超过区块 Gas 限制，导致全失败。  
**建议**: 改为内部调用并可选分段批量处理。

### H-04: Provider/Relayer 权限边界
**影响**: 授权管理边界不清导致滥用。  
**建议**: 对 `authorizedProviders`/`relayer` 增加事件与更细粒度权限控制；生产上使用多签管理。

### H-05: 多链 decimals 固化问题
**影响**: ERC8004SessionManager 目前假设 USDC 6 decimals，BNB-USDT 可能为 18 decimals。  
**建议**: 引入可配置 decimals 或在构造器中读取 `IERC20Metadata.decimals()`。

---

## 四、测试计划（BNB-USDT / BASE-USDC）

参考基础测试说明: [contract/TESTING_GUIDE.md](contract/TESTING_GUIDE.md)

### 1) 单元测试（合约级）
**Commission**
- `quickPaySplit` / `walletSplit` / `providerFiatToCryptoSplit` 全流程
- 分账总和一致性与 dust 处理
- `pause`/`unpause`/`emergencyWithdraw` 覆盖

**X402Adapter**
- 单签/批量签名校验
- 过期 session 拒绝执行
- relayer 执行权限验证

**AutoPay**
- `grant` 创建/撤销
- 单日/单次限额
- ERC20 `transferFrom` 资产来源验证

**ERC8004SessionManager**
- 单日 reset 逻辑
- `executeBatchWithSession` 分段执行
- 多币种 decimals 适配

**AuditProof**
- SIGNATURE/HASH_MATCH/MULTISIG 三模式
- 争议窗口与结果释放流程

### 2) 集成测试（跨合约）
- X402 → PaymentRouter → Commission 分账链路
- AutoPay → Commission 分账链路
- AuditProof → Commission 结算释放链路

### 3) 多链测试矩阵
| 链 | 代币 | Decimals | 重点场景 |
|----|------|----------|---------|
| BNB | USDT | 以链上为准 | 非标准 ERC20 行为、gas 成本 |
| BASE | USDC | 6 | 低 gas、高频支付 |

---

## 五、上线准备清单（必须完成）

### 修复与安全
- [ ] Critical/High 全部修复并回归测试
- [ ] SafeERC20 全面替换
- [ ] `nonReentrant` 全覆盖资金流入口
- [ ] 多链 decimals 兼容完成
- [ ] `pause()` 覆盖所有可转移资金入口

### 部署与运维
- [ ] 确认主网 RPC 与稳定币地址
- [ ] Owner 权限迁移到多签
- [ ] 完成 BscScan/BaseScan 合约验证
- [ ] 生产部署记录归档

### 风险控制
- [ ] 关键参数上限控制（max fee / max split）
- [ ] 资金冻结/争议路径实测
- [ ] 紧急提款与恢复机制验证

---

## 六、补齐清单（Gap List）

### 必须补齐
1. AutoPay 资金模型统一为 ERC20 模式。
2. X402Adapter 签名验证升级为标准签名。
3. ERC8004SessionManager 多币种 decimals 支持。
4. Commission 分账精度与残余处理。
5. 全局 SafeERC20 与重入保护覆盖。

### 建议补齐
1. 事件覆盖与索引字段补齐（便于后端对账）。
2. 批量执行分片策略（防止 gas 上限）。
3. 使用独立 `Treasury` 合约处理资金与审计流程。

---

## 七、下一步建议

如需我直接修复合约并更新测试，我会按以下顺序执行：
1) 修复 Critical/High 级问题；
2) 补齐 decimals 兼容；
3) 回归测试与覆盖率报告；
4) 更新部署脚本与多链配置。

```solidity
function providerFiatToCryptoSplit(...) external {
    require(authorizedProviders[msg.sender], "Unauthorized provider");
    require(settlementToken.balanceOf(address(this)) >= amount, ...);
}
```

**问题描述**:
- 验证的是合约余额而非 Provider 实际转入的金额
- Provider 可以声称转入大额但实际转入小额
- 需要验证转账前后的余额差

**修复建议**:
```solidity
function providerFiatToCryptoSplit(...) external {
    require(authorizedProviders[msg.sender], "Unauthorized provider");
    uint256 balanceBefore = settlementToken.balanceOf(address(this));
    settlementToken.safeTransferFrom(msg.sender, address(this), amount);
    uint256 balanceAfter = settlementToken.balanceOf(address(this));
    require(balanceAfter - balanceBefore >= amount, "Insufficient deposit");
    // ...
}
```

---

### H-05: 多合约间授权不一致

**问题描述**:
- `PaymentRouter` 可以调用 `completePayment` 但没有验证调用者
- `X402Adapter` 依赖 `PaymentRouter` 但授权机制分散
- 缺少统一的权限管理

**修复建议**:
- 实现统一的 AccessControl 合约
- 使用 OpenZeppelin 的 AccessControl 模式

---

## 四、低危问题 (Medium)

### M-01: Commission.sol - 缺少事件索引

**位置**: 多处事件定义

**问题描述**: 部分关键事件缺少 `indexed` 关键字，影响链下查询效率

**修复建议**: 为关键字段添加 `indexed`

---

### M-02: AutoPay.sol - 时间戳依赖

**位置**: `AutoPay.sol:121`

```solidity
uint256 currentDate = block.timestamp / 1 days;
```

**问题描述**: 依赖 `block.timestamp` 进行日期计算，矿工可在约15秒范围内操纵

**风险等级**: 低（影响有限）

---

### M-03: Commission.sol - 缺少暂停机制

**问题描述**: 
- 合约没有 Pausable 功能
- 发现漏洞时无法紧急停止

**修复建议**:
```solidity
import "@openzeppelin/contracts/security/Pausable.sol";

contract Commission is Ownable, ReentrancyGuard, Pausable {
    function quickPaySplit(...) external nonReentrant whenNotPaused { ... }
}
```

---

### M-04: ERC8004SessionManager.sol - Session ID 碰撞

**位置**: `ERC8004SessionManager.sol:98-106`

**问题描述**:
- `sessionId` 使用 `blockhash(block.number - 1)` 增加随机性
- 但在同一区块内创建多个 Session 可能碰撞

**修复建议**: 添加 nonce 或使用 chainlink VRF

---

### M-05: PaymentRouter.sol - 未使用的 priority 字段

**问题描述**: `PaymentChannel.priority` 字段声明但未使用

---

### M-06: X402Adapter.sol - 过期 Session 未清理

**问题描述**: 过期的 Session 数据永久存储，浪费存储空间

---

### M-07: Commission.sol - Order 和 SplitConfig 冗余

**问题描述**: `Order` 结构体和 `SplitConfig` 功能重叠，增加维护复杂度

---

### M-08: 缺少代币精度统一处理

**位置**: `ERC8004SessionManager.sol:200-215`

**问题描述**: 
- 代币精度转换逻辑只在 ERC8004 中实现
- Commission.sol 假设所有代币都是 6 decimals

---

## 五、信息级问题 (Info)

### I-01: 使用过时的 transfer 方法

**建议**: 将 `payable().transfer()` 替换为 `call{value: amount}("")`

---

### I-02: 魔法数字

**问题**: 代码中存在未定义的常量如 `50`、`100000`

**建议**: 定义为 constant

---

### I-03: 缺少 NatSpec 文档

**建议**: 为所有 public 函数添加完整的 NatSpec 注释

---

### I-04: 版本锁定

**建议**: 使用固定的 Solidity 版本而非 `^0.8.20`

---

### I-05: 缺少紧急提款函数

**建议**: 添加 owner 可调用的紧急提款函数

---

### I-06: 事件参数命名不一致

**建议**: 统一事件参数命名风格

---

## 六、Gas 优化建议

### G-01: 使用 unchecked 优化计数器

```solidity
for (uint256 i = 0; i < length;) {
    // ...
    unchecked { ++i; }
}
```

### G-02: 缓存 storage 变量

```solidity
// 当前
sessions[sessionId].usedToday += amount;
sessions[sessionId].lastResetDate = currentDate;

// 优化
Session storage session = sessions[sessionId];
session.usedToday += amount;
session.lastResetDate = currentDate;
```

### G-03: 使用 custom errors

```solidity
error InsufficientBalance();
error SessionExpired();
// 替代 require(..., "string")
```

---

## 七、审计结论

### 建议优先级

| 优先级 | 问题编号 | 预计工时 |
|-------|---------|---------|
| P0 紧急 | C-01, C-02, C-03 | 4h |
| P1 高优 | H-01 ~ H-05 | 6h |
| P2 中等 | M-01 ~ M-08 | 4h |
| P3 低优 | I-01 ~ I-06, G-01 ~ G-03 | 2h |

### 上线前必须完成

1. ✅ 修复所有 Critical 问题
2. ✅ 修复所有 High 问题
3. ✅ 添加 Pausable 机制
4. ✅ 添加紧急提款函数
5. ✅ 完善测试覆盖率 (目标 90%+)
6. ✅ 在测试网完整测试

### 建议上线后完成

1. 完善 NatSpec 文档
2. Gas 优化
3. 代码重构（合并 Order 和 SplitConfig）

---

## 八、修复验证 Checklist

- [ ] C-01: AutoPay ERC20 支持已实现
- [ ] C-02: X402Adapter 签名验证已完善
- [ ] C-03: Commission SafeERC20 已使用
- [ ] H-01: PaymentRouter withdraw nonReentrant
- [ ] H-02: 分账精度处理已验证
- [ ] H-03: 批量执行改为内部调用
- [ ] H-04: Provider 转账验证已修复
- [ ] H-05: 权限管理已统一
- [ ] M-03: Pausable 已添加

---

*报告由 Agentrix Security Team 生成*
