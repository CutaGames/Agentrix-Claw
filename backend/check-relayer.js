
const { JsonRpcProvider, Contract } = require('ethers');

const RPC_URL = 'https://bsc-testnet.nodereal.io/v1/1eefed273dc64160afd5e328e6c518d6';
const ERC8004_ADDRESS = '0xFfEf72198A71B288EfE403AC07f9c60A1a99f29e';
const RELAYER_WALLET = '0x2bee8AE78e4E41cf7facc4A4387A8F299dd2b8f3';

const ABI = [
  'function relayer() view returns (address)',
  'function owner() view returns (address)'
];

async function main() {
  const provider = new JsonRpcProvider(RPC_URL);
  const contract = new Contract(ERC8004_ADDRESS, ABI, provider);

  console.log(`Checking Relayer on contract: ${ERC8004_ADDRESS}`);
  
  try {
    const currentRelayer = await contract.relayer();
    const owner = await contract.owner();
    
    console.log(`Current Relayer: ${currentRelayer}`);
    console.log(`Contract Owner:  ${owner}`);
    console.log(`Backend Wallet:  ${RELAYER_WALLET}`);
    
    if (currentRelayer.toLowerCase() === RELAYER_WALLET.toLowerCase()) {
      console.log('✅ Backend wallet IS the configured relayer.');
    } else {
      console.log('❌ Backend wallet is NOT the configured relayer.');
    }
  } catch (error) {
    console.error('Error reading contract:', error);
  }
}

main();
