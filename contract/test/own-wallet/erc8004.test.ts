import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, getAddress, keccak256, toUtf8Bytes } from "ethers";
import {
  DEAD,
  REGISTRY,
  REGISTRY_IFACE,
  deployAccount,
  executeSingle,
  rootOp,
  submit,
  useVendor,
} from "./fixture";

/**
 * L8-6 S2: ERC-8004 IdentityRegistry v2.0.0 through the account (design I1, M1, M2). The proxy, implementation slot,
 * owner, ERC-721 name and symbol and _lastId are replayed from 97 (manifest.json storage).
 */
describe("own wallet ERC-8004 registration", function () {
  useVendor();
  const registry = () => new Contract(REGISTRY, REGISTRY_IFACE, ethers.provider);

  it("the replayed registry is v2.0.0 behind the pinned proxy", async function () {
    expect(await registry().getVersion()).to.equal("2.0.0");
  });

  it("deploy_setup registers from the account: ownerOf = account, agentWallet = account, metadata as sent; the account receives the ERC-721", async function () {
    const digest = keccak256(toUtf8Bytes("registration file canonical digest"));
    const vault = ethers.Wallet.createRandom().address;
    const acct = await deployAccount({ register: { uri: "https://api.agentrix.top/api/public/agent-identity/x", metadata: [["agentrix.fileDigest", digest], ["agentrix.ownerVault", vault]] } });
    expect(acct.outcome.success).to.equal(true);
    const r = registry();
    expect(await r.balanceOf(acct.address)).to.equal(1n);
    const events = await r.queryFilter(r.filters.Registered(null, null, acct.address));
    expect(events.length).to.equal(1);
    const agentId = (events[0] as any).args.agentId as bigint;
    expect(getAddress(await r.ownerOf(agentId))).to.equal(getAddress(acct.address));
    expect(getAddress(await r.getAgentWallet(agentId))).to.equal(getAddress(acct.address));
    expect(await r.getMetadata(agentId, "agentrix.fileDigest")).to.equal(digest);
    expect(await r.getMetadata(agentId, "agentrix.ownerVault")).to.equal(vault.toLowerCase());
  });

  it("someone else's registration in between shifts the agentId but not what was registered (M1)", async function () {
    const [other] = await ethers.getSigners();
    const r = registry();
    const digest = keccak256(toUtf8Bytes("same digest"));
    await (await (r.connect(other) as Contract)["register(string)"]("https://example.invalid/front-run")).wait();
    const before = await r.queryFilter(r.filters.Registered());
    const frontRunId = (before[before.length - 1] as any).args.agentId as bigint;
    const acct = await deployAccount({ register: { uri: "https://api.agentrix.top/x", metadata: [["agentrix.fileDigest", digest]] } });
    const mine = await r.queryFilter(r.filters.Registered(null, null, acct.address));
    const agentId = (mine[0] as any).args.agentId as bigint;
    expect(agentId).to.equal(frontRunId + 1n);
    expect(await r.getMetadata(agentId, "agentrix.fileDigest")).to.equal(digest);
  });

  it("revocation transfers to 0x…dEaD; afterwards the account can no longer set metadata or the URI (M2)", async function () {
    const acct = await deployAccount({ register: { uri: "https://api.agentrix.top/y", metadata: [] } });
    const r = registry();
    const agentId = ((await r.queryFilter(r.filters.Registered(null, null, acct.address)))[0] as any).args.agentId as bigint;
    const revoke = executeSingle(REGISTRY, 0n, REGISTRY_IFACE.encodeFunctionData("transferFrom", [acct.address, DEAD, agentId]));
    expect((await submit(await rootOp(acct, revoke))).success).to.equal(true);
    expect(getAddress(await r.ownerOf(agentId))).to.equal(getAddress(DEAD));
    expect(await r.getAgentWallet(agentId)).to.equal(ethers.ZeroAddress);
    const setMeta = executeSingle(REGISTRY, 0n, REGISTRY_IFACE.encodeFunctionData("setMetadata", [agentId, "agentrix.status", "0x01"]));
    expect((await submit(await rootOp(acct, setMeta))).success, "setMetadata after revocation").to.equal(false);
    expect(await r.getMetadata(agentId, "agentrix.status")).to.equal("0x");
  });

  it("the reserved agentWallet key cannot be written at registration (the deploy_setup batch fails as a whole)", async function () {
    const acct = await deployAccount({ register: { uri: "https://api.agentrix.top/z", metadata: [["agentWallet", "0x" + "11".repeat(20)]] } });
    expect(acct.outcome.success).to.equal(false);
    expect(await registry().balanceOf(acct.address)).to.equal(0n);
  });
});
