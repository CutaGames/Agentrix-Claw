import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useWeb3 } from '../../contexts/Web3Context';
import { useUser } from '../../contexts/UserContext';
import { useToast } from '../../contexts/ToastContext';
import { authApi } from '../../lib/api/auth.api';
import { Wallet, Mail, ArrowRight, Shield, Globe, Zap, LayoutGrid, Users } from 'lucide-react';
import { motion } from 'framer-motion';

export default function RegisterPage() {
  const router = useRouter();
  const { login, isAuthenticated } = useUser();
  const { connect, signMessage } = useWeb3();
  const toast = useToast();
  
  const [authMethod, setAuthMethod] = useState<'web3' | 'email'>('web3');
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(true);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/app/user');
    }
  }, [isAuthenticated, router]);

  const handleWeb3Login = async (walletType: any) => {
    setIsLoading(true);
    try {
      const walletInfo = await connect(walletType);
      if (!walletInfo?.address) throw new Error('Wallet connection failed');

      const message = `Agentrix Login\nAddress: ${walletInfo.address}\nTimestamp: ${Date.now()}`;
      const signature = await signMessage(message, walletInfo);

      const response = await authApi.walletLogin({
        walletAddress: walletInfo.address,
        walletType: walletInfo.type,
        chain: walletInfo.chain,
        message,
        signature
      });

      if (response && (response as any).user) {
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
        router.push('/app/user');
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
        router.push('/app/user');
      }
    } catch (error: any) {
      toast.error(error.message || 'Authentication Failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#0B0F19] text-white overflow-hidden">
      <Head>
        <title>Sign Up | Agentrix</title>
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
              Join the <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Agent Economy</span>
            </h1>
            <p className="text-lg text-slate-400 leading-relaxed">
              Create your account to start building, deploying, and monetizing your autonomous AI agents today.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Globe, label: 'Global Access', desc: 'No borders' },
              { icon: Shield, label: 'Secure', desc: 'Enterprise Grade' },
              { icon: LayoutGrid, label: 'Tools', desc: 'Full Suite' },
              { icon: Users, label: 'Community', desc: 'Growing Fast' }
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
          © {new Date().getFullYear()} Agentrix Protocol. All rights reserved.
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative">
        <div className="absolute inset-0 bg-blue-900/10 opacity-50" />
        
        <div className="w-full max-w-md space-y-8 relative z-10">
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold text-white mb-2">
              Create your account
            </h2>
            <p className="text-slate-400">
              Start building your agent economy today.
            </p>
          </div>

          {/* Auth Method Switcher */}
          <div className="flex p-1 bg-slate-800/50 rounded-lg border border-white/5">
            <button
              onClick={() => setAuthMethod('web3')}
              className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${
                authMethod === 'web3' 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wallet className="w-4 h-4" />
              Web3 Wallet
            </button>
            <button
              onClick={() => setAuthMethod('email')}
              className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${
                authMethod === 'email' 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Mail className="w-4 h-4" />
              Email & Password
            </button>
          </div>

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
                <p className="text-xs text-center text-slate-500 mt-4">
                  By connecting your wallet, you agree to our Terms of Service and Privacy Policy.
                </p>
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
                  {isLoading ? 'Processing...' : 'Create Account'}
                </button>

                <div className="text-center pt-4">
                  <button
                    type="button"
                    onClick={() => router.push('/auth/login')}
                    className="text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    Already have an account? Sign In
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
