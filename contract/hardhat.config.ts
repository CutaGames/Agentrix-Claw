import { HardhatUserConfig, extendEnvironment } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import { assertTestnetChainId } from "./scripts/lib/network-guard";

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x" + "0".repeat(64);
const BSC_TESTNET_RPC = process.env.BSC_TESTNET_RPC_URL || "https://bsc-testnet.publicnode.com";
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || "";
// Injective EVM (MultiVM). Testnet chainId 1439. Set the real RPC via env.
const INJECTIVE_EVM_TESTNET_RPC = process.env.INJECTIVE_EVM_TESTNET_RPC_URL || "";
const hasDeployer = DEPLOYER_PRIVATE_KEY !== "0x" + "0".repeat(64);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {
      chainId: 97, // mirror BSC Testnet for local testing
      // L8-6 S2: BSC testnet 97 has the RIP-7212 P-256 precompile at 0x100 (S0 probe), so the local chain has it too.
      enableRip7212: true,
    },
    bscTestnet: {
      url: BSC_TESTNET_RPC,
      chainId: 97,
      accounts: DEPLOYER_PRIVATE_KEY !== "0x" + "0".repeat(64) ? [DEPLOYER_PRIVATE_KEY] : [],
      gasPrice: 10_000_000_000, // 10 gwei
    },
    // 主网网络（BSC 56、Injective EVM 1776）不在这个配置里：这里的网络都挂着部署私钥，主网不该是一个 --network 参数就能到的地方。
    // 主网部署由 owner 逐次批准，走单独的流程。下面的 extendEnvironment 还会在每次运行前再拦一道。
    injectiveEvmTestnet: {
      url: INJECTIVE_EVM_TESTNET_RPC,
      chainId: 1439,
      accounts: hasDeployer ? [DEPLOYER_PRIVATE_KEY] : [],
      gasPrice: 200_000_000, // Injective EVM min ~0.16 gwei; use 0.2 gwei buffer
    },
  },
  etherscan: {
    apiKey: {
      bscTestnet: BSCSCAN_API_KEY,
      bsc: BSCSCAN_API_KEY,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

// 每次 hardhat 运行（run、test、console、任务）都先断言所选网络的链号在测试网白名单里，
// 不靠每个脚本记得自己调用守卫。配置里没写链号的网络，由脚本里的 assertTestnetNetwork() 在运行时按真实链号再查。
extendEnvironment((hre) => {
  const chainId = hre.network.config.chainId;
  if (chainId !== undefined) assertTestnetChainId(chainId);
});

export default config;
