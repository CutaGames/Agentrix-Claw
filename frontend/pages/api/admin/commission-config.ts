import type { NextApiRequest, NextApiResponse } from 'next';

interface CommissionConfig {
  x402ChannelFeeRate: number;
  scannedUcpFeeRate: number;
  scannedX402FeeRate: number;
  scannedFtFeeRate: number;
  scannedNftFeeRate: number;
  infraPlatformFee: number;
  infraPoolRate: number;
  resourcePlatformFee: number;
  resourcePoolRate: number;
  logicPlatformFee: number;
  logicPoolRate: number;
  compositePlatformFee: number;
  compositePoolRate: number;
  executorShare: number;
  referrerShare: number;
  promoterShareOfPlatform: number;
}

// 默认配置 (V5.0)
const defaultConfig: CommissionConfig = {
  x402ChannelFeeRate: 0,
  scannedUcpFeeRate: 1,
  scannedX402FeeRate: 1,
  scannedFtFeeRate: 0.3,
  scannedNftFeeRate: 0.3,
  infraPlatformFee: 0.5,
  infraPoolRate: 2,
  resourcePlatformFee: 0.5,
  resourcePoolRate: 2.5,
  logicPlatformFee: 1,
  logicPoolRate: 4,
  compositePlatformFee: 3,
  compositePoolRate: 7,
  executorShare: 70,
  referrerShare: 30,
  promoterShareOfPlatform: 20,
};

// 内存存储 (生产环境应使用数据库)
let currentConfig: CommissionConfig = { ...defaultConfig };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // TODO: 添加管理员认证检查
  // const session = await getSession({ req });
  // if (!session?.user?.isAdmin) {
  //   return res.status(401).json({ error: 'Unauthorized' });
  // }

  if (req.method === 'GET') {
    return res.status(200).json(currentConfig);
  }

  if (req.method === 'POST') {
    try {
      const newConfig = req.body as Partial<CommissionConfig>;
      
      // 验证配置值
      if (newConfig.x402ChannelFeeRate !== undefined) {
        if (newConfig.x402ChannelFeeRate < 0 || newConfig.x402ChannelFeeRate > 3) {
          return res.status(400).json({ error: 'X402 channel fee rate must be between 0 and 3%' });
        }
      }
      
      if (newConfig.executorShare !== undefined && newConfig.referrerShare !== undefined) {
        if (newConfig.executorShare + newConfig.referrerShare !== 100) {
          return res.status(400).json({ error: 'Executor and referrer shares must sum to 100%' });
        }
      }
      
      // 更新配置
      currentConfig = { ...currentConfig, ...newConfig };
      
      // TODO: 持久化到数据库
      // await saveConfigToDatabase(currentConfig);
      
      // TODO: 如果需要，同步到智能合约
      // await syncToContract(currentConfig);
      
      return res.status(200).json({ success: true, config: currentConfig });
    } catch (error) {
      console.error('Failed to save commission config:', error);
      return res.status(500).json({ error: 'Failed to save configuration' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
