/**
 * Trim the deployer's testnet MockUSDC balance down to a target by sending the
 * surplus to a burn/dead address (MockUSDC has no burn fn). testnet-only.
 *
 * Usage:
 *   TARGET_USDC=10000000 npx hardhat run scripts/trim-usdc.ts --network injectiveEvmTestnet
 */
import { ethers, network } from "hardhat";
import { assertTestnetNetwork } from "./lib/network-guard";

const USDC = process.env.USDC_ADDRESS || "0x9fcF02d8f706BAbc690a860F89b93b9801c8F28D";
const DEAD = "0x000000000000000000000000000000000000dEaD";

async function main() {
  await assertTestnetNetwork(); // 主网链号一律拒绝
  const [signer] = await ethers.getSigners();
  const target = BigInt(process.env.TARGET_USDC || "10000000"); // 10M USDC
  const usdc = await ethers.getContractAt("MockUSDC", USDC);
  const dec = Number(await usdc.decimals());
  const f = (x: bigint) => ethers.formatUnits(x, dec);
  const targetBase = target * 10n ** BigInt(dec);
  const bal: bigint = await usdc.balanceOf(signer.address);

  console.log(`Network ${network.name}  deployer ${signer.address}`);
  console.log(`current ${f(bal)} USDC  target ${f(targetBase)} USDC`);
  if (bal <= targetBase) {
    console.log("already at/below target — nothing to trim.");
    return;
  }
  const surplus = bal - targetBase;
  console.log(`burning surplus ${f(surplus)} USDC -> ${DEAD} ...`);
  await (await usdc.transfer(DEAD, surplus)).wait();
  console.log(`✅ deployer now = ${f(await usdc.balanceOf(signer.address))} USDC; total still minted (incl. dead).`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
