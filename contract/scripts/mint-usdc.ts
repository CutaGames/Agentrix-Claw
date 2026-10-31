/**
 * Mint testnet MockUSDC to the treasury (owner) wallet.
 *
 * Usage (Injective EVM testnet):
 *   USDC_ADDRESS=0x9fcF02d8f706BAbc690a860F89b93b9801c8F28D MINT_USDC=1000000000 \
 *   npx hardhat run scripts/mint-usdc.ts --network injectiveEvmTestnet
 *
 * Default mints 1,000,000,000 (1B) USDC to the deployer. testnet-only.
 */
import { ethers, network } from "hardhat";
import { assertTestnetNetwork } from "./lib/network-guard";

async function main() {
  await assertTestnetNetwork(); // 主网链号一律拒绝
  const usdcAddress =
    process.env.USDC_ADDRESS || "0x9fcF02d8f706BAbc690a860F89b93b9801c8F28D";
  const mintWhole = BigInt(process.env.MINT_USDC || "1000000000"); // 1B USDC
  const [signer] = await ethers.getSigners();
  const to = process.env.MINT_TO || signer.address;

  const usdc = await ethers.getContractAt("MockUSDC", usdcAddress);
  const dec: number = Number(await usdc.decimals());
  const amount = mintWhole * 10n ** BigInt(dec);

  console.log(`Network ${network.name}  USDC ${usdcAddress}  decimals ${dec}`);
  console.log(`Minting ${mintWhole.toString()} USDC to ${to} ...`);
  const tx = await usdc.mint(to, amount);
  console.log(`tx ${tx.hash} — waiting...`);
  await tx.wait();

  const total = await usdc.totalSupply();
  const bal = await usdc.balanceOf(to);
  console.log(`✅ done. totalSupply = ${ethers.formatUnits(total, dec)} USDC`);
  console.log(`   ${to} balance = ${ethers.formatUnits(bal, dec)} USDC`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
