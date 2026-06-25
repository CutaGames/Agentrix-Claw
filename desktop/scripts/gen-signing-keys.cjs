// Generate Tauri updater signing keys (minisign-compatible Ed25519)
// Usage: node scripts/gen-signing-keys.js
// Output: src-tauri/keys/agentrix.key (private) and src-tauri/keys/agentrix.key.pub (public)
// The public key string (printed to stdout) goes into tauri.conf.json plugins.updater.pubkey
const nacl = require("tweetnacl");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const kp = nacl.sign.keyPair();
const keyId = crypto.randomBytes(8);

// minisign signature algorithm: Ed (0x45, 0x64)
const sigAlg = Buffer.from([0x45, 0x64]);

// Public key: sigAlg(2) + keyId(8) + pk(32) = 42 bytes
const pubBuf = Buffer.concat([sigAlg, keyId, Buffer.from(kp.publicKey)]);
const pubB64 = pubBuf.toString("base64");

// Private key (unencrypted): sigAlg(2) + kdfAlg(2, zeros=no-kdf) + cksumAlg(2, zeros) 
// + kdfMem(8) + kdfOps(8) + salt(8) + checksum(8) + keyId(8) + secretKey(64) = 110 bytes
const kdfAlg = Buffer.alloc(2);   // no KDF
const cksumAlg = Buffer.alloc(2); // no checksum
const kdfMem = Buffer.alloc(8);
const kdfOps = Buffer.alloc(8);
const salt = Buffer.alloc(8);
const checksum = Buffer.alloc(8);
const privBuf = Buffer.concat([
  sigAlg, kdfAlg, cksumAlg, kdfMem, kdfOps, salt, checksum, keyId,
  Buffer.from(kp.secretKey),
]);
const privB64 = privBuf.toString("base64");

// Write files
const keysDir = path.join(__dirname, "..", "src-tauri", "keys");
fs.mkdirSync(keysDir, { recursive: true });

const pubContent = `untrusted comment: minisign public key ${keyId.toString("hex").toUpperCase()}\n${pubB64}\n`;
const privContent = `untrusted comment: minisign secret key ${keyId.toString("hex").toUpperCase()}\n${privB64}\n`;

fs.writeFileSync(path.join(keysDir, "agentrix.key.pub"), pubContent);
fs.writeFileSync(path.join(keysDir, "agentrix.key"), privContent);

console.log("=== Tauri Updater Signing Keys Generated ===");
console.log("");
console.log("Public key (for tauri.conf.json plugins.updater.pubkey):");
console.log(pubB64);
console.log("");
console.log("Private key (for TAURI_SIGNING_PRIVATE_KEY GitHub secret):");
console.log(privB64);
console.log("");
console.log("Files written:");
console.log("  src-tauri/keys/agentrix.key.pub");
console.log("  src-tauri/keys/agentrix.key");
console.log("");
console.log("IMPORTANT: Add agentrix.key to .gitignore!");
