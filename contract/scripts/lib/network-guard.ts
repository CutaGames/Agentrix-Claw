/**
 * 部署脚本的主网守卫（L8 D5，审计「上线准备清单」）。
 *
 * 规矩：所有会发交易的脚本，第一件事就是调用 `assertTestnetNetwork()`。
 *  - 白名单，不是黑名单：只有下面列出的测试网和本地链能跑，**不认识的链号一律拒绝**。
 *  - 没有环境变量或参数能绕过它。主网部署只由 owner 逐次批准，走单独的流程，不走这些脚本。
 */

/** 允许运行脚本的链号：测试网和本地链。 */
export const ALLOWED_TESTNET_CHAIN_IDS: readonly bigint[] = [
  97n, // BSC 测试网（本仓库的 hardhat 本地网络也用这个链号）
  31337n, // hardhat 默认本地链
  1337n, // 本地链（ganache 等）
  84532n, // Base Sepolia
  11155111n, // Sepolia
  1439n, // Injective EVM 测试网
];

/** 只用来把报错写得更清楚，守卫本身不靠这张表。 */
export const KNOWN_MAINNET_CHAIN_IDS: Readonly<Record<string, string>> = {
  "1": "Ethereum",
  "10": "Optimism",
  "56": "BNB Smart Chain",
  "137": "Polygon",
  "8453": "Base",
  "42161": "Arbitrum One",
  "43114": "Avalanche C-Chain",
  "1776": "Injective EVM",
};

function parseChainId(value: unknown): bigint | null {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") {
      return Number.isSafeInteger(value) ? BigInt(value) : null;
    }
    if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
      return BigInt(value.trim());
    }
  } catch {
    // 落到 null
  }
  return null;
}

export function isAllowedDeployChainId(chainId: unknown): boolean {
  const parsed = parseChainId(chainId);
  return parsed !== null && ALLOWED_TESTNET_CHAIN_IDS.includes(parsed);
}

/** 链号不在白名单就抛错；通过时返回解析后的链号。 */
export function assertTestnetChainId(chainId: unknown): bigint {
  const parsed = parseChainId(chainId);
  if (parsed === null) {
    throw new Error(`Refusing to run: cannot read a chainId from ${String(chainId)}`);
  }
  if (!ALLOWED_TESTNET_CHAIN_IDS.includes(parsed)) {
    const name = KNOWN_MAINNET_CHAIN_IDS[parsed.toString()];
    throw new Error(
      `Refusing to run: chainId ${parsed.toString()}${name ? ` (${name} mainnet)` : ""} is not an allowed testnet or local chain. ` +
        "Mainnet deployment is not done with these scripts."
    );
  }
  return parsed;
}

/** 读当前 hardhat 网络的链号并检查。脚本的第一行调用它。 */
export async function assertTestnetNetwork(): Promise<bigint> {
  // 延迟加载：纯函数的单测不需要启动 hardhat 运行环境
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ethers } = require("hardhat");
  const network = await ethers.provider.getNetwork();
  return assertTestnetChainId(network.chainId);
}
