/**
 * 详细检查 USDT 合约行为
 * BSC 测试网上的 USDT 可能有特殊行为
 */

import { ethers, Contract, Interface } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const USDT_ADDRESS = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
const ERC8004_ADDRESS = '0xFfEf72198A71B288EfE403AC07f9c60A1a99f29e';
const USER_WALLET = '0xdf8e26fab0553ec755073f1c923c14942ad0d816';
const COMMISSION_ADDRESS = '0x4d10DA389E0ADe7E7a7E3232531048aEaCa4021C';

async function main() {
  const rpcUrl = process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet.nodereal.io/v1/1eefed273dc64160afd5e328e6c518d6';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  console.log('=== 检查 USDT 合约行为 ===\n');
  
  // 1. 获取 USDT 合约代码
  const code = await provider.getCode(USDT_ADDRESS);
  console.log(`1. USDT 合约代码长度: ${code.length} 字符`);
  console.log(`   合约代码哈希: ${ethers.keccak256(code)}`);
  
  // 2. 检查 USDT 基本信息
  const usdtAbi = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
  ];
  
  const usdt = new Contract(USDT_ADDRESS, usdtAbi, provider);
  
  console.log('\n2. USDT 基本信息:');
  const name = await usdt.name();
  const symbol = await usdt.symbol();
  const decimals = await usdt.decimals();
  const totalSupply = await usdt.totalSupply();
  
  console.log(`   Name: ${name}`);
  console.log(`   Symbol: ${symbol}`);
  console.log(`   Decimals: ${decimals}`);
  console.log(`   Total Supply: ${ethers.formatUnits(totalSupply, decimals)}`);
  
  // 3. 检查用户余额和授权
  console.log('\n3. 用户状态:');
  const balance = await usdt.balanceOf(USER_WALLET);
  const allowanceToERC8004 = await usdt.allowance(USER_WALLET, ERC8004_ADDRESS);
  
  console.log(`   User Balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`);
  console.log(`   Allowance to ERC8004: ${ethers.formatUnits(allowanceToERC8004, decimals)} ${symbol}`);
  
  // 4. 计算需要转账的金额
  const amount6Decimals = 100000n; // 0.1 in 6 decimals
  const amountForTransfer = amount6Decimals * BigInt(10 ** (Number(decimals) - 6));
  
  console.log(`\n4. 转账金额计算:`);
  console.log(`   合约参数 (6 decimals): ${amount6Decimals}`);
  console.log(`   转账金额 (${decimals} decimals): ${amountForTransfer}`);
  console.log(`   转账金额 (人类可读): ${ethers.formatUnits(amountForTransfer, decimals)} ${symbol}`);
  
  // 5. 检查 USDT 是否支持标准 ERC20 接口
  console.log('\n5. 检查 USDT 函数选择器:');
  
  const selectors = {
    'transfer(address,uint256)': ethers.id('transfer(address,uint256)').substring(0, 10),
    'transferFrom(address,address,uint256)': ethers.id('transferFrom(address,address,uint256)').substring(0, 10),
    'approve(address,uint256)': ethers.id('approve(address,uint256)').substring(0, 10),
    'balanceOf(address)': ethers.id('balanceOf(address)').substring(0, 10),
    'allowance(address,address)': ethers.id('allowance(address,address)').substring(0, 10),
  };
  
  for (const [name, selector] of Object.entries(selectors)) {
    const inCode = code.includes(selector.substring(2));
    console.log(`   ${selector}: ${name} - ${inCode ? '✅' : '❓'}`);
  }
  
  // 6. 检查 BSCScan 链接
  console.log('\n6. 检查 USDT 合约:');
  console.log(`   https://testnet.bscscan.com/address/${USDT_ADDRESS}`);
  console.log(`   https://testnet.bscscan.com/token/${USDT_ADDRESS}`);
  
  // 7. 尝试模拟 transferFrom 调用
  console.log('\n7. 检查 ERC8004 是否可以调用 transferFrom...');
  
  // 创建一个 eth_call 来模拟 transferFrom
  // 注意：这是从 ERC8004 合约的视角模拟的
  const transferFromSelector = '0x23b872dd'; // transferFrom(address,address,uint256)
  
  // 编码参数: from=USER_WALLET, to=COMMISSION_ADDRESS, amount=amountForTransfer
  const abiCoder = new ethers.AbiCoder();
  const callData = transferFromSelector + abiCoder.encode(
    ['address', 'address', 'uint256'],
    [USER_WALLET, COMMISSION_ADDRESS, amountForTransfer]
  ).substring(2);
  
  console.log(`   模拟 transferFrom 调用:`);
  console.log(`     From: ${USER_WALLET}`);
  console.log(`     To: ${COMMISSION_ADDRESS}`);
  console.log(`     Amount: ${amountForTransfer}`);
  
  // 尝试用 ERC8004 地址作为 msg.sender 调用
  try {
    const result = await provider.call({
      to: USDT_ADDRESS,
      data: callData,
      from: ERC8004_ADDRESS, // 模拟 ERC8004 调用
    });
    console.log(`     ✅ 调用成功! 返回值: ${result}`);
    
    // 解码返回值
    const decoded = abiCoder.decode(['bool'], result);
    console.log(`     返回值解码: ${decoded[0]}`);
    
    if (decoded[0] === false) {
      console.log(`     ⚠️ transferFrom 返回 false 而不是 revert!`);
      console.log(`     这可能导致 SafeERC20.safeTransferFrom 失败`);
    }
  } catch (error: any) {
    console.log(`     ❌ 调用失败: ${error.message}`);
  }
  
  console.log('\n=== 检查完成 ===');
}

main().catch(console.error);
