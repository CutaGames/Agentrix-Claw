// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev ERC-4337 v0.7 user operation as the EntryPoint hands it to an account (and the account to a validator module).
struct PackedUserOperation {
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

/// @dev One call of an ERC-7579 batch execution.
struct Execution {
    address target;
    uint256 value;
    bytes callData;
}

/**
 * @dev The part of the ERC-7579 validator module interface (module type 1) that Kernel v3 calls. `validateUserOp`
 *      returns ERC-4337 `validationData` (0 = valid, 1 = signature failed, otherwise a packed time window).
 */
interface IERC7579Validator {
    function onInstall(bytes calldata data) external;

    function onUninstall(bytes calldata data) external;

    function isModuleType(uint256 moduleTypeId) external view returns (bool);

    function isInitialized(address smartAccount) external view returns (bool);

    function validateUserOp(PackedUserOperation calldata userOp, bytes32 userOpHash) external view returns (uint256);

    function isValidSignatureWithSender(address sender, bytes32 hash, bytes calldata data) external view returns (bytes4);
}
