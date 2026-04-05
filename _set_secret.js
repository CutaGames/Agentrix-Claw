// Set GitHub Actions secret using API + tweetnacl
const https = require('https');
const PAT = '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';
const REPO = 'CutaGames/Agentrix';
const SECRET_NAME = 'PUBLIC_BUILD_REPO_PUSH_TOKEN';
const SECRET_VALUE = PAT;

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path: path,
      method: method,
      headers: {
        'Authorization': 'token ' + PAT,
        'User-Agent': 'Agentrix',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      }
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Install tweetnacl if needed
  try { require('tweetnacl'); } catch(e) {
    console.log('Installing tweetnacl...');
    require('child_process').execSync('npm install tweetnacl', { cwd: '/tmp', stdio: 'inherit' });
  }
  const nacl = require('/tmp/node_modules/tweetnacl');

  // Get public key
  const keyRes = await apiCall('GET', `/repos/${REPO}/actions/secrets/public-key`);
  console.log('Public key ID:', keyRes.body.key_id);

  // Encrypt: sealed box
  const keyBytes = Buffer.from(keyRes.body.key, 'base64');
  const messageBytes = Buffer.from(SECRET_VALUE);

  // NaCl sealed box = ephemeral keypair + box
  const ephemeralKeypair = nacl.box.keyPair();
  const nonce = new Uint8Array(24); // nacl.box nonce
  // Compute nonce from hash of ephemeral public key + recipient public key
  const crypto = require('crypto');
  const nonceInput = Buffer.concat([ephemeralKeypair.publicKey, keyBytes]);
  const hash = crypto.createHash('sha512').update(nonceInput).digest();
  nonce.set(hash.slice(0, 24));

  // Encrypt
  const encrypted = nacl.box(messageBytes, nonce, keyBytes, ephemeralKeypair.secretKey);
  if (!encrypted) { console.error('Encryption failed'); process.exit(1); }

  // Sealed box = ephemeral public key + encrypted
  const sealedBox = Buffer.concat([Buffer.from(ephemeralKeypair.publicKey), Buffer.from(encrypted)]);
  const encryptedValue = sealedBox.toString('base64');

  // Set secret
  const setRes = await apiCall('PUT', `/repos/${REPO}/actions/secrets/${SECRET_NAME}`, {
    encrypted_value: encryptedValue,
    key_id: keyRes.body.key_id,
  });
  console.log('Set secret response:', setRes.status, JSON.stringify(setRes.body));
  if (setRes.status === 201 || setRes.status === 204) {
    console.log('SUCCESS: SECRET SET');
  } else {
    console.log('FAILED:', setRes.status);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
