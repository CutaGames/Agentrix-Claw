import * as fs from "fs";
import * as path from "path";
import { ethers, network } from "hardhat";
import { assertTestnetNetwork } from "./lib/network-guard";
import { assertSmartAccountTestnet } from "./lib/testnet-guard";

/**
 * L8 D6: deploy SessionKeyValidator to a TESTNET (BSC testnet 97 or Base Sepolia 84532). Run by coord with the
 * testnet-only deployer key, never from a work session:
 *   npx hardhat run scripts/deploy-session-key-validator.ts --network bscTestnet
 * The chain id is checked first; any other chain, mainnets included, stops the script before a key is used.
 */
async function main() {
  await assertTestnetNetwork();
  const chainId = assertSmartAccountTestnet((await ethers.provider.getNetwork()).chainId);
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("no deployer key configured (DEPLOYER_PRIVATE_KEY)");

  const factory = await ethers.getContractFactory("SessionKeyValidator");
  const validator = await factory.deploy();
  await validator.waitForDeployment();
  const address = await validator.getAddress();

  const out = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: { SessionKeyValidator: { address } },
    note: "ERC-7579 validator module for Kernel v3; native-coin session keys only; testnet only, not audited.",
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `session-key-validator.${network.name}.${Date.now()}.json`), JSON.stringify(out, null, 2) + "\n");
  console.log(`SessionKeyValidator deployed on chain ${chainId} at ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
