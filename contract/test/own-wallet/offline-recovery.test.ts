import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Interface } from "ethers";
import {
  RECOVERY_NONCE_KEY,
  WEBAUTHN_IFACE,
  WEBAUTHN_VALIDATOR,
  addCredentialExecution,
  buildOp,
  deployAccount,
  executeSingle,
  guardianSignature,
  newSoftP256,
  signRoot,
  sortedGuardians,
  submit,
  useVendor,
} from "./fixture";

/**
 * L8-6 S2: the offline recovery path (decision 3d, A10). Without the platform: the recovery-code guardian adds a
 * software P-256 key as a root credential, and that key moves the native coin and the pinned token out.
 * How the recovery code turns into the guardian key is the S6 web code; here the guardian is an EOA standing for it.
 */
const ERC20 = new Interface(["function transfer(address to, uint256 amount) returns (bool)"]);

describe("own wallet offline recovery", function () {
  useVendor();

  it("recovery-code guardian adds a software key; the software key moves native coin and the token out", async function () {
    const recoveryCode = ethers.Wallet.createRandom();
    const friend = ethers.Wallet.createRandom();
    const acct = await deployAccount({ guardians: sortedGuardians([recoveryCode.address, friend.address]), threshold: 1 });
    const Token = await ethers.getContractFactory("MockUSDC");
    const token = await Token.deploy();
    await token.waitForDeployment();
    const [payer] = await ethers.getSigners();
    await (await token.mint(acct.address, 777n)).wait();
    await (await payer.sendTransaction({ to: acct.address, value: 9000n })).wait();

    const software = newSoftP256();
    const op = await buildOp({ sender: acct.address, callData: addCredentialExecution(software), nonceKey: RECOVERY_NONCE_KEY });
    op.signature = await guardianSignature(op, [recoveryCode]);
    expect((await submit(op)).success).to.equal(true);
    expect((await new Contract(WEBAUTHN_VALIDATOR, WEBAUTHN_IFACE, ethers.provider).getCredentialIds(acct.address)).length).to.equal(2);

    const safe = ethers.Wallet.createRandom().address;
    // software verification path (usePrecompile false), as the offline tool may run on a chain without RIP-7212
    expect((await submit(await signRoot(await buildOp({ sender: acct.address, callData: executeSingle(safe, 9000n, "0x") }), software, false))).success).to.equal(true);
    const tokenAddress = await token.getAddress();
    expect((await submit(await signRoot(await buildOp({ sender: acct.address, callData: executeSingle(tokenAddress, 0n, ERC20.encodeFunctionData("transfer", [safe, 777n])) }), software))).success).to.equal(true);
    expect(await ethers.provider.getBalance(safe)).to.equal(9000n);
    expect(await token.balanceOf(safe)).to.equal(777n);
  });
});
