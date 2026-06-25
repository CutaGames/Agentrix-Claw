import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JsonRpcProvider,
  Wallet,
  AbiCoder,
  keccak256,
  solidityPackedKeccak256,
  getBytes,
  concat,
  toBeHex,
  zeroPadValue,
  Contract,
} from 'ethers';

/**
 * UserOperation struct (ERC-4337 v0.7)
 */
export interface PackedUserOperation {
  sender: string;
  nonce: string;
  initCode: string;
  callData: string;
  accountGasLimits: string; // packed: verificationGasLimit (16 bytes) + callGasLimit (16 bytes)
  preVerificationGas: string;
  gasFees: string; // packed: maxPriorityFeePerGas (16 bytes) + maxFeePerGas (16 bytes)
  paymasterAndData: string;
  signature: string;
}

/**
 * Paymaster validation result
 */
export interface PaymasterValidation {
  approved: boolean;
  paymasterAndData: string;
  reason?: string;
}

/**
 * Gas sponsorship policy
 */
export interface SponsorshipPolicy {
  userId: string;
  dailySpentUsd: number;
  dailyLimitUsd: number;
  isWhitelisted: boolean;
  sponsorshipType: 'full' | 'token' | 'none';
}

/**
 * ERC-4337 Paymaster Service
 * 
 * Two modes:
 * 1. Verifying Paymaster: Platform signs and sponsors gas (for onboarding / small txs)
 * 2. Token Paymaster: User pays gas in USDC (for regular usage, avoids holding BNB)
 * 
 * Flow:
 *   Frontend builds UserOp → requests paymaster signature → Paymaster validates policy
 *   → signs paymasterAndData → Frontend submits to bundler
 * 
 * Commission integration:
 *   Gas cost is tracked separately from commission. Commission split (merchant 76.92% +
 *   execution 7.69% + platform 11.54% + referral 3.85%) applies to the PAYMENT amount,
 *   NOT the gas. Gas is either sponsored or deducted as a separate USDC fee.
 */
@Injectable()
export class PaymasterService {
  private readonly logger = new Logger(PaymasterService.name);
  private paymasterSigner: Wallet | null = null;
  private provider: JsonRpcProvider | null = null;
  private readonly dailySpending = new Map<string, { amount: number; date: string }>();

  constructor(private configService: ConfigService) {
    this.initialize();
  }

  private initialize() {
    const signerKey = this.configService.get<string>('accountAbstraction.paymasterSignerKey');
    const rpcUrl = this.configService.get<string>('RPC_URL')
      || this.configService.get<string>('BSC_TESTNET_RPC_URL')
      || 'https://data-seed-prebsc-1-s1.binance.org:8545';

    if (signerKey) {
      this.provider = new JsonRpcProvider(rpcUrl);
      this.paymasterSigner = new Wallet(signerKey, this.provider);
      this.logger.log('Paymaster signer initialized');
    } else {
      this.logger.warn('PAYMASTER_SIGNER_KEY not set — paymaster signing disabled (mock mode)');
    }
  }

  /**
   * Check if paymaster is available for a given chain
   */
  isAvailable(chainId: number = 97): boolean {
    const sponsoredChains = this.configService.get<number[]>('accountAbstraction.sponsoredChains') || [97];
    const paymasterAddr = this.configService.get<string>('accountAbstraction.paymasterAddress');
    return !!paymasterAddr && !!this.paymasterSigner && sponsoredChains.includes(chainId);
  }

  /**
   * Evaluate sponsorship policy for a user
   * Determines whether gas is fully sponsored, paid in USDC, or not sponsored
   */
  async evaluatePolicy(userId: string): Promise<SponsorshipPolicy> {
    const maxDaily = this.configService.get<number>('accountAbstraction.maxGasSponsorPerUser') || 5;
    const today = new Date().toISOString().split('T')[0];
    
    const record = this.dailySpending.get(userId);
    const dailySpent = (record && record.date === today) ? record.amount : 0;

    // Policy: sponsor up to $5/day/user fully; above that, user pays in USDC
    return {
      userId,
      dailySpentUsd: dailySpent,
      dailyLimitUsd: maxDaily,
      isWhitelisted: true, // TODO: check whitelist from DB
      sponsorshipType: dailySpent < maxDaily ? 'full' : 'token',
    };
  }

  /**
   * Generate paymasterAndData for a UserOperation
   * 
   * For Verifying Paymaster:
   *   paymasterAndData = paymasterAddress + validUntil + validAfter + signature
   * 
   * For Token Paymaster:
   *   paymasterAndData = tokenPaymasterAddress + token + exchangeRate + signature
   */
  async signUserOperation(
    userOp: PackedUserOperation,
    userId: string,
    mode: 'sponsor' | 'token' = 'sponsor',
  ): Promise<PaymasterValidation> {
    // Check if paymaster is configured
    if (!this.paymasterSigner) {
      // Mock mode: return mock paymasterAndData for development
      return this.mockPaymasterValidation(userOp, userId, mode);
    }

    const policy = await this.evaluatePolicy(userId);

    if (mode === 'sponsor' && policy.sponsorshipType === 'none') {
      return { approved: false, paymasterAndData: '0x', reason: 'Sponsorship limit exceeded' };
    }

    if (mode === 'sponsor') {
      return this.signVerifyingPaymaster(userOp, userId, policy);
    } else {
      return this.signTokenPaymaster(userOp, userId);
    }
  }

