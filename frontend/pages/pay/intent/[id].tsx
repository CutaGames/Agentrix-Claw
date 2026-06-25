import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  ShieldCheck, 
  CreditCard, 
  Wallet, 
  ArrowRight,
  Lock,
  Info
} from 'lucide-react';
import { payIntentApi, PayIntent } from '../../../lib/api/pay-intent.api';
import { formatCurrency } from '../../../utils/format';
import { useWeb3 } from '../../../contexts/Web3Context';
import { ethers } from 'ethers';

const TOKEN_CONFIG: Record<string, { address: string; decimals: number }> = {
  USDT: {
    address: process.env.NEXT_PUBLIC_BSC_TESTNET_USDT_ADDRESS || '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
    decimals: 18,
  },
  USDC: {
    address: process.env.NEXT_PUBLIC_BSC_TESTNET_USDC_ADDRESS || '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
    decimals: 18,
  },
};

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function decimals() external view returns (uint8)',
  'function balanceOf(address account) external view returns (uint256)',
];

const BSC_TESTNET_PARAMS = {
  chainId: '0x61', // 97
  chainName: 'Binance Smart Chain Testnet',
  nativeCurrency: {
    name: 'tBNB',
    symbol: 'tBNB',
    decimals: 18,
  },
  rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545/'],
  blockExplorerUrls: ['https://testnet.bscscan.com'],
};

