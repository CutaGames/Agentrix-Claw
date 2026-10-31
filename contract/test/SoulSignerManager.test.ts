import { expect } from "chai";
import { ethers } from "hardhat";
import { SoulSignerManager } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * T8 · Gd 签名者轮换合约层单测(需求 2.3/15.2 · design G1)。
 * account 地址稳定;owner 授权下"授新+撤旧";过户须原主授权。
 */
describe("SoulSignerManager", function () {
  let mgr: SoulSignerManager;
  let owner: SignerWithAddress;
  let other: SignerWithAddress;
  const account = "0x000000000000000000000000000000000000A001";
  const sMpc = "0x000000000000000000000000000000000000B001";
  const sHw = "0x000000000000000000000000000000000000B002";
  const sExtra = "0x000000000000000000000000000000000000B003";

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();
    const F = await ethers.getContractFactory("SoulSignerManager");
    mgr = (await F.deploy()) as SoulSignerManager;
  });

  it("register sets owner + first signer", async function () {
    await mgr.registerAccount(account, sMpc);
    expect(await mgr.accountOwner(account)).to.equal(owner.address);
    expect(await mgr.isAuthorizedSigner(account, sMpc)).to.be.true;
    expect(await mgr.signerCount(account)).to.equal(1);
  });

  it("cannot register twice", async function () {
    await mgr.registerAccount(account, sMpc);
    await expect(mgr.registerAccount(account, sHw)).to.be.revertedWith("already registered");
  });

  it("only owner can authorize/revoke", async function () {
    await mgr.registerAccount(account, sMpc);
    await expect(mgr.connect(other).authorizeSigner(account, sHw)).to.be.revertedWith("not account owner");
    await mgr.authorizeSigner(account, sHw);
    expect(await mgr.isAuthorizedSigner(account, sHw)).to.be.true;
    expect(await mgr.signerCount(account)).to.equal(2);
  });

  it("cannot revoke the last signer (no lockout)", async function () {
    await mgr.registerAccount(account, sMpc);
    await expect(mgr.revokeSigner(account, sMpc)).to.be.revertedWith("cannot revoke last signer");
  });

  it("rotateSigner atomically authorizes new + revokes old (G1 recovery)", async function () {
    await mgr.registerAccount(account, sMpc);
    await expect(mgr.rotateSigner(account, sMpc, sHw)).to.emit(mgr, "SignerRotated");
    expect(await mgr.isAuthorizedSigner(account, sMpc)).to.be.false; // 旧钥作废
    expect(await mgr.isAuthorizedSigner(account, sHw)).to.be.true;   // 新钥生效
    expect(await mgr.signerCount(account)).to.equal(1);              // 计数稳定
    expect(await mgr.accountOwner(account)).to.equal(owner.address); // 所有权不变
  });

  it("rotate rejects when old is not a signer", async function () {
    await mgr.registerAccount(account, sMpc);
    await expect(mgr.rotateSigner(account, sExtra, sHw)).to.be.revertedWith("old not a signer");
  });

  it("transferOwnership requires current owner (占有 != 所有)", async function () {
    await mgr.registerAccount(account, sMpc);
    await expect(mgr.connect(other).transferOwnership(account, other.address)).to.be.revertedWith("not account owner");
    await mgr.transferOwnership(account, other.address);
    expect(await mgr.accountOwner(account)).to.equal(other.address);
    // 原 owner 失去控制权
    await expect(mgr.authorizeSigner(account, sHw)).to.be.revertedWith("not account owner");
  });
});
