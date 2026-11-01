// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AgentrixRoles
 * @dev 统一的权限基类（审计 H-04 / H-05）。
 *
 * 目标：Commission、X402Adapter、ERC8004SessionManager 共用同一套角色，不再各写各的白名单。
 *  - 保留 Ownable，已有脚本和后端对 `owner()` / `onlyOwner` 的依赖不变。
 *  - 在 Ownable 之上加 OpenZeppelin AccessControl：`RELAYER_ROLE`、`PROVIDER_ROLE`。
 *  - owner 永远等于 `DEFAULT_ADMIN_ROLE`：转移 owner 时，管理员角色一起转走，
 *    不会出现旧 owner 还握着授权权限的情况。生产环境把 owner 迁到多签，角色管理自然跟过去。
 *  - 所有授权变更都会发出事件（OpenZeppelin 的 RoleGranted / RoleRevoked）。
 */
abstract contract AgentrixRoles is Ownable, AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("AGENTRIX_RELAYER_ROLE");
    bytes32 public constant PROVIDER_ROLE = keccak256("AGENTRIX_PROVIDER_ROLE");

    /**
     * @dev Ownable 构造函数也会走到这里（此时 owner() 还是 0），所以部署者自动成为管理员。
     */
    function _transferOwnership(address newOwner) internal virtual override {
        address previousOwner = owner();
        super._transferOwnership(newOwner);
        if (previousOwner != address(0) && previousOwner != newOwner) {
            _revokeRole(DEFAULT_ADMIN_ROLE, previousOwner);
        }
        if (newOwner != address(0)) {
            _grantRole(DEFAULT_ADMIN_ROLE, newOwner);
        }
    }

    /**
     * @dev 有单一 `relayer` 变量的合约（X402Adapter、ERC8004SessionManager）重写成 true：
     *      这时 RELAYER_ROLE 只能经 `setRelayer` 变更，owner 直接 grantRole / revokeRole、账户自己 renounceRole 都被拒绝，
     *      免得出现持有角色却不是 `relayer` 的账户（或者 `relayer` 变量指着已经没有角色的账户）。
     */
    function _relayerRoleOnlyViaSetter() internal pure virtual returns (bool) {
        return false;
    }

    function grantRole(bytes32 role, address account) public virtual override {
        require(!(role == RELAYER_ROLE && _relayerRoleOnlyViaSetter()), "Use setRelayer");
        super.grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) public virtual override {
        require(!(role == RELAYER_ROLE && _relayerRoleOnlyViaSetter()), "Use setRelayer");
        super.revokeRole(role, account);
    }

    function renounceRole(bytes32 role, address account) public virtual override {
        require(!(role == RELAYER_ROLE && _relayerRoleOnlyViaSetter()), "Use setRelayer");
        super.renounceRole(role, account);
    }

    function _setRole(bytes32 role, address account, bool active) internal {
        if (active) {
            _grantRole(role, account);
        } else {
            _revokeRole(role, account);
        }
    }
}