const PayIntentPage = () => {
  const router = useRouter();
  const { id, auto } = router.query;
  const { address, isConnected, connect } = useWeb3();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payIntent, setPayIntent] = useState<PayIntent | null>(null);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [autoTriggered, setAutoTriggered] = useState(false);

  const fetchPayIntent = useCallback(async () => {
    if (!id) return;
    
    // 检查是否是本地生成的临时 ID
    if ((id as string).startsWith('local-')) {
      setError('此支付链接是本地临时生成的，无法在其他设备上使用。请在原始设备上使用钱包支付功能，或重新生成支付二维码。');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const data = await payIntentApi.get(id as string);
      setPayIntent(data);
      
      // 如果已经完成，直接显示成功
      if (data.status === 'completed' || data.status === 'succeeded') {
        setSuccess(true);
      }
    } catch (err: any) {
      console.error('Failed to fetch pay intent:', err);
      // 提供更详细的错误信息
      if (err.message?.includes('不存在') || err.message?.includes('not found')) {
        setError('支付意图不存在或已过期。请返回商品页面重新发起支付。');
      } else {
        setError(err.message || '无法加载支付信息');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPayIntent();
  }, [fetchPayIntent]);

  // 自动触发逻辑 (Moved below handleConfirm)

  const handleConfirm = React.useCallback(async () => {
    if (!payIntent) return;
    
    try {
      setProcessing(true);
      setError(null);
      
      let txHash = '';

      // 如果在钱包浏览器中，且是加密货币支付，则执行链上转账
      // V3.0: 增加对 USD 的支持，将其视为 USDT 进行链上转账
      const currencyUpper = payIntent.currency.toUpperCase();
      const isCrypto = ['USDT', 'USDC', 'BNB', 'ETH', 'USD'].includes(currencyUpper);
      
      if (isCrypto && window.ethereum && isConnected) {
        try {
          // Starting on-chain transaction for PayIntent
          
          // 检查并切换到 BSC Testnet
          const provider = new ethers.BrowserProvider(window.ethereum);
          const network = await provider.getNetwork();
          const targetChainId = BigInt(BSC_TESTNET_PARAMS.chainId);
          
          if (network.chainId !== targetChainId) {
            // Switching network
            try {
              await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: BSC_TESTNET_PARAMS.chainId }],
              });
            } catch (switchError: any) {
              if (switchError.code === 4902) {
                await window.ethereum.request({
                  method: 'wallet_addEthereumChain',
                  params: [BSC_TESTNET_PARAMS],
                });
              } else {
                throw switchError;
              }
            }
            // 切换后重新获取 provider 和 signer
            await new Promise(resolve => setTimeout(resolve, 1000)); // 等待切换生效
          }

          const signer = await provider.getSigner();
          
          const to = payIntent.metadata?.to || 
                     process.env.NEXT_PUBLIC_COMMISSION_CONTRACT_ADDRESS || 
                     '0x4d10DA389E0ADe7E7a7E3232531048aEaCa4021C';
          if (!to) throw new Error('未找到收款地址');

          // 如果是 USD，映射到 USDT 进行链上转账
          const tokenSymbol = currencyUpper === 'USD' ? 'USDT' : currencyUpper;
          const config = TOKEN_CONFIG[tokenSymbol];
          
          if (config) {
            const tokenContract = new ethers.Contract(config.address, ERC20_ABI, signer);
            const amountInWei = ethers.parseUnits(payIntent.amount.toString(), config.decimals);
            
            // Transferring tokens
            const tx = await tokenContract.transfer(to, amountInWei);
            // Transaction sent
            txHash = tx.hash;
            
            // 等待交易确认（可选，但为了用户体验建议等待）
            // await tx.wait(); 
          } else if (tokenSymbol === 'BNB' || tokenSymbol === 'ETH') {
            const amountInWei = ethers.parseUnits(payIntent.amount.toString(), 18);
            const tx = await signer.sendTransaction({
              to,
              value: amountInWei
            });
            txHash = tx.hash;
          }
        } catch (txErr: any) {
          console.error('On-chain transaction failed:', txErr);
          throw new Error('钱包交易失败: ' + (txErr.reason || txErr.message));
        }
      }

      // 1. 授权
      await payIntentApi.authorize(payIntent.id, 'user');
      
      // 2. 执行
      const result = await payIntentApi.execute(payIntent.id, { txHash });
      
      if (result.status === 'completed' || result.status === 'succeeded') {
        setSuccess(true);
        // 如果有 returnUrl，3秒后跳转
        if (result.metadata?.returnUrl) {
          setTimeout(() => {
            window.location.href = result.metadata.returnUrl;
          }, 3000);
        }
      } else {
        throw new Error('支付执行未完成: ' + result.status);
      }
    } catch (err: any) {
      console.error('Payment failed:', err);
      setError(err.message || '支付失败，请重试');
    } finally {
      setProcessing(false);
    }
  }, [payIntent, isConnected, address, connect]);

  // 自动触发逻辑
  useEffect(() => {
    if (auto === 'true' && payIntent && !loading && !processing && !success && !autoTriggered) {
      if (isConnected) {
        // Auto-triggering payment for connected wallet
        setAutoTriggered(true);
        handleConfirm();
      } else if (window.ethereum) {
        // 如果在钱包浏览器中但未连接，尝试自动连接
        // 默认尝试连接 metamask (EVM 兼容钱包)
        connect('metamask').catch(err => console.error('Auto-connect failed:', err));
      }
    }
  }, [auto, payIntent, loading, isConnected, autoTriggered, address, connect, processing, success, handleConfirm]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <p className="text-gray-600 font-medium">正在加载支付信息...</p>
      </div>
    );
  }

  if (error && !payIntent) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">支付加载失败</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button 
            onClick={() => router.back()}
            className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">支付成功</h1>
          <p className="text-gray-600 mb-8">
            您已成功支付 {formatCurrency(payIntent?.amount || 0, payIntent?.currency || 'USD')}
          </p>
          
          {payIntent?.metadata?.returnUrl ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">正在为您跳转回商户...</p>
              <a 
                href={payIntent.metadata.returnUrl}
                className="inline-flex items-center text-blue-600 font-medium hover:underline"
              >
                点击此处立即跳转 <ArrowRight className="w-4 h-4 ml-1" />
              </a>
            </div>
          ) : (
            <button 
              onClick={() => router.push('/pay/history')}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              查看支付记录
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <Head>
        <title>Agentrix Checkout - 安全支付</title>
      </Head>

      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">Agentrix Pay</span>
          </div>
          <div className="flex items-center text-gray-500 text-sm">
            <Lock className="w-3 h-3 mr-1" />
            安全加密连接
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          {/* Amount Section */}
          <div className="p-8 text-center border-b border-gray-50 bg-gray-50/30">
            <p className="text-gray-500 text-sm font-medium mb-1 uppercase tracking-wider">支付金额</p>
            <h2 className="text-4xl font-extrabold text-gray-900">
              {formatCurrency(payIntent?.amount || 0, payIntent?.currency || 'USD')}
            </h2>
            <p className="text-gray-600 mt-2 font-medium">{payIntent?.description || '订单支付'}</p>
          </div>

          {/* Details Section */}
          <div className="p-8 space-y-6">
            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">支付详情</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">商户</span>
                  <span className="text-gray-900 font-medium">{payIntent?.merchantId || 'Agentrix Merchant'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">订单号</span>
                  <span className="text-gray-900 font-mono">{payIntent?.orderId || payIntent?.id.substring(0, 8)}</span>
                </div>
                {payIntent?.agentId && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">发起 Agent</span>
                    <span className="text-gray-900 font-medium">{payIntent.agentId}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">选择支付方式</h3>
              <div className="grid grid-cols-1 gap-3">
                <button className="flex items-center justify-between p-4 border-2 border-blue-600 bg-blue-50 rounded-xl transition-all">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                      <Wallet className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-gray-900">Agentrix 钱包</p>
                      <p className="text-xs text-blue-600 font-medium">余额支付 (推荐)</p>
                    </div>
                  </div>
                  <CheckCircle className="w-6 h-6 text-blue-600" />
                </button>

                <button className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-gray-300 transition-all opacity-60 cursor-not-allowed">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                      <CreditCard className="w-6 h-6 text-gray-400" />
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-gray-400">信用卡 / 借记卡</p>
                      <p className="text-xs text-gray-400">即将推出</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <button 
              onClick={isConnected ? handleConfirm : () => connect('metamask')}
              disabled={processing || success}
              className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg shadow-blue-200 transition-all flex items-center justify-center space-x-2 ${
                processing 
                  ? 'bg-blue-400 cursor-not-allowed text-white' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white active:transform active:scale-[0.98]'
              }`}
            >
              {processing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>正在处理...</span>
                </>
              ) : !isConnected ? (
                <>
                  <Wallet className="w-5 h-5" />
                  <span>连接钱包支付</span>
                </>
              ) : (
                <>
                  <span>确认支付 {formatCurrency(payIntent?.amount || 0, payIntent?.currency || 'USD')}</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>

            <div className="flex items-center justify-center space-x-1 text-xs text-gray-400">
              <Info className="w-3 h-3" />
              <span>点击确认即表示您同意 Agentrix 支付服务协议</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-gray-400 text-sm">
            &copy; {new Date().getFullYear()} Agentrix Network. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PayIntentPage;
