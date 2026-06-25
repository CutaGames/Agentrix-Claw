import { ethers } from 'ethers';
import { SchemaRegistry } from '@ethereum-attestation-service/eas-sdk';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

/**
 * EAS Schema 注册脚本
 * 
 * 使用方法:
 * npx ts-node scripts/register-eas-schemas.ts
 * 
 * 环境变量要求:
 * - EAS_RPC_URL 或 RPC_URL
 * - EAS_SIGNER_PRIVATE_KEY
 * - EAS_SCHEMA_REGISTRY_ADDRESS
 */

interface SchemaConfig {
  name: string;
  envKey: string;
  schema: string;
  resolver: string;
  revocable: boolean;
  description: string;
}

const SCHEMAS: SchemaConfig[] = [
  {
    name: 'AgentRegistration',
    envKey: 'EAS_SCHEMA_AGENT_REGISTRATION',
    schema: 'string agentId,string name,string riskTier,string ownerId,uint64 registeredAt',
    resolver: ethers.ZeroAddress,
    revocable: true,
    description: 'Agent 注册存证 - 证明 Agent 身份和风险等级',
  },
  {
    name: 'SkillPublication',
    envKey: 'EAS_SCHEMA_SKILL_PUBLICATION',
    schema: 'string skillId,string name,string authorId,string version,string category,string pricingType',
    resolver: ethers.ZeroAddress,
    revocable: true,
    description: 'Skill 发布存证 - 证明 Skill 的作者和版本',
  },
  {
    name: 'AuditRoot',
    envKey: 'EAS_SCHEMA_AUDIT_ROOT',
    schema: 'bytes32 merkleRoot,string date,uint64 proofCount,string platform',
    resolver: ethers.ZeroAddress,
    revocable: false,  // 审计记录不可撤销
    description: '审计 Root 存证 - 每日 Merkle Root 链上锚定',
  },
  {
    name: 'TransactionAttestation',
    envKey: 'EAS_SCHEMA_TRANSACTION',
    schema: 'string txId,string paymentId,address payer,address recipient,uint256 amount,string currency,uint64 timestamp',
    resolver: ethers.ZeroAddress,
    revocable: false,  // 交易记录不可撤销
    description: '交易存证 - 关键交易的链上证明',
  },
];

