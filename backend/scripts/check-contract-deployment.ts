/**
 * 检查合约部署信息和字节码
 */

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const ERC8004_ADDRESS = '0xFfEf72198A71B288EfE403AC07f9c60A1a99f29e';

async function main() {
  const rpcUrl = process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet.nodereal.io/v1/1eefed273dc64160afd5e328e6c518d6';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  console.log('=== 检查合约部署信息 ===\n');
  
  // 1. 获取合约代码
  const code = await provider.getCode(ERC8004_ADDRESS);
  console.log(`合约代码长度: ${code.length} 字符`);
  console.log(`合约代码哈希: ${ethers.keccak256(code)}`);
  
  // 2. 尝试获取合约创建交易
  // 注意：这需要通过 BSCScan API 或其他方式
  console.log('\n请在 BSCScan 上检查合约:');
  console.log(`https://testnet.bscscan.com/address/${ERC8004_ADDRESS}`);
  
  // 3. 检查一些关键函数选择器
  console.log('\n检查函数选择器...');
  
  const selectors = {
    'sessions(bytes32)': ethers.id('sessions(bytes32)').substring(0, 10),
    'executeWithSession(bytes32,address,uint256,bytes32,bytes)': ethers.id('executeWithSession(bytes32,address,uint256,bytes32,bytes)').substring(0, 10),
    'executeBatchWithSession(bytes32[],address[],uint256[],bytes32[],bytes[])': ethers.id('executeBatchWithSession(bytes32[],address[],uint256[],bytes32[],bytes[])').substring(0, 10),
    'relayer()': ethers.id('relayer()').substring(0, 10),
    'usdcToken()': ethers.id('usdcToken()').substring(0, 10),
    'setRelayer(address)': ethers.id('setRelayer(address)').substring(0, 10),
  };
  
  for (const [name, selector] of Object.entries(selectors)) {
    console.log(`  ${selector}: ${name}`);
  }
  
  // 4. 验证 executeWithSession 的选择器
  console.log('\n验证 executeWithSession...');
  const expectedSelector = '0x91170e47';
  const actualSelector = selectors['executeWithSession(bytes32,address,uint256,bytes32,bytes)'];
  console.log(`  期望选择器: ${expectedSelector}`);
  console.log(`  计算选择器: ${actualSelector}`);
  
  if (expectedSelector === actualSelector) {
    console.log('  ✅ 选择器匹配');
  } else {
    console.log('  ❌ 选择器不匹配!');
  }
  
  // 5. 检查合约代码中是否包含特定字符串
  console.log('\n检查合约代码...');
  
  // 检查 SafeERC20 的 safeTransferFrom 调用
  // SafeERC20.safeTransferFrom 会调用底层的 transferFrom，然后检查返回值
  // 如果 USDT 返回 false（而不是 revert），SafeERC20 会 revert
  
  // 6. 尝试调用一个简单的函数验证合约正常
  console.log('\n调用 relayer()...');
  const abi = ['function relayer() view returns (address)'];
  const contract = new ethers.Contract(ERC8004_ADDRESS, abi, provider);
  const relayer = await contract.relayer();
  console.log(`  Relayer: ${relayer}`);
  
  console.log('\n=== 检查完成 ===');
  console.log('\n📌 下一步:');
  console.log('1. 在 BSCScan 上验证合约是否与源代码匹配');
  console.log('2. 如果合约版本不对，需要重新部署');
  console.log('3. 检查 USDT 合约是否有特殊行为');
}

main().catch(console.error);
