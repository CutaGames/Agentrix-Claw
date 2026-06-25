// ClawLink Auth Service — OpenClaw + Social + Wallet Login
// Primary path: OpenClaw bind (scan QR or enter address+token)
// Secondary: Google/Apple/X/Discord/Telegram/Wallet/Email
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Platform, Linking } from 'react-native';
import { apiFetch, saveTokenToStorage, setApiConfig, getApiConfig } from './api';
import { useAuthStore, AuthUser, AuthProvider, OpenClawInstance } from '../stores/authStore';
import { ensureMPCWallet } from './mpcWallet';
import { bindOpenClaw, BindPayload, pollBindSession, createBindSession } from './openclaw.service';

WebBrowser.maybeCompleteAuthSession();

function getBackendBaseUrl(): string {
  return getApiConfig().baseUrl || 'https://api.agentrix.top/api';
}

// ClawLink deep link scheme
function getMobileCallbackUrl(): string {
  return AuthSession.makeRedirectUri({
    scheme: 'clawlink',
    path: 'auth/callback',
  });
}

// 原生 App URI Scheme 配置
const APP_SCHEMES: Record<string, { scheme: string; name: string }> = {
  google: { scheme: Platform.OS === 'ios' ? 'com.google.gmail://' : 'com.google.android.gm://', name: 'Google' },
  twitter: { scheme: 'twitter://', name: 'Twitter/X' },
  discord: { scheme: 'discord://', name: 'Discord' },
  telegram: { scheme: 'tg://', name: 'Telegram' },
  metamask: { scheme: 'metamask://', name: 'MetaMask' },
  tokenpocket: { scheme: 'tpoutside://', name: 'TokenPocket' },
  okx: { scheme: 'okx://', name: 'OKX Wallet' },
};

// ========== 工具函数 ==========

export async function isAppInstalled(appKey: string): Promise<boolean> {
  const config = APP_SCHEMES[appKey];
  if (!config) return false;
  try {
    return await Linking.canOpenURL(config.scheme);
  } catch {
    return false;
  }
}

// ========== 后端 API 类型 ==========

interface LoginResponse {
  access_token: string;
  user: {
    id: string;
    agentrixId: string;
    email?: string;
    nickname?: string;
    avatarUrl?: string;
    roles: string[];
    walletAddress?: string;
  };
}

// ========== 通用登录结果处理 ==========

async function handleLoginResult(
  result: LoginResponse,
  provider?: AuthProvider,
  socialId?: string,
): Promise<AuthUser> {
  const { setAuth } = useAuthStore.getState();

  const user: AuthUser = {
    id: result.user.id,
    agentrixId: result.user.agentrixId,
    email: result.user.email,
    nickname: result.user.nickname,
    avatarUrl: result.user.avatarUrl,
    walletAddress: result.user.walletAddress,
    roles: result.user.roles || ['user'],
    provider,
  };

  setApiConfig({ token: result.access_token });
  await saveTokenToStorage(result.access_token);
  await setAuth(user, result.access_token);

  // 异步创建 MPC 钱包（不阻塞登录）
  if (provider !== 'wallet' && socialId) {
    ensureMPCWallet(socialId)
      .then((walletAddress) => {
        if (walletAddress && !user.walletAddress) {
          const currentState = useAuthStore.getState();
          if (currentState.user) {
            currentState.setAuth(
              { ...currentState.user, walletAddress },
              currentState.token!,
            );
          }
        }
      })
      .catch((err) => {
        console.warn('MPC wallet auto-creation failed (non-blocking):', err.message);
      });
  }

  // 异步获取完整用户信息
  fetchCurrentUser().then((fullUser) => {
    if (fullUser) {
      const currentState = useAuthStore.getState();
      if (currentState.token) {
        currentState.setAuth(fullUser, currentState.token);
      }
    }
  }).catch(() => {});

  return user;
}

// ========== 从 agentrix://auth/callback URL 提取登录结果 ==========

function parseCallbackUrl(url: string): LoginResponse {
  const parsed = new URL(url);
  const error = parsed.searchParams.get('error');
  if (error) throw new Error(error);

  const token = parsed.searchParams.get('token');
  if (!token) throw new Error('No token received from OAuth callback');

  return {
    access_token: token,
    user: {
      id: parsed.searchParams.get('userId') || '',
      agentrixId: parsed.searchParams.get('agentrixId') || '',
      email: parsed.searchParams.get('email') || undefined,
      roles: ['user'],
    },
  };
}

// ========== 核心：尝试唤起原生 App，失败则降级到 Web OAuth ==========
//
// 逻辑：
//   1. Linking.canOpenURL(scheme) 检测是否安装了原生 App
//   2. 如果已安装 → Linking.openURL(scheme) 唤起原生 App
//      同时打开 WebBrowser.openAuthSessionAsync 监听 agentrix:// 回调
//   3. 如果未安装 → 直接走 WebBrowser.openAuthSessionAsync 网页 OAuth
//   4. 后端 /auth/mobile/{provider} 统一处理 OAuth 流程

