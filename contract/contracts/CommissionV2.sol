// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title CommissionV2
 * @dev Commerce Skill 统一分润结算合约
 * @notice 整合 Payment + Commission，支持统一费率体系
 * 
 * 费率结构 (basis points, 10000 = 100%):
 * - 纯链上 Crypto 支付: 0% (免费)
 * - On-ramp (Transak 买币): +0.1% (10 bps)
 * - Off-ramp (Transak 提现): +0.1% (10 bps)
 * - Split 分润: 0.3% (30 bps), 最低 0.1 USDC (100000 micro)
 */
contract CommissionV2 is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    uint16 public constant BASIS_POINTS = 10000; // 100% = 10000
    uint256 public constant MICRO_UNIT = 1e6; // 1 USDC = 1000000

    // ============ Fee Configuration ============
    struct FeeConfig {
        uint16 onrampFeeBps;   // On-ramp 额外费率 (默认 10 = 0.1%)
        uint16 offrampFeeBps;  // Off-ramp 额外费率 (默认 10 = 0.1%)
        uint16 splitFeeBps;    // Split 费率 (默认 30 = 0.3%)
        uint256 minSplitFee;   // 最低 Split 费用 (默认 100000 = 0.1 USDC)
    }

    // ============ Split Plan ============
    struct SplitPlan {
        bytes32 planId;
        address owner;
        string name;
        SplitRule[] rules;
        FeeConfig feeConfig;
        bool active;
        uint256 createdAt;
        uint256 updatedAt;
    }

    struct SplitRule {
        address recipient;
        uint16 shareBps; // 分成比例 (basis points)
        string role;     // 角色标识: "platform", "merchant", "agent", "referrer"
    }

    // ============ Split Execution ============
    struct SplitExecution {
        bytes32 executionId;
        bytes32 planId;
        bytes32 sessionId;
        uint256 totalAmount;
        uint256 platformFee;
        address token;
        uint256 executedAt;
        bool completed;
    }

    struct Allocation {
        address recipient;
        uint256 amount;
        uint256 fee;
        bool claimed;
    }

    // ============ Payment Types ============
    enum PaymentType {
        CRYPTO_DIRECT, // 纯链上支付 (0%)
        ONRAMP,        // Transak 买币 (+0.1%)
        OFFRAMP,       // Transak 提现 (+0.1%)
        MIXED          // 混合场景
    }

    // ============ State Variables ============
    IERC20 public settlementToken;
    address public platformTreasury;
    FeeConfig public defaultFeeConfig;

    // Split Plans
    mapping(bytes32 => SplitPlan) public splitPlans;
    mapping(address => bytes32[]) public ownerPlans;
    bytes32[] public allPlanIds;

    // Split Executions
    mapping(bytes32 => SplitExecution) public executions;
    mapping(bytes32 => Allocation[]) public executionAllocations;
    mapping(address => uint256) public pendingBalances;

    // Access Control
    mapping(address => bool) public operators;
    mapping(address => bool) public relayers;

    // ============ Events ============
    event FeeConfigUpdated(
        uint16 onrampFeeBps,
        uint16 offrampFeeBps,
        uint16 splitFeeBps,
        uint256 minSplitFee
    );

    event SplitPlanCreated(
        bytes32 indexed planId,
        address indexed owner,
        string name,
        uint256 rulesCount
    );

    event SplitPlanUpdated(
        bytes32 indexed planId,
        address indexed owner,
        bool active
    );

    event SplitExecuted(
        bytes32 indexed executionId,
        bytes32 indexed planId,
        bytes32 indexed sessionId,
        uint256 totalAmount,
        uint256 platformFee,
        PaymentType paymentType
    );

    event AllocationClaimed(
        bytes32 indexed executionId,
        address indexed recipient,
        uint256 amount
    );

    event OperatorUpdated(address indexed operator, bool authorized);
    event RelayerUpdated(address indexed relayer, bool authorized);

    // ============ Modifiers ============
    modifier onlyOperator() {
        require(operators[msg.sender] || msg.sender == owner(), "Not operator");
        _;
    }

    modifier onlyRelayer() {
        require(relayers[msg.sender] || msg.sender == owner(), "Not relayer");
        _;
    }

    // ============ Constructor ============
    constructor(
        address _settlementToken,
        address _platformTreasury
    ) {
        require(_settlementToken != address(0), "Invalid token");
        require(_platformTreasury != address(0), "Invalid treasury");
        
        settlementToken = IERC20(_settlementToken);
        platformTreasury = _platformTreasury;
        
        // 设置默认费率
        defaultFeeConfig = FeeConfig({
            onrampFeeBps: 10,   // 0.1%
            offrampFeeBps: 10,  // 0.1%
            splitFeeBps: 30,    // 0.3%
            minSplitFee: 100000 // 0.1 USDC
        });
    }

    // ============ Admin Functions ============

    /**
     * @dev 更新默认费率配置
     */
    function updateDefaultFeeConfig(
        uint16 _onrampFeeBps,
        uint16 _offrampFeeBps,
        uint16 _splitFeeBps,
        uint256 _minSplitFee
    ) external onlyOwner {
        require(_onrampFeeBps <= 100, "Onramp fee too high"); // Max 1%
        require(_offrampFeeBps <= 100, "Offramp fee too high");
        require(_splitFeeBps <= 100, "Split fee too high");
        
        defaultFeeConfig = FeeConfig({
            onrampFeeBps: _onrampFeeBps,
            offrampFeeBps: _offrampFeeBps,
            splitFeeBps: _splitFeeBps,
            minSplitFee: _minSplitFee
        });
        
        emit FeeConfigUpdated(_onrampFeeBps, _offrampFeeBps, _splitFeeBps, _minSplitFee);
    }

    function setOperator(address _operator, bool _authorized) external onlyOwner {
        operators[_operator] = _authorized;
        emit OperatorUpdated(_operator, _authorized);
    }

    function setRelayer(address _relayer, bool _authorized) external onlyOwner {
        relayers[_relayer] = _authorized;
        emit RelayerUpdated(_relayer, _authorized);
    }

    function setPlatformTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        platformTreasury = _treasury;
    }

    // ============ Split Plan Management ============

    /**
     * @dev 创建分润方案
     */
    function createSplitPlan(
        string calldata _name,
        address[] calldata _recipients,
        uint16[] calldata _shares,
        string[] calldata _roles,
        FeeConfig calldata _feeConfig
    ) external returns (bytes32 planId) {
        require(_recipients.length == _shares.length, "Length mismatch");
        require(_recipients.length == _roles.length, "Length mismatch");
        require(_recipients.length > 0, "No recipients");
        
        // 验证分成比例总和 = 100%
        uint16 totalShares;
        for (uint i = 0; i < _shares.length; i++) {
            totalShares += _shares[i];
        }
        require(totalShares == BASIS_POINTS, "Shares must equal 100%");
        
        planId = keccak256(abi.encodePacked(msg.sender, _name, block.timestamp, allPlanIds.length));
        
        SplitPlan storage plan = splitPlans[planId];
        plan.planId = planId;
        plan.owner = msg.sender;
        plan.name = _name;
        plan.feeConfig = _feeConfig;
        plan.active = true;
        plan.createdAt = block.timestamp;
        plan.updatedAt = block.timestamp;
        
        for (uint i = 0; i < _recipients.length; i++) {
            require(_recipients[i] != address(0), "Invalid recipient");
            plan.rules.push(SplitRule({
                recipient: _recipients[i],
                shareBps: _shares[i],
                role: _roles[i]
            }));
        }
        
        ownerPlans[msg.sender].push(planId);
        allPlanIds.push(planId);
        
        emit SplitPlanCreated(planId, msg.sender, _name, _recipients.length);
    }

    /**
     * @dev 激活/停用分润方案
     */
    function setSplitPlanActive(bytes32 _planId, bool _active) external {
        SplitPlan storage plan = splitPlans[_planId];
        require(plan.owner == msg.sender || msg.sender == owner(), "Not authorized");
        require(plan.planId != bytes32(0), "Plan not found");
        
        plan.active = _active;
        plan.updatedAt = block.timestamp;
        
        emit SplitPlanUpdated(_planId, msg.sender, _active);
    }

    // ============ Split Execution ============

    /**
     * @dev 计算平台费用
     */
    function calculatePlatformFee(
        uint256 _amount,
        PaymentType _paymentType,
        FeeConfig memory _config
    ) public pure returns (uint256 fee) {
        // 纯链上支付免费
        if (_paymentType == PaymentType.CRYPTO_DIRECT) {
            return 0;
        }
        
        // 基础 Split 费用
        fee = (_amount * _config.splitFeeBps) / BASIS_POINTS;
        
        // 确保最低费用
        if (fee < _config.minSplitFee) {
            fee = _config.minSplitFee;
        }
        
        // On-ramp 额外费用
        if (_paymentType == PaymentType.ONRAMP || _paymentType == PaymentType.MIXED) {
            fee += (_amount * _config.onrampFeeBps) / BASIS_POINTS;
        }
        
        // Off-ramp 额外费用
        if (_paymentType == PaymentType.OFFRAMP || _paymentType == PaymentType.MIXED) {
            fee += (_amount * _config.offrampFeeBps) / BASIS_POINTS;
        }
    }

    /**
     * @dev 执行分润
     * @param _planId 分润方案ID
     * @param _sessionId 会话ID
     * @param _amount 总金额
     * @param _paymentType 支付类型
     */
    function executeSplit(
        bytes32 _planId,
        bytes32 _sessionId,
        uint256 _amount,
        PaymentType _paymentType
    ) external nonReentrant whenNotPaused onlyRelayer returns (bytes32 executionId) {
        SplitPlan storage plan = splitPlans[_planId];
        require(plan.active, "Plan not active");
        require(_amount > 0, "Invalid amount");
        
        // 计算平台费用
        uint256 platformFee = calculatePlatformFee(_amount, _paymentType, plan.feeConfig);
        uint256 distributableAmount = _amount - platformFee;
        
        // 生成执行ID
        executionId = keccak256(abi.encodePacked(_planId, _sessionId, block.timestamp));
        
        // 创建执行记录
        SplitExecution storage execution = executions[executionId];
        execution.executionId = executionId;
        execution.planId = _planId;
        execution.sessionId = _sessionId;
        execution.totalAmount = _amount;
        execution.platformFee = platformFee;
        execution.token = address(settlementToken);
        execution.executedAt = block.timestamp;
        execution.completed = false;
        
        // 计算每个参与者的分配（处理精度损失）
        uint256 totalAllocated = 0;
        for (uint i = 0; i < plan.rules.length; i++) {
            SplitRule memory rule = plan.rules[i];
            uint256 allocation = (distributableAmount * rule.shareBps) / BASIS_POINTS;
            totalAllocated += allocation;
            
            executionAllocations[executionId].push(Allocation({
                recipient: rule.recipient,
                amount: allocation,
                fee: 0,
                claimed: false
            }));
            
            // 累加待领取余额
            pendingBalances[rule.recipient] += allocation;
        }
        
        // 处理精度损失：将剩余 dust 分配给第一个参与者
        if (distributableAmount > totalAllocated && plan.rules.length > 0) {
            uint256 dust = distributableAmount - totalAllocated;
            executionAllocations[executionId][0].amount += dust;
            pendingBalances[plan.rules[0].recipient] += dust;
        }
        
        // 平台费用直接转入 Treasury
        if (platformFee > 0) {
            settlementToken.safeTransferFrom(msg.sender, platformTreasury, platformFee);
        }
        
        // 标记完成
        execution.completed = true;
        
        emit SplitExecuted(
            executionId,
            _planId,
            _sessionId,
            _amount,
            platformFee,
            _paymentType
        );
    }

    /**
     * @dev 领取分润
     */
    function claimAllocation(bytes32 _executionId, uint256 _index) external nonReentrant {
        Allocation storage allocation = executionAllocations[_executionId][_index];
        require(allocation.recipient == msg.sender, "Not recipient");
        require(!allocation.claimed, "Already claimed");
        require(allocation.amount > 0, "Nothing to claim");
        
        allocation.claimed = true;
        pendingBalances[msg.sender] -= allocation.amount;
        
        settlementToken.safeTransfer(msg.sender, allocation.amount);
        
        emit AllocationClaimed(_executionId, msg.sender, allocation.amount);
    }

    /**
     * @dev 批量领取所有待领取余额
     */
    function claimAll() external nonReentrant {
        uint256 balance = pendingBalances[msg.sender];
        require(balance > 0, "Nothing to claim");
        
        pendingBalances[msg.sender] = 0;
        settlementToken.safeTransfer(msg.sender, balance);
        
        emit AllocationClaimed(bytes32(0), msg.sender, balance);
    }

    // ============ View Functions ============

    function getSplitPlan(bytes32 _planId) external view returns (
        bytes32 planId,
        address owner_,
        string memory name,
        bool active,
        uint256 rulesCount,
        FeeConfig memory feeConfig,
        uint256 createdAt
    ) {
        SplitPlan storage plan = splitPlans[_planId];
        return (
            plan.planId,
            plan.owner,
            plan.name,
            plan.active,
            plan.rules.length,
            plan.feeConfig,
            plan.createdAt
        );
    }

    function getSplitRules(bytes32 _planId) external view returns (SplitRule[] memory) {
        return splitPlans[_planId].rules;
    }

    function getExecution(bytes32 _executionId) external view returns (SplitExecution memory) {
        return executions[_executionId];
    }

    function getExecutionAllocations(bytes32 _executionId) external view returns (Allocation[] memory) {
        return executionAllocations[_executionId];
    }

    function getOwnerPlans(address _owner) external view returns (bytes32[] memory) {
        return ownerPlans[_owner];
    }

    function getAllPlanIds() external view returns (bytes32[] memory) {
        return allPlanIds;
    }

    function getPendingBalance(address _account) external view returns (uint256) {
        return pendingBalances[_account];
    }

    // ============ Pausable ============

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
