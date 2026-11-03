// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SoulSignerManager
 * @dev 元神 Soul Core · 账户签名者管理 / 恢复统一控制面
 *      (soul-core-erc4337-verifiable-reputation · 需求 2/15 · design G1)
 *
 * 核心语义(与 ERC-4337 智能账户"地址稳定、签名者可轮换"对齐):
 *  - **账户身份 = 稳定的 account 地址**(4337 智能账户地址),独立于当前签名者。
 *  - **账户所有权 = owner**(4337 owner 模块);只有 owner 能增删/轮换签名者(需求 2.3)。
 *  - **签名者(signer)= 可轮换的控制钥**:现在是 MPC 钥,未来是元神芯钥,走同一接口(需求 2.4 roadmap)。
 *  - **权威恢复(G1 / 需求 15)= 原子"授新 + 撤旧"**(rotateSigner):失窃/换设备时旧钥作废、
 *    地址/DID/信誉不变。这是**唯一权威恢复路径**,MPC 分片重建只是"重建当前签名者钥"的实现细节。
 *  - **过户须原主授权**(transferOwnership 仅现 owner 可调)——占有 ≠ 所有(用户明确要求)。
 *
 * 本合约只管"谁能控制账户",不持资金;是控制面基元(限额在 SpendingLimitValidator,
 * 实际执行在 4337 账户/Kernel)。审计面小。
 */
contract SoulSignerManager {
    /// @dev account(4337 地址) => owner(账户所有权持有者)。
    mapping(address => address) public accountOwner;

    /// @dev account => signer => 是否授权。
    mapping(address => mapping(address => bool)) public authorized;

    /// @dev account => 当前授权签名者数量(便于防"撤到零"锁死)。
    mapping(address => uint256) public signerCount;

    event AccountRegistered(address indexed account, address indexed owner, address indexed firstSigner);
    event SignerAuthorized(address indexed account, address indexed signer);
    event SignerRevoked(address indexed account, address indexed signer);
    event SignerRotated(address indexed account, address indexed oldSigner, address indexed newSigner);
    event OwnershipTransferred(address indexed account, address indexed prevOwner, address indexed newOwner);

    modifier onlyOwner(address account) {
        require(accountOwner[account] == msg.sender, "not account owner");
        _;
    }

    /**
     * @dev 注册账户并设首个签名者。owner = 调用者(4337 账户创建时由 owner 调)。
     */
    function registerAccount(address account, address firstSigner) external {
        require(account != address(0) && firstSigner != address(0), "zero addr");
        require(accountOwner[account] == address(0), "already registered");
        accountOwner[account] = msg.sender;
        authorized[account][firstSigner] = true;
        signerCount[account] = 1;
        emit AccountRegistered(account, msg.sender, firstSigner);
        emit SignerAuthorized(account, firstSigner);
    }

    /// @dev 授权新签名者(需求 2.3)。
    function authorizeSigner(address account, address signer) external onlyOwner(account) {
        require(signer != address(0), "zero signer");
        if (!authorized[account][signer]) {
            authorized[account][signer] = true;
            signerCount[account] += 1;
            emit SignerAuthorized(account, signer);
        }
    }

    /// @dev 撤销签名者(需求 2.3);不允许撤到 0 个,避免账户永久锁死。
    function revokeSigner(address account, address signer) external onlyOwner(account) {
        require(authorized[account][signer], "not a signer");
        require(signerCount[account] > 1, "cannot revoke last signer");
        authorized[account][signer] = false;
        signerCount[account] -= 1;
        emit SignerRevoked(account, signer);
    }

    /**
     * @dev 权威恢复(G1 / 需求 15.2):**原子**授新签名者 + 撤旧签名者。
     *      地址/账户所有权/信誉不变;旧钥作废。失窃或 MPC→元神芯 迁移走此路径。
     */
    function rotateSigner(address account, address oldSigner, address newSigner)
        external
        onlyOwner(account)
    {
        require(newSigner != address(0), "zero new signer");
        require(authorized[account][oldSigner], "old not a signer");
        require(oldSigner != newSigner, "same signer");
        if (!authorized[account][newSigner]) {
            authorized[account][newSigner] = true;
            signerCount[account] += 1;
        }
        authorized[account][oldSigner] = false;
        signerCount[account] -= 1;
        emit SignerRotated(account, oldSigner, newSigner);
    }

    /**
     * @dev 过户:仅现 owner 可转移账户所有权(需求:占有 ≠ 所有,过户须原主授权)。
     */
    function transferOwnership(address account, address newOwner) external onlyOwner(account) {
        require(newOwner != address(0), "zero owner");
        address prev = accountOwner[account];
        accountOwner[account] = newOwner;
        emit OwnershipTransferred(account, prev, newOwner);
    }

    /// @dev 校验某签名者当前是否被授权控制该账户。
    function isAuthorizedSigner(address account, address signer) external view returns (bool) {
        return authorized[account][signer];
    }
}
