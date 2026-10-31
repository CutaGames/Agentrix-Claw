import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

/**
 * L8-6 S2: the simulator and the test paymaster are never deployed (design M22, plan P2). Static checks only; the
 * bytecode pin against the backend copy is in exec-simulator.test.ts.
 */
const CONTRACT = path.join(__dirname, "..", "..");

function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

describe("own wallet simulator and test paymaster are not deployed", function () {
  it("no script, deployment record or hardhat config names them", function () {
    const files = [...filesUnder(path.join(CONTRACT, "scripts")), ...filesUnder(path.join(CONTRACT, "deployments")), path.join(CONTRACT, "hardhat.config.ts")];
    expect(files.length).to.be.greaterThan(1);
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      for (const name of ["OwnWalletExecSimulator", "OwnWalletTestPaymaster", "TestPaymaster"]) {
        expect(text.includes(name), `${path.relative(CONTRACT, file)} mentions ${name}`).to.equal(false);
      }
    }
  });

  it("the simulator source imports nothing, cannot receive ether and has no selfdestruct; the paymaster lives under contracts/test", function () {
    const dir = path.join(CONTRACT, "contracts", "own-wallet-sim");
    expect(fs.readdirSync(dir)).to.deep.equal(["OwnWalletExecSimulator.sol"]);
    const source = fs.readFileSync(path.join(dir, "OwnWalletExecSimulator.sol"), "utf8");
    expect(source).to.match(/SPDX-License-Identifier: MIT/);
    expect(source).to.not.match(/^\s*import\s/m);
    expect(source).to.not.match(/\bpayable\b|receive\s*\(|fallback\s*\(|selfdestruct/);
    expect(fs.existsSync(path.join(CONTRACT, "contracts", "test", "own-wallet", "TestPaymaster.sol"))).to.equal(true);
  });
});