  /**
   * Verifying Paymaster: Platform pays gas
   */
  private async signVerifyingPaymaster(
    userOp: PackedUserOperation,
    userId: string,
    policy: SponsorshipPolicy,
  ): Promise<PaymasterValidation> {
    const paymasterAddress = this.configService.get<string>('accountAbstraction.paymasterAddress')!;
    
    // Valid for 10 minutes
    const validAfter = Math.floor(Date.now() / 1000);
    const validUntil = validAfter + 600;

    // Hash the UserOp fields for paymaster signature
    const hash = this.hashUserOpForPaymaster(userOp, paymasterAddress, validUntil, validAfter);
    const signature = await this.paymasterSigner!.signMessage(getBytes(hash));

    // Pack: paymasterAddress (20 bytes) + validUntil (6 bytes) + validAfter (6 bytes) + signature (65 bytes)
    const abiCoder = AbiCoder.defaultAbiCoder();
    const paymasterAndData = concat([
      paymasterAddress,
      abiCoder.encode(['uint48', 'uint48'], [validUntil, validAfter]),
      signature,
    ]);

    // Track spending
    this.trackSpending(userId, 0.001); // ~$0.001 gas on BSC

    this.logger.debug(`Paymaster signed for user ${userId} (sponsor mode)`);
    return { approved: true, paymasterAndData };
  }

  /**
   * Token Paymaster: User pays gas in USDC
   */
  private async signTokenPaymaster(
    userOp: PackedUserOperation,
    userId: string,
  ): Promise<PaymasterValidation> {
    const tokenPaymasterAddress = this.configService.get<string>('accountAbstraction.tokenPaymasterAddress');
    if (!tokenPaymasterAddress) {
      return { approved: false, paymasterAndData: '0x', reason: 'Token paymaster not deployed' };
    }

    const usdcAddress = this.configService.get<string>('USDC_ADDRESS') || '';
    const markup = this.configService.get<number>('accountAbstraction.gasPriceMarkup') || 10;

    // Get current gas price and calculate USDC cost
    const gasPrice = await this.provider!.getFeeData();
    const gasCostWei = BigInt(userOp.preVerificationGas) * (gasPrice.gasPrice || BigInt(5e9));
    
    // Convert BNB gas cost to USDC (simplified: 1 BNB ≈ $600)
    const bnbPriceUsd = 600;
    const gasCostUsd = Number(gasCostWei) / 1e18 * bnbPriceUsd;
    const usdcAmount = gasCostUsd * (1 + markup / 100);

    // Sign with exchange rate
    const abiCoder = AbiCoder.defaultAbiCoder();
    const exchangeRate = Math.floor(usdcAmount * 1e6); // USDC has 6 decimals

    const hash = solidityPackedKeccak256(
      ['address', 'address', 'uint256', 'uint256'],
      [tokenPaymasterAddress, usdcAddress, exchangeRate, Math.floor(Date.now() / 1000) + 600],
    );
    const signature = await this.paymasterSigner!.signMessage(getBytes(hash));

    const paymasterAndData = concat([
      tokenPaymasterAddress,
      abiCoder.encode(['address', 'uint256'], [usdcAddress, exchangeRate]),
      signature,
    ]);

    this.logger.debug(`Token paymaster signed for user ${userId}: ~$${usdcAmount.toFixed(4)} USDC`);
    return { approved: true, paymasterAndData };
  }

  /**
   * Mock paymaster for development/testing
   */
  private mockPaymasterValidation(
    userOp: PackedUserOperation,
    userId: string,
    mode: string,
  ): PaymasterValidation {
    this.logger.debug(`[MOCK] Paymaster validation for user ${userId}, mode=${mode}`);
    return {
      approved: true,
      paymasterAndData: '0x' + '00'.repeat(20) + '00'.repeat(12) + '00'.repeat(65),
      reason: 'mock',
    };
  }

  /**
   * Hash UserOp fields for paymaster signature verification
   */
  private hashUserOpForPaymaster(
    userOp: PackedUserOperation,
    paymasterAddress: string,
    validUntil: number,
    validAfter: number,
  ): string {
    return solidityPackedKeccak256(
      ['address', 'uint256', 'bytes32', 'bytes32', 'uint256', 'uint256', 'uint48', 'uint48'],
      [
        userOp.sender,
        userOp.nonce,
        keccak256(userOp.initCode),
        keccak256(userOp.callData),
        userOp.preVerificationGas,
        userOp.accountGasLimits,
        validUntil,
        validAfter,
      ],
    );
  }

  /**
   * Track daily gas spending per user
   */
  private trackSpending(userId: string, amountUsd: number) {
    const today = new Date().toISOString().split('T')[0];
    const record = this.dailySpending.get(userId);
    if (record && record.date === today) {
      record.amount += amountUsd;
    } else {
      this.dailySpending.set(userId, { amount: amountUsd, date: today });
    }
  }

  /**
   * Get gas sponsorship status for a user (for frontend display)
   */
  async getSponsorshipStatus(userId: string, chainId: number = 97): Promise<{
    available: boolean;
    mode: 'sponsor' | 'token' | 'none';
    dailySpentUsd: number;
    dailyLimitUsd: number;
    paymasterAddress: string;
    tokenPaymasterAddress: string;
  }> {
    const policy = await this.evaluatePolicy(userId);
    return {
      available: this.isAvailable(chainId),
      mode: policy.sponsorshipType === 'full' ? 'sponsor' : policy.sponsorshipType === 'token' ? 'token' : 'none',
      dailySpentUsd: policy.dailySpentUsd,
      dailyLimitUsd: policy.dailyLimitUsd,
      paymasterAddress: this.configService.get<string>('accountAbstraction.paymasterAddress') || '',
      tokenPaymasterAddress: this.configService.get<string>('accountAbstraction.tokenPaymasterAddress') || '',
    };
  }
}
