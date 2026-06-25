import { registerAs } from '@nestjs/config';

export default registerAs('relayer', () => ({
  privateKey: process.env.RELAYER_PRIVATE_KEY || '',
  rpcUrl: process.env.BSC_TESTNET_RPC_URL || process.env.RPC_URL || 'http://localhost:8545',
  contractAddress: process.env.ERC8004_CONTRACT_ADDRESS || '',
  usdcAddress: process.env.USDC_ADDRESS || '',
  batchSize: parseInt(process.env.RELAYER_BATCH_SIZE || '10', 10),
  batchInterval: parseInt(process.env.RELAYER_BATCH_INTERVAL || '30000', 10), // 30 seconds
  maxRetries: parseInt(process.env.RELAYER_MAX_RETRIES || '3', 10),
  oldPaymentThreshold: parseInt(process.env.RELAYER_OLD_PAYMENT_THRESHOLD || '300000', 10), // 5 minutes
}));

