// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockFeeOnTransferERC20
 * @dev 每笔转账扣 10% 的代币：收款方实际收到的比转出的少（审计 H-04：Provider 声称转了多少，合约要按余额差校验）。
 * 仅供测试。
 */
contract MockFeeOnTransferERC20 is ERC20 {
    constructor(uint256 initialSupply) ERC20("Fee Token", "FEE") {
        _mint(msg.sender, initialSupply);
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        uint256 fee = amount / 10;
        super._transfer(from, to, amount - fee);
        if (fee > 0) {
            super._transfer(from, address(0xdead), fee);
        }
    }
}
