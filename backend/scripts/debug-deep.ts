/**
 * 深度调试合约执行失败原因
 * 解码交易数据并模拟各个步骤
 */

import { ethers, Contract, Wallet, Interface } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const ERC8004_ADDRESS = '0xFfEf72198A71B288EfE403AC07f9c60A1a99f29e';
const USDT_ADDRESS = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
const COMMISSION_ADDRESS = '0x4d10DA389E0ADe7E7a7E3232531048aEaCa4021C';
const SESSION_ID = '0x174aef6f57ac7311b9d97e62750d990ecbbb8052f15ef32b7f5a04383058e7d5';
const USER_WALLET = '0xdf8e26fab0553ec755073f1c923c14942ad0d816';

const ERC8004_ABI = [
  'function sessions(bytes32) view returns (address signer, address owner, uint256 singleLimit, uint256 dailyLimit, uint256 usedToday, uint256 expiry, uint256 lastResetDate, bool isActive)',
  'function executeWithSession(bytes32 sessionId, address to, uint256 amount, bytes32 paymentId, bytes signature)',
  'function relayer() view returns (address)',
  'function usdcToken() view returns (address)',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

async function main() {
  const rpcUrl = process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet.nodereal.io/v1/1eefed273dc64160afd5e328e6c518d6';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  console.log('=== 深度调试合约执行失败 ===\n');
  
  // 获取失败交易的详情
  const failedTxHash = '0x08f1f73e4296751955d9b341e4da7108907d5955ea0465c1fc7cabd3cda6587e';
  
  console.log('1. 解析失败交易...');
  const tx = await provider.getTransaction(failedTxHash);
  const receipt = await provider.getTransactionReceipt(failedTxHash);
  
  if (!tx || !receipt) {
    console.log('   ❌ 交易未找到');
    return;
  }
  
  console.log(`   Transaction Hash: ${tx.hash}`);
  console.log(`   From: ${tx.from}`);
  console.log(`   To: ${tx.to}`);
  console.log(`   Status: ${receipt.status === 1 ? '成功' : '失败'}`);
  console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
  
  // 解码交易数据
  const iface = new Interface(ERC8004_ABI);
  
  try {
    const decoded = iface.parseTransaction({ data: tx.data });
    if (decoded) {
      console.log(`\n2. 解码调用参数...`);
      console.log(`   Function: ${decoded.name}`);
      console.log(`   Session ID: ${decoded.args[0]}`);
      console.log(`   To: ${decoded.args[1]}`);
      console.log(`   Amount: ${decoded.args[2]} (${Number(decoded.args[2]) / 1e6} in 6 decimals)`);
      console.log(`   Payment ID: ${decoded.args[3]}`);
      console.log(`   Signature: ${decoded.args[4].substring(0, 20)}...`);
      
      // 保存解码后的参数用于进一步分析
      const sessionId = decoded.args[0];
      const to = decoded.args[1];
      const amount = decoded.args[2];
      const paymentId = decoded.args[3];
      const signature = decoded.args[4];
      
      // 3. 检查合约状态
      console.log('\n3. 检查合约状态...');
      const sessionManager = new Contract(ERC8004_ADDRESS, ERC8004_ABI, provider);
      
      const session = await sessionManager.sessions(sessionId);
      console.log(`   Session Signer: ${session.signer}`);
      console.log(`   Session Owner: ${session.owner}`);
      console.log(`   Session Active: ${session.isActive}`);
      console.log(`   Single Limit: ${session.singleLimit} (${Number(session.singleLimit) / 1e6} USDC)`);
      console.log(`   Daily Limit: ${session.dailyLimit} (${Number(session.dailyLimit) / 1e6} USDC)`);
      console.log(`   Used Today: ${session.usedToday} (${Number(session.usedToday) / 1e6} USDC)`);
      
      // 4. 验证签名
      console.log('\n4. 验证签名...');
      const chainId = 97;
      
      // 构建消息哈希（与合约一致）
      const innerHash = ethers.solidityPackedKeccak256(
        ['bytes32', 'address', 'uint256', 'bytes32', 'uint256'],
        [sessionId, to, amount, paymentId, chainId]
      );
      
      const messageHash = ethers.solidityPackedKeccak256(
        ['string', 'bytes32'],
        ['\x19Ethereum Signed Message:\n32', innerHash]
      );
      
      console.log(`   Inner Hash: ${innerHash}`);
      console.log(`   Message Hash (with prefix): ${messageHash}`);
      
      // 恢复签名者
      try {
        const recoveredSigner = ethers.recoverAddress(messageHash, signature);
        console.log(`   Recovered Signer: ${recoveredSigner}`);
        console.log(`   Expected Signer: ${session.signer}`);
        
        if (recoveredSigner.toLowerCase() === session.signer.toLowerCase()) {
          console.log(`   ✅ 签名验证通过!`);
        } else {
          console.log(`   ❌ 签名验证失败! 签名者不匹配`);
        }
      } catch (e: any) {
        console.log(`   ❌ 签名恢复失败: ${e.message}`);
      }
      
      // 5. 检查 USDT 余额和授权
      console.log('\n5. 检查 USDT 余额和授权...');
      const usdt = new Contract(USDT_ADDRESS, ERC20_ABI, provider);
      const decimals = await usdt.decimals();
      
      // 计算实际转账金额（从 6 decimals 转换到 token decimals）
      const amountForTransfer = BigInt(amount) * BigInt(10 ** (Number(decimals) - 6));
      console.log(`   Token Decimals: ${decimals}`);
      console.log(`   Contract Amount (6 decimals): ${amount}`);
      console.log(`   Transfer Amount (${decimals} decimals): ${amountForTransfer}`);
      
      const balance = await usdt.balanceOf(session.owner);
      const allowance = await usdt.allowance(session.owner, ERC8004_ADDRESS);
      
      console.log(`   Owner Balance: ${ethers.formatUnits(balance, decimals)} USDT`);
      console.log(`   Allowance to SessionManager: ${ethers.formatUnits(allowance, decimals)} USDT`);
      
      if (balance >= amountForTransfer) {
        console.log(`   ✅ 余额充足`);
      } else {
        console.log(`   ❌ 余额不足!`);
      }
      
      if (allowance >= amountForTransfer) {
        console.log(`   ✅ 授权充足`);
      } else {
        console.log(`   ❌ 授权不足!`);
      }
      
      // 6. 检查限额
      console.log('\n6. 检查限额...');
      if (BigInt(amount) <= session.singleLimit) {
        console.log(`   ✅ 单笔限额检查通过: ${amount} <= ${session.singleLimit}`);
      } else {
        console.log(`   ❌ 超过单笔限额: ${amount} > ${session.singleLimit}`);
      }
      
      if (session.usedToday + BigInt(amount) <= session.dailyLimit) {
        console.log(`   ✅ 每日限额检查通过: ${session.usedToday} + ${amount} <= ${session.dailyLimit}`);
      } else {
        console.log(`   ❌ 超过每日限额: ${session.usedToday} + ${amount} > ${session.dailyLimit}`);
      }
      
      // 7. 检查 Relayer
      console.log('\n7. 检查 Relayer...');
      const relayer = await sessionManager.relayer();
      console.log(`   Contract Relayer: ${relayer}`);
      console.log(`   Transaction From: ${tx.from}`);
      
      if (relayer.toLowerCase() === tx.from.toLowerCase()) {
        console.log(`   ✅ Relayer 验证通过`);
      } else {
        console.log(`   ❌ Relayer 不匹配!`);
      }
      
      // 8. 检查 Token 地址
      console.log('\n8. 检查 Token 配置...');
      const configuredToken = await sessionManager.usdcToken();
      console.log(`   Configured Token: ${configuredToken}`);
      console.log(`   Expected USDT: ${USDT_ADDRESS}`);
      
      if (configuredToken.toLowerCase() === USDT_ADDRESS.toLowerCase()) {
        console.log(`   ✅ Token 地址匹配`);
      } else {
        console.log(`   ❌ Token 地址不匹配!`);
      }
      
    }
  } catch (e: any) {
    console.log(`   解码失败: ${e.message}`);
  }
  
  console.log('\n=== 深度调试完成 ===');
}

main().catch(console.error);
