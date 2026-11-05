// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title AuditProof
 * @dev 结果审计与托管释放合约
 * 
 * 实现"任务完成"的链上验证：
 * 1. 托管资金：用户预存资金到合约
 * 2. 任务绑定：关联 proofHash（预期结果哈希）
 * 3. 验证释放：Auditor 或用户确认结果后释放资金
 * 
 * 支持三种验证模式：
 * - SIGNATURE: 指定 Auditor 签名验证
 * - HASH_MATCH: 结果哈希匹配验证
 * - MULTISIG: 多签验证（M-of-N）
 */
contract AuditProof is Ownable, ReentrancyGuard, Pausable, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ============ 常量 ============
    bytes32 public constant RELEASE_TYPEHASH = keccak256(
        "Release(bytes32 taskId,bytes32 resultHash,uint256 quality,uint256 nonce)"
    );
    
    uint256 public constant MAX_AUDITORS = 10;
    uint256 public constant MIN_QUALITY_SCORE = 60; // 最低质量分（0-100）
    uint256 public constant DISPUTE_WINDOW = 24 hours; // 争议窗口期

    // ============ 枚举 ============
    enum VerificationMode {
        SIGNATURE,      // 签名验证
        HASH_MATCH,     // 哈希匹配
        MULTISIG        // 多签验证
    }

    enum TaskStatus {
        CREATED,        // 已创建
        FUNDED,         // 已托管资金
        SUBMITTED,      // 已提交结果
        VERIFIED,       // 已验证
        RELEASED,       // 已释放资金
        DISPUTED,       // 争议中
        REFUNDED        // 已退款
    }

    // ============ 结构体 ============
    
    /**
     * @dev 任务配置 - 简化版本避免 Stack too deep
     */
    struct TaskConfig {
        bytes32 taskId;              // 任务 ID
        address creator;             // 任务创建者（付款方）
        address executor;            // 执行者（收款方）
        
        // 资金信息
        address token;               // 支付代币
        uint256 amount;              // 托管金额
        uint256 platformFee;         // 平台费用
        
        // 验证配置
        VerificationMode mode;       // 验证模式
        bytes32 expectedProofHash;   // 预期结果哈希（用于 HASH_MATCH 模式）
        uint256 requiredSignatures;  // 所需签名数（用于 MULTISIG 模式）
        
        // 状态
        TaskStatus status;
        uint256 createdAt;
        uint256 deadline;            // 任务截止时间
        uint256 releasedAt;
        
        // 结果
        bytes32 submittedResultHash; // 提交的结果哈希
        uint256 qualityScore;        // 质量评分 (0-100)
    }

    /**
     * @dev 签名记录
     */
    struct SignatureRecord {
        address signer;
        bytes32 resultHash;
        uint256 quality;
        uint256 timestamp;
    }

    // ============ 状态变量 ============
    
    mapping(bytes32 => TaskConfig) public tasks;
    mapping(bytes32 => address[]) public taskAuditors;  // 分离存储审计员列表
    mapping(bytes32 => SignatureRecord[]) public taskSignatures;
    mapping(bytes32 => mapping(address => bool)) public hasSignedTask;
    mapping(address => bool) public trustedAuditors;
    
    // 平台配置
    address public platformTreasury;
    uint256 public defaultPlatformFeeRate = 100; // 1% = 100 basis points
    uint256 public nonce;

    // ============ 事件 ============
    
    event TaskCreated(
        bytes32 indexed taskId,
        address indexed creator,
        address indexed executor,
        uint256 amount,
        VerificationMode mode
    );
    
    event TaskFunded(
        bytes32 indexed taskId,
        address indexed funder,
        uint256 amount
    );
    
    event ResultSubmitted(
        bytes32 indexed taskId,
        address indexed executor,
        bytes32 resultHash
    );
    
    event ProofVerified(
        bytes32 indexed taskId,
        address indexed auditor,
        bytes32 resultHash,
        uint256 quality
    );
    
    event FundsReleased(
        bytes32 indexed taskId,
        address indexed executor,
        uint256 amount,
        uint256 platformFee
    );
    
    event TaskDisputed(
        bytes32 indexed taskId,
        address indexed disputer,
        string reason
    );
    
    event TaskRefunded(
        bytes32 indexed taskId,
        address indexed creator,
        uint256 amount
    );

    event AuditorUpdated(address indexed auditor, bool trusted);

    // ============ 构造函数 ============
    
    constructor(address _treasury) EIP712("AuditProof", "1") {
        platformTreasury = _treasury;
    }

    // ============ 管理函数 ============

    function setTrustedAuditor(address auditor, bool trusted) external onlyOwner {
        trustedAuditors[auditor] = trusted;
        emit AuditorUpdated(auditor, trusted);
    }

    function setPlatformTreasury(address treasury) external onlyOwner {
        require(treasury != address(0), "Invalid treasury");
        platformTreasury = treasury;
    }

    function setDefaultPlatformFeeRate(uint256 rate) external onlyOwner {
        require(rate <= 1000, "Fee rate too high"); // Max 10%
        defaultPlatformFeeRate = rate;
    }

    // ============ 核心函数 ============

    /**
     * @dev 创建托管任务
     */
    function createTask(
        bytes32 taskId,
        address executor,
        address token,
        uint256 amount,
        VerificationMode mode,
        bytes32 expectedProofHash,
        address[] calldata auditors,
        uint256 requiredSignatures,
        uint256 deadline
    ) external whenNotPaused returns (bytes32) {
        require(tasks[taskId].taskId == bytes32(0), "Task exists");
        require(executor != address(0), "Invalid executor");
        require(amount > 0, "Invalid amount");
        require(deadline > block.timestamp, "Invalid deadline");
        
        // 验证模式特定检查
        if (mode == VerificationMode.HASH_MATCH) {
            require(expectedProofHash != bytes32(0), "Hash required");
        } else if (mode == VerificationMode.SIGNATURE) {
            require(auditors.length > 0 && auditors.length <= MAX_AUDITORS, "Invalid auditors");
        } else if (mode == VerificationMode.MULTISIG) {
            require(auditors.length >= requiredSignatures, "Invalid multisig config");
            require(requiredSignatures > 0, "Need at least 1 signature");
        }

        uint256 platformFee = (amount * defaultPlatformFeeRate) / 10000;

        TaskConfig storage task = tasks[taskId];
        task.taskId = taskId;
        task.creator = msg.sender;
        task.executor = executor;
        task.token = token;
        task.amount = amount;
        task.platformFee = platformFee;
        task.mode = mode;
        task.expectedProofHash = expectedProofHash;
        task.requiredSignatures = requiredSignatures;
        task.status = TaskStatus.CREATED;
        task.createdAt = block.timestamp;
        task.deadline = deadline;
        
        // 分离存储审计员列表
        for (uint i = 0; i < auditors.length; i++) {
            taskAuditors[taskId].push(auditors[i]);
        }

        emit TaskCreated(taskId, msg.sender, executor, amount, mode);
        return taskId;
    }

    /**
     * @dev 为任务注资（托管）
     */
    function fundTask(bytes32 taskId) external payable whenNotPaused nonReentrant {
        TaskConfig storage task = tasks[taskId];
        require(task.taskId != bytes32(0), "Task not found");
        require(task.status == TaskStatus.CREATED, "Invalid status");
        
        uint256 totalRequired = task.amount + task.platformFee;
        
        if (task.token == address(0)) {
            // ETH 支付
            require(msg.value >= totalRequired, "Insufficient ETH");
            // 退还多余的 ETH
            if (msg.value > totalRequired) {
                (bool refundSuccess, ) = payable(msg.sender).call{value: msg.value - totalRequired}("");
                require(refundSuccess, "ETH refund failed");
            }
        } else {
            // ERC20 支付
            IERC20(task.token).safeTransferFrom(msg.sender, address(this), totalRequired);
        }

        task.status = TaskStatus.FUNDED;
        emit TaskFunded(taskId, msg.sender, totalRequired);
    }

    /**
     * @dev 提交任务结果（执行者调用）
     */
    function submitResult(
        bytes32 taskId,
        bytes32 resultHash
    ) external whenNotPaused nonReentrant {
        TaskConfig storage task = tasks[taskId];
        require(task.taskId != bytes32(0), "Task not found");
        require(task.status == TaskStatus.FUNDED, "Task not funded");
        require(msg.sender == task.executor, "Not executor");
        require(block.timestamp <= task.deadline, "Task expired");

        task.submittedResultHash = resultHash;
        task.status = TaskStatus.SUBMITTED;

        emit ResultSubmitted(taskId, msg.sender, resultHash);

        // 如果是哈希匹配模式，自动验证
        if (task.mode == VerificationMode.HASH_MATCH) {
            if (resultHash == task.expectedProofHash) {
                _verifyAndRelease(taskId, 100); // 完全匹配给 100 分
            }
        }
    }

    /**
     * @dev 审计员验证结果
     */
    function verifyResult(
        bytes32 taskId,
        bytes32 resultHash,
        uint256 quality,
        bytes calldata signature
    ) external whenNotPaused nonReentrant {
        TaskConfig storage task = tasks[taskId];
        require(task.taskId != bytes32(0), "Task not found");
        require(task.status == TaskStatus.SUBMITTED, "Not submitted");
        require(!hasSignedTask[taskId][msg.sender], "Already signed");
        require(quality <= 100, "Invalid quality");

        // 验证签名
        bytes32 structHash = keccak256(abi.encode(
            RELEASE_TYPEHASH,
            taskId,
            resultHash,
            quality,
            nonce++
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);

        // 检查签名者权限
        bool isValidSigner = false;
        address[] storage auditors = taskAuditors[taskId];
        if (task.mode == VerificationMode.SIGNATURE || task.mode == VerificationMode.MULTISIG) {
            for (uint i = 0; i < auditors.length; i++) {
                if (auditors[i] == signer) {
                    isValidSigner = true;
                    break;
                }
            }
        }
        // 也允许受信任的全局审计员
        if (trustedAuditors[signer]) {
            isValidSigner = true;
        }
        require(isValidSigner, "Invalid signer");

        // 记录签名
        hasSignedTask[taskId][signer] = true;
        taskSignatures[taskId].push(SignatureRecord({
            signer: signer,
            resultHash: resultHash,
            quality: quality,
            timestamp: block.timestamp
        }));

        emit ProofVerified(taskId, signer, resultHash, quality);

        // 检查是否达到释放条件
        if (task.mode == VerificationMode.SIGNATURE) {
            // 单签名模式：任意一个审计员签名即可
            if (quality >= MIN_QUALITY_SCORE) {
                _verifyAndRelease(taskId, quality);
            }
        } else if (task.mode == VerificationMode.MULTISIG) {
            // 多签模式：需要足够数量的签名
            if (taskSignatures[taskId].length >= task.requiredSignatures) {
                // 计算平均质量分
                uint256 totalQuality = 0;
                for (uint i = 0; i < taskSignatures[taskId].length; i++) {
                    totalQuality += taskSignatures[taskId][i].quality;
                }
                uint256 avgQuality = totalQuality / taskSignatures[taskId].length;
                if (avgQuality >= MIN_QUALITY_SCORE) {
                    _verifyAndRelease(taskId, avgQuality);
                }
            }
        }
    }

    /**
     * @dev 用户直接确认释放（创建者调用）
     */
    function confirmRelease(bytes32 taskId, uint256 quality) external whenNotPaused nonReentrant {
        TaskConfig storage task = tasks[taskId];
        require(task.taskId != bytes32(0), "Task not found");
        require(msg.sender == task.creator, "Not creator");
        require(task.status == TaskStatus.SUBMITTED || task.status == TaskStatus.FUNDED, "Invalid status");

        _verifyAndRelease(taskId, quality);
    }

    /**
     * @dev 发起争议
     */
    function disputeTask(bytes32 taskId, string calldata reason) external whenNotPaused {
        TaskConfig storage task = tasks[taskId];
        require(task.taskId != bytes32(0), "Task not found");
        require(msg.sender == task.creator || msg.sender == task.executor, "Not participant");
        require(
            task.status == TaskStatus.SUBMITTED || task.status == TaskStatus.VERIFIED,
            "Cannot dispute"
        );

        task.status = TaskStatus.DISPUTED;
        emit TaskDisputed(taskId, msg.sender, reason);
    }

    /**
     * @dev 解决争议（仅 Owner）
     */
    function resolveDispute(
        bytes32 taskId,
        bool releaseToExecutor,
        uint256 executorShare // basis points
    ) external onlyOwner nonReentrant {
        TaskConfig storage task = tasks[taskId];
        require(task.status == TaskStatus.DISPUTED, "Not disputed");
        require(executorShare <= 10000, "Invalid share");

        if (releaseToExecutor) {
            uint256 executorAmount = (task.amount * executorShare) / 10000;
            uint256 creatorRefund = task.amount - executorAmount;

            if (task.token == address(0)) {
                if (executorAmount > 0) {
                    (bool s1, ) = payable(task.executor).call{value: executorAmount}("");
                    require(s1, "ETH transfer failed");
                }
                if (creatorRefund > 0) {
                    (bool s2, ) = payable(task.creator).call{value: creatorRefund}("");
                    require(s2, "ETH transfer failed");
                }
                (bool s3, ) = payable(platformTreasury).call{value: task.platformFee}("");
                require(s3, "ETH transfer failed");
            } else {
                if (executorAmount > 0) IERC20(task.token).safeTransfer(task.executor, executorAmount);
                if (creatorRefund > 0) IERC20(task.token).safeTransfer(task.creator, creatorRefund);
                IERC20(task.token).safeTransfer(platformTreasury, task.platformFee);
            }
        } else {
            // 全额退款给创建者
            uint256 refund = task.amount + task.platformFee;
            if (task.token == address(0)) {
                (bool s4, ) = payable(task.creator).call{value: refund}("");
                require(s4, "ETH transfer failed");
            } else {
                IERC20(task.token).safeTransfer(task.creator, refund);
            }
        }

        task.status = TaskStatus.RELEASED;
    }

    /**
     * @dev 过期退款
     */
    function refundExpired(bytes32 taskId) external whenNotPaused nonReentrant {
        TaskConfig storage task = tasks[taskId];
        require(task.taskId != bytes32(0), "Task not found");
        require(msg.sender == task.creator, "Not creator");
        require(block.timestamp > task.deadline + DISPUTE_WINDOW, "Not expired");
        require(
            task.status == TaskStatus.FUNDED || task.status == TaskStatus.SUBMITTED,
            "Cannot refund"
        );

        uint256 refund = task.amount + task.platformFee;
        task.status = TaskStatus.REFUNDED;

        if (task.token == address(0)) {
            (bool success, ) = payable(task.creator).call{value: refund}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(task.token).safeTransfer(task.creator, refund);
        }

        emit TaskRefunded(taskId, task.creator, refund);
    }

    // ============ 内部函数 ============

    function _verifyAndRelease(bytes32 taskId, uint256 quality) internal {
        TaskConfig storage task = tasks[taskId];
        require(task.status != TaskStatus.RELEASED, "Already released");
        require(task.status != TaskStatus.REFUNDED, "Already refunded");

        task.status = TaskStatus.VERIFIED;
        task.qualityScore = quality;

        // 分发资金
        if (task.token == address(0)) {
            // ETH - 使用 call 替代 transfer
            (bool s1, ) = payable(task.executor).call{value: task.amount}("");
            require(s1, "ETH transfer failed");
            (bool s2, ) = payable(platformTreasury).call{value: task.platformFee}("");
            require(s2, "ETH transfer failed");
        } else {
            // ERC20
            IERC20(task.token).safeTransfer(task.executor, task.amount);
            IERC20(task.token).safeTransfer(platformTreasury, task.platformFee);
        }

        task.status = TaskStatus.RELEASED;
        task.releasedAt = block.timestamp;

        emit FundsReleased(taskId, task.executor, task.amount, task.platformFee);
    }

    // ============ 视图函数 ============

    function getTask(bytes32 taskId) external view returns (TaskConfig memory) {
        return tasks[taskId];
    }

    function getTaskSignatures(bytes32 taskId) external view returns (SignatureRecord[] memory) {
        return taskSignatures[taskId];
    }

    function isAuditorForTask(bytes32 taskId, address auditor) external view returns (bool) {
        address[] storage auditors = taskAuditors[taskId];
        for (uint i = 0; i < auditors.length; i++) {
            if (auditors[i] == auditor) return true;
        }
        return trustedAuditors[auditor];
    }

    function getTaskAuditors(bytes32 taskId) external view returns (address[] memory) {
        return taskAuditors[taskId];
    }

    // ============ 紧急函数 ============

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = payable(owner()).call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
    }

    // 允许合约接收 ETH
    receive() external payable {}
}