async function socialLogin(provider: string, providerName: string): Promise<AuthUser> {
  const baseUrl = getBackendBaseUrl();
  const callbackUrl = getMobileCallbackUrl();

  // 将 redirect_uri 传给后端，让后端知道 OAuth 完成后重定向到哪里
  const entryUrl = `${baseUrl}/auth/mobile/${provider}?redirect_uri=${encodeURIComponent(callbackUrl)}`;

  console.log(`[Auth] Starting ${providerName} login`);
  console.log(`[Auth] Entry URL: ${entryUrl}`);
  console.log(`[Auth] Expected callback: ${callbackUrl}`);

  // Note: No HEAD pre-check — it can cause false 403s from nginx/rate-limiting.
  // The openAuthSessionAsync flow will surface backend errors via the redirect URL.

  const result = await WebBrowser.openAuthSessionAsync(entryUrl, callbackUrl, {
    showInRecents: true,
    // 必须为 false：ephemeral session 会清除 cookies，导致 OAuth state 丢失
    preferEphemeralSession: false,
  });

  console.log(`[Auth] ${providerName} result:`, JSON.stringify(result).slice(0, 300));

  if (result.type !== 'success') {
    if (result.type === 'cancel') {
      throw new Error(`User cancelled ${providerName} login`);
    }
    // 'dismiss' often means the callback URL scheme wasn't intercepted
    if (result.type === 'dismiss') {
      throw new Error(
        `${providerName} login dismissed — the OAuth callback may not have redirected correctly. ` +
        `Expected callback: ${callbackUrl}. Please check server OAuth configuration.`
      );
    }
    throw new Error(`${providerName} login failed (${result.type})`);
  }

  // Check for error in the callback URL
  try {
    const loginResult = parseCallbackUrl(result.url);
    return handleLoginResult(loginResult, provider as AuthProvider, loginResult.user?.id);
  } catch (parseErr: any) {
    console.error(`[Auth] Failed to parse ${providerName} callback:`, result.url, parseErr);
    throw new Error(`${providerName} login failed: ${parseErr.message}`);
  }
}

// ========== 1) Google 登录 ==========
// 统一走后端 /auth/mobile/google → Google OAuth → 后端回调 → agentrix://

export async function loginWithGoogle(): Promise<AuthUser> {
  return socialLogin('google', 'Google');
}

// ========== 2) Twitter/X 登录 ==========

export async function loginWithTwitter(): Promise<AuthUser> {
  return socialLogin('twitter', 'Twitter/X');
}

// ========== 3) Discord 登录 ==========

export async function loginWithDiscord(): Promise<AuthUser> {
  return socialLogin('discord', 'Discord');
}

// ========== 4) Telegram 登录 ==========

export async function loginWithTelegram(): Promise<AuthUser> {
  return socialLogin('telegram', 'Telegram');
}

// ========== 5) 钱包登录（简化版）==========
// 检测 MetaMask / TokenPocket → 有则唤起 → 签名 → 登录
// 无则提示安装

export async function loginWithWallet(params: {
  address: string;
  signature: string;
  message: string;
  chainType: 'evm' | 'solana';
}): Promise<AuthUser> {
  const loginResult = await apiFetch<LoginResponse>('/auth/wallet/login', {
    method: 'POST',
    body: JSON.stringify({
      walletAddress: params.address,
      walletType: 'walletconnect',
      chain: params.chainType,
      message: params.message,
      signature: params.signature,
    }),
  });

  return handleLoginResult(loginResult, 'wallet');
}

// 检测已安装的钱包 App 列表
export async function detectInstalledWallets(): Promise<string[]> {
  const walletKeys = ['metamask', 'tokenpocket', 'okx'];
  const installed: string[] = [];
  for (const key of walletKeys) {
    if (await isAppInstalled(key)) {
      installed.push(key);
    }
  }
  return installed;
}

