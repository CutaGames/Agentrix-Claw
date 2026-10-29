// Generate Tauri updater signing keys (minisign-compatible Ed25519)
// Usage: node scripts/gen-signing-keys.cjs [--force]
// Output: src-tauri/keys/agentrix.key (private, mode 0600, git-ignored) and
//         src-tauri/keys/agentrix.key.pub (public, committed)
// The public key string (printed to stdout) goes into tauri.conf.json plugins.updater.pubkey
//
// Desktop D0 hardening:
// - Uses Node's built-in Ed25519 (the old version required `tweetnacl`, which
//   is not a dependency of this package).
// - Refuses to overwrite an existing key pair unless --force: rotating the
//   key makes every installed client reject future updates signed with it.
// - Never prints the private key. Copy it from the file into the
//   TAURI_SIGNING_PRIVATE_KEY secret yourself, then move the file off disk.
// - Prefer `npx tauri signer generate`, which produces a password-protected key.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const keysDir = path.join(__dirname, "..", "src-tauri", "keys");
const pubPath = path.join(keysDir, "agentrix.key.pub");
const privPath = path.join(keysDir, "agentrix.key");
const force = process.argv.includes("--force");

if (!force && (fs.existsSync(pubPath) || fs.existsSync(privPath))) {
  console.error("✗ A signing key pair already exists in src-tauri/keys/.");
  console.error("  Rotating it breaks auto-update for every installed client (they only trust the old public key).");
  console.error("  Re-run with --force only as part of an approved key rotation.");
  process.exit(1);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const seed = Buffer.from(privateKey.export({ format: "jwk" }).d, "base64url");
const pk = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
const keyId = crypto.randomBytes(8);

// minisign signature algorithm: Ed (0x45, 0x64)
const sigAlg = Buffer.from([0x45, 0x64]);

// Public key: sigAlg(2) + keyId(8) + pk(32) = 42 bytes
const pubB64 = Buffer.concat([sigAlg, keyId, pk]).toString("base64");

// Private key (unencrypted): sigAlg(2) + kdfAlg(2, zeros=no-kdf) + cksumAlg(2, zeros)
// + kdfMem(8) + kdfOps(8) + salt(8) + checksum(8) + keyId(8) + secretKey(64 = seed + pk) = 110 bytes
const privB64 = Buffer.concat([
  sigAlg,
  Buffer.alloc(2),
  Buffer.alloc(2),
  Buffer.alloc(8),
  Buffer.alloc(8),
  Buffer.alloc(8),
  Buffer.alloc(8),
  keyId,
  seed,
  pk,
]).toString("base64");

fs.mkdirSync(keysDir, { recursive: true });
const keyIdHex = keyId.toString("hex").toUpperCase();
fs.writeFileSync(pubPath, `untrusted comment: minisign public key ${keyIdHex}\n${pubB64}\n`);
fs.writeFileSync(privPath, `untrusted comment: minisign secret key ${keyIdHex}\n${privB64}\n`, { mode: 0o600 });
fs.chmodSync(privPath, 0o600);

console.log("=== Tauri Updater Signing Keys Generated ===");
console.log("");
console.log("Public key (for tauri.conf.json plugins.updater.pubkey):");
console.log(pubB64);
console.log("");
console.log("Private key written to src-tauri/keys/agentrix.key (mode 0600, git-ignored).");
console.log("Copy it into the TAURI_SIGNING_PRIVATE_KEY secret, then remove the file from this machine.");
