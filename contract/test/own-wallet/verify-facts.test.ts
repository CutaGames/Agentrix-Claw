import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Interface, getAddress, hexlify, keccak256, toUtf8Bytes } from "ethers";
import {
  DEAD,
  KERNEL_IMPLEMENTATION,
  KERNEL_V31_INIT_CODE_HASH,
  REGISTRY,
  REGISTRY_IFACE,
  WEBAUTHN_VALIDATOR,
  codeAt,
  deployAccount,
  executeBatch,
  rootOp,
  submit,
  useVendor,
} from "./fixture";

/**
 * L8-6 S10: the on-chain facts the public verify page (frontend/lib/own-wallet/verify.ts) reads, and the character
 * slices its command-line steps cut from raw `eth_call` answers, on the replayed contracts.
 * - An own account is the LibClone ERC-1967 proxy (61 bytes) with the pinned Kernel v3.1 in the ERC-1967 slot, whose
 *   `rootValidator()` is 0x01 ‖ WebAuthnValidator and whose passkey `getCredentialIds` / `getCredentialInfo` return.
 * - A platform key that registers for itself holds the token from an address with no code.
 */
const KERNEL_PROXY_RUNTIME = "0x363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3";
const ERC1967_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const REGISTRY_IMPLEMENTATION = "0x7274e874ca62410a93bd8bf61c69d8045e399c02";
const VIEW_IFACE = new Interface([
  "function rootValidator() view returns (bytes21)",
  "function getCredentialIds(address account) view returns (bytes32[])",
  "function getCredentialInfo(bytes32 credentialId, address account) view returns (uint256 pubKeyX, uint256 pubKeyY, bool requireUV)",
]);

