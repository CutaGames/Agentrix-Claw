// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * L8-6 test-only paymaster for the hardhat session tests (design R2-M10: a session with permitERC4337Paymaster = false
 * must refuse a UserOp that names a paymaster). It approves every UserOp the EntryPoint asks about.
 * Never deployed to any chain (plan P2); simulator-not-deployed.test.ts pins that no script or deployment file names it.
 */
struct OwnWalletTestPackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    bytes32 accountGasLimits;
    uint256 preVerificationGas;
    bytes32 gasFees;
    bytes paymasterAndData;
    bytes signature;
}

interface IOwnWalletTestEntryPoint {
    function depositTo(address account) external payable;
}

contract OwnWalletTestPaymaster {
    address public immutable entryPoint;

    constructor(address entryPoint_) {
        entryPoint = entryPoint_;
    }

    function validatePaymasterUserOp(OwnWalletTestPackedUserOperation calldata, bytes32, uint256)
        external
        view
        returns (bytes memory context, uint256 validationData)
    {
        require(msg.sender == entryPoint, "only entry point");
        return ("", 0);
    }

    /// PostOpMode is an enum, encoded as uint8 in the ABI and the selector.
    function postOp(uint8, bytes calldata, uint256, uint256) external view {
        require(msg.sender == entryPoint, "only entry point");
    }

    function deposit() external payable {
        IOwnWalletTestEntryPoint(entryPoint).depositTo{value: msg.value}(address(this));
    }
}
