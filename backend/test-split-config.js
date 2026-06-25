
require('dotenv').config();
const { JsonRpcProvider, Wallet, Contract, ZeroAddress } = require('ethers');

const RPC_URL = process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet.nodereal.io/v1/1eefed273dc64160afd5e328e6c518d6';
const COMMISSION_ADDRESS = '0xa0C571F348Bc1C8E08F8fcFc8805254eF128B48D';
const PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;

const ABI = [
  'function setSplitConfig(bytes32 orderId, tuple(address merchantMPCWallet, uint256 merchantAmount, address referrer, uint256 referralFee, address executor, uint256 executionFee, uint256 platformFee, uint256 offRampFee, bool executorHasWallet, uint256 settlementTime, bool isDisputed) config) external'
];

async function main() {
  if (!PRIVATE_KEY) {
    console.error('❌ RELAYER_PRIVATE_KEY not found');
    return;
  }

  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const contract = new Contract(COMMISSION_ADDRESS, ABI, wallet);

  const dummyOrderId = '0x' + '1'.repeat(64);
  const dummyConfig = {
    merchantMPCWallet: wallet.address,
    merchantAmount: 100,
    referrer: ZeroAddress,
    referralFee: 0,
    executor: ZeroAddress,
    executionFee: 0,
    platformFee: 0,
    offRampFee: 0,
    executorHasWallet: false,
    settlementTime: 0,
    isDisputed: false
  };

  console.log(`Testing setSplitConfig on ${COMMISSION_ADDRESS}...`);
  
  try {
    // Try static call first
    await contract.setSplitConfig.staticCall(dummyOrderId, dummyConfig);
    console.log('✅ Static call successful. Function exists and works.');
  } catch (error) {
    console.error('❌ Static call failed:', error.message);
    if (error.data) console.error('Error data:', error.data);
  }
}

main();
