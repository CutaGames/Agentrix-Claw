// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IWithdrawRouter {
    function withdraw(uint256 amount) external;
}

/**
 * @title ReentrantWithdrawer
 * @dev 收到 ETH 时再次调用 router.withdraw 的恶意收款合约（审计 H-01 重入）。
 * 仅供测试。`reentered` 记录重入那一笔有没有成功，`reentryRevertedWith` 记录它是怎么失败的。
 */
contract ReentrantWithdrawer {
    IWithdrawRouter public immutable router;
    uint256 public attackAmount;
    bool public attacking;
    bool public reentered;
    bytes public reentryError;

    constructor(address router_) {
        router = IWithdrawRouter(router_);
    }

    function attack(uint256 amount) external {
        attackAmount = amount;
        attacking = true;
        router.withdraw(amount);
        attacking = false;
    }

    receive() external payable {
        if (attacking) {
            attacking = false;
            try router.withdraw(attackAmount) {
                reentered = true;
            } catch (bytes memory reason) {
                reentryError = reason;
            }
        }
    }
}
