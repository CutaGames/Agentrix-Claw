// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title ReputationAnchor
 * @dev 元神 Soul Core · 可验证信誉的极简 Merkle 批量锚点合约
 *      (soul-core-erc4337-verifiable-reputation · 需求 6/13 · design ReputationAnchor)
 *
 * 目标：把一批信誉 VC 的哈希打包成一棵 Merkle 树，只把 root 上链，
 *       任何第三方仅凭 (VC 叶子哈希 + Merkle proof + 链上 root) 即可离线独立复验，
 *       不依赖 Agentrix 的任何信任 API（design Property 1）。
 *
 * 设计要点：
 * - 批量：一次 anchorBatch 覆盖任意多条 VC，降低逐条上链成本/吞吐问题（需求 13.1）。
 * - 幂等：同一 batchId 重复锚同一 root 为 no-op；锚不同 root 直接 revert（root 不可变，需求 13.2 / Property 5）。
 * - 只读复验：verifyInclusion(batchId, leaf, proof) 供链上/链下校验（需求 13.3）。
 * - ERC-8004 兼容：数据形状为 (subject 摘要哈希 → root)，便于将来把同一批数据同写官方注册表；
 *   本合约不承担资金/权限，纯锚点，审计面小。
 *
 * 叶子哈希约定：leaf = keccak256(abi.encodePacked(vcDigest))，vcDigest 为 VC 规范化串的 keccak256。
 * Merkle 校验用 OpenZeppelin MerkleProof（交换式排序对哈希），链下建树须一致。
 */
contract ReputationAnchor is Ownable {
    /// @dev batchId => Merkle root（root 一经写入不可变）。
    mapping(uint256 => bytes32) public roots;

    /// @dev batchId => 锚定区块时间戳（0 表示未锚定）。
    mapping(uint256 => uint256) public anchoredAt;

    /// @dev batchId => 该批叶子数量（仅作元数据/审计参考，不参与校验）。
    mapping(uint256 => uint256) public leafCounts;

    /// @dev 已锚定批次总数。
    uint256 public totalBatches;

    /// @dev 迄今最大的已锚 batchId（便于索引/前端翻页）。
    uint256 public latestBatchId;

    event BatchAnchored(
        uint256 indexed batchId,
        bytes32 indexed merkleRoot,
        uint256 leafCount,
        uint256 timestamp
    );

    /**
     * @dev 锚定一批 VC 哈希的 Merkle root。
     *      幂等：同 batchId + 同 root → no-op 返回；同 batchId + 异 root → revert。
     * @param batchId   业务侧分配的批次号（严格单调递增建议，但合约不强制）。
     * @param merkleRoot 该批 VC 叶子哈希构成的 Merkle 树根。
     * @param leafCount  该批叶子数量（元数据）。
     */
    function anchorBatch(
        uint256 batchId,
        bytes32 merkleRoot,
        uint256 leafCount
    ) external onlyOwner {
        require(merkleRoot != bytes32(0), "empty root");

        bytes32 existing = roots[batchId];
        if (existing != bytes32(0)) {
            // 幂等：允许重复提交同一 root（重试安全），但禁止篡改已锚 root。
            require(existing == merkleRoot, "batch immutable");
            return;
        }

        roots[batchId] = merkleRoot;
        anchoredAt[batchId] = block.timestamp;
        leafCounts[batchId] = leafCount;
        totalBatches += 1;
        if (batchId > latestBatchId) {
            latestBatchId = batchId;
        }

        emit BatchAnchored(batchId, merkleRoot, leafCount, block.timestamp);
    }

    /**
     * @dev 校验某条 VC 叶子哈希是否包含于某批已锚 root（离线可复验的链上镜像）。
     * @return true 当且仅当 batchId 已锚定且 proof 能把 leaf 归约到该 root。
     */
    function verifyInclusion(
        uint256 batchId,
        bytes32 leaf,
        bytes32[] calldata proof
    ) external view returns (bool) {
        bytes32 root = roots[batchId];
        if (root == bytes32(0)) {
            return false;
        }
        return MerkleProof.verify(proof, root, leaf);
    }

    /// @dev 该批是否已锚定。
    function isAnchored(uint256 batchId) external view returns (bool) {
        return roots[batchId] != bytes32(0);
    }
}
