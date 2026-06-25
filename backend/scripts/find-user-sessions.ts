/**
 * 查询用户的所有 Session
 */

import { ethers } from 'ethers';

async function main() {
  const userAddress = process.argv[2] || '0xdf8E26faB0553ec755073f1c923C14942Ad0d816';
  
  const provider = new ethers.JsonRpcProvider('https://bsc-testnet.nodereal.io/v1/1eefed273dc64160afd5e328e6c518d6');
  const sessionManagerAddress = '0xFfEf72198A71B288EfE403AC07f9c60A1a99f29e';
  
  console.log('\n=== 查询用户的所有 Session ===\n');
  console.log('User Address:', userAddress);
  console.log('Contract:', sessionManagerAddress);
  
  const SESSION_MANAGER_ABI = [
    'function getUserSessions(address user) view returns (bytes32[])',
    'function sessions(bytes32) view returns (address owner, address signer, uint256 singleLimit, uint256 dailyLimit, uint256 usedToday, uint256 expiry, uint256 lastResetDate, bool isActive)',
  ];
  
  const sessionManager = new ethers.Contract(sessionManagerAddress, SESSION_MANAGER_ABI, provider);
  
  // 查询用户的 Session 列表
  console.log('\nQuerying sessions owned by this address...');
  const sessionIds = await sessionManager.getUserSessions(userAddress);
  console.log('Found', sessionIds.length, 'sessions owned by', userAddress);
  
  for (const sessionId of sessionIds) {
    console.log('\n---');
    console.log('Session ID:', sessionId);
    const session = await sessionManager.sessions(sessionId);
    console.log('  Owner:', session.owner);
    console.log('  Signer:', session.signer);
    console.log('  Single Limit:', ethers.formatUnits(session.singleLimit, 6), 'USDC');
    console.log('  Daily Limit:', ethers.formatUnits(session.dailyLimit, 6), 'USDC');
    console.log('  Used Today:', ethers.formatUnits(session.usedToday, 6), 'USDC');
    console.log('  Expiry:', new Date(Number(session.expiry) * 1000).toISOString());
    console.log('  Is Active:', session.isActive);
  }
  
  // 也查询该地址作为 Signer 的 Session（通过事件）
  console.log('\n\n=== 查询该地址作为 Signer 的 Session ===\n');
  
  const abi = ['event SessionCreated(bytes32 indexed sessionId, address indexed owner, address indexed signer, uint256 singleLimit, uint256 dailyLimit, uint256 expiry)'];
  const iface = new ethers.Interface(abi);
  
  const latestBlock = await provider.getBlockNumber();
  
  const filter = {
    address: sessionManagerAddress,
    topics: [
      ethers.id('SessionCreated(bytes32,address,address,uint256,uint256,uint256)'),
      null, // any sessionId
      null, // any owner
      ethers.zeroPadValue(userAddress, 32) // signer = userAddress
    ],
    fromBlock: latestBlock - 100000,
    toBlock: latestBlock
  };
  
  const logs = await provider.getLogs(filter);
  console.log('Found', logs.length, 'sessions where', userAddress, 'is the Signer');
  
  for (const log of logs) {
    const parsed = iface.parseLog(log);
    if (parsed) {
      console.log('\n---');
      console.log('Session ID:', parsed.args.sessionId);
      console.log('  Owner:', parsed.args.owner);
      console.log('  Signer:', parsed.args.signer);
      console.log('  Created in tx:', log.transactionHash);
    }
  }
}

main().catch(console.error);
