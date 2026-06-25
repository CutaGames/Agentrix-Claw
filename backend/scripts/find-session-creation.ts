/**
 * 查询 Session 创建事件
 */

import { ethers } from 'ethers';

async function main() {
  const sessionId = process.argv[2] || '0xb561917dcd7b2e34c5fb0afbfb2900d5b61c5f6a3ab7994f4e05b962f9d7f16d';
  
  const provider = new ethers.JsonRpcProvider('https://bsc-testnet.nodereal.io/v1/1eefed273dc64160afd5e328e6c518d6');
  const sessionManagerAddress = '0xFfEf72198A71B288EfE403AC07f9c60A1a99f29e';
  
  console.log('\n=== 查询 Session 创建事件 ===\n');
  console.log('Session ID:', sessionId);
  console.log('Contract:', sessionManagerAddress);
  
  // 查询 SessionCreated 事件
  const abi = ['event SessionCreated(bytes32 indexed sessionId, address indexed owner, address indexed signer, uint256 singleLimit, uint256 dailyLimit, uint256 expiry)'];
  const iface = new ethers.Interface(abi);
  
  // 获取最近的区块
  const latestBlock = await provider.getBlockNumber();
  console.log('Latest block:', latestBlock);
  
  // 搜索事件（分批查询，每次 10000 个区块）
  const batchSize = 10000;
  let found = false;
  
  for (let toBlock = latestBlock; toBlock > latestBlock - 200000 && !found; toBlock -= batchSize) {
    const fromBlock = Math.max(toBlock - batchSize + 1, 0);
    
    const filter = {
      address: sessionManagerAddress,
      topics: [
        ethers.id('SessionCreated(bytes32,address,address,uint256,uint256,uint256)'),
        sessionId
      ],
      fromBlock,
      toBlock
    };
    
    console.log(`Searching blocks ${fromBlock} to ${toBlock}...`);
    const logs = await provider.getLogs(filter);
    
    if (logs.length > 0) {
      console.log('Found', logs.length, 'SessionCreated events for this sessionId\n');
      
      for (const log of logs) {
        const parsed = iface.parseLog(log);
        if (parsed) {
          console.log('Event found in tx:', log.transactionHash);
          console.log('  Block:', log.blockNumber);
          console.log('  Owner:', parsed.args.owner);
          console.log('  Signer:', parsed.args.signer);
          console.log('  Single Limit:', ethers.formatUnits(parsed.args.singleLimit, 6), 'USDC');
          console.log('  Daily Limit:', ethers.formatUnits(parsed.args.dailyLimit, 6), 'USDC');
          console.log('  Expiry:', new Date(Number(parsed.args.expiry) * 1000).toISOString());
          
          // 获取交易详情
          const tx = await provider.getTransaction(log.transactionHash);
          if (tx) {
            console.log('  Transaction from:', tx.from);
          }
        }
      }
      found = true;
    }
  }
  
  if (!found) {
    console.log('No events found in the last 200000 blocks.');
  }
}

main().catch(console.error);
