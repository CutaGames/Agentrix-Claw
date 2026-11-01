// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * L8-6 pre-flight simulator (design 7.3 "预演", decision A40).
 *
 * Only ever used as `eth_call` state-override code placed at the EntryPoint v0.7 address. It is never deployed to any
 * chain and never holds funds (M22). No third-party source is imported; the two interfaces below are all it needs.
 *
 * It skips signature validation, so it can run before the owner signs:
 * 1. if the sender has no code, it calls the UserOp's factory with the UserOp's factoryData, limited to
 *    verificationGasLimit (KernelFactory.createAccount on 97, FactoryStaker.deployWithFactory on 84532);
 * 2. it calls the sender with the UserOp's callData from the EntryPoint address (Kernel's onlyEntryPointOrSelfOrRoot
 *    lets it through), limited to callGasLimit;
 * 3. it reads back whether SocialRecovery is installed and how many ERC-8004 NFTs the sender holds.
 */
interface IOwnWalletSimKernel {
    function isModuleInstalled(uint256 moduleType, address module, bytes calldata additionalContext) external view returns (bool);
}

interface IOwnWalletSimRegistry {
    function balanceOf(address owner) external view returns (uint256);
}

contract OwnWalletExecSimulator {
    uint8 public constant OUTCOME_OK = 0;
    uint8 public constant OUTCOME_DEPLOY_FAILED = 1;
    uint8 public constant OUTCOME_DEPLOY_OUT_OF_GAS = 2;
    uint8 public constant OUTCOME_SENDER_NOT_DEPLOYED = 3;
    uint8 public constant OUTCOME_EXECUTION_FAILED = 4;
    uint8 public constant OUTCOME_EXECUTION_OUT_OF_GAS = 5;

    struct Result {
        uint8 outcome;
        bool deployedBefore;
        bool deployed;
        bytes revertData;
        bool recoveryInstalled;
        uint256 registryBalance;
    }

    function simulate(
        address factory,
        bytes calldata factoryData,
        address sender,
        bytes calldata callData,
        address socialRecovery,
        address registry,
        uint256 verificationGasLimit,
        uint256 callGasLimit
    ) external returns (Result memory r) {
        r.deployedBefore = sender.code.length > 0;
        if (!r.deployedBefore) {
            (bool deployOk, bool deployOutOfGas, bytes memory deployRet) = _limitedCall(factory, factoryData, verificationGasLimit);
            if (!deployOk) {
                r.outcome = deployOutOfGas ? OUTCOME_DEPLOY_OUT_OF_GAS : OUTCOME_DEPLOY_FAILED;
                r.revertData = deployRet;
                return r;
            }
            if (sender.code.length == 0) {
                r.outcome = OUTCOME_SENDER_NOT_DEPLOYED;
                return r;
            }
        }
        r.deployed = true;
        (bool ok, bool outOfGas, bytes memory ret) = _limitedCall(sender, callData, callGasLimit);
        if (!ok) {
            r.outcome = outOfGas ? OUTCOME_EXECUTION_OUT_OF_GAS : OUTCOME_EXECUTION_FAILED;
            r.revertData = ret;
        }
        if (socialRecovery != address(0)) {
            try IOwnWalletSimKernel(sender).isModuleInstalled(1, socialRecovery, "") returns (bool installed) {
                r.recoveryInstalled = installed;
            } catch {}
        }
        if (registry != address(0)) {
            try IOwnWalletSimRegistry(registry).balanceOf(sender) returns (uint256 balance) {
                r.registryBalance = balance;
            } catch {}
        }
    }

    /// A call that gets exactly `gasLimit` gas (or the call refuses to start). A failed call with empty revert data that
    /// used at least 7/8 of the limit ran out of gas: every call level on the way (proxy, delegatecall, self-call,
    /// module call) keeps 1/64 of its gas to revert with (EIP-150), so the caller gets a few levels' worth back.
    function _limitedCall(address target, bytes calldata data, uint256 gasLimit) private returns (bool ok, bool outOfGas, bytes memory ret) {
        require(gasleft() > gasLimit + gasLimit / 63 + 50_000, "simulator: not enough gas for the limit");
        uint256 before = gasleft();
        (ok, ret) = target.call{gas: gasLimit}(data);
        outOfGas = !ok && ret.length == 0 && before - gasleft() >= gasLimit - gasLimit / 8;
    }
}
