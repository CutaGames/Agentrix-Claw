// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IAgentRegistry
 * @dev Agent 注册与发现标准接口 - Agentrix EIP 草案
 * @notice 定义 AI Agent 在链上注册、发现和信任评估的标准接口
 */
interface IAgentRegistry {
    // ============ 数据结构 ============
    
    /**
     * @dev Agent 信息结构
     */
    struct AgentInfo {
        bytes32 agentId;            // Agent 唯一标识
        address owner;              // 所有者地址
        address paymentWallet;      // 支付钱包地址
        string name;                // Agent 名称
        string endpoint;            // API/MCP 端点
        bytes32[] capabilities;     // 能力标签
        uint256 trustScore;         // 信任评分 (0-10000, basis points)
        uint256 totalTransactions;  // 总交易数
        uint256 totalVolume;        // 总交易量
        uint256 registeredAt;       // 注册时间
        AgentStatus status;         // 状态
    }
    
    /**
     * @dev Agent 状态枚举
     */
    enum AgentStatus {
        PENDING,        // 待审核
        ACTIVE,         // 活跃
        SUSPENDED,      // 暂停
        BLACKLISTED,    // 黑名单
        DEACTIVATED     // 已停用
    }
    
    /**
     * @dev 能力声明结构
     */
    struct CapabilityDeclaration {
        bytes32 capabilityId;       // 能力ID
        string name;                // 能力名称
        string version;             // 版本
        bytes32 schemaHash;         // 输入输出 schema 哈希
    }

    // ============ 事件 ============
    
    /**
     * @dev Agent 注册事件
     */
    event AgentRegistered(
        bytes32 indexed agentId,
        address indexed owner,
        string name,
        string endpoint
    );
    
    /**
     * @dev Agent 更新事件
     */
    event AgentUpdated(
        bytes32 indexed agentId,
        string field,
        bytes newValue
    );
    
    /**
     * @dev Agent 状态变更事件
     */
    event AgentStatusChanged(
        bytes32 indexed agentId,
        AgentStatus oldStatus,
        AgentStatus newStatus,
        string reason
    );
    
    /**
     * @dev 信任评分更新事件
     */
    event TrustScoreUpdated(
        bytes32 indexed agentId,
        uint256 oldScore,
        uint256 newScore,
        bytes32 indexed transactionId
    );
    
    /**
     * @dev 能力声明事件
     */
    event CapabilityDeclared(
        bytes32 indexed agentId,
        bytes32 indexed capabilityId,
        string name
    );

    // ============ 注册函数 ============
    
    /**
     * @dev 注册新 Agent
     * @param name Agent 名称
     * @param endpoint API/MCP 端点
     * @param paymentWallet 支付钱包地址
     * @param capabilities 能力标签列表
     * @return agentId 生成的 Agent ID
     */
    function registerAgent(
        string calldata name,
        string calldata endpoint,
        address paymentWallet,
        bytes32[] calldata capabilities
    ) external returns (bytes32 agentId);
    
    /**
     * @dev 更新 Agent 信息
     * @param agentId Agent ID
     * @param name 新名称 (空字符串表示不更新)
     * @param endpoint 新端点 (空字符串表示不更新)
     * @param paymentWallet 新支付钱包 (address(0) 表示不更新)
     */
    function updateAgent(
        bytes32 agentId,
        string calldata name,
        string calldata endpoint,
        address paymentWallet
    ) external;
    
    /**
     * @dev 停用 Agent
     * @param agentId Agent ID
     */
    function deactivateAgent(bytes32 agentId) external;
    
    /**
     * @dev 声明 Agent 能力
     * @param agentId Agent ID
     * @param capability 能力声明
     */
    function declareCapability(
        bytes32 agentId,
        CapabilityDeclaration calldata capability
    ) external;

    // ============ 管理函数 ============
    
    /**
     * @dev 暂停 Agent (管理员)
     * @param agentId Agent ID
     * @param reason 暂停原因
     */
    function suspendAgent(bytes32 agentId, string calldata reason) external;
    
    /**
     * @dev 恢复 Agent (管理员)
     * @param agentId Agent ID
     */
    function reinstateAgent(bytes32 agentId) external;
    
    /**
     * @dev 加入黑名单 (管理员)
     * @param agentId Agent ID
     * @param reason 原因
     */
    function blacklistAgent(bytes32 agentId, string calldata reason) external;
    
    /**
     * @dev 更新信任评分 (内部/授权)
     * @param agentId Agent ID
     * @param transactionId 关联交易ID
     * @param scoreChange 评分变化 (正数增加，负数减少)
     */
    function updateTrustScore(
        bytes32 agentId,
        bytes32 transactionId,
        int256 scoreChange
    ) external;

    // ============ 查询函数 ============
    
    /**
     * @dev 获取 Agent 信息
     */
    function getAgent(bytes32 agentId) external view returns (AgentInfo memory);
    
    /**
     * @dev 通过钱包地址获取 Agent
     */
    function getAgentByWallet(address wallet) external view returns (bytes32 agentId);
    
    /**
     * @dev 获取 Agent 的所有能力
     */
    function getAgentCapabilities(bytes32 agentId) external view returns (bytes32[] memory);
    
    /**
     * @dev 检查 Agent 是否具有特定能力
     */
    function hasCapability(bytes32 agentId, bytes32 capabilityId) external view returns (bool);
    
    /**
     * @dev 按能力搜索 Agent
     */
    function findAgentsByCapability(
        bytes32 capabilityId,
        uint256 minTrustScore,
        uint256 limit
    ) external view returns (bytes32[] memory agentIds);
    
    /**
     * @dev 获取 Agent 状态
     */
    function getAgentStatus(bytes32 agentId) external view returns (AgentStatus);
    
    /**
     * @dev 检查 Agent 是否活跃
     */
    function isAgentActive(bytes32 agentId) external view returns (bool);
}
