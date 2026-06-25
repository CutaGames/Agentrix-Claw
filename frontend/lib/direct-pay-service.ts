import { ethers } from 'ethers';
import { SessionKeyManager } from './session-key-manager';
import { paymentApi } from './api/payment.api';

export interface DirectPayOrder {
  id: string;
  amount: number;
  currency: string;
  description: string;
  merchantId: string;
  to?: string;
  metadata?: Record<string, any>;
}

export async function executeDirectQuickPay(
  order: DirectPayOrder,
  session: any,
  userProfile: any,
  options?: {
    exchangeRate?: number;
    cryptoAmount?: number;
    exchangeRateLockId?: string;
  }
) {
  if (!userProfile) {
    throw new Error('User not logged in');
  }

  if (!session) {
    throw new Error('No active session found');
  }

  const sessionKeys = await SessionKeyManager.listSessionKeys();
  const hasLocalSessionKey = sessionKeys.includes(session.signer);
  
  if (!hasLocalSessionKey) {
    throw new Error('Session key missing in local storage. Please re-create QuickPay session.');
  }

  let paymentAmount = order.amount;
  let paymentCurrency = order.currency || 'USDC';
  let lockId = options?.exchangeRateLockId;
  
  const currency = (order.currency || 'USDC').toUpperCase();
  const isFiatCurrency = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'INR'].includes(currency);
  
  // Fiat handling (CNY -> USDT etc)
  if (isFiatCurrency) {
    if (options?.exchangeRate && options?.cryptoAmount) {
      paymentAmount = options.cryptoAmount;
      paymentCurrency = 'USDT';
    } else {
      // Try to get exchange rate if not provided
      console.log('Fetching exchange rate for direct pay...');
      const rateResult = await paymentApi.getExchangeRate(currency, 'USDT');
      const cryptoAmt = order.amount / rateResult.rate;
      
      // Auto-lock
      const lockResult = await paymentApi.lockExchangeRate({
        from: currency,
        to: 'USDT',
        amount: order.amount,
        expiresIn: 300,
      });
      lockId = lockResult.lockId;
      paymentAmount = lockResult.cryptoAmount;
      paymentCurrency = 'USDT';
    }
  }

  // Get token metadata (simplified, normally from a central registry or hook)
  // Defaulting to 6 for USDT/USDC on BSC Testnet if unknown
  const TOKEN_CONFIG: Record<string, number> = {
    'USDT': 18, // BSC Testnet USDT is often 18
    'USDC': 18,
    'BNB': 18,
  };
  const tokenDecimals = TOKEN_CONFIG[paymentCurrency] || 18;
  const paymentAmountInSmallestUnit = ethers.parseUnits(paymentAmount.toFixed(tokenDecimals < 6 ? tokenDecimals : 6), tokenDecimals);

  // ERC8004 Signature Logic (Using 6 decimals)
  const contractDecimals = 6;
  let amountForSignature: bigint;
  
  if (tokenDecimals > contractDecimals) {
    const decimalDiff = tokenDecimals - contractDecimals;
    const divisor = BigInt(Math.pow(10, decimalDiff));
    amountForSignature = BigInt(paymentAmountInSmallestUnit.toString()) / divisor;
  } else if (tokenDecimals < contractDecimals) {
    const decimalDiff = contractDecimals - tokenDecimals;
    const multiplier = BigInt(Math.pow(10, decimalDiff));
    amountForSignature = BigInt(paymentAmountInSmallestUnit.toString()) * multiplier;
  } else {
    amountForSignature = BigInt(paymentAmountInSmallestUnit.toString());
  }

  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 97);
  const orderIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(order.id)) as `0x${string}`;
  
  let recipientAddress: string;
  try {
    const contractInfo = await paymentApi.getContractAddress();
    recipientAddress = contractInfo.commissionContractAddress;
  } catch (e) {
    recipientAddress = process.env.NEXT_PUBLIC_COMMISSION_CONTRACT_ADDRESS || order.to || '';
  }

  if (!recipientAddress) {
    throw new Error('No recipient address (Commission Contract or Merchant) available');
  }

  const sessionIdBytes32 = session.sessionId as `0x${string}`;
  const innerHash = ethers.solidityPackedKeccak256(
    ['bytes32', 'address', 'uint256', 'bytes32', 'uint256'],
    [sessionIdBytes32, recipientAddress, amountForSignature, orderIdBytes32, chainId]
  );

  const signature = await SessionKeyManager.signWithSessionKey(session.signer, innerHash);

  // Call Backend process
  const result = await paymentApi.process({
    amount: order.amount,
    currency: order.currency,
    paymentMethod: 'x402',
    merchantId: order.merchantId,
    description: order.description,
    agentId: order.metadata?.agentId,
    metadata: {
      ...order.metadata,
      sessionId: session.sessionId,
      signature,
      amountInSmallestUnit: amountForSignature.toString(),
      tokenDecimals: contractDecimals,
      to: recipientAddress,
      exchangeRateLockId: lockId,
      isOnChain: true,
      quickPayType: 'x402',
      isClosedLoop: true, // Tag for analytics/logging
    }
  });

  return result;
}
