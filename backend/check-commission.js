
require('dotenv').config();
const { JsonRpcProvider, Contract } = require('ethers');

const RPC_URL = process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet.nodereal.io/v1/1eefed273dc64160afd5e328e6c518d6';
const COMMISSION_ADDRESS = '0xa0C571F348Bc1C8E08F8fcFc8805254eF128B48D';
const BACKEND_WALLET = '0x2bee8AE78e4E41cf7facc4A4387A8F299dd2b8f3';

const ABI = [
  'function owner() view returns (address)'
];

async function main() {
  const provider = new JsonRpcProvider(RPC_URL);
  const contract = new Contract(COMMISSION_ADDRESS, ABI, provider);

  console.log(`Checking Commission Contract: ${COMMISSION_ADDRESS}`);
  
  try {
    const owner = await contract.owner();
    console.log(`Contract Owner: ${owner}`);
    console.log(`Backend Wallet: ${BACKEND_WALLET}`);
    
    if (owner.toLowerCase() === BACKEND_WALLET.toLowerCase()) {
      console.log('✅ Backend wallet IS the owner.');
    } else {
      console.log('❌ Backend wallet is NOT the owner.');
    }
  } catch (error) {
    console.error('Error reading contract:', error);
  }
}

main();
