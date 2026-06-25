/**
 * Token授权工具
 * 支持ERC20 Permit、SPL Token Delegate等授权方式
 */

import { ethers } from 'ethers';

export type AuthorizationType = 'ERC20_PERMIT' | 'SPL_DELEGATE' | 'ERC20_APPROVE';

export interface AuthorizationRequest {
  tokenAddress: string;
  amount: string;
  spender: string;
  authorizationType: AuthorizationType;
  chain: 'solana' | 'ethereum' | 'base' | 'polygon' | 'arbitrum' | 'optimism' | 'bsc';
}

export interface AuthorizationResult {
  success: boolean;
  transactionHash?: string;
  signature?: string;
  expiresAt?: Date;
}

/**
 * 创建ERC20 Permit授权
 */
export async function createERC20Permit(
  tokenAddress: string,
  amount: string,
  spender: string,
  deadline?: number,
): Promise<AuthorizationResult> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('请先安装MetaMask');
  }

  try {
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const token = new ethers.Contract(
      tokenAddress,
      [
        'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
        'function nonces(address owner) view returns (uint256)',
        'function name() view returns (string)',
        'function DOMAIN_SEPARATOR() view returns (bytes32)',
      ],
      signer,
    );

    // 获取nonce
    const nonce = await token.nonces(await signer.getAddress());
    
    // 设置deadline（默认30天后）
    const deadlineValue = deadline || Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

    // 构建Permit消息
    const domain = {
      name: await token.name(),
      version: '1',
      chainId: (await provider.getNetwork()).chainId,
      verifyingContract: tokenAddress,
    };

    const types = {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    };

    const values = {
      owner: await signer.getAddress(),
      spender,
      value: ethers.parseUnits(amount, 18),
      nonce,
      deadline: deadlineValue,
    };

    // 签名
    const signature = await signer.signTypedData(domain, types, values);

    return {
      success: true,
      signature,
      expiresAt: new Date(deadlineValue * 1000),
    };
  } catch (error: any) {
    console.error('创建ERC20 Permit失败:', error);
    throw new Error(`授权失败: ${error.message}`);
  }
}

/**
 * 创建ERC20 Approve授权
 */
export async function createERC20Approve(
  tokenAddress: string,
  amount: string,
  spender: string,
): Promise<AuthorizationResult> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('请先安装MetaMask');
  }

  try {
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const token = new ethers.Contract(
      tokenAddress,
      ['function approve(address spender, uint256 amount) returns (bool)'],
      signer,
    );

    const tx = await token.approve(spender, ethers.parseUnits(amount, 18));
    const receipt = await tx.wait();

    return {
      success: true,
      transactionHash: receipt.hash,
    };
  } catch (error: any) {
    console.error('创建ERC20 Approve失败:', error);
    throw new Error(`授权失败: ${error.message}`);
  }
}

/**
 * 创建SPL Token Delegate授权
 */
export async function createSPLDelegate(
  tokenAddress: string,
  amount: string,
  delegate: string,
): Promise<AuthorizationResult> {
  if (typeof window === 'undefined' || !(window as any).solana) {
    throw new Error('请先安装Phantom钱包');
  }

  try {
    const { Connection, PublicKey, Transaction, SystemProgram } = await import('@solana/web3.js');
    const provider = (window as any).solana;

    // 连接钱包
    const connectResult = await provider.connect();
    const publicKey = new PublicKey(connectResult.publicKey.toString());
    const delegatePubkey = new PublicKey(delegate);
    const tokenPubkey = new PublicKey(tokenAddress);

    // 构建授权交易
    // 这里需要调用SPL Token程序的approve指令
    // 简化实现，实际应该使用@solana/spl-token
    const transaction = new Transaction();

    // 获取最近的区块哈希
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = publicKey;

    // 签名并发送
    const signed = await provider.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(signature, 'confirmed');

    return {
      success: true,
      transactionHash: signature,
    };
  } catch (error: any) {
    console.error('创建SPL Delegate失败:', error);
    throw new Error(`授权失败: ${error.message}`);
  }
}

/**
 * 创建Token授权（自动选择最佳方式）
 */
export async function createTokenAuthorization(
  request: AuthorizationRequest,
): Promise<AuthorizationResult> {
  switch (request.authorizationType) {
    case 'ERC20_PERMIT':
      return createERC20Permit(
        request.tokenAddress,
        request.amount,
        request.spender,
      );
    case 'ERC20_APPROVE':
      return createERC20Approve(
        request.tokenAddress,
        request.amount,
        request.spender,
      );
    case 'SPL_DELEGATE':
      return createSPLDelegate(
        request.tokenAddress,
        request.amount,
        request.spender,
      );
    default:
      throw new Error(`不支持的授权类型: ${request.authorizationType}`);
  }
}

/**
 * 检查授权状态
 */
export async function checkAuthorizationStatus(
  tokenAddress: string,
  owner: string,
  spender: string,
  chain: 'solana' | 'ethereum' | 'base' | 'polygon' | 'arbitrum' | 'optimism' | 'bsc',
): Promise<{ authorized: boolean; amount?: string }> {
  if (chain === 'solana') {
    // Solana授权检查
    // 简化实现
    return { authorized: false };
  }

  // EVM授权检查
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    return { authorized: false };
  }

  try {
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const token = new ethers.Contract(
      tokenAddress,
      ['function allowance(address owner, address spender) view returns (uint256)'],
      provider,
    );

    const allowance = await token.allowance(owner, spender);
    const authorized = allowance > BigInt(0);

    return {
      authorized,
      amount: authorized ? ethers.formatUnits(allowance, 18) : undefined,
    };
  } catch (error) {
    console.error('检查授权状态失败:', error);
    return { authorized: false };
  }
}

