// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PackedUserOperation, Execution, IERC7579Validator} from "./interfaces/IERC7579Validator.sol";

/**
 * @title SessionKeyValidator
 * @dev L8 D6 (testnet only). An ERC-7579 validator module (type 1) for a Kernel v3 smart account. It lets an Agent sign
 *      with a session key that the CHAIN keeps inside the limits the account owner wrote for it:
 *        - a single-payment limit, a daily limit and a monthly limit (all above zero; the old SpendingLimitValidator read
 *          0 as "no limit", this one never does),
 *        - a list of payees (a whitelist, at least one),
 *        - an expiry,
 *        - revocation by the owner, effective at once.
 *      The session key can do exactly one thing: pay native coin to a listed payee. It cannot sign for the account
 *      (ERC-1271 is refused), cannot call any other contract, cannot touch the account, the limits or the owner.
 *
 *      Why the batch shape. ERC-4337 bans TIMESTAMP in the validation phase, but daily and monthly buckets need the time.
 *      So validation checks what needs no clock (key, payee, single limit, expiry through `validationData`) and
 *      REQUIRES the user operation to be an ERC-7579 batch of exactly two calls: first `recordSpend(key, payee, amount)`
 *      on this contract (which keeps the buckets, in the execution phase where the clock is allowed), then the payment
 *      itself. The two are atomic: a payment over the daily or monthly limit reverts the whole operation. The call data
 *      must be the canonical ABI encoding, so a decoder in the account cannot read it differently from this one.
 *
 *      Every management function is called by the account itself (`msg.sender` is the account), through an operation the
 *      owner's key (the passkey, in the root validator) signed. Nobody can claim, configure or burn another account's
 *      allowance: all state is keyed by `msg.sender`.
 *
 *      Said plainly: this is the limit core for native-coin payments. ERC-20 payments are not covered (a transfer is a
 *      call with data, which this module refuses). Not audited; testnet only (see contract/scripts/lib/testnet-guard.ts).
 */
