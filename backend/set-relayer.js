
require('dotenv').config();
const { JsonRpcProvider, Wallet, Contract } = require('ethers');

const RPC_URL = process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet.nodereal.io/v1/1eefed273dc64160afd5e328e6c518d6';
const ERC8004_ADDRESS = '0xFfEf72198A71B288EfE403AC07f9c60A1a99f29e';
const PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;

const ABI = [
  'function setRelayer(address _relayer) external',
  'function relayer() view returns (address)',
  'function owner() view returns (address)'
];

async function main() {
  if (!PRIVATE_KEY) {
    console.error('❌ RELAYER_PRIVATE_KEY not found in .env');
    return;
  }

  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const contract = new Contract(ERC8004_ADDRESS, ABI, wallet);

  console.log(`Wallet Address: ${wallet.address}`);
  console.log(`Contract: ${ERC8004_ADDRESS}`);

  const owner = await contract.owner();
  console.log(`Contract Owner: ${owner}`);

  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error('❌ Wallet is NOT the owner. Cannot set relayer.');
    return;
  }

  const currentRelayer = await contract.relayer();
  console.log(`Current Relayer: ${currentRelayer}`);

  if (currentRelayer.toLowerCase() === wallet.address.toLowerCase()) {
    console.log('✅ Relayer is already set correctly.');
    return;
  }

  console.log(`Setting relayer to ${wallet.address}...`);
  try {
    const tx = await contract.setRelayer(wallet.address);
    console.log(`Transaction sent: ${tx.hash}`);
    await tx.wait();
    console.log('✅ Relayer set successfully!');
    
    const newRelayer = await contract.relayer();
    console.log(`New Relayer: ${newRelayer}`);
  } catch (error) {
    console.error('❌ Failed to set relayer:', error);
  }
}

main();
