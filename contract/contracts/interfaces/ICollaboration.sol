// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ICollaboration
 * @dev Agent 协作协议标准接口 - Agentrix EIP 草案
 * @notice 定义 AI Agent 之间协作和分成的标准接口
 */
interface ICollaboration {
    // ============ 数据结构 ============
    
    /**
     * @dev 协作协议结构
     */
    struct Agreement {
        bytes32 agreementId;        // 协议唯一标识
        address initiator;          // 发起人
        bytes32[] agentIds;         // 参与的 Agent ID 列表
        address[] agentWallets;     // Agent 钱包地址列表
        uint256[] shareRatios;      // 分成比例 (basis points, 总和=10000)
        uint256 validFrom;          // 生效时间
        uint256 validUntil;         // 失效时间
        bytes32 termsHash;          // 条款哈希 (链下存储)
        uint8 requiredApprovals;    // 需要的批准数
        uint8 currentApprovals;     // 当前批准数
        AgreementStatus status;     // 状态
    }
    
    /**
     * @dev 协议状态枚举
     */
    enum AgreementStatus {
        DRAFT,          // 草稿
        PENDING,        // 待批准
        ACTIVE,         // 生效中
        SUSPENDED,      // 暂停
        TERMINATED,     // 终止
        EXPIRED         // 已过期
    }
    
    /**
     * @dev 协议模板结构
     */
    struct AgreementTemplate {
        bytes32 templateId;
        string name;
        uint256[] defaultRatios;
        bytes32 termsHash;
        bool isActive;
    }

    // ============ 事件 ============
    
    /**
     * @dev 协议创建事件
     */
    event AgreementCreated(
        bytes32 indexed agreementId,
        address indexed initiator,
        bytes32[] agentIds,
        uint256 validUntil
    );
    
    /**
     * @dev 协议批准事件
     */
    event AgreementApproved(
        bytes32 indexed agreementId,
        bytes32 indexed agentId,
        address indexed approver,
        uint8 currentApprovals,
        uint8 requiredApprovals
    );
    
    /**
     * @dev 协议激活事件
     */
    event AgreementActivated(
        bytes32 indexed agreementId,
        uint256 activatedAt
    );
    
    /**
     * @dev 协议终止事件
     */
    event AgreementTerminated(
        bytes32 indexed agreementId,
        address indexed terminator,
        string reason
    );
    
    /**
     * @dev 分成执行事件
     */
    event ShareDistributed(
        bytes32 indexed agreementId,
        bytes32 indexed transactionId,
        uint256 totalAmount,
        uint256[] distributions
    );

    // ============ 协议管理函数 ============
    
    /**
     * @dev 创建协作协议
     * @param agentIds 参与的 Agent ID 列表
     * @param agentWallets Agent 钱包地址列表
     * @param shareRatios 分成比例 (basis points)
     * @param validUntil 有效期截止时间
     * @param termsHash 条款哈希
     * @param requiredApprovals 需要的批准数
     * @return agreementId 创建的协议ID
     */
    function createAgreement(
        bytes32[] calldata agentIds,
        address[] calldata agentWallets,
        uint256[] calldata shareRatios,
        uint256 validUntil,
        bytes32 termsHash,
        uint8 requiredApprovals
    ) external returns (bytes32 agreementId);
    
    /**
     * @dev 批准协议
     * @param agreementId 协议ID
     * @param agentId 批准的 Agent ID
     */
    function approveAgreement(
        bytes32 agreementId,
        bytes32 agentId
    ) external;
    
    /**
     * @dev 终止协议
     * @param agreementId 协议ID
     * @param reason 终止原因
     */
    function terminateAgreement(
        bytes32 agreementId,
        string calldata reason
    ) external;
    
    /**
     * @dev 续期协议
     * @param agreementId 协议ID
     * @param newValidUntil 新的有效期
     */
    function extendAgreement(
        bytes32 agreementId,
        uint256 newValidUntil
    ) external;

    // ============ 分账函数 ============
    
    /**
     * @dev 根据协议执行分账
     * @param agreementId 协议ID
     * @param totalAmount 总金额
     * @param transactionId 关联交易ID
     * @return distributions 各方分配金额
     */
    function distributeByAgreement(
        bytes32 agreementId,
        uint256 totalAmount,
        bytes32 transactionId
    ) external returns (uint256[] memory distributions);
    
    /**
     * @dev 计算分账金额（视图函数，不执行转账）
     * @param agreementId 协议ID
     * @param totalAmount 总金额
     * @return distributions 各方分配金额
     */
    function calculateDistribution(
        bytes32 agreementId,
        uint256 totalAmount
    ) external view returns (uint256[] memory distributions);

    // ============ 模板函数 ============
    
    /**
     * @dev 创建协议模板
     */
    function createTemplate(
        string calldata name,
        uint256[] calldata defaultRatios,
        bytes32 termsHash
    ) external returns (bytes32 templateId);
    
    /**
     * @dev 从模板创建协议
     */
    function createFromTemplate(
        bytes32 templateId,
        bytes32[] calldata agentIds,
        address[] calldata agentWallets,
        uint256 validUntil
    ) external returns (bytes32 agreementId);

    // ============ 查询函数 ============
    
    /**
     * @dev 获取协议详情
     */
    function getAgreement(bytes32 agreementId) external view returns (Agreement memory);
    
    /**
     * @dev 获取 Agent 参与的所有协议
     */
    function getAgentAgreements(bytes32 agentId) external view returns (bytes32[] memory);
    
    /**
     * @dev 检查协议是否有效
     */
    function isAgreementValid(bytes32 agreementId) external view returns (bool);
    
    /**
     * @dev 获取协议状态
     */
    function getAgreementStatus(bytes32 agreementId) external view returns (AgreementStatus);
    
    /**
     * @dev 检查地址是否已批准协议
     */
    function hasApproved(bytes32 agreementId, address approver) external view returns (bool);
}
