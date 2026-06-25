
const { ethers } = require('ethers');

const sessionId = '0x552ec987d4a17f522c1077dfd1de752cf0d3490847e6a7971a963c20cc71666f';
const to = '0x1f5D9bB59Fdb91c9f82291F7b896dE07d31888a5';
const amount = 100000n;
const orderId = 'e2ee0a46-ddb0-4bf1-85d4-e630c860fce6';
const chainId = 97;

const paymentIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(orderId));
console.log('Calculated paymentIdBytes32:', paymentIdBytes32);
console.log('Expected paymentIdBytes32:  ', '0x40c4e014ffd21fed7504d2f2ef92d598d90a69a2f3efe4f807faeccc226229eb');

const innerHash = ethers.solidityPackedKeccak256(
  ['bytes32', 'address', 'uint256', 'bytes32', 'uint256'],
  [sessionId, to, amount, paymentIdBytes32, chainId]
);

console.log('Calculated innerHash:', innerHash);
console.log('Expected innerHash:  ', '0xc8d3bd749c760d6a8f6d2fd9a512ad9a44022c28ca4dc3ddd77899b510d0377f');

const messageHashWithPrefix = ethers.solidityPackedKeccak256(
  ['string', 'bytes32'],
  ['\x19Ethereum Signed Message:\n32', innerHash]
);

console.log('Calculated messageHashWithPrefix:', messageHashWithPrefix);
console.log('Expected messageHashWithPrefix:  ', '0x75b0af4f924ac22da614663da6e6588b87cbf99232a0ae52da9db978b6806190');
