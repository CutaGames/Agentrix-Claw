/**
 * 元神 Soul Core · ReputationAnchor 部署脚本(可验证信誉 Merkle 批量锚点)。
 *
 * 纯锚点合约，无资金/权限风险；owner = 部署者(即锚定操作者/后端 relayer 钥)。
 *
 * 用法(BNB 测试网, chainId 97):
 *   DEPLOYER_PRIVATE_KEY=0x... BSC_TESTNET_RPC_URL=https://... \
 *   npx hardhat run scripts/deploy-reputation-anchor.ts --network bscTestnet
 *
 * 部署后把合约地址写入后端 env: REPUTATION_ANCHOR_ADDRESS(_97)。
 */
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { assertTestnetNetwork } from "./lib/network-guard";

async function main() {
  await assertTestnetNetwork(); // 主网链号一律拒绝
  const [deployer] = await ethers.getSigners();
  console.log(`Network: ${network.name}  Deployer(=anchor owner): ${deployer.address}`);

  const Factory = await ethers.getContractFactory("ReputationAnchor");
  const anchor = await Factory.deploy();
  await anchor.waitForDeployment();
  const address = await anchor.getAddress();
  console.log(`ReputationAnchor deployed: ${address}`);

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      ReputationAnchor: { address, owner: deployer.address },
    },
    note: "纯 Merkle 批量锚点，ERC-8004 兼容数据形状；持真金前需第三方审计(超本 spec)。",
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `reputation-anchor.${network.name}.${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`Deployment written: ${file}`);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
