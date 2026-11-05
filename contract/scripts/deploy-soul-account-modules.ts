/**
 * 元神 Soul Core · T8 账户控制面模块部署(SoulSignerManager + SpendingLimitValidator)。
 *
 * 二者均为纯控制面/校验模块,无资金面;owner/controller 由调用者认领。
 *
 * 用法(BNB 测试网 chainId 97):
 *   DEPLOYER_PRIVATE_KEY=0x... npx hardhat run scripts/deploy-soul-account-modules.ts --network bscTestnet
 *
 * 诚实边界:把 SpendingLimitValidator 作为真正的 ERC-7579 validator 挂进 Kernel、
 * 以及经 bundler(Pimlico)跑 UserOp,是后续集成步骤(需已部署 Kernel/EntryPoint + API key)。
 */
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { assertTestnetNetwork } from "./lib/network-guard";

async function main() {
  await assertTestnetNetwork(); // 主网链号一律拒绝
  const [deployer] = await ethers.getSigners();
  console.log(`Network: ${network.name}  Deployer: ${deployer.address}`);

  const Signer = await ethers.getContractFactory("SoulSignerManager");
  const signerMgr = await Signer.deploy();
  await signerMgr.waitForDeployment();
  const signerAddr = await signerMgr.getAddress();
  console.log(`SoulSignerManager deployed: ${signerAddr}`);

  const Limit = await ethers.getContractFactory("SpendingLimitValidator");
  const limit = await Limit.deploy();
  await limit.waitForDeployment();
  const limitAddr = await limit.getAddress();
  console.log(`SpendingLimitValidator deployed: ${limitAddr}`);

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      SoulSignerManager: { address: signerAddr },
      SpendingLimitValidator: { address: limitAddr },
    },
    note: "控制面/校验模块;7579 validator 挂 Kernel + bundler UserOp 为后续集成;持真金前需审计。",
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `soul-account-modules.${network.name}.${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`Deployment written: ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
