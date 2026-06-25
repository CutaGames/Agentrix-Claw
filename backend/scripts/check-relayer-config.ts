/**
 * 检查合约的 Relayer 设置
 */

import { ethers, Contract } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const ERC8004_ADDRESS = '0xFfEf72198A71B288EfE403AC07f9c60A1a99f29e';

const ABI = [
  'function relayer() view returns (address)',
  'function usdcToken() view returns (address)',
  'function owner() view returns (address)',
  'function setRelayer(address _relayer)',
];

async function main() {
  const rpcUrl = process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet.nodereal.io/v1/1eefed273dc64160afd5e328e6c518d6';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  console.log('=== 检查 ERC8004SessionManager 配置 ===\n');
  
  const contract = new Contract(ERC8004_ADDRESS, ABI, provider);
  
  // 1. 检查 Relayer 地址
  console.log('1. 检查 Relayer 地址...');
  try {
    const relayerAddress = await contract.relayer();
    console.log(`   合约中的 Relayer: ${relayerAddress}`);
    
    const envRelayer = process.env.RELAYER_ADDRESS;
    console.log(`   环境变量 RELAYER_ADDRESS: ${envRelayer || '未设置'}`);
    
    // 从私钥计算地址
    const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
    if (relayerPrivateKey) {
      const wallet = new ethers.Wallet(relayerPrivateKey);
      console.log(`   从私钥计算的地址: ${wallet.address}`);
      
      if (relayerAddress.toLowerCase() === wallet.address.toLowerCase()) {
        console.log(`   ✅ Relayer 地址匹配!`);
      } else if (relayerAddress === '0x0000000000000000000000000000000000000000') {
        console.log(`   ❌ Relayer 未设置! (零地址)`);
        console.log(`   需要调用 setRelayer(${wallet.address}) 来设置`);
      } else {
        console.log(`   ❌ Relayer 地址不匹配!`);
        console.log(`   合约: ${relayerAddress}`);
        console.log(`   私钥: ${wallet.address}`);
      }
    }
  } catch (error: any) {
    console.log(`   ❌ 获取 Relayer 失败: ${error.message}`);
  }
  
  // 2. 检查 Token 地址
  console.log('\n2. 检查 Token 地址...');
  try {
    const tokenAddress = await contract.usdcToken();
    console.log(`   合约中的 Token: ${tokenAddress}`);
    console.log(`   期望 USDT: 0x337610d27c682E347C9cD60BD4b3b107C9d34dDd`);
    
    if (tokenAddress.toLowerCase() === '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd'.toLowerCase()) {
      console.log(`   ✅ Token 地址匹配!`);
    } else {
      console.log(`   ❌ Token 地址不匹配!`);
    }
  } catch (error: any) {
    console.log(`   ❌ 获取 Token 失败: ${error.message}`);
  }
  
  // 3. 检查 Owner 地址
  console.log('\n3. 检查 Owner 地址...');
  try {
    const ownerAddress = await contract.owner();
    console.log(`   合约 Owner: ${ownerAddress}`);
  } catch (error: any) {
    console.log(`   ❌ 获取 Owner 失败: ${error.message}`);
  }
  
  console.log('\n=== 检查完成 ===');
}

main().catch(console.error);
