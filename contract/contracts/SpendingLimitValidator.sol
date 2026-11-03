// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SpendingLimitValidator
 * @dev 元神 Soul Core · 支出限额校验模块(单笔/日/月 + 目标白名单)
 *      (soul-core-erc4337-verifiable-reputation · 需求 3.1/3.2 · design 限额 validator 模块)
 *
 * 把现状 `ERC8004SessionManager` 的限额能力标准化为**可插拔校验模块**:每个 account 配置
 * 单笔/日/月上限 + 可选目标白名单;`checkAndRecord` 在支出前校验并累计,超限 revert(失败闭合)。
 *
 * 设计为 ERC-7579 validator 的**校验内核**:Kernel 智能账户在 `validateUserOp`/执行 hook 里
 * 调用本模块即可获得与 L0 一致的限额语义(需求 3.2 零回归)。standalone 亦可单测。
 *
 * 诚实边界:把它作为**真正的** 7579 validator 挂进 Kernel(module install / userOp 校验流)
 * 是集成步骤,需已部署的 Kernel + EntryPoint;本合约提供可复用、可单测的限额内核。
 */
contract SpendingLimitValidator {
    struct Limits {
        uint256 single;      // 单笔上限(0 = 不限)
        uint256 daily;       // 日上限(0 = 不限)
        uint256 monthly;     // 月上限(0 = 不限)
        bool whitelistOnly;  // 是否仅允许白名单目标
        bool configured;     // 是否已配置
    }

    mapping(address => Limits) public limits;                 // account => 限额
    mapping(address => address) public controller;            // account => 配置权持有者(owner)
    mapping(address => mapping(address => bool)) public whitelisted; // account => target => 允许

    mapping(address => uint256) public usedToday;
    mapping(address => uint256) public usedMonth;
    mapping(address => uint256) public dayBucket;   // block.timestamp / 1 days
    mapping(address => uint256) public monthBucket; // block.timestamp / 30 days(近似月)

    event LimitsConfigured(address indexed account, uint256 single, uint256 daily, uint256 monthly, bool whitelistOnly);
    event WhitelistSet(address indexed account, address indexed target, bool allowed);
    event Spent(address indexed account, address indexed target, uint256 amount, uint256 usedToday, uint256 usedMonth);

    modifier onlyController(address account) {
        require(controller[account] == msg.sender, "not controller");
        _;
    }

    /// @dev 首次配置由调用者认领 controller;之后仅 controller 可改。
    function configure(
        address account,
        uint256 single,
        uint256 daily,
        uint256 monthly,
        bool whitelistOnly
    ) external {
        address c = controller[account];
        require(c == address(0) || c == msg.sender, "not controller");
        if (c == address(0)) controller[account] = msg.sender;
        limits[account] = Limits(single, daily, monthly, whitelistOnly, true);
        emit LimitsConfigured(account, single, daily, monthly, whitelistOnly);
    }

    function setWhitelist(address account, address target, bool allowed)
        external
        onlyController(account)
    {
        whitelisted[account][target] = allowed;
        emit WhitelistSet(account, target, allowed);
    }

    function _rollBuckets(address account) internal {
        uint256 d = block.timestamp / 1 days;
        if (d > dayBucket[account]) {
            dayBucket[account] = d;
            usedToday[account] = 0;
        }
        uint256 m = block.timestamp / 30 days;
        if (m > monthBucket[account]) {
            monthBucket[account] = m;
            usedMonth[account] = 0;
        }
    }

    /// @dev 只读预检:能否支出(不改状态)。返回 (ok, reason)。
    function canSpend(address account, address target, uint256 amount)
        external
        view
        returns (bool ok, string memory reason)
    {
        Limits memory l = limits[account];
        if (!l.configured) return (false, "not configured");
        if (l.whitelistOnly && !whitelisted[account][target]) return (false, "target not whitelisted");
        if (l.single > 0 && amount > l.single) return (false, "exceeds single limit");

        uint256 d = block.timestamp / 1 days;
        uint256 usedD = d > dayBucket[account] ? 0 : usedToday[account];
        if (l.daily > 0 && usedD + amount > l.daily) return (false, "exceeds daily limit");

        uint256 m = block.timestamp / 30 days;
        uint256 usedM = m > monthBucket[account] ? 0 : usedMonth[account];
        if (l.monthly > 0 && usedM + amount > l.monthly) return (false, "exceeds monthly limit");

        return (true, "");
    }

    /**
     * @dev 校验并累计(支出前调用)。超限 revert(失败闭合,需求 3.2)。
     *      由 account 自身(或其执行模块)调用以记账。
     */
    function checkAndRecord(address account, address target, uint256 amount) external {
        Limits memory l = limits[account];
        require(l.configured, "not configured");
        require(!l.whitelistOnly || whitelisted[account][target], "target not whitelisted");
        require(l.single == 0 || amount <= l.single, "exceeds single limit");

        _rollBuckets(account);
        require(l.daily == 0 || usedToday[account] + amount <= l.daily, "exceeds daily limit");
        require(l.monthly == 0 || usedMonth[account] + amount <= l.monthly, "exceeds monthly limit");

        usedToday[account] += amount;
        usedMonth[account] += amount;
        emit Spent(account, target, amount, usedToday[account], usedMonth[account]);
    }
}
