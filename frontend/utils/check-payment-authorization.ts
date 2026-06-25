/**
 * 检查支付授权状态的工具函数
 * 用于诊断为什么钱包没有扣款
 */

import { ethers } from 'ethers';

interface AuthorizationCheckResult {
  isAuthorized: boolean;
  allowance: string;
  allowanceFormatted: string;
  needsApproval: boolean;
  userAddress: string;
  sessionOwner: string;
  addressesMatch: boolean;
  erc8004TokenAddress: string;
  frontendTokenAddress: string;
  tokenAddressMatch: boolean;
  paymentAmount: string;
  hasEnoughAllowance: boolean;
}

/**
 * 检查支付授权状态
 */
export async function checkPaymentAuthorization(params: {
  sessionId: string;
  erc8004ContractAddress: string;
  tokenAddress: string;
  paymentAmount: string; // 最小单位的金额
  tokenDecimals: number;
}): Promise<AuthorizationCheckResult> {
  if (!window.ethereum) {
    throw new Error('请先连接钱包');
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const userAddress = await signer.getAddress();

  // 1. 查询 Session 信息
  const erc8004ABI = [
    'function getSession(bytes32 sessionId) view returns (tuple(address signer, address owner, uint256 singleLimit, uint256 dailyLimit, uint256 usedToday, uint256 expiry, uint256 lastResetDate, bool isActive))',
    'function usdcToken() view returns (address)',
  ];

  const erc8004Contract = new ethers.Contract(
    params.erc8004ContractAddress,
    erc8004ABI,
    provider,
  );

  const session = await erc8004Contract.getSession(params.sessionId);
  const sessionOwner = session.owner;
  const addressesMatch = sessionOwner.toLowerCase() === userAddress.toLowerCase();

  // 2. 查询 ERC8004 合约使用的代币地址
  const erc8004TokenAddress = await erc8004Contract.usdcToken();
  const tokenAddressMatch =
    erc8004TokenAddress.toLowerCase() === params.tokenAddress.toLowerCase();

  // 3. 查询授权额度
  const tokenABI = [
    'function allowance(address owner, address spender) view returns (uint256)',
    'function decimals() view returns (uint8)',
  ];

  const tokenContract = new ethers.Contract(
    params.tokenAddress,
    tokenABI,
    provider,
  );

  const allowance = await tokenContract.allowance(
    userAddress,
    params.erc8004ContractAddress,
  );

  const allowanceFormatted = ethers.formatUnits(allowance, params.tokenDecimals);
  const paymentAmountFormatted = ethers.formatUnits(
    params.paymentAmount,
    params.tokenDecimals,
  );

  const hasEnoughAllowance = BigInt(allowance) >= BigInt(params.paymentAmount);
  const isAuthorized = BigInt(allowance) > BigInt(0);
  const needsApproval = !hasEnoughAllowance;

  return {
    isAuthorized,
    allowance: allowance.toString(),
    allowanceFormatted,
    needsApproval,
    userAddress,
    sessionOwner,
    addressesMatch,
    erc8004TokenAddress,
    frontendTokenAddress: params.tokenAddress,
    tokenAddressMatch,
    paymentAmount: params.paymentAmount,
    hasEnoughAllowance,
  };
}

/**
 * 格式化诊断结果
 */
export function formatAuthorizationCheckResult(
  result: AuthorizationCheckResult,
): string {
  const issues: string[] = [];
  const ok: string[] = [];

  if (!result.addressesMatch) {
    issues.push(
      `❌ 钱包地址不匹配：用户钱包 ${result.userAddress}，Session Owner ${result.sessionOwner}`,
    );
  } else {
    ok.push(`✅ 钱包地址匹配：${result.userAddress}`);
  }

  if (!result.tokenAddressMatch) {
    issues.push(
      `❌ 代币地址不匹配：ERC8004合约使用 ${result.erc8004TokenAddress}，前端授权 ${result.frontendTokenAddress}`,
    );
  } else {
    ok.push(`✅ 代币地址匹配：${result.frontendTokenAddress}`);
  }

  if (!result.isAuthorized) {
    issues.push(`❌ 未授权：授权额度为 0`);
  } else if (!result.hasEnoughAllowance) {
    issues.push(
      `❌ 授权额度不足：当前授权 ${result.allowanceFormatted}，需要 ${ethers.formatUnits(result.paymentAmount, 18)}`,
    );
  } else {
    ok.push(
      `✅ 授权充足：当前授权 ${result.allowanceFormatted}，支付金额 ${ethers.formatUnits(result.paymentAmount, 18)}`,
    );
  }

  let message = '📋 授权状态检查结果：\n\n';
  if (ok.length > 0) {
    message += '✅ 正常项：\n';
    ok.forEach((item) => {
      message += `  ${item}\n`;
    });
    message += '\n';
  }

  if (issues.length > 0) {
    message += '❌ 问题项：\n';
    issues.forEach((item) => {
      message += `  ${item}\n`;
    });
    message += '\n';
    message += '💡 解决方案：\n';
    if (!result.addressesMatch) {
      message +=
        '  1. 使用创建 Session 时的钱包地址，或重新创建 Session\n';
    }
    if (!result.tokenAddressMatch) {
      message +=
        '  2. 检查并更新前端授权逻辑，使用正确的代币地址\n';
    }
    if (!result.isAuthorized || !result.hasEnoughAllowance) {
      message +=
        '  3. 重新授权：打开 Session Manager，撤销现有 Session，重新创建 Session（会自动授权）\n';
    }
  } else {
    message += '✅ 所有检查通过！如果钱包仍未扣款，请检查链上交易详情。\n';
  }

  return message;
}

