import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { config as hardhatConfig } from "hardhat";
import {
  ALLOWED_TESTNET_CHAIN_IDS,
  KNOWN_MAINNET_CHAIN_IDS,
  assertTestnetChainId,
  assertTestnetNetwork,
  isAllowedDeployChainId,
} from "../scripts/lib/network-guard";

/**
 * L8 D5：部署脚本遇到主网链号一律拒绝（负向测试）。
 * 白名单：不认识的链号也拒绝。
 */
describe("deploy script network guard (L8 D5)", function () {
  it("主网链号全部被拒绝，报错里点出是哪条主网", function () {
    const mainnets: Array<[number, string]> = [
      [1, "Ethereum"],
      [10, "Optimism"],
      [56, "BNB Smart Chain"],
      [137, "Polygon"],
      [8453, "Base"],
      [42161, "Arbitrum One"],
      [43114, "Avalanche"],
      [1776, "Injective EVM"],
    ];
    for (const [id, name] of mainnets) {
      expect(() => assertTestnetChainId(id), `chain ${id}`).to.throw(/Refusing to run/);
      expect(() => assertTestnetChainId(BigInt(id))).to.throw(name);
      expect(() => assertTestnetChainId(String(id))).to.throw(/Refusing to run/);
      expect(isAllowedDeployChainId(id)).to.equal(false);
    }
  });

  it("不认识的链号、读不出的值：同样拒绝（白名单，不是黑名单）", function () {
    for (const bad of [0, 2, 99999, -1, 1.5, NaN, Infinity, "abc", "", "0x38", null, undefined, {}, "56 "]) {
      if (bad === "56 ") {
        // 带空格的数字字符串会被去空格后识别成 56，仍然是主网
        expect(() => assertTestnetChainId(bad)).to.throw(/Refusing to run/);
      } else {
        expect(() => assertTestnetChainId(bad), `value ${String(bad)}`).to.throw(/Refusing to run/);
      }
      expect(isAllowedDeployChainId(bad)).to.equal(false);
    }
  });

  it("测试网和本地链放行", function () {
    for (const id of ALLOWED_TESTNET_CHAIN_IDS) {
      expect(assertTestnetChainId(id)).to.equal(id);
      expect(assertTestnetChainId(id.toString())).to.equal(id);
    }
    expect(isAllowedDeployChainId(97)).to.equal(true); // BSC 测试网
    expect(isAllowedDeployChainId(1439)).to.equal(true); // Injective EVM 测试网
  });

  it("白名单里没有任何主网链号", function () {
    for (const mainnet of [1n, 10n, 56n, 137n, 8453n, 42161n, 43114n, 1776n]) {
      expect(ALLOWED_TESTNET_CHAIN_IDS.includes(mainnet)).to.equal(false);
    }
  });

  it("当前 hardhat 本地网络（链号 97）通过守卫", async function () {
    expect(await assertTestnetNetwork()).to.equal(97n);
  });

  it("hardhat 配置里没有任何主网网络，每个写了链号的网络都在白名单里（--network bscMainnet 这类入口不存在）", function () {
    const networks = hardhatConfig.networks as unknown as Record<string, { chainId?: number }>;
    expect(Object.keys(networks).length).to.be.greaterThan(0);
    for (const [name, network] of Object.entries(networks)) {
      expect(name, `网络名 ${name}`).to.not.match(/mainnet/i);
      if (network.chainId !== undefined) {
        expect(Object.keys(KNOWN_MAINNET_CHAIN_IDS), `${name} 的链号是主网`).to.not.include(String(network.chainId));
        expect(isAllowedDeployChainId(network.chainId), `${name} 的链号 ${network.chainId} 不在白名单里`).to.equal(true);
      }
    }
  });

  it("hardhat.config.ts 在每次运行前都用守卫检查所选网络（不靠脚本自己记得调用）", function () {
    const source = fs.readFileSync(path.join(__dirname, "..", "hardhat.config.ts"), "utf8");
    expect(source).to.match(/extendEnvironment\(/);
    expect(source).to.match(/assertTestnetChainId\(chainId\)/);
  });

  /** 去掉整行注释和块注释（注释里写的守卫调用不算数）；不动行尾，免得误伤字符串里的 "https://"。 */
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }

  /** scripts/ 下（含子目录，不含 lib/）所有 .ts / .js / .mjs / .cjs 脚本 */
  function listScripts(dir: string, base = dir): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (path.relative(base, full) === "lib") continue;
        out.push(...listScripts(full, base));
      } else if (/\.(ts|js|mjs|cjs)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  it("scripts/ 目录下（含子目录和 .js / .mjs）每个脚本都先调用守卫（以后新加的脚本漏了会在这里挂掉）", function () {
    const dir = path.join(__dirname, "..", "scripts");
    const scripts = listScripts(dir);
    expect(scripts.length).to.be.greaterThan(0);
    for (const file of scripts) {
      const name = path.relative(dir, file);
      const source = stripComments(fs.readFileSync(file, "utf8"));
      expect(source, `${name} 缺少 assertTestnetNetwork 调用`).to.match(/await assertTestnetNetwork\(\)/);
      expect(source, `${name} 缺少 network-guard 导入`).to.match(/network-guard/);
      // 守卫必须出现在第一笔交易之前：main() 里 assertTestnetNetwork 之前不能有 deploy / sendTransaction / mint 等
      const mainBody = source.slice(Math.max(0, source.indexOf("async function main")));
      const guardAt = mainBody.indexOf("await assertTestnetNetwork()");
      const firstTx = mainBody.search(/\.deploy\(|sendTransaction|\.mint\(|\.transfer\(|\.setPaymentChannel\(|\.deposit/);
      expect(guardAt, `${name} 守卫位置`).to.be.greaterThan(-1);
      if (firstTx !== -1) expect(guardAt, `${name} 守卫必须在第一笔交易之前`).to.be.lessThan(firstTx);
    }
  });

  it("静态检查本身有效：注释里写的守卫调用不算数", function () {
    const sneaky = '// await assertTestnetNetwork()\n/* import "./lib/network-guard" */\nasync function main() { await x.deploy(); }';
    const code = stripComments(sneaky);
    expect(code).to.not.match(/await assertTestnetNetwork\(\)/);
    expect(code).to.not.match(/network-guard/);
  });
});
