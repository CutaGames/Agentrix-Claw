// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockFalseReturnERC20
 * @dev 转账失败时 **返回 false 而不是 revert** 的 ERC20（审计 C-03 说的「失败但不 revert」）。
 * 合约如果直接 `token.transferFrom(...)` 而不检查返回值，这种代币的失败会被悄悄吞掉。
 * 用 SafeERC20 调用时，false 会变成 revert。仅供测试。
 */
contract MockFalseReturnERC20 {
    string public name = "False Return";
    string public symbol = "FRT";
    uint8 public decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(uint256 supply) {
        totalSupply = supply;
        balanceOf[msg.sender] = supply;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (balanceOf[msg.sender] < amount) return false;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (allowance[from][msg.sender] < amount || balanceOf[from] < amount) return false;
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