describe("own wallet public verify facts (S10, local chain 97)", function () {
  useVendor();
  const registry = () => new Contract(REGISTRY, REGISTRY_IFACE, ethers.provider);
  const rawCall = (to: string, data: string) => ethers.provider.call({ to, data });
  const agentIdOf = async (account: string): Promise<bigint> => {
    const r = registry();
    return ((await r.queryFilter(r.filters.Registered(null, null, account)))[0] as any).args.agentId as bigint;
  };

  it("the proxy runtime is what the pinned initcode deploys (LibClone ERC-1967 around the pinned implementation)", async function () {
    const initcode = "0x603d3d8160223d3973" + KERNEL_IMPLEMENTATION.slice(2).toLowerCase() + "60095155f3" + KERNEL_PROXY_RUNTIME.slice(2);
    expect(keccak256(initcode)).to.equal(KERNEL_V31_INIT_CODE_HASH);
  });

  it("an own account: proxy code, Kernel v3.1 in its slot, rootValidator = 0x01 ‖ WebAuthnValidator, its passkey readable", async function () {
    const acct = await deployAccount();
    expect(acct.outcome.success).to.equal(true);
    expect((await codeAt(acct.address)).toLowerCase()).to.equal(KERNEL_PROXY_RUNTIME);
    const slot = await ethers.provider.getStorage(acct.address, ERC1967_SLOT);
    expect(slot.slice(0, 26)).to.equal("0x" + "0".repeat(24));
    expect(getAddress("0x" + slot.slice(26))).to.equal(getAddress(KERNEL_IMPLEMENTATION));
    const kernel = new Contract(acct.address, VIEW_IFACE, ethers.provider);
    expect(String(await kernel.rootValidator()).toLowerCase()).to.equal("0x01" + WEBAUTHN_VALIDATOR.slice(2).toLowerCase());
    const validator = new Contract(WEBAUTHN_VALIDATOR, VIEW_IFACE, ethers.provider);
    const ids: string[] = await validator.getCredentialIds(acct.address);
    expect(ids.length).to.equal(1);
    const [x, y, requireUV] = await validator.getCredentialInfo(ids[0], acct.address);
    expect(x).to.equal(acct.key.x);
    expect(y).to.equal(acct.key.y);
    expect(requireUV).to.equal(true);
  });

  it("the registry answers the page's reads, and the command-line slices give the same values", async function () {
    const digest = keccak256(toUtf8Bytes("s10 registration file digest"));
    const vault = ethers.Wallet.createRandom().address;
    const uri = "https://api.agentrix.top/api/public/agent-identity/97/0x" + "ab".repeat(20) + "/registration.json";
    const acct = await deployAccount({ register: { uri, metadata: [["agentrix.fileDigest", digest], ["agentrix.ownerVault", vault]] } });
    expect(acct.outcome.success).to.equal(true);
    const agentId = await agentIdOf(acct.address);
    const r = registry();
    expect(await r.tokenURI(agentId)).to.equal(uri);
    expect(getAddress(await r.getAgentWallet(agentId))).to.equal(getAddress(acct.address));

    // `call $REG <ownerOf> | cut -c 27-`
    const owner = await rawCall(REGISTRY, REGISTRY_IFACE.encodeFunctionData("ownerOf", [agentId]));
    expect(owner.slice(26).toLowerCase()).to.equal(acct.address.slice(2).toLowerCase());
    // `call $REG <tokenURI> | cut -c 131- | xxd -r -p | tr -d '\000'`
    const uriRaw = await rawCall(REGISTRY, REGISTRY_IFACE.encodeFunctionData("tokenURI", [agentId]));
    expect(Buffer.from(uriRaw.slice(130), "hex").toString("utf8").replace(/\u0000+$/, "")).to.equal(uri);
    // `call $REG <getMetadata fileDigest> | cut -c 131-194`
    const digestRaw = await rawCall(REGISTRY, REGISTRY_IFACE.encodeFunctionData("getMetadata", [agentId, "agentrix.fileDigest"]));
    expect("0x" + digestRaw.slice(130, 194)).to.equal(digest);
    // `eth_getStorageAt $REG <ERC-1967 slot> | cut -c 27-`
    expect("0x" + (await ethers.provider.getStorage(REGISTRY, ERC1967_SLOT)).slice(26)).to.equal(REGISTRY_IMPLEMENTATION);
  });

  it("a token that does not exist: ownerOf reverts (the page says 'not found', never 'confirmed')", async function () {
    let reverted = false;
    try {
      await registry().ownerOf(10n ** 30n);
    } catch {
      reverted = true;
    }
    expect(reverted).to.equal(true);
  });

  it("the I4 revocation batch: holder 0x…dEaD, agentrix.status = 'revoked', the revoked digest, agentWallet cleared, URI kept", async function () {
    const uri = "https://api.agentrix.top/api/public/agent-identity/97/0x" + "cd".repeat(20) + "/registration.json";
    const digest = keccak256(toUtf8Bytes("active file"));
    const revokedDigest = keccak256(toUtf8Bytes("revoked file"));
    const acct = await deployAccount({ register: { uri, metadata: [["agentrix.fileDigest", digest]] } });
    const agentId = await agentIdOf(acct.address);
    const batch = executeBatch([
      [REGISTRY, 0n, REGISTRY_IFACE.encodeFunctionData("setMetadata", [agentId, "agentrix.status", hexlify(toUtf8Bytes("revoked"))])],
      [REGISTRY, 0n, REGISTRY_IFACE.encodeFunctionData("setMetadata", [agentId, "agentrix.fileDigest", revokedDigest])],
      [REGISTRY, 0n, REGISTRY_IFACE.encodeFunctionData("transferFrom", [acct.address, DEAD, agentId])],
    ]);
    expect((await submit(await rootOp(acct, batch))).success).to.equal(true);
    const r = registry();
    expect(getAddress(await r.ownerOf(agentId))).to.equal(getAddress(DEAD));
    expect(await r.getMetadata(agentId, "agentrix.status")).to.equal(hexlify(toUtf8Bytes("revoked")));
    expect(await r.getMetadata(agentId, "agentrix.fileDigest")).to.equal(revokedDigest);
    expect(await r.getAgentWallet(agentId)).to.equal(ethers.ZeroAddress);
    expect(await r.tokenURI(agentId)).to.equal(uri);
  });

  it("a platform key registering for itself holds the token from an address with no code (not an own account)", async function () {
    const [platformKey] = await ethers.getSigners();
    const r = registry().connect(platformKey) as Contract;
    await (await r["register(string)"]("https://api.agentrix.top/api/public/agent-identity/97/" + platformKey.address.toLowerCase() + "/registration.json")).wait();
    const events = await registry().queryFilter(registry().filters.Registered(null, null, platformKey.address));
    const agentId = (events[events.length - 1] as any).args.agentId as bigint;
    expect(getAddress(await registry().ownerOf(agentId))).to.equal(getAddress(platformKey.address));
    expect(getAddress(await registry().getAgentWallet(agentId))).to.equal(getAddress(platformKey.address));
    expect(await codeAt(platformKey.address)).to.equal("0x");
  });
});
