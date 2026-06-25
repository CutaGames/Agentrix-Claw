import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x" + "0".repeat(64);
const BSC_TESTNET_RPC = process.env.BSC_TESTNET_RPC_URL || "https://bsc-testnet.publicnode.com";
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || "";

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
    },
    bscTestnet: {
      url: BSC_TESTNET_RPC,
      chainId: 97,
      accounts: DEPLOYER_PRIVATE_KEY !== "0x" + "0".repeat(64) ? [DEPLOYER_PRIVATE_KEY] : [],
      gasPrice: 10_000_000_000, // 10 gwei
    },
    bscMainnet: {
      url: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org",
      chainId: 56,
      accounts: DEPLOYER_PRIVATE_KEY !== "0x" + "0".repeat(64) ? [DEPLOYER_PRIVATE_KEY] : [],
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

export default config;
