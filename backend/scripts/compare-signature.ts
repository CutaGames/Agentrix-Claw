/**
 * 精确对比链上和链下的签名恢复
 */

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  console.log('=== 精确对比签名恢复 ===\n');
  
  // 使用失败交易中的实际参数
  const sessionId = '0x174aef6f57ac7311b9d97e62750d990ecbbb8052f15ef32b7f5a04383058e7d5';
  const to = '0x4d10DA389E0ADe7E7a7E3232531048aEaCa4021C';
  const amount = 100000n;
  const paymentId = '0x2b99df5b2e740d28217e94ae5c0ab61cdc230c83ae045cf8d939da097ec28587';
  const signature = '0xcd4dde8744ac33a7824c4830b12fe35fd54b0e7bd609f5f797e0424f7558e0402c81d6980d71542108e8824aebebd7043c1fd7ccf63e1b2117f9fbbcc1aa93281c';
  const chainId = 97;
  
  console.log('1. 输入参数:');
  console.log(`   Session ID: ${sessionId}`);
  console.log(`   To: ${to}`);
  console.log(`   Amount: ${amount}`);
  console.log(`   Payment ID: ${paymentId}`);
  console.log(`   Chain ID: ${chainId}`);
  console.log(`   Signature: ${signature}`);
  
  // 2. 计算内部哈希 (与合约 abi.encodePacked 一致)
  console.log('\n2. 计算内部哈希...');
  
  // 合约中:
  // keccak256(abi.encodePacked(sessionId, to, amount, paymentId, block.chainid))
  
  // 使用 solidityPackedKeccak256 (等同于 keccak256(abi.encodePacked(...)))
  const innerHash = ethers.solidityPackedKeccak256(
    ['bytes32', 'address', 'uint256', 'bytes32', 'uint256'],
    [sessionId, to, amount, paymentId, chainId]
  );
  console.log(`   Inner Hash: ${innerHash}`);
  
  // 3. 计算带前缀的消息哈希
  console.log('\n3. 计算消息哈希 (with EIP-191 prefix)...');
  
  // 合约中:
  // keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", innerHash))
  const messageHash = ethers.solidityPackedKeccak256(
    ['string', 'bytes32'],
    ['\x19Ethereum Signed Message:\n32', innerHash]
  );
  console.log(`   Message Hash: ${messageHash}`);
  
  // 4. 使用 ethers.recoverAddress 恢复签名者
  console.log('\n4. 恢复签名者...');
  
  const recoveredSigner = ethers.recoverAddress(messageHash, signature);
  console.log(`   Recovered Signer: ${recoveredSigner}`);
  
  // 5. 分解签名
  console.log('\n5. 分解签名...');
  const sig = ethers.Signature.from(signature);
  console.log(`   r: ${sig.r}`);
  console.log(`   s: ${sig.s}`);
  console.log(`   v: ${sig.v}`);
  
  // 6. 验证签名长度
  console.log('\n6. 验证签名长度...');
  // 去掉 0x 前缀，每 2 个字符是 1 个字节
  const sigBytes = (signature.length - 2) / 2;
  console.log(`   签名字节数: ${sigBytes}`);
  if (sigBytes === 65) {
    console.log('   ✅ 签名长度正确 (65 bytes)');
  } else {
    console.log(`   ❌ 签名长度错误! 期望 65, 实际 ${sigBytes}`);
  }
  
  // 7. 检查 v 值
  console.log('\n7. 检查 v 值...');
  if (sig.v === 27 || sig.v === 28) {
    console.log(`   ✅ v 值正确: ${sig.v}`);
  } else {
    console.log(`   ⚠️ v 值可能需要调整: ${sig.v}`);
    // 某些钱包返回 0 或 1，需要加 27
    if (sig.v === 0 || sig.v === 1) {
      console.log(`   自动调整: ${sig.v} + 27 = ${sig.v + 27}`);
    }
  }
  
  // 8. 使用 ecrecover 预编译模拟
  console.log('\n8. 模拟 ecrecover...');
  
  // ecrecover 需要: messageHash, v, r, s
  // 返回恢复的地址
  
  // 使用 ethers 的低级 ecrecover
  const vBytes = sig.v === 27 ? '0x1b' : '0x1c';
  console.log(`   v (hex): ${vBytes}`);
  console.log(`   r: ${sig.r}`);
  console.log(`   s: ${sig.s}`);
  
  // 9. 比较期望的签名者
  console.log('\n9. 比较签名者...');
  const expectedSigner = '0x2572bded06dB261d3FC0d8439ea8bb162e7ba1dC';
  console.log(`   期望 Signer: ${expectedSigner}`);
  console.log(`   恢复 Signer: ${recoveredSigner}`);
  
  if (recoveredSigner.toLowerCase() === expectedSigner.toLowerCase()) {
    console.log('   ✅ 签名者匹配!');
  } else {
    console.log('   ❌ 签名者不匹配!');
  }
  
  // 10. 额外检查: 使用不同方法计算 messageHash
  console.log('\n10. 使用不同方法验证...');
  
  // 方法1: 使用 hashMessage
  const innerHashBytes = ethers.getBytes(innerHash);
  const messageHash2 = ethers.hashMessage(innerHashBytes);
  console.log(`   使用 hashMessage: ${messageHash2}`);
  
  // 方法2: 使用 solidityPackedKeccak256
  console.log(`   使用 solidityPackedKeccak256: ${messageHash}`);
  
  if (messageHash === messageHash2) {
    console.log('   ✅ 两种方法结果一致');
  } else {
    console.log('   ❌ 两种方法结果不一致!');
    
    // 尝试用 hashMessage 恢复签名者
    const recoveredSigner2 = ethers.recoverAddress(messageHash2, signature);
    console.log(`   使用 hashMessage 恢复: ${recoveredSigner2}`);
  }
  
  console.log('\n=== 检查完成 ===');
}

main().catch(console.error);
