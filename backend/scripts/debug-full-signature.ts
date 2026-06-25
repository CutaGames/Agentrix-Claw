/**
 * 完整的签名验证和执行调试脚本
 * 模拟前端签名 + 后端验证 + 合约调用
 */

import { ethers, Wallet, Contract, solidityPackedKeccak256, recoverAddress, keccak256, toUtf8Bytes, getBytes } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

const ERC8004_ADDRESS = '0xFfEf72198A71B288EfE403AC07f9c60A1a99f29e';
const USDT_ADDRESS = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
const COMMISSION_ADDRESS = '0x4d10DA389E0ADe7E7a7E3232531048aEaCa4021C';

// Session 信息
const SESSION_ID = '0x174aef6f57ac7311b9d97e62750d990ecbbb8052f15ef32b7f5a04383058e7d5';
const USER_WALLET = '0xdf8e26fab0553ec755073f1c923c14942ad0d816';
const SESSION_SIGNER = '0x2572bded06dB261d3FC0d8439ea8bb162e7ba1dC';

const ERC8004_ABI = [
  'function sessions(bytes32) view returns (address signer, address owner, uint256 singleLimit, uint256 dailyLimit, uint256 usedToday, uint256 expiry, uint256 lastResetDate, bool isActive)',
  'function executeWithSession(bytes32 sessionId, address to, uint256 amount, bytes32 paymentId, bytes signature)',
  'function token() view returns (address)',
  'event PaymentExecuted(bytes32 indexed sessionId, address indexed to, uint256 amount, bytes32 indexed paymentId)',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

async function main() {
  const rpcUrl = process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet.nodereal.io/v1/1eefed273dc64160afd5e328e6c518d6';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
  if (!relayerPrivateKey) {
    console.error('RELAYER_PRIVATE_KEY not set!');
    return;
  }
  
  const relayerWallet = new Wallet(relayerPrivateKey, provider);
  console.log('=== 完整签名验证和执行调试 ===\n');
  console.log(`Relayer 地址: ${relayerWallet.address}`);
  
  // 1. 获取 Session 信息
  const sessionManager = new Contract(ERC8004_ADDRESS, ERC8004_ABI, provider);
  
  console.log('\n1. 获取 Session 信息...');
  const session = await sessionManager.sessions(SESSION_ID);
  console.log(`   Signer: ${session.signer}`);
  console.log(`   Owner: ${session.owner}`);
  console.log(`   Single Limit: ${session.singleLimit} (${Number(session.singleLimit) / 1e6} in 6 dec)`);
  console.log(`   Is Active: ${session.isActive}`);
  
  // 2. 检查 Session Key
  console.log('\n2. 检查 Session Key...');
  console.log(`   期望 Signer: ${SESSION_SIGNER}`);
  console.log(`   实际 Signer: ${session.signer}`);
  if (session.signer.toLowerCase() === SESSION_SIGNER.toLowerCase()) {
    console.log(`   ✅ Signer 匹配`);
  } else {
    console.log(`   ❌ Signer 不匹配!`);
  }
  
  // 3. 检查 USDT 余额和授权
  console.log('\n3. 检查 USDT 余额和授权...');
  const usdt = new Contract(USDT_ADDRESS, ERC20_ABI, provider);
  const balance = await usdt.balanceOf(USER_WALLET);
  const allowance = await usdt.allowance(USER_WALLET, ERC8004_ADDRESS);
  console.log(`   用户余额: ${ethers.formatUnits(balance, 18)} USDT`);
  console.log(`   授权给 SessionManager: ${ethers.formatUnits(allowance, 18)} USDT`);
  
  // 4. 模拟签名
  console.log('\n4. 模拟签名过程...');
  
  const testPaymentId = 'test-payment-' + Date.now();
  const paymentIdBytes32 = keccak256(toUtf8Bytes(testPaymentId));
  const amount6Decimals = 100000n; // 0.1 USDT in 6 decimals
  const chainId = 97;
  
  console.log(`   Payment ID: ${testPaymentId}`);
  console.log(`   Payment ID Bytes32: ${paymentIdBytes32}`);
  console.log(`   Amount (6 decimals): ${amount6Decimals}`);
  console.log(`   Recipient: ${COMMISSION_ADDRESS}`);
  console.log(`   Chain ID: ${chainId}`);
  
  // 构建消息哈希（与合约一致）
  const innerHash = solidityPackedKeccak256(
    ['bytes32', 'address', 'uint256', 'bytes32', 'uint256'],
    [SESSION_ID, COMMISSION_ADDRESS, amount6Decimals, paymentIdBytes32, chainId]
  );
  console.log(`   Inner Hash: ${innerHash}`);
  
  // 5. 检查 Session Key Manager 中是否有私钥
  console.log('\n5. 检查 Session Key...');
  console.log(`   ⚠️ Session Key 私钥存储在用户浏览器的 localStorage 中`);
  console.log(`   我们无法在后端模拟签名，除非有 Session Key 的私钥`);
  
  // 6. 尝试使用 Relayer 调用合约查看错误
  console.log('\n6. 尝试调用合约（使用假签名）...');
  
  const sessionManagerWithSigner = new Contract(ERC8004_ADDRESS, ERC8004_ABI, relayerWallet);
  
  // 创建一个假签名（65 字节）
  const fakeSignature = '0x' + '00'.repeat(65);
  
  try {
    // 使用 staticCall 测试
    await sessionManagerWithSigner.executeWithSession.staticCall(
      SESSION_ID,
      COMMISSION_ADDRESS,
      amount6Decimals,
      paymentIdBytes32,
      fakeSignature
    );
    console.log('   ✅ Static call 成功（不应该发生，因为签名是假的）');
  } catch (error: any) {
    console.log(`   ❌ Static call 失败: ${error.message}`);
    
    if (error.message.includes('Invalid signature')) {
      console.log(`   📍 错误原因: 签名验证失败（这是预期的，因为我们使用了假签名）`);
    } else if (error.message.includes('require(false)')) {
      console.log(`   📍 错误原因: 合约内部有 require(false)`);
      console.log(`   这可能意味着合约中有某个检查失败了`);
    } else if (error.message.includes('Session not active')) {
      console.log(`   📍 错误原因: Session 未激活`);
    } else if (error.message.includes('Limit exceeded')) {
      console.log(`   📍 错误原因: 超过限额`);
    }
  }
  
  // 7. 解码最近一次失败交易的 call data
  console.log('\n7. 解码失败交易的 call data...');
  const failedTxHash = '0x08f1f73e4296751955d9b341e4da7108907d5955ea0465c1fc7cabd3cda6587e';
  
  try {
    const tx = await provider.getTransaction(failedTxHash);
    if (tx && tx.data) {
      console.log(`   交易数据长度: ${tx.data.length} 字符`);
      console.log(`   函数选择器: ${tx.data.substring(0, 10)}`);
      
      // 手动解码
      // executeWithSession(bytes32, address, uint256, bytes32, bytes)
      // 选择器: 0x91170e47
      const data = tx.data;
      if (data.startsWith('0x91170e47')) {
        console.log(`   ✅ 函数选择器匹配 executeWithSession`);
        
        // 解码参数 (去掉选择器的 10 个字符)
        const params = data.substring(10);
        const sessionId = '0x' + params.substring(0, 64);
        const to = '0x' + params.substring(64, 128).substring(24); // 地址是 20 字节
        const amount = BigInt('0x' + params.substring(128, 192));
        const paymentId = '0x' + params.substring(192, 256);
        
        console.log(`   Session ID: ${sessionId}`);
        console.log(`   To: ${to}`);
        console.log(`   Amount: ${amount} (${Number(amount) / 1e6} in 6 dec)`);
        console.log(`   Payment ID: ${paymentId}`);
        
        // 检查金额是否超过限额
        if (amount > session.singleLimit) {
          console.log(`   ❌ 金额 ${amount} 超过 singleLimit ${session.singleLimit}!`);
        } else {
          console.log(`   ✅ 金额在限额范围内`);
        }
        
        // 检查 To 地址是否有效
        if (to.toLowerCase() === '0x0000000000000000000000000000000000000000') {
          console.log(`   ❌ 收款地址是零地址!`);
        }
      }
    } else {
      console.log(`   ⚠️ 交易未找到或数据为空`);
    }
  } catch (error: any) {
    console.log(`   ❌ 获取交易失败: ${error.message}`);
  }
  
  // 8. 查看合约的 event logs 获取更多信息
  console.log('\n8. 检查合约事件日志...');
  try {
    const filter = sessionManager.filters.PaymentExecuted(SESSION_ID);
    const events = await sessionManager.queryFilter(filter, -1000); // 最近 1000 个区块
    console.log(`   找到 ${events.length} 个 PaymentExecuted 事件`);
    
    for (const event of events) {
      console.log(`   - Block ${event.blockNumber}: ${event}`);
    }
  } catch (error: any) {
    console.log(`   ⚠️ 查询事件失败: ${error.message}`);
  }
  
  console.log('\n=== 调试完成 ===');
  console.log('\n📋 总结:');
  console.log(`   1. Session 存在且激活: ${session.isActive}`);
  console.log(`   2. Session Owner 匹配: ${session.owner.toLowerCase() === USER_WALLET.toLowerCase()}`);
  console.log(`   3. Session Signer: ${session.signer}`);
  console.log(`   4. USDT 余额: ${ethers.formatUnits(balance, 18)} USDT`);
  console.log(`   5. USDT 授权: ${ethers.formatUnits(allowance, 18)} USDT`);
  
  console.log('\n⚠️ 下一步:');
  console.log('   请检查前端签名时使用的参数是否与后端验证一致');
  console.log('   特别注意: amount, to, paymentId, chainId 是否完全一致');
}

main().catch(console.error);