async function main() {
  console.log('==========================================');
  console.log('      Agentrix EAS Schema 注册工具');
  console.log('==========================================\n');

  // 检查环境变量
  const rpcUrl = process.env.EAS_RPC_URL || process.env.RPC_URL;
  const privateKey = process.env.EAS_SIGNER_PRIVATE_KEY;
  const schemaRegistryAddress = process.env.EAS_SCHEMA_REGISTRY_ADDRESS;

  if (!rpcUrl) {
    console.error('❌ 错误: 未配置 EAS_RPC_URL 或 RPC_URL');
    process.exit(1);
  }

  if (!privateKey) {
    console.error('❌ 错误: 未配置 EAS_SIGNER_PRIVATE_KEY');
    process.exit(1);
  }

  if (!schemaRegistryAddress) {
    console.error('❌ 错误: 未配置 EAS_SCHEMA_REGISTRY_ADDRESS');
    console.log('\n常用 Schema Registry 地址:');
    console.log('  Sepolia:  0x0a7E2Ff54e76B8E6659aedc9103FB21c038050D0');
    console.log('  Mainnet:  0xA7b39296258348C78294F95B872b282326A97BDF');
    console.log('  Base:     0x4200000000000000000000000000000000000020');
    process.exit(1);
  }

  // 连接网络
  console.log(`📡 连接到 RPC: ${rpcUrl.substring(0, 50)}...`);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  
  // 获取网络信息
  const network = await provider.getNetwork();
  console.log(`🌐 网络: ${network.name} (chainId: ${network.chainId})`);
  
  // 检查余额
  const balance = await provider.getBalance(signer.address);
  console.log(`💰 签名者地址: ${signer.address}`);
  console.log(`💰 余额: ${ethers.formatEther(balance)} ETH\n`);

  if (balance === 0n) {
    console.error('❌ 错误: 签名者余额为 0，无法支付 Gas 费');
    console.log('\n获取测试 ETH:');
    console.log('  Sepolia: https://sepoliafaucet.com/');
    console.log('  Base:    https://faucet.quicknode.com/base');
    process.exit(1);
  }

  // 连接 Schema Registry
  console.log(`📝 Schema Registry: ${schemaRegistryAddress}`);
  const schemaRegistry = new SchemaRegistry(schemaRegistryAddress);
  schemaRegistry.connect(signer);

  // 存储注册结果
  const results: { name: string; envKey: string; uid: string | null; error?: string }[] = [];

  console.log('\n开始注册 Schemas...\n');
  console.log('------------------------------------------');

  for (const schemaConfig of SCHEMAS) {
    console.log(`\n📋 ${schemaConfig.name}`);
    console.log(`   ${schemaConfig.description}`);
    console.log(`   Schema: ${schemaConfig.schema}`);
    console.log(`   Revocable: ${schemaConfig.revocable}`);

    try {
      const tx = await schemaRegistry.register({
        schema: schemaConfig.schema,
        resolverAddress: schemaConfig.resolver,
        revocable: schemaConfig.revocable,
      });

      console.log(`   ⏳ 等待交易确认...`);
      const schemaUID = await tx.wait();
      
      console.log(`   ✅ 注册成功!`);
      console.log(`   UID: ${schemaUID}`);
      
      results.push({
        name: schemaConfig.name,
        envKey: schemaConfig.envKey,
        uid: schemaUID,
      });
    } catch (error: any) {
      console.log(`   ❌ 注册失败: ${error.message}`);
      results.push({
        name: schemaConfig.name,
        envKey: schemaConfig.envKey,
        uid: null,
        error: error.message,
      });
    }
  }

  console.log('\n------------------------------------------');
  console.log('\n📊 注册结果汇总:\n');

  // 生成环境变量
  const envLines: string[] = ['# EAS Schema UIDs (自动生成)'];
  const successCount = results.filter(r => r.uid).length;
  
  for (const result of results) {
    if (result.uid) {
      console.log(`✅ ${result.name}: ${result.uid}`);
      envLines.push(`${result.envKey}=${result.uid}`);
    } else {
      console.log(`❌ ${result.name}: 失败 - ${result.error}`);
      envLines.push(`# ${result.envKey}= # 注册失败: ${result.error}`);
    }
  }

  console.log(`\n总计: ${successCount}/${results.length} 成功\n`);

  // 输出环境变量配置
  console.log('==========================================');
  console.log('   请将以下内容添加到 .env 文件中:');
  console.log('==========================================\n');
  console.log(envLines.join('\n'));
  console.log('');

  // 可选：保存到文件
  const outputPath = path.join(__dirname, '../eas-schemas.env');
  fs.writeFileSync(outputPath, envLines.join('\n') + '\n');
  console.log(`💾 已保存到: ${outputPath}`);

  // 生成 EAS Scan 链接
  console.log('\n==========================================');
  console.log('   在 EAS Scan 查看已注册的 Schema:');
  console.log('==========================================\n');
  
  const chainId = Number(network.chainId);
  const easScanBase = chainId === 1 ? 'https://easscan.org' 
    : chainId === 11155111 ? 'https://sepolia.easscan.org'
    : chainId === 8453 ? 'https://base.easscan.org'
    : chainId === 42161 ? 'https://arbitrum.easscan.org'
    : null;

  if (easScanBase) {
    for (const result of results) {
      if (result.uid) {
        console.log(`${result.name}: ${easScanBase}/schema/view/${result.uid}`);
      }
    }
  } else {
    console.log('(当前网络不支持 EAS Scan 查看)');
  }

  console.log('\n✨ 完成!');
}

main().catch((error) => {
  console.error('脚本执行失败:', error);
  process.exit(1);
});
