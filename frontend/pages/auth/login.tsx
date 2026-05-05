import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useWeb3 } from '../../contexts/Web3Context';
import { useUser } from '../../contexts/UserContext';
import { useToast } from '../../contexts/ToastContext';
import { authApi } from '../../lib/api/auth.api';
import { API_BASE_URL } from '../../lib/api/client';
import { Wallet, Mail, ArrowRight, Shield, Globe, Zap, LayoutGrid, Users, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import type { UserRole } from '../../types/user';

// 动态导入 MPC 钱包设置组件（避免 SSR 问题）
const MPCWalletSetup = dynamic(
  () => import('../../components/auth/MPCWalletSetup'),
  { ssr: false }
);

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated } = useUser();
  const { connect, signMessage } = useWeb3();
  const toast = useToast();
  const mobileCallback = typeof router.query.callback === 'string' ? router.query.callback : null;
  const isWalletFlow = router.query.tab === 'wallet' || router.query.mobile === '1' || !!mobileCallback;
  
  const [authMethod, setAuthMethod] = useState<'web3' | 'email'>('web3');
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  
  // MPC 钱包状态
  const [showMPCSetup, setShowMPCSetup] = useState(false);
  const [pendingUser, setPendingUser] = useState<{
    id: string;
    socialProviderId: string;
    email?: string;
    roles: UserRole[];
    agentrixId: string;
  } | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/console/dashboard');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (isWalletFlow) {
      setAuthMethod('web3');
    }
  }, [isWalletFlow]);

  // Plan B: 当从移动端 WebBrowser 打开时 (mobile=1)，自动触发 WalletConnect 连接
  const autoConnectTriggered = useRef(false);
  useEffect(() => {
    if (router.query.mobile === '1' && mobileCallback && !autoConnectTriggered.current && !isLoading && !isAuthenticated) {
      autoConnectTriggered.current = true;
      // 延迟一小段时间确保页面完全加载
      const timer = setTimeout(() => {
        handleWeb3Login('walletconnect');
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [router.query.mobile, mobileCallback, isLoading, isAuthenticated]);

  // 检查 URL 参数中的社交登录回调
  useEffect(() => {
    const { mpc_setup, user_id, provider_id, email: userEmail } = router.query;
    if (mpc_setup === 'true' && user_id && provider_id) {
      setPendingUser({
        id: user_id as string,
        socialProviderId: provider_id as string,
        email: userEmail as string,
        roles: ['user'],
        agentrixId: '',
      });
      setShowMPCSetup(true);
    }
  }, [router.query]);

  const buildMobileCallbackUrl = (token: string, walletAddress?: string) => {
    if (!mobileCallback) {
      return null;
    }

    try {
      const url = new URL(mobileCallback);
      url.searchParams.set('token', token);
      url.searchParams.set('provider', 'wallet');
      if (walletAddress) {
        url.searchParams.set('walletAddress', walletAddress);
      }
      return url.toString();
    } catch {
      const separator = mobileCallback.includes('?') ? '&' : '?';
      const params = new URLSearchParams({ token, provider: 'wallet' });
      if (walletAddress) {
        params.set('walletAddress', walletAddress);
      }
      return `${mobileCallback}${separator}${params.toString()}`;
    }
  };

  const handleWeb3Login = async (walletType: any) => {
    setIsLoading(true);
    try {
      // Coinbase Wallet 兼容 EIP-1193，映射到 metamask 连接器
      const mappedType = walletType === 'coinbase' ? 'metamask' : walletType;
      const walletInfo = await connect(mappedType);
      if (!walletInfo?.address) throw new Error('Wallet connection failed');

      const challenge = await authApi.getWalletNonce(walletInfo.address);
      const message = challenge.message;
      const signature = await signMessage(message, walletInfo);

      const response = await authApi.walletLogin({
        walletAddress: walletInfo.address,
        walletType: walletInfo.type,
        chain: walletInfo.chain,
        message,
        signature
      });

      if (response && (response as any).user) {
        const callbackUrl = buildMobileCallbackUrl(response.access_token, walletInfo.address);
        if (callbackUrl && typeof window !== 'undefined') {
          window.location.href = callbackUrl;
          return;
        }

        const user = (response as any).user;
        login({
          id: user.id,
          agentrixId: user.agentrixId,
          email: user.email,
          walletAddress: walletInfo.address,
          roles: user.roles || [],
          role: user.roles?.[0] || 'user',
          createdAt: new Date().toISOString()
        });
        toast.success('Login Successful');
        router.push('/console/dashboard');
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Login Failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      let response;
      if (isRegister) {
        response = await authApi.register({ email, password });
      } else {
        response = await authApi.login({ email, password });
      }

      if (response && (response as any).user) {
        const user = (response as any).user;
        login({
          id: user.id,
          agentrixId: user.agentrixId,
          email: user.email,
          roles: user.roles || [],
          role: user.roles?.[0] || 'user',
          createdAt: new Date().toISOString()
        });
        toast.success(isRegister ? 'Registration Successful' : 'Login Successful');
        router.push('/console/dashboard');
      }
    } catch (error: any) {
      toast.error(error.message || 'Authentication Failed');
    } finally {
      setIsLoading(false);
    }
  };

  // MPC 钱包创建完成处理
  const handleMPCWalletComplete = (wallet: any) => {
    if (pendingUser) {
      login({
        id: pendingUser.id,
        agentrixId: pendingUser.agentrixId,
        email: pendingUser.email,
        walletAddress: wallet.walletAddress,
        roles: pendingUser.roles,
        role: pendingUser.roles[0] || 'user',
        createdAt: new Date().toISOString()
      });
      toast.success('Wallet created successfully!');
      router.push('/console/dashboard');
    }
    setShowMPCSetup(false);
  };

  // 跳过 MPC 钱包创建
  const handleMPCSkip = () => {
    if (pendingUser) {
      login({
        id: pendingUser.id,
        agentrixId: pendingUser.agentrixId,
        email: pendingUser.email,
        roles: pendingUser.roles,
        role: pendingUser.roles[0] || 'user',
        createdAt: new Date().toISOString()
      });
      toast.success('Login Successful');
      router.push('/console/dashboard');
    }
    setShowMPCSetup(false);
  };

  return (
    <div className="min-h-screen flex bg-[#0B0F19] text-white overflow-hidden">
      <Head>
        <title>Login | Agentrix</title>
      </Head>

      {/* Left Panel - Branding & Visuals */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 bg-gradient-to-br from-blue-900/20 via-[#0B0F19] to-purple-900/20">
        <div className="absolute inset-0 bg-slate-900 opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] to-transparent" />
        
        {/* Animated Orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[100px] animate-pulse delay-1000" />

        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-2 text-2xl font-bold tracking-tighter">
            <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white fill-current" />
            </div>
            Agentrix
          </Link>
        </div>

        <div className="relative z-10 max-w-lg space-y-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-5xl font-bold leading-tight mb-6">
              The Operating System for <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Autonomous Commerce</span>
            </h1>
            <p className="text-lg text-slate-400 leading-relaxed">
              Empower your AI Agents with native payment, settlement, and operational capabilities. Join the ecosystem where agents do business.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Globe, label: 'Global Payments', desc: 'Fiat & Crypto Hybrid' },
              { icon: Shield, label: 'Enterprise Security', desc: 'Bank-grade MPC Wallets' },
              { icon: LayoutGrid, label: 'Merchant Workspace', desc: 'Full-stack Management' },
              { icon: Users, label: 'Agent Alliance', desc: 'Collaborative Economy' }
            ].map((item, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + (i * 0.1) }}
                className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm"
              >
                <item.icon className="w-6 h-6 text-blue-400 mb-2" />
                <h3 className="font-semibold">{item.label}</h3>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-sm text-slate-500">
          © 2024 Agentrix Protocol. All rights reserved.
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative">
        <div className="absolute inset-0 bg-blue-900/10 opacity-50" />
        
        <div className="w-full max-w-md space-y-8 relative z-10">
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold text-white mb-2">
              {isRegister ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-slate-400">
              {isRegister ? 'Start building your agent economy today.' : 'Enter your credentials to access the workspace.'}
            </p>
          </div>

          {/* Auth Method Header */}
          {authMethod === 'email' && (
            <button
              onClick={() => setAuthMethod('web3')}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-4"
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
              Back to all login options
            </button>
          )}

          <div className="min-h-[300px]">
            {authMethod === 'web3' ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid gap-4">
                  {[
                    { id: 'metamask', name: 'MetaMask', icon: '/icons/metamask.svg', color: 'hover:bg-orange-500/10 hover:border-orange-500/50' },
                    { id: 'walletconnect', name: 'WalletConnect', icon: '/icons/walletconnect.svg', color: 'hover:bg-blue-500/10 hover:border-blue-500/50' },
                    { id: 'coinbase', name: 'Coinbase Wallet', icon: '/icons/coinbase.svg', color: 'hover:bg-blue-600/10 hover:border-blue-600/50' }
                  ].map((wallet) => (
                    <button
                      key={wallet.id}
                      onClick={() => handleWeb3Login(wallet.id)}
                      disabled={isLoading}
                      className={`group relative flex items-center p-4 border border-white/10 rounded-xl bg-white/5 transition-all ${wallet.color}`}
                    >
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mr-4">
                        <Wallet className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors">{wallet.name}</h3>
                        <p className="text-xs text-slate-400">Connect securely</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-white group-hover:translate-x-1 transition-all" />
                    </button>
                  ))}
                </div>

                {/* Social Login Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-3 bg-[#0B0F19] text-slate-500">Or continue with</span>
                  </div>
                </div>

                {/* Social Login Options - Google, X, and Email */}
                <div className="space-y-3">
                  <button
                    onClick={() => window.location.href = `${API_BASE_URL}/auth/google?create_wallet=true`}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-3 p-3 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all group"
                    title="Sign in with Google"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#EA4335" d="M5.26620003,9.76452941 C6.19878754,6.93863203 8.85444915,4.90909091 12,4.90909091 C13.6909091,4.90909091 15.2181818,5.50909091 16.4181818,6.49090909 L19.9090909,3 C17.7818182,1.14545455 15.0545455,0 12,0 C7.27006974,0 3.1977497,2.69829785 1.23999023,6.65002441 L5.26620003,9.76452941 Z"/>
                      <path fill="#34A853" d="M16.0407269,18.0125889 C14.9509167,18.7163016 13.5660892,19.0909091 12,19.0909091 C8.86648613,19.0909091 6.21911939,17.076871 5.27698177,14.2678769 L1.23746264,17.3349879 C3.19279051,21.2936293 7.26500293,24 12,24 C14.9328362,24 17.7353462,22.9573905 19.834192,20.9995801 L16.0407269,18.0125889 Z"/>
                      <path fill="#4A90E2" d="M19.834192,20.9995801 C22.0291676,18.9520994 23.4545455,15.903663 23.4545455,12 C23.4545455,11.2909091 23.3454545,10.5272727 23.1818182,9.81818182 L12,9.81818182 L12,14.4545455 L18.4363636,14.4545455 C18.1187732,16.013626 17.2662994,17.2212117 16.0407269,18.0125889 L19.834192,20.9995801 Z"/>
                      <path fill="#FBBC05" d="M5.27698177,14.2678769 C5.03832634,13.556323 4.90909091,12.7937589 4.90909091,12 C4.90909091,11.2182781 5.03443647,10.4668121 5.26620003,9.76452941 L1.23999023,6.65002441 C0.43658717,8.26043162 0,10.0753848 0,12 C0,13.9195484 0.444780743,15.7301709 1.23746264,17.3349879 L5.27698177,14.2678769 Z"/>
                    </svg>
                    <span className="text-white font-medium">Continue with Google</span>
                  </button>
                  <button
                    onClick={() => window.location.href = `${API_BASE_URL}/auth/twitter?create_wallet=true`}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-3 p-3 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all group"
                    title="Sign in with X (Twitter)"
                  >
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    <span className="text-white font-medium">Continue with X</span>
                  </button>
                  <button
                    onClick={() => setAuthMethod('email')}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-3 p-3 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all group"
                    title="Sign in with Email"
                  >
                    <Mail className="w-5 h-5 text-white" />
                    <span className="text-white font-medium">Continue with Email</span>
                  </button>
                </div>

                <p className="text-xs text-center text-slate-500 mt-4">
                  By connecting, you agree to our Terms of Service and Privacy Policy.
                </p>

                {/* No Wallet CTA - simplified */}
                <div className="mt-6 pt-6 border-t border-white/10">
                  <p className="text-xs text-center text-slate-400 mb-2">
                    <Sparkles className="w-4 h-4 inline mr-1" />
                    All social logins auto-create a secure MPC wallet for you
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleEmailAuth} className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-white placeholder-slate-500 transition-all"
                    placeholder="name@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-white placeholder-slate-500 transition-all"
                    placeholder="••••••••"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-blue-900/20 transform hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Processing...' : isRegister ? 'Create Account' : 'Sign In'}
                </button>

                <div className="text-center pt-4">
                  <button
                    type="button"
                    onClick={() => router.push('/auth/register')}
                    className="text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    Don&apos;t have an account? Sign Up
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* MPC Wallet Setup Modal */}
      {showMPCSetup && pendingUser && (
        <MPCWalletSetup
          userId={pendingUser.id}
          socialProviderId={pendingUser.socialProviderId}
          onComplete={handleMPCWalletComplete}
          onSkip={handleMPCSkip}
        />
      )}
    </div>
  );
}
