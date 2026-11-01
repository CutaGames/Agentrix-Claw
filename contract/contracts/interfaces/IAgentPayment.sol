// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IAgentPayment
 * @dev Agent 支付标准接口 - Agentrix EIP 草案
 * @notice 定义 AI Agent 生态系统中支付和分账的标准接口
 */
interface IAgentPayment {
    // ============ 数据结构 ============
    
    /**
     * @dev 支付意图结构
     */
    struct PaymentIntent {
        bytes32 intentId;           // 意图唯一标识
        address payer;              // 付款人
        address[] recipients;       // 收款人列表
        uint256[] amounts;          // 对应金额列表
        bytes32 collaborationId;    // 关联的协作协议ID
        uint256 totalAmount;        // 总金额
        uint256 createdAt;          // 创建时间
        uint256 expiresAt;          // 过期时间
        IntentStatus status;        // 状态
    }
    
    /**
     * @dev 分账配置结构
     */
    struct SplitConfig {
        address merchantWallet;     // 商户钱包
        uint256 merchantAmount;     // 商户金额
        address[] agents;           // Agent 地址列表
        uint256[] agentFees;        // Agent 费用列表
        uint256 platformFee;        // 平台费用
        bytes32 sessionId;          // Session ID
        bool isDisputed;            // 是否有争议
    }
    
    /**
     * @dev 意图状态枚举
     */
    enum IntentStatus {
        CREATED,        // 已创建
        APPROVED,       // 已批准
        EXECUTED,       // 已执行
        CANCELLED,      // 已取消
        EXPIRED,        // 已过期
        DISPUTED        // 争议中
    }

    // ============ 事件 ============
    
    /**
     * @dev 支付意图创建事件
     */
    event IntentCreated(
        bytes32 indexed intentId,
        address indexed payer,
        uint256 totalAmount,
        bytes32 collaborationId
    );
    
    /**
     * @dev 支付意图执行事件
     */
    event IntentExecuted(
        bytes32 indexed intentId,
        uint256 totalAmount,
        uint256 recipientCount
    );
    
    /**
     * @dev 支付意图取消事件
     */
    event IntentCancelled(
        bytes32 indexed intentId,
        address indexed canceller,
        string reason
    );
    
    /**
     * @dev 自动分账完成事件
     */
    event PaymentSplit(
        bytes32 indexed intentId,
        bytes32 indexed sessionId,
        address indexed merchantWallet,
        uint256 merchantAmount,
        uint256 agentFees,
        uint256 platformFee
    );

    // ============ 核心函数 ============
    
    /**
     * @dev 创建支付意图
     * @param recipients 收款人地址列表
     * @param amounts 对应金额列表
     * @param collaborationId 协作协议ID
     * @param expiresIn 有效期（秒）
     * @return intentId 创建的意图ID
     */
    function createIntent(
        address[] calldata recipients,
        uint256[] calldata amounts,
        bytes32 collaborationId,
        uint256 expiresIn
    ) external returns (bytes32 intentId);
    
    /**
     * @dev 执行支付意图
     * @param intentId 意图ID
     * @param proof 执行证明（如签名、Merkle proof等）
     */
    function executeIntent(
        bytes32 intentId,
        bytes calldata proof
    ) external;
    
    /**
     * @dev 取消支付意图
     * @param intentId 意图ID
     * @param reason 取消原因
     */
    function cancelIntent(
        bytes32 intentId,
        string calldata reason
    ) external;
    
    /**
     * @dev 设置分账配置
     * @param orderId 订单ID
     * @param config 分账配置
     */
    function setSplitConfig(
        bytes32 orderId,
        SplitConfig calldata config
    ) external;
    
    /**
     * @dev 执行自动分账
     * @param orderId 订单ID
     * @param amount 支付金额
     */
    function executeAutoSplit(
        bytes32 orderId,
        uint256 amount
    ) external;

    // ============ 查询函数 ============
    
    /**
     * @dev 获取支付意图详情
     */
    function getIntent(bytes32 intentId) external view returns (PaymentIntent memory);
    
    /**
     * @dev 获取分账配置
     */
    function getSplitConfig(bytes32 orderId) external view returns (SplitConfig memory);
    
    /**
     * @dev 获取待处理余额
     */
    function getPendingBalance(address payee, address token) external view returns (uint256);
}
