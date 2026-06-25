import { registerAs } from '@nestjs/config';

/**
 * ERC-4337 Account Abstraction configuration
 * Supports both BSC Testnet and future mainnet deployment
 */
export default registerAs('accountAbstraction', () => ({
  // EntryPoint v0.7 (default for BSC)
  entryPointAddress: process.env.ENTRYPOINT_ADDRESS || '',
  entryPointVersion: process.env.ENTRYPOINT_VERSION || 'v0.7',

  // Paymaster — Agentrix Verifying Paymaster (signs gasless ops)
  paymasterAddress: process.env.PAYMASTER_ADDRESS || '',
  paymasterSignerKey: process.env.PAYMASTER_SIGNER_KEY || '', // offchain signer for paymaster validation
  
  // Token Paymaster — accepts USDC for gas
  tokenPaymasterAddress: process.env.TOKEN_PAYMASTER_ADDRESS || '',
  gasPriceMarkup: parseInt(process.env.PAYMASTER_GAS_MARKUP || '10', 10), // 10% markup on gas cost when paying in USDC

  // Account Factory — deploys smart accounts
  accountFactoryAddress: process.env.ACCOUNT_FACTORY_ADDRESS || '',
  
  // Bundler (Pimlico / Stackup / self-hosted)
  bundlerUrl: process.env.BUNDLER_URL || '',
  bundlerApiKey: process.env.BUNDLER_API_KEY || '',

  // Gas policy
  maxGasSponsorPerUser: parseFloat(process.env.MAX_GAS_SPONSOR_PER_USER || '5'), // max $5 gas sponsored per user per day
  sponsoredChains: (process.env.SPONSORED_CHAINS || '97,56').split(',').map(Number), // BSC testnet + mainnet

  // Chain-specific EntryPoint addresses (ERC-4337 v0.7 canonical)
  entryPoints: {
    97:  process.env.ENTRYPOINT_ADDRESS_BSC_TESTNET || '0x0000000071727De22E5E9d8BAf0edAc6f37da032', // v0.7
    56:  process.env.ENTRYPOINT_ADDRESS_BSC || '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    1:   process.env.ENTRYPOINT_ADDRESS_ETH || '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
  },
}));
