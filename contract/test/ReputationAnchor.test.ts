import { expect } from "chai";
import { ethers } from "hardhat";
import { ReputationAnchor } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * OpenZeppelin MerkleProof 使用交换式(排序对)哈希：
 *   hashPair(a, b) = keccak256(a<b ? a||b : b||a)
 * 这里在链下用同样规则建树 + 生成 proof，保证与合约 verifyInclusion 一致。
 */
function hashPair(a: string, b: string): string {
  const [lo, hi] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return ethers.keccak256(ethers.concat([lo, hi]));
}

function buildTree(leaves: string[]): { root: string; layers: string[][] } {
  if (leaves.length === 0) return { root: ethers.ZeroHash, layers: [[]] };
  const layers: string[][] = [leaves.slice()];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next: string[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      if (i + 1 < prev.length) {
        next.push(hashPair(prev[i], prev[i + 1]));
      } else {
        next.push(prev[i]); // 奇数节点向上提升(与 OZ StandardMerkleTree 的处理略不同，这里用于测试构造)
      }
    }
    layers.push(next);
  }
  return { root: layers[layers.length - 1][0], layers };
}

function getProof(layers: string[][], index: number): string[] {
  const proof: string[] = [];
  let idx = index;
  for (let l = 0; l < layers.length - 1; l++) {
    const layer = layers[l];
    const pairIndex = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (pairIndex < layer.length) {
      proof.push(layer[pairIndex]);
    }
    idx = Math.floor(idx / 2);
  }
  return proof;
}

describe("ReputationAnchor", function () {
  let anchor: ReputationAnchor;
  let owner: SignerWithAddress;
  let other: SignerWithAddress;

  // 一组稳定的叶子(模拟 VC 摘要哈希)。用偶数个避免奇数提升的边界。
  const leaves = [
    ethers.keccak256(ethers.toUtf8Bytes("vc-1")),
    ethers.keccak256(ethers.toUtf8Bytes("vc-2")),
    ethers.keccak256(ethers.toUtf8Bytes("vc-3")),
    ethers.keccak256(ethers.toUtf8Bytes("vc-4")),
  ];

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ReputationAnchor");
    anchor = (await Factory.deploy()) as ReputationAnchor;
  });

  describe("Deployment", function () {
    it("owner is deployer, empty state", async function () {
      expect(await anchor.owner()).to.equal(owner.address);
      expect(await anchor.totalBatches()).to.equal(0);
      expect(await anchor.latestBatchId()).to.equal(0);
    });
  });

  describe("anchorBatch", function () {
    it("stores root, timestamp, leafCount and emits event", async function () {
      const { root } = buildTree(leaves);
      await expect(anchor.anchorBatch(1, root, leaves.length))
        .to.emit(anchor, "BatchAnchored");
      expect(await anchor.roots(1)).to.equal(root);
      expect(await anchor.leafCounts(1)).to.equal(leaves.length);
      expect(await anchor.isAnchored(1)).to.be.true;
      expect(await anchor.totalBatches()).to.equal(1);
      expect(await anchor.latestBatchId()).to.equal(1);
      expect(await anchor.anchoredAt(1)).to.be.gt(0);
    });

    it("reverts empty root", async function () {
      await expect(anchor.anchorBatch(1, ethers.ZeroHash, 0))
        .to.be.revertedWith("empty root");
    });

    it("only owner can anchor", async function () {
      const { root } = buildTree(leaves);
      await expect(anchor.connect(other).anchorBatch(1, root, leaves.length))
        .to.be.reverted;
    });

    it("idempotent: same batchId + same root is a no-op (retry safe)", async function () {
      const { root } = buildTree(leaves);
      await anchor.anchorBatch(1, root, leaves.length);
      // 二次提交同 root 不应 revert，也不应重复计数
      await anchor.anchorBatch(1, root, leaves.length);
      expect(await anchor.totalBatches()).to.equal(1);
    });

    it("reverts overwriting a batchId with a different root (immutable)", async function () {
      const { root } = buildTree(leaves);
      await anchor.anchorBatch(1, root, leaves.length);
      const otherRoot = ethers.keccak256(ethers.toUtf8Bytes("different"));
      await expect(anchor.anchorBatch(1, otherRoot, 1))
        .to.be.revertedWith("batch immutable");
    });

    it("tracks latestBatchId as the max anchored id", async function () {
      const { root } = buildTree(leaves);
      await anchor.anchorBatch(5, root, leaves.length);
      await anchor.anchorBatch(3, root, leaves.length);
      expect(await anchor.latestBatchId()).to.equal(5);
      expect(await anchor.totalBatches()).to.equal(2);
    });
  });

  describe("verifyInclusion", function () {
    it("verifies a leaf against its anchored root", async function () {
      const { root, layers } = buildTree(leaves);
      await anchor.anchorBatch(1, root, leaves.length);
      for (let i = 0; i < leaves.length; i++) {
        const proof = getProof(layers, i);
        expect(await anchor.verifyInclusion(1, leaves[i], proof)).to.be.true;
      }
    });

    it("rejects a leaf not in the tree", async function () {
      const { root, layers } = buildTree(leaves);
      await anchor.anchorBatch(1, root, leaves.length);
      const proof = getProof(layers, 0);
      const bogusLeaf = ethers.keccak256(ethers.toUtf8Bytes("not-in-tree"));
      expect(await anchor.verifyInclusion(1, bogusLeaf, proof)).to.be.false;
    });

    it("returns false for an un-anchored batch", async function () {
      const { layers } = buildTree(leaves);
      const proof = getProof(layers, 0);
      expect(await anchor.verifyInclusion(999, leaves[0], proof)).to.be.false;
    });
  });
});
