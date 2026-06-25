/**
 * 检查授权状态的诊断工具
 * 用于诊断为什么支付时钱包没有扣款
 */

import { ethers } from 'ethers';

interface AuthorizationStatus {
  userAddress: string;
  erc8004Address: string;
  tokenAddress: string;
  currentAllowance: string;
  currentAllowanceFormatted: string;
  isAuthorized: boolean;
  needsApproval: boolean;
  erc8004TokenAddress: string; // ERC8004合约实际使用的代币地址
  tokenAddressMatch: boolean;
  paymentAmount?: string;
  hasEnoughAllowance?: boolean;
}

/**
 * 检查授权状态
 */
export async function checkAuthorizationStatus(params?: {
  paymentAmount?: string; // 最小单位的金额
  tokenDecimals?: number;
}): Promise<AuthorizationStatus> {
  if (!window.ethereum) {
    throw new Error('请先连接钱包');
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  
  // 先尝试获取已授权的账户，避免触发 MetaMask 弹窗
  let userAddress: string;
  try {
    // 尝试获取已授权的账户（不会弹窗）
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    if (accounts && accounts.length > 0) {
      userAddress = accounts[0];
      console.log('✅ 使用已授权的账户:', userAddress);
    } else {
      // 如果没有已授权的账户，才调用 getSigner（可能会弹窗）
      const signer = await provider.getSigner();
      userAddress = await signer.getAddress();
    }
  } catch (error) {
    // 如果获取失败，回退到 getSigner
    const signer = await provider.getSigner();
    userAddress = await signer.getAddress();
  }

  // 1. 获取ERC8004合约地址（从后端API或环境变量）
  let erc8004Address: string;
  let tokenAddress: string;
  
  try {
    // 尝试从后端API获取
    const { paymentApi } = await import('@/lib/api/payment.api');
    const contractInfo = await paymentApi.getContractAddress();
    erc8004Address = contractInfo?.erc8004ContractAddress || 
                     process.env.NEXT_PUBLIC_ERC8004_CONTRACT_ADDRESS || 
                     '0x88b3993250Da39041C9263358C3c24C6a69a955e';
    tokenAddress = contractInfo?.usdcAddress || 
                   '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd'; // BSC Testnet USDT
  } catch {
    // 如果API不存在，使用环境变量或默认值
    erc8004Address = process.env.NEXT_PUBLIC_ERC8004_CONTRACT_ADDRESS || 
                     '0x88b3993250Da39041C9263358C3c24C6a69a955e';
    tokenAddress = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd'; // BSC Testnet USDT
  }

  console.log('🔍 检查授权状态:', {
    userAddress,
    erc8004Address,
    tokenAddress,
  });

  // 2. 查询ERC8004合约实际使用的代币地址
  const erc8004ABI = [
    'function usdcToken() view returns (address)',
  ];
  const erc8004Contract = new ethers.Contract(erc8004Address, erc8004ABI, provider);
  let erc8004TokenAddress: string;
  try {
    erc8004TokenAddress = await erc8004Contract.usdcToken();
    console.log('✅ ERC8004合约使用的代币地址:', erc8004TokenAddress);
  } catch (error: any) {
    console.error('❌ 无法查询ERC8004合约的代币地址:', error.message);
    erc8004TokenAddress = tokenAddress; // 使用默认值
  }

  const tokenAddressMatch = erc8004TokenAddress.toLowerCase() === tokenAddress.toLowerCase();
  if (!tokenAddressMatch) {
    console.error('❌ 代币地址不匹配！');
    console.error(`   前端使用的代币地址: ${tokenAddress}`);
    console.error(`   ERC8004合约使用的代币地址: ${erc8004TokenAddress}`);
  }

  // 3. 查询授权额度
  const tokenABI = [
    'function allowance(address owner, address spender) view returns (uint256)',
    'function decimals() view returns (uint8)',
  ];
  const tokenContract = new ethers.Contract(tokenAddress, tokenABI, provider);
  
  // 使用ERC8004合约实际使用的代币地址查询授权
  const actualTokenContract = new ethers.Contract(erc8004TokenAddress, tokenABI, provider);
  const decimals = await actualTokenContract.decimals?.().then((d: number) => Number(d)).catch(() => 18);
  
  const allowance = await actualTokenContract.allowance(userAddress, erc8004Address);
  const currentAllowanceFormatted = ethers.formatUnits(allowance, decimals);
  
  const isAuthorized = BigInt(allowance) > BigInt(0);
  const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  const isUnlimited = allowance >= maxUint256 - BigInt(1000);

  let needsApproval = false;
  let hasEnoughAllowance = false;
  
  if (params?.paymentAmount) {
    hasEnoughAllowance = BigInt(allowance) >= BigInt(params.paymentAmount);
    needsApproval = !hasEnoughAllowance;
  }

  const result: AuthorizationStatus = {
    userAddress,
    erc8004Address,
    tokenAddress,
    currentAllowance: allowance.toString(),
    currentAllowanceFormatted,
    isAuthorized,
    needsApproval,
    erc8004TokenAddress,
    tokenAddressMatch,
    paymentAmount: params?.paymentAmount,
    hasEnoughAllowance,
  };

  // 4. 输出诊断结果
  console.log('\n📊 授权状态诊断结果:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`用户钱包地址: ${userAddress}`);
  console.log(`ERC8004合约地址: ${erc8004Address}`);
  console.log(`前端使用的代币地址: ${tokenAddress}`);
  console.log(`ERC8004合约使用的代币地址: ${erc8004TokenAddress}`);
  console.log(`代币地址匹配: ${tokenAddressMatch ? '✅' : '❌'}`);
  console.log(`当前授权额度: ${currentAllowanceFormatted} USDT`);
  console.log(`是否已授权: ${isAuthorized ? '✅ 是' : '❌ 否'}`);
  console.log(`是否无限授权: ${isUnlimited ? '⚠️  是（无限授权）' : '✅ 否（有限授权）'}`);
  
  if (params?.paymentAmount) {
    const paymentAmountFormatted = ethers.formatUnits(params.paymentAmount, params.tokenDecimals || decimals);
    console.log(`支付金额: ${paymentAmountFormatted} USDT`);
    console.log(`授权额度是否足够: ${hasEnoughAllowance ? '✅ 是' : '❌ 否'}`);
    console.log(`是否需要重新授权: ${needsApproval ? '⚠️  是' : '✅ 否'}`);
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 5. 检查问题
  if (!isAuthorized) {
    console.error('❌ 问题：未授权！');
    console.error('   解决方案：创建Session时会自动授权，或手动授权USDT给ERC8004合约');
  } else if (!tokenAddressMatch) {
    console.error('❌ 问题：代币地址不匹配！');
    console.error('   解决方案：确保前端使用的代币地址与ERC8004合约配置的地址一致');
  } else if (params?.paymentAmount && !hasEnoughAllowance) {
    console.error('❌ 问题：授权额度不足！');
    console.error(`   当前授权: ${currentAllowanceFormatted} USDT`);
    console.error(`   需要授权: ${ethers.formatUnits(params.paymentAmount, params.tokenDecimals || decimals)} USDT`);
    console.error('   解决方案：重新创建Session或增加授权额度');
  } else {
    console.log('✅ 授权状态正常！');
  }

  return result;
}

/**
 * 在浏览器控制台中使用
 * 用法：await window.checkAuth() 或 await checkAuthorizationStatus()
 */
if (typeof window !== 'undefined') {
  (window as any).checkAuth = checkAuthorizationStatus;
  (window as any).checkAuthorizationStatus = checkAuthorizationStatus;
  // 延迟输出日志，确保在页面加载后显示
  setTimeout(() => {
    console.log('💡 授权状态检查工具已加载');
    console.log('   使用方法: await window.checkAuth()');
    console.log('   或: await checkAuthorizationStatus()');
  }, 2000);
}