contract SessionKeyValidator is IERC7579Validator {
    struct Session {
        uint256 single;
        uint256 daily;
        uint256 monthly;
        uint48 validUntil;
        bool exists;
        bool revoked;
        uint256 usedDay;
        uint256 dayBucket;
        uint256 usedMonth;
        uint256 monthBucket;
    }

    uint256 public constant MAX_TARGETS = 20;
    uint256 internal constant SIG_VALIDATION_FAILED = 1;
    uint256 internal constant SECP256K1_HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;
    bytes4 internal constant EXECUTE_SELECTOR = bytes4(keccak256("execute(bytes32,bytes)"));
    /// @dev ERC-7579 mode: call type batch (0x01), exec type default (revert on failure), nothing else set.
    bytes32 internal constant MODE_BATCH_DEFAULT = bytes32(uint256(0x01) << 248);

    /// @dev account => validator installed
    mapping(address => bool) public installed;
    /// @dev account => session key => session
    mapping(address => mapping(address => Session)) internal _sessions;
    /// @dev account => session key => payee => allowed
    mapping(address => mapping(address => mapping(address => bool))) public allowedTarget;

    event Installed(address indexed account);
    event Uninstalled(address indexed account);
    event SessionGranted(address indexed account, address indexed key, uint256 single, uint256 daily, uint256 monthly, uint48 validUntil);
    event SessionRevoked(address indexed account, address indexed key);
    event Spent(address indexed account, address indexed key, address indexed target, uint256 amount, uint256 usedDay, uint256 usedMonth);

    // ---------------------------------------------------------------- ERC-7579 module surface

    function onInstall(bytes calldata) external override {
        installed[msg.sender] = true;
        emit Installed(msg.sender);
    }

    /// @dev After uninstall every session of the account is dead: validation needs `installed`.
    function onUninstall(bytes calldata) external override {
        installed[msg.sender] = false;
        emit Uninstalled(msg.sender);
    }

    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == 1;
    }

    function isInitialized(address smartAccount) external view override returns (bool) {
        return installed[smartAccount];
    }

    /// @dev A session key never signs messages for the account.
    function isValidSignatureWithSender(address, bytes32, bytes calldata) external pure override returns (bytes4) {
        return 0xffffffff;
    }

    // ---------------------------------------------------------------- management (called by the account)

    function grantSession(
        address key,
        uint256 single,
        uint256 daily,
        uint256 monthly,
        uint48 validUntil,
        address[] calldata targets
    ) external {
        require(installed[msg.sender], "not installed");
        require(key != address(0) && key != msg.sender && key != address(this), "bad key");
        Session storage s = _sessions[msg.sender][key];
        // A revoked key keeps its entry, so it can never be granted again: give the Agent a new key.
        require(!s.exists, "session exists");
        require(single > 0 && single <= daily && daily <= monthly, "limits not ordered");
        require(validUntil > block.timestamp, "expiry in the past");
        require(targets.length > 0 && targets.length <= MAX_TARGETS, "bad target count");
        for (uint256 i = 0; i < targets.length; i++) {
            address t = targets[i];
            require(t != address(0) && t != msg.sender && t != address(this), "bad target");
            require(!allowedTarget[msg.sender][key][t], "duplicate target");
            allowedTarget[msg.sender][key][t] = true;
        }
        s.single = single;
        s.daily = daily;
        s.monthly = monthly;
        s.validUntil = validUntil;
        s.exists = true;
        emit SessionGranted(msg.sender, key, single, daily, monthly, validUntil);
    }

    function revokeSession(address key) external {
        Session storage s = _sessions[msg.sender][key];
        require(s.exists, "unknown session");
        s.revoked = true;
        emit SessionRevoked(msg.sender, key);
    }

    /**
     * @dev Execution phase, first call of every session-key operation. `msg.sender` is the account, so an outsider can
     *      only ever touch an entry of its own address, which does not exist.
     */
    function recordSpend(address key, address target, uint256 amount) external {
        Session storage s = _sessions[msg.sender][key];
        require(s.exists, "unknown session");
        require(!s.revoked, "session revoked");
        require(block.timestamp <= s.validUntil, "session expired");
        require(allowedTarget[msg.sender][key][target], "target not whitelisted");
        require(amount > 0, "zero amount");
        require(amount <= s.single, "exceeds single limit");

        uint256 d = block.timestamp / 1 days;
        if (d > s.dayBucket) {
            s.dayBucket = d;
            s.usedDay = 0;
        }
        uint256 m = block.timestamp / 30 days;
        if (m > s.monthBucket) {
            s.monthBucket = m;
            s.usedMonth = 0;
        }
        require(s.usedDay + amount <= s.daily, "exceeds daily limit");
        require(s.usedMonth + amount <= s.monthly, "exceeds monthly limit");
        s.usedDay += amount;
        s.usedMonth += amount;
        emit Spent(msg.sender, key, target, amount, s.usedDay, s.usedMonth);
    }

    // ---------------------------------------------------------------- views

    function session(address account, address key)
        external
        view
        returns (
            uint256 single,
            uint256 daily,
            uint256 monthly,
            uint48 validUntil,
            bool exists,
            bool revoked,
            uint256 usedDay,
            uint256 usedMonth
        )
    {
        Session storage s = _sessions[account][key];
        return (s.single, s.daily, s.monthly, s.validUntil, s.exists, s.revoked, s.usedDay, s.usedMonth);
    }

    /// @dev Read-only pre-check for the server: would `recordSpend` accept this spend now?
    function canSpend(address account, address key, address target, uint256 amount) external view returns (bool ok, string memory reason) {
        Session storage s = _sessions[account][key];
        if (!installed[account]) return (false, "not installed");
        if (!s.exists) return (false, "unknown session");
        if (s.revoked) return (false, "session revoked");
        if (block.timestamp > s.validUntil) return (false, "session expired");
        if (!allowedTarget[account][key][target]) return (false, "target not whitelisted");
        if (amount == 0) return (false, "zero amount");
        if (amount > s.single) return (false, "exceeds single limit");
        uint256 usedD = block.timestamp / 1 days > s.dayBucket ? 0 : s.usedDay;
        if (usedD + amount > s.daily) return (false, "exceeds daily limit");
        uint256 usedM = block.timestamp / 30 days > s.monthBucket ? 0 : s.usedMonth;
        if (usedM + amount > s.monthly) return (false, "exceeds monthly limit");
        return (true, "");
    }

    // ---------------------------------------------------------------- validation

    /**
     * @dev Reads only this contract's storage keyed by the account, uses no clock: expiry travels in `validationData`
     *      (the EntryPoint enforces it). A bad signature, an unknown or revoked key returns 1; a call that breaks the
     *      policy reverts with the reason, which a bundler reports as a rejected operation.
     */
    function validateUserOp(PackedUserOperation calldata userOp, bytes32 userOpHash) external view override returns (uint256) {
        address account = msg.sender;
        if (userOp.sender != account || !installed[account]) return SIG_VALIDATION_FAILED;
        address signer = _recover(userOpHash, userOp.signature);
        if (signer == address(0)) return SIG_VALIDATION_FAILED;
        Session storage s = _sessions[account][signer];
        if (!s.exists || s.revoked) return SIG_VALIDATION_FAILED;
        _checkCallData(userOp.callData, account, signer, s);
        // validationData: authorizer 0 (valid), validUntil in bits 160..207, validAfter 0.
        return uint256(s.validUntil) << 160;
    }

    function _checkCallData(bytes calldata callData, address account, address signer, Session storage s) internal view {
        require(callData.length >= 4 && bytes4(callData[:4]) == EXECUTE_SELECTOR, "not execute");
        (bytes32 mode, bytes memory exec) = abi.decode(callData[4:], (bytes32, bytes));
        require(keccak256(callData[4:]) == keccak256(abi.encode(mode, exec)), "non canonical call data");
        require(mode == MODE_BATCH_DEFAULT, "mode not allowed");
        Execution[] memory e = abi.decode(exec, (Execution[]));
        require(keccak256(abi.encode(e)) == keccak256(exec), "non canonical batch");
        require(e.length == 2, "batch shape");
        require(e[0].target == address(this) && e[0].value == 0, "first call must record");
        require(e[1].callData.length == 0, "plain transfers only");
        require(allowedTarget[account][signer][e[1].target], "target not whitelisted");
        require(e[1].value > 0, "zero amount");
        require(e[1].value <= s.single, "exceeds single limit");
        require(
            keccak256(e[0].callData) == keccak256(abi.encodeWithSelector(this.recordSpend.selector, signer, e[1].target, e[1].value)),
            "record call mismatch"
        );
    }

    /// @dev The key signs `toEthSignedMessageHash(userOpHash)` (what viem's `signMessage({ message: { raw } })` makes).
    ///      65 bytes, v of 27 or 28, low s only (no malleable twin).
    function _recover(bytes32 userOpHash, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v != 27 && v != 28) return address(0);
        if (uint256(s) > SECP256K1_HALF_N) return address(0);
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash));
        return ecrecover(digest, v, r, s);
    }
}
