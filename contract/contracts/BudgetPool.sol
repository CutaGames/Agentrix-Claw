// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title BudgetPool
 * @dev 预算池合约 - 用于多 Agent 协作任务的预算分配与里程碑管理
 * @notice 支持资金托管、里程碑审批、质量门控、自动释放
 * 
 * 使用场景:
 * - 多 Agent 协作完成复杂任务
 * - 按里程碑分阶段释放资金
 * - 质量审核后自动分润
 */
contract BudgetPool is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    uint16 public constant BASIS_POINTS = 10000;
    uint256 public constant MIN_POOL_AMOUNT = 1e6; // 最低 1 USDC
    uint256 public constant MAX_MILESTONES = 20;

    // ============ Enums ============
    enum PoolStatus {
        DRAFT,      // 草稿
        FUNDED,     // 已充值
        ACTIVE,     // 进行中
        COMPLETED,  // 已完成
        CANCELLED   // 已取消
    }

    enum MilestoneStatus {
        PENDING,    // 待开始
        IN_PROGRESS,// 进行中
        SUBMITTED,  // 已提交待审核
        APPROVED,   // 已批准
        REJECTED,   // 被拒绝
        RELEASED    // 已释放资金
    }

    // ============ Structs ============
    struct Pool {
        bytes32 poolId;
        address owner;
        string name;
        string description;
        uint256 totalBudget;
        uint256 fundedAmount;
        uint256 reservedAmount;
        uint256 releasedAmount;
        address token;
        PoolStatus status;
        uint256 createdAt;
        uint256 deadline;
    }

    struct Milestone {
        bytes32 milestoneId;
        bytes32 poolId;
        string title;
        string description;
        uint256 budgetAmount;
        uint16 percentOfPool;
        MilestoneStatus status;
        address[] participants;
        uint16[] participantShares; // basis points
        bytes32 deliverableHash; // 交付物哈希
        uint256 submittedAt;
        uint256 approvedAt;
        address approver;
        uint8 qualityScore; // 0-100
    }

    struct QualityGate {
        uint8 minQualityScore;   // 最低质量分 (0-100)
        bool requiresApproval;    // 是否需要人工审批
        uint256 autoReleaseDelay; // 自动释放延迟 (秒)
    }

    struct Participant {
        address wallet;
        uint256 totalEarned;
        uint256 pendingAmount;
        uint256 claimedAmount;
    }

    // ============ State Variables ============
    IERC20 public settlementToken;
    address public platformTreasury;
    uint16 public platformFeeBps; // 平台费率

    // Pools
    mapping(bytes32 => Pool) public pools;
    mapping(address => bytes32[]) public ownerPools;
    bytes32[] public allPoolIds;

    // Milestones
    mapping(bytes32 => Milestone) public milestones;
    mapping(bytes32 => bytes32[]) public poolMilestones;

    // Quality Gates
    mapping(bytes32 => QualityGate) public poolQualityGates;

    // Participants
    mapping(bytes32 => mapping(address => Participant)) public poolParticipants;
    mapping(address => uint256) public pendingBalances;

    // Access Control
    mapping(bytes32 => mapping(address => bool)) public poolApprovers;
    mapping(address => bool) public operators;

    // ============ Events ============
    event PoolCreated(
        bytes32 indexed poolId,
        address indexed owner,
        string name,
        uint256 totalBudget,
        address token
    );

    event PoolFunded(
        bytes32 indexed poolId,
        address indexed funder,
        uint256 amount
    );

    event PoolStatusChanged(
        bytes32 indexed poolId,
        PoolStatus oldStatus,
        PoolStatus newStatus
    );

    event MilestoneCreated(
        bytes32 indexed milestoneId,
        bytes32 indexed poolId,
        string title,
        uint256 budgetAmount
    );

    event MilestoneStatusChanged(
        bytes32 indexed milestoneId,
        MilestoneStatus oldStatus,
        MilestoneStatus newStatus
    );

    event MilestoneSubmitted(
        bytes32 indexed milestoneId,
        bytes32 deliverableHash,
        address indexed submitter
    );

    event MilestoneApproved(
        bytes32 indexed milestoneId,
        address indexed approver,
        uint8 qualityScore
    );

    event MilestoneRejected(
        bytes32 indexed milestoneId,
        address indexed approver,
        string reason
    );

    event FundsReleased(
        bytes32 indexed milestoneId,
        uint256 totalAmount,
        uint256 participantCount
    );

    event ParticipantPaid(
        bytes32 indexed milestoneId,
        address indexed participant,
        uint256 amount
    );

    event OperatorUpdated(address indexed operator, bool authorized);

    // ============ Modifiers ============
    modifier onlyPoolOwner(bytes32 _poolId) {
        require(pools[_poolId].owner == msg.sender, "Not pool owner");
        _;
    }

    modifier onlyPoolApprover(bytes32 _poolId) {
        require(
            pools[_poolId].owner == msg.sender ||
            poolApprovers[_poolId][msg.sender] ||
            msg.sender == owner(),
            "Not authorized approver"
        );
        _;
    }

    modifier onlyOperator() {
        require(operators[msg.sender] || msg.sender == owner(), "Not operator");
        _;
    }

    // ============ Constructor ============
    constructor(
        address _settlementToken,
        address _platformTreasury,
        uint16 _platformFeeBps
    ) {
        require(_settlementToken != address(0), "Invalid token");
        require(_platformTreasury != address(0), "Invalid treasury");
        require(_platformFeeBps <= 500, "Fee too high"); // Max 5%

        settlementToken = IERC20(_settlementToken);
        platformTreasury = _platformTreasury;
        platformFeeBps = _platformFeeBps;
    }

    // ============ Admin Functions ============

    function setPlatformFee(uint16 _feeBps) external onlyOwner {
        require(_feeBps <= 500, "Fee too high");
        platformFeeBps = _feeBps;
    }

    function setPlatformTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        platformTreasury = _treasury;
    }

    function setOperator(address _operator, bool _authorized) external onlyOwner {
        operators[_operator] = _authorized;
        emit OperatorUpdated(_operator, _authorized);
    }

    // ============ Pool Management ============

    /**
     * @dev 创建预算池
     */
    function createPool(
        string calldata _name,
        string calldata _description,
        uint256 _totalBudget,
        uint256 _deadline,
        QualityGate calldata _qualityGate
    ) external returns (bytes32 poolId) {
        require(_totalBudget >= MIN_POOL_AMOUNT, "Budget too low");
        require(_deadline > block.timestamp, "Invalid deadline");

        poolId = keccak256(abi.encodePacked(
            msg.sender,
            _name,
            block.timestamp,
            allPoolIds.length
        ));

        Pool storage pool = pools[poolId];
        pool.poolId = poolId;
        pool.owner = msg.sender;
        pool.name = _name;
        pool.description = _description;
        pool.totalBudget = _totalBudget;
        pool.token = address(settlementToken);
        pool.status = PoolStatus.DRAFT;
        pool.createdAt = block.timestamp;
        pool.deadline = _deadline;

        poolQualityGates[poolId] = _qualityGate;
        ownerPools[msg.sender].push(poolId);
        allPoolIds.push(poolId);

        emit PoolCreated(poolId, msg.sender, _name, _totalBudget, address(settlementToken));
    }

    /**
     * @dev 充值预算池
     */
    function fundPool(bytes32 _poolId, uint256 _amount) external nonReentrant {
        Pool storage pool = pools[_poolId];
        require(pool.poolId != bytes32(0), "Pool not found");
        require(pool.status == PoolStatus.DRAFT || pool.status == PoolStatus.FUNDED, "Cannot fund");
        require(_amount > 0, "Invalid amount");

        uint256 remaining = pool.totalBudget - pool.fundedAmount;
        uint256 fundAmount = _amount > remaining ? remaining : _amount;

        settlementToken.safeTransferFrom(msg.sender, address(this), fundAmount);
        pool.fundedAmount += fundAmount;

        if (pool.fundedAmount >= pool.totalBudget) {
            _changePoolStatus(_poolId, PoolStatus.FUNDED);
        }

        emit PoolFunded(_poolId, msg.sender, fundAmount);
    }

    /**
     * @dev 激活预算池
     */
    function activatePool(bytes32 _poolId) external onlyPoolOwner(_poolId) {
        Pool storage pool = pools[_poolId];
        require(pool.status == PoolStatus.FUNDED, "Not funded");
        require(poolMilestones[_poolId].length > 0, "No milestones");

        _changePoolStatus(_poolId, PoolStatus.ACTIVE);
    }

    /**
     * @dev 添加审批人
     */
    function addApprover(bytes32 _poolId, address _approver) external onlyPoolOwner(_poolId) {
        poolApprovers[_poolId][_approver] = true;
    }

    /**
     * @dev 移除审批人
     */
    function removeApprover(bytes32 _poolId, address _approver) external onlyPoolOwner(_poolId) {
        poolApprovers[_poolId][_approver] = false;
    }

    // ============ Milestone Management ============

    /**
     * @dev 创建里程碑
     */
    function createMilestone(
        bytes32 _poolId,
        string calldata _title,
        string calldata _description,
        uint16 _percentOfPool,
        address[] calldata _participants,
        uint16[] calldata _shares
    ) external onlyPoolOwner(_poolId) returns (bytes32 milestoneId) {
        Pool storage pool = pools[_poolId];
        require(pool.status == PoolStatus.DRAFT || pool.status == PoolStatus.FUNDED, "Pool not configurable");
        require(poolMilestones[_poolId].length < MAX_MILESTONES, "Too many milestones");
        require(_participants.length == _shares.length, "Length mismatch");
        require(_percentOfPool <= BASIS_POINTS, "Invalid percent");

        // 验证参与者分成总和 = 100%
        uint16 totalShares;
        for (uint i = 0; i < _shares.length; i++) {
            totalShares += _shares[i];
        }
        require(totalShares == BASIS_POINTS, "Shares must equal 100%");

        milestoneId = keccak256(abi.encodePacked(
            _poolId,
            _title,
            block.timestamp,
            poolMilestones[_poolId].length
        ));

        uint256 budgetAmount = (pool.totalBudget * _percentOfPool) / BASIS_POINTS;

        Milestone storage milestone = milestones[milestoneId];
        milestone.milestoneId = milestoneId;
        milestone.poolId = _poolId;
        milestone.title = _title;
        milestone.description = _description;
        milestone.budgetAmount = budgetAmount;
        milestone.percentOfPool = _percentOfPool;
        milestone.status = MilestoneStatus.PENDING;
        milestone.participants = _participants;
        milestone.participantShares = _shares;

        poolMilestones[_poolId].push(milestoneId);
        pool.reservedAmount += budgetAmount;

        emit MilestoneCreated(milestoneId, _poolId, _title, budgetAmount);
    }

    /**
     * @dev 开始里程碑
     */
    function startMilestone(bytes32 _milestoneId) external {
        Milestone storage milestone = milestones[_milestoneId];
        Pool storage pool = pools[milestone.poolId];
        
        require(milestone.milestoneId != bytes32(0), "Milestone not found");
        require(pool.status == PoolStatus.ACTIVE, "Pool not active");
        require(milestone.status == MilestoneStatus.PENDING, "Invalid status");
        require(_isParticipant(milestone, msg.sender) || pool.owner == msg.sender, "Not authorized");

        _changeMilestoneStatus(_milestoneId, MilestoneStatus.IN_PROGRESS);
    }

    /**
     * @dev 提交里程碑交付物
     */
    function submitMilestone(bytes32 _milestoneId, bytes32 _deliverableHash) external {
        Milestone storage milestone = milestones[_milestoneId];
        
        require(milestone.status == MilestoneStatus.IN_PROGRESS, "Not in progress");
        require(_isParticipant(milestone, msg.sender), "Not participant");

        milestone.deliverableHash = _deliverableHash;
        milestone.submittedAt = block.timestamp;
        _changeMilestoneStatus(_milestoneId, MilestoneStatus.SUBMITTED);

        emit MilestoneSubmitted(_milestoneId, _deliverableHash, msg.sender);
    }

    /**
     * @dev 批准里程碑
     */
    function approveMilestone(
        bytes32 _milestoneId,
        uint8 _qualityScore
    ) external onlyPoolApprover(milestones[_milestoneId].poolId) {
        Milestone storage milestone = milestones[_milestoneId];
        QualityGate storage gate = poolQualityGates[milestone.poolId];

        require(milestone.status == MilestoneStatus.SUBMITTED, "Not submitted");
        require(_qualityScore >= gate.minQualityScore, "Quality too low");

        milestone.qualityScore = _qualityScore;
        milestone.approver = msg.sender;
        milestone.approvedAt = block.timestamp;
        _changeMilestoneStatus(_milestoneId, MilestoneStatus.APPROVED);

        emit MilestoneApproved(_milestoneId, msg.sender, _qualityScore);
    }

    /**
     * @dev 拒绝里程碑
     */
    function rejectMilestone(
        bytes32 _milestoneId,
        string calldata _reason
    ) external onlyPoolApprover(milestones[_milestoneId].poolId) {
        Milestone storage milestone = milestones[_milestoneId];
        require(milestone.status == MilestoneStatus.SUBMITTED, "Not submitted");

        milestone.approver = msg.sender;
        _changeMilestoneStatus(_milestoneId, MilestoneStatus.REJECTED);

        emit MilestoneRejected(_milestoneId, msg.sender, _reason);
    }

    /**
     * @dev 释放里程碑资金
     */
    function releaseMilestoneFunds(bytes32 _milestoneId) external nonReentrant {
        Milestone storage milestone = milestones[_milestoneId];
        Pool storage pool = pools[milestone.poolId];
        QualityGate storage gate = poolQualityGates[milestone.poolId];

        require(milestone.status == MilestoneStatus.APPROVED, "Not approved");
        
        // 检查自动释放延迟
        if (gate.autoReleaseDelay > 0) {
            require(
                block.timestamp >= milestone.approvedAt + gate.autoReleaseDelay,
                "Release delay not met"
            );
        }

        uint256 totalAmount = milestone.budgetAmount;
        
        // 扣除平台费用
        uint256 platformFee = (totalAmount * platformFeeBps) / BASIS_POINTS;
        uint256 distributableAmount = totalAmount - platformFee;

        // 向平台转账
        if (platformFee > 0) {
            settlementToken.safeTransfer(platformTreasury, platformFee);
        }

        // 分配给参与者
        for (uint i = 0; i < milestone.participants.length; i++) {
            address participant = milestone.participants[i];
            uint256 share = (distributableAmount * milestone.participantShares[i]) / BASIS_POINTS;
            
            pendingBalances[participant] += share;
            poolParticipants[milestone.poolId][participant].pendingAmount += share;
            poolParticipants[milestone.poolId][participant].totalEarned += share;

            emit ParticipantPaid(_milestoneId, participant, share);
        }

        pool.releasedAmount += totalAmount;
        pool.reservedAmount -= totalAmount;
        _changeMilestoneStatus(_milestoneId, MilestoneStatus.RELEASED);

        // 检查是否所有里程碑都完成
        _checkPoolCompletion(milestone.poolId);

        emit FundsReleased(_milestoneId, totalAmount, milestone.participants.length);
    }

    // ============ Claim Functions ============

    /**
     * @dev 领取待领取余额
     */
    function claim() external nonReentrant {
        uint256 amount = pendingBalances[msg.sender];
        require(amount > 0, "Nothing to claim");

        pendingBalances[msg.sender] = 0;
        settlementToken.safeTransfer(msg.sender, amount);
    }

    // ============ View Functions ============

    function getPool(bytes32 _poolId) external view returns (Pool memory) {
        return pools[_poolId];
    }

    function getMilestone(bytes32 _milestoneId) external view returns (Milestone memory) {
        return milestones[_milestoneId];
    }

    function getPoolMilestones(bytes32 _poolId) external view returns (bytes32[] memory) {
        return poolMilestones[_poolId];
    }

    function getOwnerPools(address _owner) external view returns (bytes32[] memory) {
        return ownerPools[_owner];
    }

    function getQualityGate(bytes32 _poolId) external view returns (QualityGate memory) {
        return poolQualityGates[_poolId];
    }

    function getPendingBalance(address _account) external view returns (uint256) {
        return pendingBalances[_account];
    }

    function getParticipant(bytes32 _poolId, address _participant) external view returns (Participant memory) {
        return poolParticipants[_poolId][_participant];
    }

    // ============ Internal Functions ============

    function _changePoolStatus(bytes32 _poolId, PoolStatus _newStatus) internal {
        Pool storage pool = pools[_poolId];
        PoolStatus oldStatus = pool.status;
        pool.status = _newStatus;
        emit PoolStatusChanged(_poolId, oldStatus, _newStatus);
    }

    function _changeMilestoneStatus(bytes32 _milestoneId, MilestoneStatus _newStatus) internal {
        Milestone storage milestone = milestones[_milestoneId];
        MilestoneStatus oldStatus = milestone.status;
        milestone.status = _newStatus;
        emit MilestoneStatusChanged(_milestoneId, oldStatus, _newStatus);
    }

    function _isParticipant(Milestone storage _milestone, address _addr) internal view returns (bool) {
        for (uint i = 0; i < _milestone.participants.length; i++) {
            if (_milestone.participants[i] == _addr) {
                return true;
            }
        }
        return false;
    }

    function _checkPoolCompletion(bytes32 _poolId) internal {
        bytes32[] storage msIds = poolMilestones[_poolId];
        bool allReleased = true;
        
        for (uint i = 0; i < msIds.length; i++) {
            if (milestones[msIds[i]].status != MilestoneStatus.RELEASED) {
                allReleased = false;
                break;
            }
        }

        if (allReleased) {
            _changePoolStatus(_poolId, PoolStatus.COMPLETED);
        }
    }

    // ============ Pausable ============

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
