/**
 * 使用 debug_traceCall 获取更详细的执行轨迹
 */

import { ethers, Contract, Wallet } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const ERC8004_ADDRESS = '0xFfEf72198A71B288EfE403AC07f9c60A1a99f29e';
const SESSION_ID = '0x174aef6f57ac7311b9d97e62750d990ecbbb8052f15ef32b7f5a04383058e7d5';

const ERC8004_ABI = [
  'function sessions(bytes32) view returns (address signer, address owner, uint256 singleLimit, uint256 dailyLimit, uint256 usedToday, uint256 expiry, uint256 lastResetDate, bool isActive)',
  'function executeWithSession(bytes32 sessionId, address to, uint256 amount, bytes32 paymentId, bytes signature)',
  'function relayer() view returns (address)',
];

async function main() {
  const rpcUrl = process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet.nodereal.io/v1/1eefed273dc64160afd5e328e6c518d6';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
  if (!relayerPrivateKey) {
    console.log('RELAYER_PRIVATE_KEY not set');
    return;
  }
  
  const relayerWallet = new Wallet(relayerPrivateKey, provider);
  
  console.log('=== 尝试重现错误 ===\n');
  
  // 使用失败交易中的参数
  const sessionId = SESSION_ID;
  const to = '0x4d10DA389E0ADe7E7a7E3232531048aEaCa4021C';
  const amount = 100000n;
  const paymentId = '0x2b99df5b2e740d28217e94ae5c0ab61cdc230c83ae045cf8d939da097ec28587';
  const signature = '0xcd4dde8744ac33a7824c4830b12fe35fd54b0e7bd609f5f797e0424f7558e0402c81d6980d71542108e8824aebebd7043c1fd7ccf63e1b2117f9fbbcc1aa93281c';
  
  console.log('1. 尝试使用 eth_call 获取更多错误信息...');
  
  const sessionManager = new Contract(ERC8004_ADDRESS, ERC8004_ABI, relayerWallet);
  
  try {
    // 使用 staticCall 模拟
    await sessionManager.executeWithSession.staticCall(
      sessionId,
      to,
      amount,
      paymentId,
      signature
    );
    console.log('   ✅ staticCall 成功!');
  } catch (error: any) {
    console.log(`   ❌ staticCall 失败: ${error.message}`);
    
    if (error.data) {
      console.log(`   Error data: ${error.data}`);
      
      // 尝试解码错误
      try {
        const errorSelector = error.data.substring(0, 10);
        console.log(`   Error selector: ${errorSelector}`);
        
        // 常见的错误选择器
        const errorSelectors: Record<string, string> = {
          '0x08c379a0': 'Error(string)',
          '0x4e487b71': 'Panic(uint256)',
        };
        
        if (errorSelectors[errorSelector]) {
          console.log(`   Error type: ${errorSelectors[errorSelector]}`);
        }
      } catch (e) {
        // ignore
      }
    }
    
    // 如果错误是 require(false)，说明合约有问题
    if (error.message.includes('require(false)')) {
      console.log('\n   📍 分析:');
      console.log('   合约返回 require(false) 但没有错误消息');
      console.log('   这可能是因为:');
      console.log('   1. 合约中有一个没有消息的 require(false)');
      console.log('   2. 合约在 ecrecover 中返回了零地址');
      console.log('   3. USDT transferFrom 失败（USDT 可能返回 false 而不是 revert）');
    }
  }
  
  // 2. 检查 USDT 是否是标准 ERC20
  console.log('\n2. 检查 USDT 合约行为...');
  const usdtAddress = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
  const usdtAbi = [
    'function transferFrom(address from, address to, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
  ];
  
  const usdt = new Contract(usdtAddress, usdtAbi, provider);
  
  // 检查 USDT 是否使用 SafeERC20
  const code = await provider.getCode(usdtAddress);
  console.log(`   USDT 合约代码长度: ${code.length}`);
  
  // 3. 尝试直接 eth_call 调用 ecrecover
  console.log('\n3. 验证链上 ecrecover...');
  
  const chainId = 97;
  const innerHash = ethers.solidityPackedKeccak256(
    ['bytes32', 'address', 'uint256', 'bytes32', 'uint256'],
    [sessionId, to, amount, paymentId, chainId]
  );
  
  const messageHash = ethers.solidityPackedKeccak256(
    ['string', 'bytes32'],
    ['\x19Ethereum Signed Message:\n32', innerHash]
  );
  
  // 本地恢复签名者
  const recoveredSigner = ethers.recoverAddress(messageHash, signature);
  console.log(`   本地恢复的签名者: ${recoveredSigner}`);
  
  // 获取 Session 的 signer
  const session = await sessionManager.sessions(sessionId);
  console.log(`   Session Signer: ${session.signer}`);
  
  if (recoveredSigner.toLowerCase() === session.signer.toLowerCase()) {
    console.log('   ✅ 签名者匹配');
  } else {
    console.log('   ❌ 签名者不匹配!');
    console.log('   这是问题所在!');
  }
  
  // 4. 检查 Session 是否过期
  console.log('\n4. 检查 Session 过期时间...');
  const expiry = Number(session.expiry);
  const now = Math.floor(Date.now() / 1000);
  console.log(`   Session Expiry: ${new Date(expiry * 1000).toISOString()}`);
  console.log(`   Current Time: ${new Date(now * 1000).toISOString()}`);
  
  if (now > expiry) {
    console.log('   ❌ Session 已过期!');
  } else {
    console.log('   ✅ Session 未过期');
  }
  
  // 5. 检查 Session Owner
  console.log('\n5. 检查 Session Owner...');
  console.log(`   Session Owner: ${session.owner}`);
  
  // 检查 Owner 是否有足够的 USDT
  const balance = await usdt.balanceOf(session.owner);
  const allowance = await usdt.allowance(session.owner, ERC8004_ADDRESS);
  const decimals = await usdt.decimals();
  
  // 计算需要转账的金额
  const amountForTransfer = amount * BigInt(10 ** (Number(decimals) - 6));
  
  console.log(`   需要转账: ${ethers.formatUnits(amountForTransfer, decimals)} USDT`);
  console.log(`   Owner 余额: ${ethers.formatUnits(balance, decimals)} USDT`);
  console.log(`   授权金额: ${ethers.formatUnits(allowance, decimals)} USDT`);
  
  console.log('\n=== 分析完成 ===');
}

main().catch(console.error);
