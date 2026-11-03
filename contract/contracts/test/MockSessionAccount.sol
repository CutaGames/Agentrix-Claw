// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PackedUserOperation, Execution, IERC7579Validator} from "../interfaces/IERC7579Validator.sol";

/**
 * @dev TEST ONLY. Stands in for a Kernel account and the EntryPoint so the session key validator can be exercised on the
 *      local hardhat network without the real ones: `msg.sender` seen by the validator is this account, `handleOp`
 *      validates with the module, checks the `validUntil` it returns (as the EntryPoint would), then runs the call data
 *      on the account itself, where `execute` runs an ERC-7579 batch. `ownerCall` stands for an operation the owner's
 *      own (root) validator approved. Never deployed to a network.
 */
contract MockSessionAccount {
    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    receive() external payable {}

    function ownerCall(address to, bytes calldata data) external {
        require(msg.sender == owner, "not owner");
        _call(to, 0, data);
    }

    function validateOnly(IERC7579Validator validator, PackedUserOperation calldata op, bytes32 hash) external view returns (uint256) {
        return validator.validateUserOp(op, hash);
    }

    function handleOp(IERC7579Validator validator, PackedUserOperation calldata op, bytes32 hash) external returns (uint256 validationData) {
        validationData = validator.validateUserOp(op, hash);
        require((validationData & type(uint160).max) == 0, "signature failed");
        uint48 validUntil = uint48(validationData >> 160);
        require(validUntil == 0 || block.timestamp <= validUntil, "expired");
        (bool ok, bytes memory ret) = address(this).call(op.callData);
        if (!ok) _bubble(ret);
    }

    /// @dev ERC-7579 `execute(bytes32,bytes)`, batch mode only, callable by the account itself (via handleOp).
    function execute(bytes32 mode, bytes calldata executionCalldata) external {
        require(msg.sender == address(this), "only self");
        require(mode == bytes32(uint256(0x01) << 248), "mode");
        Execution[] memory e = abi.decode(executionCalldata, (Execution[]));
        for (uint256 i = 0; i < e.length; i++) {
            _call(e[i].target, e[i].value, e[i].callData);
        }
    }

    function _call(address to, uint256 value, bytes memory data) internal {
        (bool ok, bytes memory ret) = to.call{value: value}(data);
        if (!ok) _bubble(ret);
    }

    function _bubble(bytes memory ret) internal pure {
        assembly {
            revert(add(ret, 32), mload(ret))
        }
    }
}
