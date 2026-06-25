/**
 * OAuth Login Page - P2: OAuth 2.0 完善
 * 
 * 用于第三方平台（ChatGPT/Claude）OAuth 授权流程的登录页面
 * 用户登录后，将授权码返回给第三方平台
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Loader2, Shield, CheckCircle, AlertCircle } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.agentrix.top/api';

interface OAuthParams {
  client_id: string;
  redirect_uri: string;
  state: string;
  scope: string;
  response_type: string;
}

const clientNames: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  'agentrix-web': 'Agentrix Web',
  'agentrix-mobile': 'Agentrix Mobile',
};

const scopeDescriptions: Record<string, string> = {
  all: '完整访问权限',
  read: '只读访问',
  'read:profile': '读取个人资料',
  'write:orders': '创建订单',
  'read:balance': '查看余额',
};

export default function OAuthLoginPage() {
  const router = useRouter();
  const [oauthParams, setOauthParams] = useState<OAuthParams | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'login' | 'authorize' | 'success'>('login');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (router.isReady) {
      const { client_id, redirect_uri, state, scope, response_type } = router.query;
      
      if (client_id && redirect_uri) {
        setOauthParams({
          client_id: client_id as string,
          redirect_uri: redirect_uri as string,
          state: (state as string) || '',
          scope: (scope as string) || 'all',
          response_type: (response_type as string) || 'code',
        });
      }
    }
  }, [router.isReady, router.query]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || '登录失败');
      }

      // 保存 token
      localStorage.setItem('access_token', data.access_token);
      setUserId(data.user.id);
      setStep('authorize');
    } catch (err: any) {
      setError(err.message || '登录失败，请检查邮箱和密码');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthorize = async () => {
    if (!oauthParams || !userId) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/oauth/authorize/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          client_id: oauthParams.client_id,
          redirect_uri: oauthParams.redirect_uri,
          state: oauthParams.state,
          scope: oauthParams.scope,
        }),
      });

      if (response.redirected) {
        window.location.href = response.url;
        return;
      }

      // 如果没有重定向，手动处理
      const data = await response.json();
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      } else {
        setStep('success');
      }
    } catch (err: any) {
      setError(err.message || '授权失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeny = () => {
    if (!oauthParams) return;
    
    const callbackUrl = new URL(oauthParams.redirect_uri);
    callbackUrl.searchParams.set('error', 'access_denied');
    callbackUrl.searchParams.set('error_description', 'User denied the authorization request');
    if (oauthParams.state) {
      callbackUrl.searchParams.set('state', oauthParams.state);
    }
    window.location.href = callbackUrl.toString();
  };

  if (!oauthParams) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <span className="ml-2">加载中...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const clientName = clientNames[oauthParams.client_id] || oauthParams.client_id;
  const scopeDesc = scopeDescriptions[oauthParams.scope] || oauthParams.scope;

  return (
    <>
      <Head>
        <title>授权登录 - Agentrix</title>
      </Head>

      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-blue-500" />
            </div>
            <CardTitle className="text-xl">
              {step === 'login' && '登录 Agentrix'}
              {step === 'authorize' && '授权请求'}
              {step === 'success' && '授权成功'}
            </CardTitle>
            <CardDescription>
              {step === 'login' && `${clientName} 请求访问您的 Agentrix 账户`}
              {step === 'authorize' && `确认授予 ${clientName} 以下权限`}
              {step === 'success' && '您可以关闭此页面'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm text-red-500">{error}</span>
              </div>
            )}

            {step === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium">邮箱</label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium">密码</label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      登录中...
                    </>
                  ) : (
                    '登录'
                  )}
                </Button>
              </form>
            )}

            {step === 'authorize' && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-gray-100 dark:bg-gray-800">
                  <h4 className="font-medium mb-2">请求的权限：</h4>
                  <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      {scopeDesc}
                    </li>
                    {oauthParams.scope === 'all' && (
                      <>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          读取您的个人资料
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          代表您执行操作
                        </li>
                      </>
                    )}
                  </ul>
                </div>

                <div className="text-xs text-gray-500 text-center">
                  授权后，{clientName} 将能够访问您的账户信息
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleDeny}
                    disabled={isLoading}
                  >
                    拒绝
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleAuthorize}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        授权中...
                      </>
                    ) : (
                      '授权'
                    )}
                  </Button>
                </div>
              </div>
            )}

            {step === 'success' && (
              <div className="text-center py-4">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">
                  授权已完成，正在返回 {clientName}...
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
