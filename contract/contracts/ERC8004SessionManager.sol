// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./access/AgentrixRoles.sol";

/**
 * @title ERC8004SessionManager
 * @dev ERC-8004 标准实现：Session Key 管理合约
 * 支持 Agent 自动化支付、高频小额支付场景
 *
 * 审计修复（L8 D5）：
 *  - H-03 批量执行里每一笔都是内部调用（不是外部自调用），上限可配置（owner 设，最大 100），
 *    调用方把大批量拆成几段提交；任何一笔失败整段回滚。
 *  - H-05 代币精度在构造函数里读一次并固定（IERC20Metadata.decimals()），额度仍按 6 位记账，转账时换算；
 *    换算后为 0 的转账直接拒绝，不会出现「记了额度却没转钱」。
 *  - H-04 relayer 改成 AccessControl 角色，变更有事件。
 *  - M-04 sessionId 加入该用户已有 session 数量，同一区块里连开多个 session 不会撞号。
 */
contract ERC8004SessionManager is AgentrixRoles, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    struct Session {
        address signer;           // Session Key 地址
        address owner;            // 主钱包地址
        uint256 singleLimit;      // 单笔限额（USDC，6 decimals）
        uint256 dailyLimit;       // 每日限额（USDC，6 decimals）
        uint256 usedToday;        // 今日已用（USDC，6 decimals）
        uint256 expiry;           // 过期时间戳
        uint256 lastResetDate;    // 上次重置日期（用于每日限额重置）
        bool isActive;           // 是否激活
    }

    // 状态变量
    mapping(bytes32 => Session) public sessions;
    mapping(address => bytes32[]) public userSessions; // 用户的所有 Session
    address public usdcToken; // USDC 代币地址
    address public relayer;   // 当前登记的 Relayer 地址（同时持有 RELAYER_ROLE）
    uint8 public immutable tokenDecimals; // 结算代币的精度（构造时读取）

    uint256 public constant MAX_BATCH_SIZE_LIMIT = 100;
    uint256 public maxBatchSize = 50; // 单次批量上限，调用方超过就拆段提交

    // 事件
    event SessionCreated(
        bytes32 indexed sessionId,
        address indexed owner,
        address indexed signer,
        uint256 singleLimit,
        uint256 dailyLimit,
        uint256 expiry
    );

    event PaymentExecuted(
        bytes32 indexed sessionId,
        address indexed to,
        uint256 amount,
        bytes32 indexed paymentId
    );

    event SessionRevoked(
        bytes32 indexed sessionId,
        address indexed owner
    );

    event DailyLimitReset(
        bytes32 indexed sessionId,
        uint256 newDate
    );

    event RelayerChanged(address indexed previousRelayer, address indexed newRelayer);
    event MaxBatchSizeChanged(uint256 maxBatchSize);

    // 修饰符
    modifier onlyRelayer() {
        require(hasRole(RELAYER_ROLE, msg.sender), "Only relayer can execute");
        _;
    }

    modifier validSession(bytes32 sessionId) {
        Session storage session = sessions[sessionId];
        require(session.owner != address(0), "Session not found");
        require(session.isActive, "Session not active");
        require(block.timestamp <= session.expiry, "Session expired");
        _;
    }

    constructor(address _usdcToken) {
        require(_usdcToken != address(0), "Invalid USDC address");
        usdcToken = _usdcToken;
        uint8 decimals_ = IERC20Metadata(_usdcToken).decimals();
        require(decimals_ <= 36, "Unsupported decimals");
        tokenDecimals = decimals_;
    }

    /**
     * @dev 创建 Session
     * @param signer Session Key 地址
     * @param singleLimit 单笔限额（USDC，6 decimals）
     * @param dailyLimit 每日限额（USDC，6 decimals）
     * @param expiry 过期时间戳
     */
    function createSession(
        address signer,
        uint256 singleLimit,
        uint256 dailyLimit,
        uint256 expiry
    ) external returns (bytes32 sessionId) {
        require(signer != address(0), "Invalid signer");
        require(singleLimit > 0, "Invalid single limit");
        require(dailyLimit >= singleLimit, "Daily limit must >= single limit");
        require(expiry > block.timestamp, "Invalid expiry");

        // 生成 Session ID
        sessionId = keccak256(
            abi.encodePacked(
                msg.sender,
                signer,
                block.timestamp,
                block.number,
                blockhash(block.number - 1),
                userSessions[msg.sender].length
            )
        );

        // 确保 Session ID 唯一
        require(sessions[sessionId].owner == address(0), "Session ID collision");

        // 创建 Session
        sessions[sessionId] = Session({
            signer: signer,
            owner: msg.sender,
            singleLimit: singleLimit,
            dailyLimit: dailyLimit,
            usedToday: 0,
            expiry: expiry,
            lastResetDate: block.timestamp / 1 days,
            isActive: true
        });

        // 记录用户 Session
        userSessions[msg.sender].push(sessionId);

        emit SessionCreated(
            sessionId,
            msg.sender,
            signer,
            singleLimit,
            dailyLimit,
            expiry
        );

        return sessionId;
    }

    /**
     * @dev 使用 Session 执行支付（由 Relayer 调用）
     * @param sessionId Session ID
     * @param to 收款地址
     * @param amount 支付金额（USDC，6 decimals）
     * @param paymentId 支付 ID（用于追踪）
     * @param signature Session Key 签名
     */
    function executeWithSession(
        bytes32 sessionId,
        address to,
        uint256 amount,
        bytes32 paymentId,
        bytes calldata signature
    ) external onlyRelayer validSession(sessionId) nonReentrant whenNotPaused {
        _executeWithSession(sessionId, to, amount, paymentId, signature);
    }

    /**
     * @dev 内部执行支付逻辑
     */
    function _executeWithSession(
        bytes32 sessionId,
        address to,
        uint256 amount,
        bytes32 paymentId,
        bytes calldata signature
    ) internal {
        Session storage session = sessions[sessionId];

        // 检查每日限额重置
        uint256 currentDate = block.timestamp / 1 days;
        if (currentDate > session.lastResetDate) {
            session.usedToday = 0;
            session.lastResetDate = currentDate;
            emit DailyLimitReset(sessionId, currentDate);
        }

        // 检查单笔限额
        require(amount <= session.singleLimit, "Exceeds single limit");

        // 检查每日限额
        require(
            session.usedToday + amount <= session.dailyLimit,
            "Exceeds daily limit"
        );

        // 验证签名（使用 OZ ECDSA 防止 s-value 可延展性攻击）
        bytes32 dataHash = keccak256(
            abi.encodePacked(
                sessionId,
                to,
                amount,
                paymentId,
                block.chainid
            )
        );
        bytes32 messageHash = dataHash.toEthSignedMessageHash();
        address recoveredSigner = messageHash.recover(signature);
        require(recoveredSigner == session.signer, "Invalid signature");

        // 更新已用额度
        session.usedToday += amount;

        // 从用户钱包转账 USDC 到收款地址
        // ⚠️ 重要：amount参数是6 decimals（用于签名验证和限额检查）
        // 但代币的实际精度可能是18 decimals（USDT），需要转换（精度在构造函数里读取并固定）
        uint256 amountForTransfer = amount;
        
        // 如果代币精度不是6 decimals，需要转换
        if (tokenDecimals != 6) {
            if (tokenDecimals > 6) {
                // 从6 decimals转换为更高精度（例如：6 -> 18，乘以 10^12）
                uint256 scaleFactor = 10 ** (tokenDecimals - 6);
                amountForTransfer = amount * scaleFactor;
            } else {
                // 从6 decimals转换为更低精度（例如：6 -> 3，除以 10^3）
                uint256 scaleFactor = 10 ** (6 - tokenDecimals);
                amountForTransfer = amount / scaleFactor;
            }
        }
        
        require(amountForTransfer > 0, "Amount rounds to zero");

        IERC20(usdcToken).safeTransferFrom(
            session.owner,
            to,
            amountForTransfer
        );

        emit PaymentExecuted(sessionId, to, amount, paymentId);
    }

    /**
     * @dev 批量执行支付（节省 Gas）
     * @param sessionIds Session ID 数组
     * @param recipients 收款地址数组
     * @param amounts 支付金额数组
     * @param paymentIds 支付 ID 数组
     * @param signatures 签名数组
     */
    function executeBatchWithSession(
        bytes32[] calldata sessionIds,
        address[] calldata recipients,
        uint256[] calldata amounts,
        bytes32[] calldata paymentIds,
        bytes[] calldata signatures
    ) external onlyRelayer nonReentrant whenNotPaused {
        require(
            sessionIds.length == recipients.length &&
            recipients.length == amounts.length &&
            amounts.length == paymentIds.length &&
            paymentIds.length == signatures.length,
            "Array length mismatch"
        );
        require(sessionIds.length > 0 && sessionIds.length <= maxBatchSize, "Invalid batch size");

        for (uint256 i = 0; i < sessionIds.length; i++) {
            // 首先验证 Session 有效性
            bytes32 sid = sessionIds[i];
            Session storage session = sessions[sid];
            require(session.owner != address(0), "Session not found");
            require(session.isActive, "Session not active");
            require(block.timestamp <= session.expiry, "Session expired");

            _executeWithSession(
                sid,
                recipients[i],
                amounts[i],
                paymentIds[i],
                signatures[i]
            );
        }
    }

    /**
     * @dev 撤销 Session
     * @param sessionId Session ID
     */
    function revokeSession(bytes32 sessionId) external {
        Session storage session = sessions[sessionId];
        require(session.owner == msg.sender, "Not session owner");
        require(session.isActive, "Session already revoked");

        session.isActive = false;

        emit SessionRevoked(sessionId, msg.sender);
    }

    /**
     * @dev 获取 Session 信息
     * @param sessionId Session ID
     */
    function getSession(bytes32 sessionId)
        external
        view
        returns (Session memory)
    {
        return sessions[sessionId];
    }

    /**
     * @dev 获取用户的所有 Session
     * @param user 用户地址
     */
    function getUserSessions(address user)
        external
        view
        returns (bytes32[] memory)
    {
        return userSessions[user];
    }

    /**
     * @dev 查询用户的代币授权状态
     * @param user 用户地址
     * @return allowance 授权额度
     * @return tokenAddress 代币地址
     * @return isAuthorized 是否已授权
     */
    function getUserTokenAllowance(address user)
        external
        view
        returns (
            uint256 allowance,
            address tokenAddress,
            bool isAuthorized
        )
    {
        tokenAddress = usdcToken;
        allowance = IERC20(usdcToken).allowance(user, address(this));
        isAuthorized = allowance > 0;
    }

    /// @dev RELAYER_ROLE 只能经 setRelayer 变更（见 AgentrixRoles）
    function _relayerRoleOnlyViaSetter() internal pure override returns (bool) {
        return true;
    }

    /**
     * @dev 设置 Relayer 地址
     */
    function setRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "Invalid relayer");
        address previous = relayer;
        if (previous != address(0)) {
            _revokeRole(RELAYER_ROLE, previous);
        }
        relayer = _relayer;
        _grantRole(RELAYER_ROLE, _relayer);
        emit RelayerChanged(previous, _relayer);
    }

    /**
     * @dev 设置批量上限（H-03：防止一次批量吃满区块 Gas）
     */
    function setMaxBatchSize(uint256 size) external onlyOwner {
        require(size > 0 && size <= MAX_BATCH_SIZE_LIMIT, "Invalid max batch size");
        maxBatchSize = size;
        emit MaxBatchSizeChanged(size);
    }

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
}

