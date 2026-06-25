import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useWeb3 } from '../../contexts/Web3Context';
import { useUser } from '../../contexts/UserContext';
import { useToast } from '../../contexts/ToastContext';
import { authApi } from '../../lib/api/auth.api';
import { API_BASE_URL } from '../../lib/api/client';
import { Wallet, Mail, ArrowRight, Shield, Globe, Sparkles, Coins, Heart, ShoppingBag, Zap } from 'lucide-react';
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
    <div className="min-h-screen flex bg-ax-base text-ax-ink overflow-hidden">
      <Head>
        <title>Login | Agentrix</title>
      </Head>

      {/* Left Panel - Branding & Visuals (v4 mesh gradient + shimmer copy) */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 ax-mesh-bg">
        {/* Grid lines decoration */}
        <div className="absolute inset-0 ax-grid-bg opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />

        {/* Animated aurora orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-ax-purple/22 rounded-full blur-[110px] animate-pulse" style={{ animationDuration: '7s' }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-ax-accent/18 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '9s', animationDelay: '1.5s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-[0.07]">
          <div className="h-full w-full rounded-full bg-ax-aurora animate-ax-aurora blur-3xl" />
        </div>

        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <div className="w-9 h-9 bg-gradient-to-tr from-ax-purple to-ax-accent rounded-ax-sm flex items-center justify-center shadow-ax-glow">
              <Zap className="w-5 h-5 text-white fill-current" />
            </div>
            <span className="ax-text-gradient">Agentrix</span>
          </Link>
        </div>

        <div className="relative z-10 max-w-lg space-y-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-5xl font-bold leading-[1.08] tracking-tight mb-5">
              Pet-as-Agent <br/>
              <span className="ax-text-gradient">Economy</span>
            </h1>
            <p className="text-base text-ax-fog leading-relaxed">
              {`Raise a living agent that companions you, works for you, and earns for you — across Mobile, Desktop, Web, Watch and Toy.`}
            </p>
          </motion.div>

          {/* Animated pet card mockup — gives the panel a real product preview */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.7 }}
            className="relative rounded-ax-lg border border-white/12 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-5 backdrop-blur-xl shadow-ax-lg"
          >
            <div className="flex items-center gap-4">
              {/* Animated pet avatar */}
              <div className="relative shrink-0">
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-ax-purple/40 to-ax-accent/30 backdrop-blur border border-white/15 flex items-center justify-center text-3xl shadow-ax-md">
                  <motion.span
                    animate={{ scale: [1, 1.08, 1], rotate: [0, -5, 5, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    🥰
                  </motion.span>
                </div>
                <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-ax-success border-2 border-ax-base flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-ax-ink">Claw</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-ax-purple/20 text-ax-purpleSoft border border-ax-purple/30">Lv.7</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-ax-accent/15 text-ax-accent border border-ax-accent/25">Love</span>
                </div>
                <div className="space-y-1.5">
                  {/* Intimacy XP bar */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-ax-mist mb-0.5">
                      <span>Intimacy XP</span>
                      <span className="tabular-nums">342 / 500</span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: '68%' }}
                        transition={{ delay: 0.8, duration: 1.2, ease: 'easeOut' }}
                        className="h-full bg-gradient-to-r from-ax-purple to-ax-purpleSoft"
                      />
                    </div>
                  </div>
                  {/* Energy bar */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-ax-mist mb-0.5">
                      <span>Energy</span>
                      <span className="tabular-nums">72%</span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: '72%' }}
                        transition={{ delay: 1.0, duration: 1.2, ease: 'easeOut' }}
                        className="h-full bg-gradient-to-r from-ax-warm to-ax-warmSoft"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Activity ticker */}
            <div className="mt-4 pt-3 border-t border-white/8 flex items-center gap-2 text-[11px] text-ax-fog">
              <motion.div
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="h-1.5 w-1.5 rounded-full bg-ax-accent shrink-0"
              />
              <span className="truncate italic">"earned <span className="text-ax-accent font-semibold">+$2.40</span> from skill marketplace · 3m ago"</span>
            </div>
          </motion.div>

          {/* Compact 4 features */}
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { icon: Heart, label: 'Living Pet', desc: '10 emotions' },
              { icon: Shield, label: 'MPC Wallet', desc: '3-share secure' },
              { icon: Coins, label: 'AXP Points', desc: '$0.001 / point' },
              { icon: ShoppingBag, label: 'Skill Market', desc: 'A2A · X402' },
            ].map((item, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + (i * 0.08) }}
                className="p-2.5 rounded-ax-md bg-white/[0.04] border border-ax-line backdrop-blur-sm hover:border-ax-accent/30 hover:bg-white/[0.06] transition-all"
              >
                <div className="flex items-center gap-2">
                  <item.icon className="w-4 h-4 text-ax-accent shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-xs text-ax-ink truncate">{item.label}</div>
                    <div className="text-[10px] text-ax-mist truncate">{item.desc}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-xs text-ax-mist">
          © {new Date().getFullYear()} Agentrix Network. All rights reserved.
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative bg-ax-base">
        <div className="absolute inset-0 bg-gradient-to-bl from-ax-accent/5 via-transparent to-ax-purple/5 opacity-60 pointer-events-none" />
        
        <div className="w-full max-w-md space-y-8 relative z-10">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center">
            <Link href="/" className="flex items-center gap-2 text-xl font-bold">
              <div className="w-8 h-8 bg-gradient-to-tr from-ax-purple to-ax-accent rounded-ax-sm flex items-center justify-center">
                <Zap className="w-4 h-4 text-white fill-current" />
              </div>
              <span className="ax-text-gradient">Agentrix</span>
            </Link>
          </div>

          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold text-ax-ink mb-2 tracking-tight">
              {isRegister ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-ax-fog text-sm">
              {isRegister ? 'Start raising your AI pet today.' : 'Sign in to your Agent Console.'}
            </p>
          </div>

          {/* Auth Method Header */}
          {authMethod === 'email' && (
            <button
              onClick={() => setAuthMethod('web3')}
              className="flex items-center gap-2 text-sm text-ax-mist hover:text-ax-ink transition-colors mb-4"
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
              Back to all login options
            </button>
          )}

          <div className="min-h-[300px]">
            {authMethod === 'web3' ? (
              <div className="space-y-4 animate-ax-fade-up">
                <div className="grid gap-3">
                  {[
                    { id: 'metamask', name: 'MetaMask', icon: '/icons/metamask.svg', color: 'hover:bg-orange-500/8 hover:border-orange-500/40' },
                    { id: 'walletconnect', name: 'WalletConnect', icon: '/icons/walletconnect.svg', color: 'hover:bg-ax-accent/8 hover:border-ax-accent/40' },
                    { id: 'coinbase', name: 'Coinbase Wallet', icon: '/icons/coinbase.svg', color: 'hover:bg-blue-600/8 hover:border-blue-600/40' }
                  ].map((wallet) => (
                    <button
                      key={wallet.id}
                      onClick={() => handleWeb3Login(wallet.id)}
                      disabled={isLoading}
                      className={`group relative flex items-center p-3.5 border border-ax-line rounded-ax-md bg-white/[0.03] transition-all ${wallet.color}`}
                    >
                      <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center mr-3">
                        <Wallet className="w-5 h-5 text-ax-ink" />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="font-semibold text-sm text-ax-ink group-hover:text-ax-accent transition-colors">{wallet.name}</h3>
                        <p className="text-xs text-ax-mist">Connect securely</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-ax-mist group-hover:text-ax-ink group-hover:translate-x-1 transition-all" />
                    </button>
                  ))}
                </div>

                {/* Social Login Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-ax-line"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-3 bg-ax-base text-ax-mist uppercase tracking-wider">Or continue with</span>
                  </div>
                </div>

                {/* Social Login Options */}
                <div className="space-y-2.5">
                  <button
                    onClick={() => window.location.href = `${API_BASE_URL}/auth/google?create_wallet=true`}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-3 p-3 border border-ax-line rounded-ax-md bg-white/[0.03] hover:bg-white/[0.06] hover:border-ax-lineStrong transition-all group"
                    title="Sign in with Google"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#EA4335" d="M5.26620003,9.76452941 C6.19878754,6.93863203 8.85444915,4.90909091 12,4.90909091 C13.6909091,4.90909091 15.2181818,5.50909091 16.4181818,6.49090909 L19.9090909,3 C17.7818182,1.14545455 15.0545455,0 12,0 C7.27006974,0 3.1977497,2.69829785 1.23999023,6.65002441 L5.26620003,9.76452941 Z"/>
                      <path fill="#34A853" d="M16.0407269,18.0125889 C14.9509167,18.7163016 13.5660892,19.0909091 12,19.0909091 C8.86648613,19.0909091 6.21911939,17.076871 5.27698177,14.2678769 L1.23746264,17.3349879 C3.19279051,21.2936293 7.26500293,24 12,24 C14.9328362,24 17.7353462,22.9573905 19.834192,20.9995801 L16.0407269,18.0125889 Z"/>
                      <path fill="#4A90E2" d="M19.834192,20.9995801 C22.0291676,18.9520994 23.4545455,15.903663 23.4545455,12 C23.4545455,11.2909091 23.3454545,10.5272727 23.1818182,9.81818182 L12,9.81818182 L12,14.4545455 L18.4363636,14.4545455 C18.1187732,16.013626 17.2662994,17.2212117 16.0407269,18.0125889 L19.834192,20.9995801 Z"/>
                      <path fill="#FBBC05" d="M5.27698177,14.2678769 C5.03832634,13.556323 4.90909091,12.7937589 4.90909091,12 C4.90909091,11.2182781 5.03443647,10.4668121 5.26620003,9.76452941 L1.23999023,6.65002441 C0.43658717,8.26043162 0,10.0753848 0,12 C0,13.9195484 0.444780743,15.7301709 1.23746264,17.3349879 L5.27698177,14.2678769 Z"/>
                    </svg>
                    <span className="text-ax-ink font-medium text-sm">Continue with Google</span>
                  </button>
                  <button
                    onClick={() => window.location.href = `${API_BASE_URL}/auth/twitter?create_wallet=true`}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-3 p-3 border border-ax-line rounded-ax-md bg-white/[0.03] hover:bg-white/[0.06] hover:border-ax-lineStrong transition-all group"
                    title="Sign in with X (Twitter)"
                  >
                    <svg className="w-5 h-5 text-ax-ink" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    <span className="text-ax-ink font-medium text-sm">Continue with X</span>
                  </button>
                  <button
                    onClick={() => window.location.href = `${API_BASE_URL}/auth/discord?create_wallet=true`}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-3 p-3 border border-ax-line rounded-ax-md bg-white/[0.03] hover:bg-white/[0.06] hover:border-ax-lineStrong transition-all group"
                    title="Sign in with Discord"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#5865F2">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                    <span className="text-ax-ink font-medium text-sm">Continue with Discord</span>
                  </button>
                  <button
                    onClick={() => setAuthMethod('email')}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-3 p-3 border border-ax-line rounded-ax-md bg-white/[0.03] hover:bg-white/[0.06] hover:border-ax-lineStrong transition-all group"
                    title="Sign in with Email"
                  >
                    <Mail className="w-5 h-5 text-ax-ink" />
                    <span className="text-ax-ink font-medium text-sm">Continue with Email</span>
                  </button>
                </div>

                <p className="text-[11px] text-center text-ax-mist mt-4">
                  By connecting, you agree to our Terms of Service and Privacy Policy.
                </p>

                {/* MPC Wallet CTA */}
                <div className="mt-6 pt-6 border-t border-ax-line">
                  <p className="text-xs text-center text-ax-fog inline-flex items-center gap-1.5 justify-center w-full">
                    <Sparkles className="w-3.5 h-3.5 text-ax-accent" />
                    All social logins auto-create a secure MPC wallet for you
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleEmailAuth} className="space-y-5 animate-ax-fade-up">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-ax-fog">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-ax-panel/50 border border-ax-line rounded-ax-md focus:ring-2 focus:ring-ax-accent/40 focus:border-ax-accent outline-none !text-ax-ink !bg-ax-panel/50 placeholder:text-ax-mist transition-all"
                    placeholder="name@company.com"
                    style={{ color: 'var(--ax-text-primary)', backgroundColor: 'rgba(20,25,37,0.5)' }}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-ax-fog">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-ax-panel/50 border border-ax-line rounded-ax-md focus:ring-2 focus:ring-ax-accent/40 focus:border-ax-accent outline-none !text-ax-ink placeholder:text-ax-mist transition-all"
                    placeholder="••••••••"
                    style={{ color: 'var(--ax-text-primary)', backgroundColor: 'rgba(20,25,37,0.5)' }}
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 bg-gradient-to-r from-ax-accent to-ax-purpleSoft hover:shadow-ax-glow text-ax-base font-bold rounded-ax-md shadow-ax-md transform hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Processing...' : isRegister ? 'Create Account' : 'Sign In'}
                </button>

                <div className="text-center pt-4">
                  <button
                    type="button"
                    onClick={() => router.push('/auth/register')}
                    className="text-sm text-ax-mist hover:text-ax-ink transition-colors"
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
