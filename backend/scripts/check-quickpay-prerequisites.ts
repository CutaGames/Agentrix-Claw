/**
 * 检查 QuickPay 支付的必要条件
 * 用法: npx ts-node scripts/check-quickpay-prerequisites.ts <sessionId> <userAddress>
 */

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

const SESSION_MANAGER_ABI = [
  'function sessions(bytes32) view returns (address owner, address signer, uint256 singleLimit, uint256 dailyLimit, uint256 usedToday, uint256 expiry, uint256 lastResetDate, bool isActive)',
  'function relayer() view returns (address)',
  'function usdcToken() view returns (address)',
];

async function main() {
  const sessionId = process.argv[2];
  const userAddress = process.argv[3];

  if (!sessionId || !userAddress) {
    console.log('用法: npx ts-node scripts/check-quickpay-prerequisites.ts <sessionId> <userAddress>');
    console.log('示例: npx ts-node scripts/check-quickpay-prerequisites.ts 0xb561917dcd7b2e34c5fb0afbfb2900d5b61c5f6a3ab7994f4e05b962f9d7f16d 0xdf8e26fab0553ec755073f1c923c14942ad0d816');
    process.exit(1);
  }

  const rpcUrl = process.env.BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.bnbchain.org:8545';
  // 支持多种环境变量名
  const sessionManagerAddress = process.env.ERC8004_CONTRACT_ADDRESS || process.env.ERC8004_SESSION_MANAGER_ADDRESS;
  const commissionAddress = process.env.COMMISSION_CONTRACT_ADDRESS;
  const relayerAddress = process.env.RELAYER_WALLET_ADDRESS;

  if (!sessionManagerAddress) {
    console.error('❌ ERC8004_CONTRACT_ADDRESS 或 ERC8004_SESSION_MANAGER_ADDRESS 未配置');
    process.exit(1);
  }

  console.log('\n=== QuickPay 支付前置条件检查 ===\n');
  console.log('配置信息:');
  console.log(`  RPC: ${rpcUrl}`);
  console.log(`  ERC8004SessionManager: ${sessionManagerAddress}`);
  console.log(`  Commission Contract: ${commissionAddress || '未配置'}`);
  console.log(`  Relayer Wallet: ${relayerAddress || '未配置'}`);
  console.log(`  Session ID: ${sessionId}`);
  console.log(`  User Address: ${userAddress}`);
  console.log('');

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const sessionManager = new ethers.Contract(sessionManagerAddress, SESSION_MANAGER_ABI, provider);
  
  // 实际使用的用户地址（可能是 Session Owner）
  let actualUserAddress = userAddress;

  // 1. 检查 Session
  console.log('1. 检查 Session 状态...');
  try {
    const session = await sessionManager.sessions(sessionId);
    console.log(`  ✅ Session 存在`);
    console.log(`     Owner: ${session.owner}`);
    console.log(`     Signer: ${session.signer}`);
    console.log(`     Single Limit: ${ethers.formatUnits(session.singleLimit, 6)} USDC`);
    console.log(`     Daily Limit: ${ethers.formatUnits(session.dailyLimit, 6)} USDC`);
    console.log(`     Used Today: ${ethers.formatUnits(session.usedToday, 6)} USDC`);
    console.log(`     Expiry: ${new Date(Number(session.expiry) * 1000).toISOString()}`);
    console.log(`     Is Active: ${session.isActive}`);
    
    if (!session.isActive) {
      console.log(`  ❌ Session 未激活！`);
    }
    
    if (Number(session.expiry) * 1000 < Date.now()) {
      console.log(`  ❌ Session 已过期！`);
    }

    // 检查 owner 是否匹配
    if (session.owner.toLowerCase() !== userAddress.toLowerCase()) {
      console.log(`  ⚠️ Session owner (${session.owner}) 与提供的用户地址 (${userAddress}) 不匹配`);
      console.log(`  ⚠️ 注意：资金将从 Session Owner (${session.owner}) 钱包转出！`);
      console.log(`  ⚠️ 请检查 Owner 钱包的余额和授权，而不是 Signer 钱包！`);
      // 使用 session.owner 作为实际的用户地址
      actualUserAddress = session.owner;
    }
  } catch (error: any) {
    console.log(`  ❌ 无法获取 Session: ${error.message}`);
    process.exit(1);
  }

  // 2. 检查 Relayer...
  console.log('\n2. 检查 Relayer...');
  try {
    const contractRelayer = await sessionManager.relayer();
    console.log(`  Contract Relayer: ${contractRelayer}`);
    
    if (relayerAddress && contractRelayer.toLowerCase() !== relayerAddress.toLowerCase()) {
      console.log(`  ⚠️ 配置的 Relayer (${relayerAddress}) 与合约中的 Relayer (${contractRelayer}) 不匹配`);
    } else if (relayerAddress) {
      console.log(`  ✅ Relayer 地址匹配`);
    }

    // 检查 Relayer 余额
    if (relayerAddress) {
      const relayerBalance = await provider.getBalance(relayerAddress);
      console.log(`  Relayer BNB Balance: ${ethers.formatEther(relayerBalance)} BNB`);
      if (relayerBalance === 0n) {
        console.log(`  ❌ Relayer 钱包没有 BNB，无法支付 Gas！`);
      }
    }
  } catch (error: any) {
    console.log(`  ❌ 无法获取 Relayer: ${error.message}`);
  }

  // 3. 检查 Token (USDT)
  console.log('\n3. 检查 Token (USDT)...');
  console.log(`  检查地址（Session Owner）: ${actualUserAddress}`);
  try {
    const tokenAddress = await sessionManager.usdcToken();
    console.log(`  Token Address: ${tokenAddress}`);
    
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const decimals = await token.decimals();
    const symbol = await token.symbol();
    
    console.log(`  Token: ${symbol} (${decimals} decimals)`);
    
    // 检查 Session Owner 的余额（资金从 Owner 转出）
    const ownerBalance = await token.balanceOf(actualUserAddress);
    console.log(`  Owner Balance: ${ethers.formatUnits(ownerBalance, decimals)} ${symbol}`);
    
    if (ownerBalance === 0n) {
      console.log(`  ❌ Session Owner 没有 ${symbol} 余额！`);
    }

    // 检查 Session Owner 对 SessionManager 的授权
    const allowanceToSessionManager = await token.allowance(actualUserAddress, sessionManagerAddress);
    console.log(`  Owner Allowance to SessionManager: ${ethers.formatUnits(allowanceToSessionManager, decimals)} ${symbol}`);
    
    if (allowanceToSessionManager === 0n) {
      console.log(`  ❌ Session Owner 没有授权 ${symbol} 给 SessionManager！`);
      console.log(`     请先调用 approve(${sessionManagerAddress}, amount) 进行授权`);
    }

    // 如果有 Commission 合约，也检查对它的授权
    if (commissionAddress) {
      const allowanceToCommission = await token.allowance(actualUserAddress, commissionAddress);
      console.log(`  Owner Allowance to Commission: ${ethers.formatUnits(allowanceToCommission, decimals)} ${symbol}`);
      
      if (allowanceToCommission === 0n) {
        console.log(`  ⚠️ Session Owner 没有授权 ${symbol} 给 Commission 合约（如果使用 Commission 分佣可能需要）`);
      }
    }

  } catch (error: any) {
    console.log(`  ❌ 无法获取 Token 信息: ${error.message}`);
  }

  // 4. 总结
  console.log('\n=== 检查完成 ===\n');
  console.log('如果所有检查都通过，请确保：');
  console.log('1. 前端签名使用的金额是 6 decimals');
  console.log('2. 后端传递给合约的金额也是 6 decimals');
  console.log('3. 签名中的收款地址与实际调用的一致（应该是 Commission 合约地址）');
  console.log('4. 签名中的 orderId/paymentId 与实际调用的一致');
  console.log('5. chainId 正确（BSC Testnet = 97）');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
