// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Commission
 * @dev 分润结算合约，管理Agent和商户的分润记录与自动结算
 * @notice 支持多场景支付分账：QuickPay (X402)、钱包直接转账、Provider 法币转数字货币
 */
contract Commission is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    IERC20 public settlementToken;
    address public paymindTreasury;
    address public systemRebatePool;

    // 分润记录
    struct CommissionRecord {
        bytes32 recordId;
        address payee; // 收款方
        PayeeType payeeType;
        AgentType agentType; // Agent类型（仅当payeeType为AGENT时有效）
        uint256 amount;
        address currency; // 代币地址，address(0)表示ETH
        uint256 commissionBase; // 佣金计算基础（商户税前价格）
        uint256 channelFee; // 通道费用
        bytes32 sessionId; // Session ID（三层ID之一）
        uint256 timestamp;
        bool settled;
    }

    // 结算记录
    struct Settlement {
        bytes32 settlementId;
        address payee;
        PayeeType payeeType;
        uint256 totalAmount;
        address currency;
        uint256 settlementDate;
        bool completed;
    }

    enum PayeeType {
        AGENT,
        MERCHANT,
        PAYMIND
    }

    enum AgentType {
        EXECUTION,
        RECOMMENDATION,
        REFERRAL
    }

    enum Status {
        PENDING,
        PAID,
        PROCESSING,
        DELIVERED,
        SETTLED,
        FROZEN,
        REFUNDED
    }

    // 支付场景枚举
    enum PaymentScenario {
        QUICKPAY,      // QuickPay (X402)
        WALLET,        // 钱包直接转账
        PROVIDER_FIAT, // Provider 法币转数字货币
        PROVIDER_CRYPTO // Provider 数字货币转法币（提现）
    }

    struct Order {
        bytes32 orderId;
        address merchant;
        address referrer;
        address executor;
        uint256 merchantAmount;
        uint256 referralFee;
        uint256 executionFee;
        uint256 platformFee;
        uint256 settlementTime;
        bool executorHasWallet;
        bool isDisputed;
        Status status;
    }

    // 分账配置（链上存储）- 支持 Audit Proof
    struct SplitConfig {
        address merchantMPCWallet;  // 商户 MPC 钱包地址
        uint256 merchantAmount;     // 商户金额
        address referrer;            // 推荐人地址
        uint256 referralFee;         // 推荐人佣金
        address executor;            // 执行Agent地址
        uint256 executionFee;        // 执行Agent佣金
        uint256 platformFee;         // 平台费用
        uint256 offRampFee;          // PayMind Off-ramp分佣（可配置，默认0.1%，可为0）
        bool executorHasWallet;      // 执行Agent是否有钱包
        uint256 settlementTime;      // 结算时间（0表示即时结算）
        bool isDisputed;             // 是否有争议
        bytes32 sessionId;           // Session ID（三层ID之一）
        // Audit Proof 扩展字段
        bytes32 proofHash;           // 预期结果哈希（用于验证任务完成）
        address auditor;             // 审计员地址（验证任务完成的签名者）
        bool requiresProof;          // 是否需要 Proof 才能释放资金
        bool proofVerified;          // Proof 是否已验证
    }

    // 事件
    event CommissionRecorded(
        bytes32 indexed recordId,
        address indexed payee,
        PayeeType payeeType,
        AgentType agentType,
        uint256 amount,
        address currency,
        uint256 commissionBase,
        uint256 channelFee,
        bytes32 sessionId
    );

    event SettlementCreated(
        bytes32 indexed settlementId,
        address indexed payee,
        PayeeType payeeType,
        uint256 totalAmount,
        address currency
    );

    event SettlementCompleted(
        bytes32 indexed settlementId,
        address indexed payee,
        uint256 amount,
        address currency
    );

    event OrderSynced(bytes32 indexed orderId, Status status, uint256 settlementTime);
    event CommissionDistributed(bytes32 indexed orderId, uint256 merchantAmount);
    
    // 新的事件
    event PaymentReceived(
        bytes32 indexed orderId,
        PaymentScenario scenario,
        address indexed from,
        uint256 amount
    );
    
    event PaymentAutoSplit(
        bytes32 indexed orderId,
        bytes32 indexed sessionId,
        address indexed merchantWallet,
        uint256 totalAmount,
        uint256 merchantAmount,
        uint256 platformFee,
        uint256 executionFee,
        uint256 referralFee
    );
    
    event SplitConfigSet(bytes32 indexed orderId, SplitConfig config);
    event ProviderAuthorized(address indexed provider, bool authorized);
    
    // Audit Proof 事件
    event ProofSubmitted(bytes32 indexed orderId, bytes32 resultHash, address indexed submitter);
    event ProofVerified(bytes32 indexed orderId, bytes32 resultHash, address indexed auditor, uint256 quality);
    event ProofRejected(bytes32 indexed orderId, string reason, address indexed auditor);
    event TrustedAuditorUpdated(address indexed auditor, bool trusted);

    // 状态变量
    mapping(bytes32 => CommissionRecord) public commissions;
    mapping(bytes32 => Settlement) public settlements;
    mapping(address => mapping(address => uint256)) public pendingBalances; // payee => currency => amount
    mapping(bytes32 => Order) public orders;
    
    // 新状态变量
    mapping(bytes32 => SplitConfig) public orderSplitConfigs; // 订单分账配置
    mapping(address => bool) public authorizedProviders; // Provider 白名单
    mapping(address => bool) public relayers; // Relayer 白名单
    
    // Audit Proof 状态变量
    mapping(address => bool) public trustedAuditors; // 受信任的审计员
    mapping(bytes32 => bytes32) public submittedProofs; // orderId => submittedResultHash

    modifier onlyRelayer() {
        require(relayers[msg.sender] || msg.sender == owner(), "Not relayer");
        _;
    }
    
    modifier onlyAuditor(bytes32 orderId) {
        SplitConfig storage config = orderSplitConfigs[orderId];
        require(
            trustedAuditors[msg.sender] || 
            config.auditor == msg.sender || 
            msg.sender == owner(),
            "Not authorized auditor"
        );
        _;
    }

    function setRelayer(address relayer, bool active) external onlyOwner {
        relayers[relayer] = active;
    }

    function configureSettlementToken(
        address token,
        address treasury,
        address rebatePool
    ) external onlyOwner {
        require(token != address(0) && treasury != address(0), "Invalid addresses");
        settlementToken = IERC20(token);
        paymindTreasury = treasury;
        systemRebatePool = rebatePool;
    }

    function updateSystemRebatePool(address rebatePool) external onlyOwner {
        systemRebatePool = rebatePool;
    }

    function syncOrder(
        bytes32 orderId,
        address merchant,
        address referrer,
        address executor,
        uint256 merchantAmount,
        uint256 referralFee,
        uint256 executionFee,
        uint256 platformFee,
        uint256 settlementTime,
        bool executorHasWallet,
        bool isDisputed,
        Status status
    ) external onlyOwner {
        require(orderId != bytes32(0), "Invalid order");
        Order storage o = orders[orderId];
        o.orderId = orderId;
        o.merchant = merchant;
        o.referrer = referrer;
        o.executor = executor;
        o.merchantAmount = merchantAmount;
        o.referralFee = referralFee;
        o.executionFee = executionFee;
        o.platformFee = platformFee;
        o.settlementTime = settlementTime;
        o.executorHasWallet = executorHasWallet;
        o.isDisputed = isDisputed;
        o.status = status;

        emit OrderSynced(orderId, status, settlementTime);
    }

    function setOrderDispute(bytes32 orderId, bool disputed) external onlyOwner {
        Order storage o = orders[orderId];
        require(o.orderId != bytes32(0), "Order not found");
        o.isDisputed = disputed;
        o.status = disputed ? Status.FROZEN : o.status;
    }

    /**
     * @dev 兼容现有的 distributeCommission 函数
     * 支持两种模式：
     * 1. 使用新的 SplitConfig（如果已设置）
     * 2. 使用旧的 Order 结构（向后兼容）
     * 
     * 如果 SplitConfig.requiresProof = true，则必须先验证 proof
     */
    function distributeCommission(bytes32 orderId) external nonReentrant {
        // 优先使用新的 SplitConfig
        SplitConfig storage config = orderSplitConfigs[orderId];
        if (config.merchantMPCWallet != address(0)) {
            // 检查是否需要 Proof 验证
            if (config.requiresProof) {
                require(config.proofVerified, "Proof not verified");
            }
            
            // 使用新的分账配置
            uint256 contractBalance = settlementToken.balanceOf(address(this));
            require(contractBalance > 0, "No balance to distribute");
            
            uint256 totalAmount = config.merchantAmount + 
                                 config.referralFee + 
                                 config.executionFee + 
                                 config.platformFee;
            
            if (totalAmount == 0) {
                totalAmount = contractBalance;
            }
            
            _autoSplit(orderId, totalAmount);
            return;
        }
        
        // 向后兼容：使用旧的 Order 结构
        Order storage o = orders[orderId];
        require(o.orderId != bytes32(0), "Order not found");
        require(o.status == Status.DELIVERED, "Order not ready");
        require(!o.isDisputed, "Order is disputed");
        require(block.timestamp >= o.settlementTime, "Still in locking period");
        require(address(settlementToken) != address(0), "Token not configured");
        require(paymindTreasury != address(0), "Treasury not configured");

        if (o.merchant != address(0) && o.merchantAmount > 0) {
            settlementToken.safeTransfer(o.merchant, o.merchantAmount);
        }

        if (o.referralFee > 0 && o.referrer != address(0)) {
            settlementToken.safeTransfer(o.referrer, o.referralFee);
        }

        if (o.executionFee > 0) {
            address target = o.executorHasWallet ? o.executor : systemRebatePool;
            if (target == address(0)) {
                target = paymindTreasury;
            }
            settlementToken.safeTransfer(target, o.executionFee);
        }

        if (o.platformFee > 0) {
            settlementToken.safeTransfer(paymindTreasury, o.platformFee);
        }

        o.status = Status.SETTLED;
        emit CommissionDistributed(orderId, o.merchantAmount);
    }

    /**
     * @dev 记录分润（新版本，支持多Agent协作和Session ID）
     * @param payee 收款方地址
     * @param payeeType 收款方类型
     * @param agentType Agent类型（仅当payeeType为AGENT时有效）
     * @param amount 分润金额
     * @param currency 代币地址
     * @param commissionBase 佣金计算基础（商户税前价格）
     * @param channelFee 通道费用
     * @param sessionId Session ID（三层ID之一）
     */
    function recordCommission(
        address payee,
        PayeeType payeeType,
        AgentType agentType,
        uint256 amount,
        address currency,
        uint256 commissionBase,
        uint256 channelFee,
        bytes32 sessionId
    ) external onlyOwner {
        require(payee != address(0), "Invalid payee address");
        require(amount > 0, "Amount must be greater than 0");

        bytes32 recordId = keccak256(
            abi.encodePacked(
                payee,
                payeeType,
                agentType,
                amount,
                currency,
                commissionBase,
                channelFee,
                sessionId,
                block.timestamp
            )
        );

        commissions[recordId] = CommissionRecord({
            recordId: recordId,
            payee: payee,
            payeeType: payeeType,
            agentType: agentType,
            amount: amount,
            currency: currency,
            commissionBase: commissionBase,
            channelFee: channelFee,
            sessionId: sessionId,
            timestamp: block.timestamp,
            settled: false
        });

        pendingBalances[payee][currency] += amount;

        emit CommissionRecorded(
            recordId,
            payee,
            payeeType,
            agentType,
            amount,
            currency,
            commissionBase,
            channelFee,
            sessionId
        );
    }

    /**
     * @dev 记录分润（旧版本，保持向后兼容）
     * @param payee 收款方地址
     * @param payeeType 收款方类型
     * @param amount 分润金额
     * @param currency 代币地址
     */
    function recordCommissionLegacy(
        address payee,
        PayeeType payeeType,
        uint256 amount,
        address currency
    ) external onlyOwner {
        require(payee != address(0), "Invalid payee address");
        require(amount > 0, "Amount must be greater than 0");

        bytes32 recordId = keccak256(
            abi.encodePacked(
                payee,
                payeeType,
                amount,
                currency,
                block.timestamp
            )
        );

        commissions[recordId] = CommissionRecord({
            recordId: recordId,
            payee: payee,
            payeeType: payeeType,
            agentType: AgentType.EXECUTION, // 默认执行Agent
            amount: amount,
            currency: currency,
            commissionBase: amount, // 默认使用amount作为基础
            channelFee: 0,
            sessionId: bytes32(0),
            timestamp: block.timestamp,
            settled: false
        });

        pendingBalances[payee][currency] += amount;

        emit CommissionRecorded(
            recordId,
            payee,
            payeeType,
            AgentType.EXECUTION,
            amount,
            currency,
            amount,
            0,
            bytes32(0)
        );
    }

    /**
     * @dev 创建结算
     * @param payee 收款方地址
     * @param payeeType 收款方类型
     * @param currency 代币地址
     */
    function createSettlement(
        address payee,
        PayeeType payeeType,
        address currency
    ) external onlyOwner returns (bytes32) {
        uint256 totalAmount = pendingBalances[payee][currency];
        require(totalAmount > 0, "No pending balance");

        bytes32 settlementId = keccak256(
            abi.encodePacked(
                payee,
                payeeType,
                currency,
                block.timestamp
            )
        );

        settlements[settlementId] = Settlement({
            settlementId: settlementId,
            payee: payee,
            payeeType: payeeType,
            totalAmount: totalAmount,
            currency: currency,
            settlementDate: block.timestamp,
            completed: false
        });

        emit SettlementCreated(
            settlementId,
            payee,
            payeeType,
            totalAmount,
            currency
        );

        return settlementId;
    }

    /**
     * @dev 执行结算
     * @param settlementId 结算ID
     */
    function executeSettlement(bytes32 settlementId) external nonReentrant {
        Settlement storage settlement = settlements[settlementId];
        require(settlement.settlementId != bytes32(0), "Settlement not found");
        require(!settlement.completed, "Settlement already completed");

        uint256 amount = settlement.totalAmount;
        address currency = settlement.currency;

        // 清零待结算余额
        pendingBalances[settlement.payee][currency] = 0;

        // 执行转账
        if (currency == address(0)) {
            // ETH转账 - 使用 call 替代 transfer 以支持更高 gas 限制
            (bool success, ) = payable(settlement.payee).call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            // ERC20代币转账 - 使用 SafeERC20
            IERC20 token = IERC20(currency);
            require(
                token.balanceOf(address(this)) >= amount,
                "Insufficient token balance"
            );
            token.safeTransfer(settlement.payee, amount);
        }

        settlement.completed = true;

        emit SettlementCompleted(
            settlementId,
            settlement.payee,
            amount,
            currency
        );
    }

    /**
     * @dev 查询待结算余额
     * @param payee 收款方地址
     * @param currency 代币地址
     */
    function getPendingBalance(address payee, address currency)
        external
        view
        returns (uint256)
    {
        return pendingBalances[payee][currency];
    }

    // ============ 统一分账函数 ============
    
    /**
     * @dev 统一的分账函数（内部函数）
     * @param orderId 订单ID
     * @param totalAmount 总金额
     */
    function _autoSplit(bytes32 orderId, uint256 totalAmount) internal {
        SplitConfig storage config = orderSplitConfigs[orderId];
        require(config.merchantMPCWallet != address(0), "Order config not found");
        require(!config.isDisputed, "Order is disputed");
        
        // 验证结算时间（如果需要）
        if (config.settlementTime > 0) {
            require(
                block.timestamp >= config.settlementTime,
                "Settlement time not reached"
            );
        }
        
        // 验证 USDC 余额
        require(
            settlementToken.balanceOf(address(this)) >= totalAmount,
            "Insufficient USDC balance"
        );
        
        // 记录已分配金额，用于防止精度损失
        uint256 distributed = 0;
        
        // 分账到商户 MPC 钱包
        if (config.merchantMPCWallet != address(0) && config.merchantAmount > 0) {
            settlementToken.safeTransfer(config.merchantMPCWallet, config.merchantAmount);
            distributed += config.merchantAmount;
        }
        
        // 分账到推荐人
        if (config.referralFee > 0 && config.referrer != address(0)) {
            settlementToken.safeTransfer(config.referrer, config.referralFee);
            distributed += config.referralFee;
        }
        
        // 分账到执行Agent
        if (config.executionFee > 0) {
            address target = config.executorHasWallet 
                ? config.executor 
                : systemRebatePool;
            if (target == address(0)) {
                target = paymindTreasury;
            }
            settlementToken.safeTransfer(target, config.executionFee);
            distributed += config.executionFee;
        }
        
        // 分账到平台
        if (config.platformFee > 0) {
            settlementToken.safeTransfer(paymindTreasury, config.platformFee);
            distributed += config.platformFee;
        }
        
        // 分账到PayMind Treasury（Off-ramp分佣，可配置，可为0）
        if (config.offRampFee > 0) {
            settlementToken.safeTransfer(paymindTreasury, config.offRampFee);
            distributed += config.offRampFee;
        }
        
        // 处理精度损失：将剩余金额转给平台
        if (totalAmount > distributed) {
            uint256 remaining = totalAmount - distributed;
            settlementToken.safeTransfer(paymindTreasury, remaining);
        }
        
        // 记录分账事件
        emit PaymentAutoSplit(
            orderId,
            config.sessionId,
            config.merchantMPCWallet,
            totalAmount,
            config.merchantAmount,
            config.platformFee,
            config.executionFee,
            config.referralFee
        );
    }
    
    // ============ 场景 1: QuickPay (X402) ============
    
    /**
     * @dev QuickPay 支付（X402 Session）
     * 注意：Session 签名验证应该在调用此函数之前完成（由 ERC8004 合约或 Relayer 验证）
     * @param orderId 订单ID
     * @param amount 支付金额
     */
    function quickPaySplit(
        bytes32 orderId,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        // 1. 从用户钱包转账 USDC 到合约 - 使用 SafeERC20
        settlementToken.safeTransferFrom(msg.sender, address(this), amount);
        
        // 2. 记录支付
        emit PaymentReceived(orderId, PaymentScenario.QUICKPAY, msg.sender, amount);
        
        // 3. 自动分账
        _autoSplit(orderId, amount);
    }

    /**
     * @dev QuickPay 支付（通过 Relayer/SessionManager）
     * 允许 Relayer 指定付款人（前提是 Relayer 已验证 Session）
     * @param orderId 订单ID
     * @param amount 支付金额
     * @param payer 付款人地址
     */
    function quickPaySplitFrom(
        bytes32 orderId,
        uint256 amount,
        address payer
    ) external nonReentrant onlyRelayer whenNotPaused {
        // 1. 从指定付款人钱包转账 USDC 到合约 - 使用 SafeERC20
        // 注意：付款人必须已授权 Commission 合约（或通过 Permit）
        settlementToken.safeTransferFrom(payer, address(this), amount);
        
        // 2. 记录支付
        emit PaymentReceived(orderId, PaymentScenario.QUICKPAY, payer, amount);
        
        // 3. 自动分账
        _autoSplit(orderId, amount);
    }
    
    // ============ 场景 2: 钱包直接转账 ============
    
    /**
     * @dev 钱包直接转账分账
     * @param orderId 订单ID
     * @param amount 支付金额
     */
    function walletSplit(
        bytes32 orderId,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        // 1. 从用户钱包转账 USDC 到合约 - 使用 SafeERC20
        settlementToken.safeTransferFrom(msg.sender, address(this), amount);
        
        // 2. 记录支付
        emit PaymentReceived(orderId, PaymentScenario.WALLET, msg.sender, amount);
        
        // 3. 自动分账
        _autoSplit(orderId, amount);
    }
    
    // ============ 场景 3: Provider 法币转数字货币 ============
    
    /**
     * @dev Provider 发送 USDC 到合约并自动分账
     * @param orderId 订单ID
     * @param amount 支付金额
     */
    function providerFiatToCryptoSplit(
        bytes32 orderId,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        // 1. 验证 Provider 地址（白名单）
        require(authorizedProviders[msg.sender], "Unauthorized provider");
        
        // 2. 从 Provider 钱包转账 USDC 到合约 - 使用 SafeERC20
        // 验证转账前后余额变化，防止转账金额不匹配
        uint256 balanceBefore = settlementToken.balanceOf(address(this));
        settlementToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = settlementToken.balanceOf(address(this));
        require(balanceAfter - balanceBefore >= amount, "Transfer amount mismatch");
        
        // 3. 记录支付
        emit PaymentReceived(orderId, PaymentScenario.PROVIDER_FIAT, msg.sender, amount);
        
        // 4. 自动分账
        _autoSplit(orderId, amount);
    }
    
    // ============ 配置函数 ============
    
    /**
     * @dev 设置订单分账配置
     * @param orderId 订单ID
     * @param config 分账配置
     */
    function setSplitConfig(
        bytes32 orderId,
        SplitConfig memory config
    ) external {
        require(msg.sender == owner() || relayers[msg.sender], "Unauthorized");
        require(config.merchantMPCWallet != address(0), "Invalid merchant wallet");
        orderSplitConfigs[orderId] = config;
        emit SplitConfigSet(orderId, config);
    }
    
    /**
     * @dev 设置 Provider 白名单（可选）
     */
    function setAuthorizedProvider(address provider, bool authorized) external onlyOwner {
        authorizedProviders[provider] = authorized;
        emit ProviderAuthorized(provider, authorized);
    }
    
    /**
     * @dev 设置争议状态
     */
    function setDisputeStatus(bytes32 orderId, bool isDisputed) external onlyOwner {
        SplitConfig storage config = orderSplitConfigs[orderId];
        require(config.merchantMPCWallet != address(0), "Order not found");
        config.isDisputed = isDisputed;
    }
    
    // ============ 查询函数 ============
    
    /**
     * @dev 查询订单分账配置
     */
    function getSplitConfig(bytes32 orderId) 
        external 
        view 
        returns (SplitConfig memory) 
    {
        return orderSplitConfigs[orderId];
    }
    
    /**
     * @dev 查询合约 USDC 余额
     */
    function getContractBalance() external view returns (uint256) {
        return settlementToken.balanceOf(address(this));
    }
    
    // ============ 紧急控制函数 ============
    
    /**
     * @dev 暂停合约
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev 恢复合约
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev 紧急提款 ERC20 代币
     * @param token 代币地址
     * @param to 接收地址
     * @param amount 金额
     */
    function emergencyWithdrawToken(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        IERC20(token).safeTransfer(to, amount);
    }
    
    /**
     * @dev 紧急提款 ETH
     * @param to 接收地址
     * @param amount 金额
     */
    function emergencyWithdrawETH(
        address to,
        uint256 amount
    ) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(address(this).balance >= amount, "Insufficient balance");
        (bool success, ) = payable(to).call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    // ============ Audit Proof 函数 ============

    /**
     * @dev 设置受信任的审计员
     */
    function setTrustedAuditor(address auditor, bool trusted) external onlyOwner {
        trustedAuditors[auditor] = trusted;
        emit TrustedAuditorUpdated(auditor, trusted);
    }

    /**
     * @dev 设置订单的 Proof 要求
     * @param orderId 订单 ID
     * @param proofHash 预期结果哈希
     * @param auditor 指定审计员（可选，address(0) 表示使用全局审计员）
     */
    function setProofRequirement(
        bytes32 orderId,
        bytes32 proofHash,
        address auditor
    ) external onlyRelayer {
        SplitConfig storage config = orderSplitConfigs[orderId];
        require(config.merchantMPCWallet != address(0), "Config not found");
        
        config.proofHash = proofHash;
        config.auditor = auditor;
        config.requiresProof = true;
        config.proofVerified = false;
    }

    /**
     * @dev 执行者提交任务结果哈希
     * @param orderId 订单 ID
     * @param resultHash 结果哈希（如图片哈希）
     */
    function submitProof(bytes32 orderId, bytes32 resultHash) external {
        SplitConfig storage config = orderSplitConfigs[orderId];
        require(config.requiresProof, "Proof not required");
        require(!config.proofVerified, "Already verified");
        require(
            msg.sender == config.executor || msg.sender == config.merchantMPCWallet,
            "Not authorized"
        );
        
        submittedProofs[orderId] = resultHash;
        emit ProofSubmitted(orderId, resultHash, msg.sender);
        
        // 如果预期哈希匹配，自动验证
        if (config.proofHash != bytes32(0) && resultHash == config.proofHash) {
            config.proofVerified = true;
            emit ProofVerified(orderId, resultHash, address(this), 100);
        }
    }

    /**
     * @dev 审计员验证 Proof
     * @param orderId 订单 ID
     * @param approved 是否通过
     * @param quality 质量评分 (0-100)
     */
    function verifyProof(
        bytes32 orderId,
        bool approved,
        uint256 quality
    ) external onlyAuditor(orderId) {
        SplitConfig storage config = orderSplitConfigs[orderId];
        require(config.requiresProof, "Proof not required");
        require(!config.proofVerified, "Already verified");
        require(submittedProofs[orderId] != bytes32(0), "No proof submitted");
        
        if (approved && quality >= 60) {
            config.proofVerified = true;
            emit ProofVerified(orderId, submittedProofs[orderId], msg.sender, quality);
        } else {
            emit ProofRejected(orderId, "Quality insufficient or rejected", msg.sender);
        }
    }

    /**
     * @dev 查询订单的 Proof 状态
     */
    function getProofStatus(bytes32 orderId) external view returns (
        bool requiresProof,
        bytes32 expectedHash,
        bytes32 submittedHash,
        bool verified,
        address auditor
    ) {
        SplitConfig storage config = orderSplitConfigs[orderId];
        return (
            config.requiresProof,
            config.proofHash,
            submittedProofs[orderId],
            config.proofVerified,
            config.auditor
        );
    }
    
    /**
     * @dev 接收ETH
     */
    receive() external payable {}
}

