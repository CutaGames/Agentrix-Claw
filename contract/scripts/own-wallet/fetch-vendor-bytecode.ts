/**
 * L8-6 S2: read the pinned own-wallet contracts from public testnet RPC and check them against
 * contract/test/vendor/own-wallet/manifest.json (decision A4).
 *
 *   npx hardhat run scripts/own-wallet/fetch-vendor-bytecode.ts
 *   OWN_WALLET_VENDOR_WRITE=1 npx hardhat run scripts/own-wallet/fetch-vendor-bytecode.ts   # rewrite the MIT files
 *
 * Read-only: eth_chainId and eth_getCode only, no key, no transaction. Every RPC must answer an allowed testnet chain id
 * (97 or 84532) before anything is read. GPL / AGPL bytecode is only checked, never written into the repository; the
 * hardhat fixture reads it the same way before the tests.
 */
import * as fs from "fs";
import * as path from "path";
import { JsonRpcProvider, keccak256 } from "ethers";
import { assertTestnetNetwork } from "../lib/network-guard";
import { assertSmartAccountTestnet } from "../lib/testnet-guard";

const VENDOR_DIR = path.join(__dirname, "..", "..", "test", "vendor", "own-wallet");
const RPC: Record<number, string> = {
  97: "https://data-seed-prebsc-1-s1.binance.org:8545",
  84532: "https://sepolia.base.org",
};

interface Entry {
  name: string;
  address: string;
  readChainId: number;
  codehash: string;
  license: string;
  inRepo: boolean;
  file?: string;
  source?: string;
}

async function readCode(chainId: number, address: string): Promise<{ code: string; block: number }> {
  const provider = new JsonRpcProvider(RPC[chainId], chainId, { staticNetwork: true });
  try {
    const answered = assertSmartAccountTestnet(BigInt(await provider.send("eth_chainId", [])));
    if (answered !== chainId) throw new Error(`RPC for ${chainId} answered chain id ${answered}`);
    const block = Number(await provider.send("eth_blockNumber", []));
    const code: string = await provider.send("eth_getCode", [address, "latest"]);
    return { code, block };
  } finally {
    provider.destroy();
  }
}

async function main() {
  await assertTestnetNetwork();
  const write = process.env.OWN_WALLET_VENDOR_WRITE === "1";
  const manifest = JSON.parse(fs.readFileSync(path.join(VENDOR_DIR, "manifest.json"), "utf8")) as { contracts: Entry[] };
  let failures = 0;
  for (const entry of manifest.contracts) {
    const { code, block } = await readCode(entry.readChainId, entry.address);
    const codehash = code === "0x" ? "none" : keccak256(code);
    const ok = codehash === entry.codehash;
    console.log(`${ok ? "ok      " : "MISMATCH"} ${entry.name} ${entry.address} chain ${entry.readChainId} block ${block} ${entry.license}${entry.inRepo ? " (in repo)" : ""}`);
    if (!ok) {
      failures += 1;
      continue;
    }
    if (write && entry.inRepo && entry.file) {
      const out = { name: entry.name, address: entry.address, chainId: entry.readChainId, block, codehash, license: entry.license, source: entry.source, runtimeBytecode: code };
      fs.writeFileSync(path.join(VENDOR_DIR, entry.file), JSON.stringify(out, null, 1) + "\n");
    }
  }
  if (failures > 0) throw new Error(`${failures} pinned contract(s) do not match manifest.json; stop and report (E137)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