// 唤起钱包 App
export async function openWalletApp(walletKey: string): Promise<boolean> {
  const config = APP_SCHEMES[walletKey];
  if (!config) return false;
  try {
    const canOpen = await Linking.canOpenURL(config.scheme);
    if (canOpen) {
      await Linking.openURL(config.scheme);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ========== 6) 邮箱验证码登录（注册+登录合一，无密码）==========

export async function sendEmailCode(email: string): Promise<{ success: boolean; message: string }> {
  return apiFetch('/auth/email/send-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function loginWithEmailCode(email: string, code: string): Promise<AuthUser> {
  const loginResult = await apiFetch<LoginResponse>('/auth/email/verify-code', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });

  return handleLoginResult(loginResult, 'email');
}

// ========== 兼容：邮箱密码登录（保留旧接口）==========

export async function loginWithEmail(email: string, password: string): Promise<AuthUser> {
  const loginResult = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  return handleLoginResult(loginResult, 'email');
}

export async function registerWithEmail(email: string, password: string): Promise<AuthUser> {
  const registerResult = await apiFetch<LoginResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  return handleLoginResult(registerResult, 'email');
}

// ========== OpenClaw Binding & Login ==========

export async function loginWithOpenClaw(payload: BindPayload): Promise<AuthUser> {
  const { setAuth } = useAuthStore.getState();
  // Try to connect first to validate
  const instance = await bindOpenClaw(payload);
  // Bind also logs the user in (or creates account) — get the token
  const loginResult = await apiFetch<{ access_token: string; user: any }>('/auth/openclaw/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const user: AuthUser = {
    id: loginResult.user.id,
    agentrixId: loginResult.user.agentrixId,
    email: loginResult.user.email,
    nickname: loginResult.user.nickname ?? `OpenClaw User`,
    avatarUrl: loginResult.user.avatarUrl,
    walletAddress: loginResult.user.walletAddress,
    roles: loginResult.user.roles || ['user'],
    provider: 'openclaw',
    openClawInstances: [instance as any],
    activeInstanceId: instance.id,
  };
  setApiConfig({ token: loginResult.access_token });
  await saveTokenToStorage(loginResult.access_token);
  await setAuth(user, loginResult.access_token);
  return user;
}

export async function bindOpenClawToCurrentUser(payload: BindPayload): Promise<OpenClawInstance> {
  const { addInstance } = useAuthStore.getState();
  const instance = await bindOpenClaw(payload);
  const openclawInstance: OpenClawInstance = {
    id: instance.id,
    name: instance.name,
    instanceUrl: instance.instanceUrl,
    status: instance.status,
    version: instance.version,
    deployType: instance.deployType as 'cloud' | 'local' | 'server' | 'existing',
    lastSyncAt: instance.lastSyncAt,
  };
  addInstance(openclawInstance);
  return openclawInstance;
}

export async function startQrBindSession(): Promise<{
  sessionId: string;
  qrData: string;
  expiresAt: number;
}> {
  return createBindSession();
}

export async function waitForQrBind(sessionId: string): Promise<OpenClawInstance | null> {
  const result = await pollBindSession(sessionId);
  if (result.status === 'confirmed' && result.instance) {
    const { addInstance } = useAuthStore.getState();
    const inst: OpenClawInstance = {
      id: result.instance.id,
      name: result.instance.name,
      instanceUrl: result.instance.instanceUrl,
      status: result.instance.status,
      version: result.instance.version,
      deployType: result.instance.deployType as 'cloud' | 'local' | 'server' | 'existing',
    };
    addInstance(inst);
    return inst;
  }
  return null;
}

// ========== 获取当前用户 ==========

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const result = await apiFetch<any>('/auth/me');
    if (!result?.id) return null;

    return {
      id: result.id,
      agentrixId: result.agentrixId,
      email: result.email,
      nickname: result.nickname,
      avatarUrl: result.avatarUrl,
      walletAddress: result.walletAddress,
      roles: result.roles || ['user'],
    };
  } catch {
    return null;
  }
}

// ========== 获取钱包 Nonce ==========

export async function getWalletNonce(address: string): Promise<{ nonce: string; message: string }> {
  return apiFetch(`/auth/wallet/nonce?address=${address}`);
}

// ========== Aliases & Missing Providers ==========

/** loginWithX — alias for loginWithTwitter */
export async function loginWithX(): Promise<AuthUser> {
  return loginWithTwitter();
}

/** loginWithApple — OAuth via WebBrowser */
export async function loginWithApple(): Promise<AuthUser> {
  const redirectUri = getMobileCallbackUrl();
  const apiBase = getBackendBaseUrl();
  const result = await WebBrowser.openAuthSessionAsync(
    `${apiBase}/auth/apple?redirect_uri=${encodeURIComponent(redirectUri)}`,
    redirectUri,
  );
  if (result.type !== 'success') throw new Error('Apple login cancelled');
  const params = new URL(result.url);
  const token = params.searchParams.get('token');
  if (!token) throw new Error('No token from Apple login');
  const user = await fetchCurrentUserWithToken(token);
  return { ...user, token } as any;
}

/** handleOAuthCallback — called from AuthCallbackScreen */
export async function handleOAuthCallback(params: {
  token?: string | null;
  code?: string | null;
  provider?: string | null;
}): Promise<{ user: AuthUser; token: string } | null> {
  try {
    if (params.token) {
      const user = await fetchCurrentUserWithToken(params.token);
      return { user, token: params.token };
    }
    if (params.code && params.provider) {
      const data = await apiFetch<any>(`/auth/${params.provider}/callback?code=${params.code}`);
      if (data?.token) {
        const user = await fetchCurrentUserWithToken(data.token);
        return { user, token: data.token };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchCurrentUserWithToken(token: string): Promise<AuthUser> {
  const data = await apiFetch<any>('/auth/me', { headers: { Authorization: `Bearer ${token}` } });
  return {
    id: data.id,
    agentrixId: data.agentrixId || data.paymindId || data.id,
    email: data.email,
    nickname: data.nickname || data.name || data.username,
    avatarUrl: data.avatarUrl || data.avatar,
    walletAddress: data.walletAddress,
    roles: data.roles || ['user'],
  };
}

