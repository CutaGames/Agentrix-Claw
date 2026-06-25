
try {
  const nacl = require('tweetnacl');
  console.log('tweetnacl available');
} catch (e) {
  console.log('tweetnacl NOT available');
}

try {
  const bs58 = require('bs58');
  console.log('bs58 available');
} catch (e) {
  console.log('bs58 NOT available');
}

try {
  const solana = require('@solana/web3.js');
  console.log('@solana/web3.js available');
} catch (e) {
  console.log('@solana/web3.js NOT available');
}
