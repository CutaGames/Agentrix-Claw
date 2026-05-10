import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../../config/env';
import { WatchDataLayerService, type WatchMessage } from '../../services/wearables/watchDataLayerBridge.service';

const TOKEN_KEY = 'agentrix.watch.token';
const REFRESH_KEY = 'agentrix.watch.refreshToken';

interface AuthState {
  token: string | null;
  loading: boolean;
}

/**
 * Lightweight token management for watch app.
 * Stores JWT in AsyncStorage, supports silent refresh.
 */
export function useWatchAuth() {
  const [state, setState] = useState<AuthState>({ token: null, loading: true });
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const saveTokens = useCallback(async (accessToken: string, refreshToken?: string) => {
    await AsyncStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) await AsyncStorage.setItem(REFRESH_KEY, refreshToken);
    setState({ token: accessToken, loading: false });
  }, []);

  // Load stored token on mount
  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(TOKEN_KEY);
      setState({ token: stored, loading: false });
      await WatchDataLayerService.startListening();
      if (!stored) {
        await WatchDataLayerService.requestAuthState();
      }
    })();
    const unsubscribeAuthState = WatchDataLayerService.onMessage('/agentrix/auth/state', (message: WatchMessage) => {
      const data = message.data as { accessToken?: unknown; token?: unknown; refreshToken?: unknown };
      const accessToken = typeof data.accessToken === 'string'
        ? data.accessToken
        : typeof data.token === 'string'
          ? data.token
          : '';
      const refreshToken = typeof data.refreshToken === 'string' ? data.refreshToken : undefined;
      if (accessToken) {
        void saveTokens(accessToken, refreshToken);
      }
    });
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      unsubscribeAuthState();
    };
  }, [saveTokens]);

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY]);
    setState({ token: null, loading: false });
  }, []);

  const refresh = useCallback(async (): Promise<string | null> => {
    try {
      const refreshToken = await AsyncStorage.getItem(REFRESH_KEY);
      if (!refreshToken) return null;

      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        await logout();
        return null;
      }
      const data = await res.json();
      await saveTokens(data.accessToken, data.refreshToken ?? refreshToken);
      return data.accessToken;
    } catch {
      return null;
    }
  }, [logout, saveTokens]);

  const requestAuthState = useCallback(async (): Promise<void> => {
    await WatchDataLayerService.requestAuthState();
  }, []);

  /** Fetch wrapper that attaches token and retries on 401 */
  const authFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      if (state.token) headers.set('Authorization', `Bearer ${state.token}`);
      headers.set('Content-Type', 'application/json');

      let res = await fetch(url, { ...init, headers });
      if (res.status === 401) {
        const newToken = await refresh();
        if (newToken) {
          headers.set('Authorization', `Bearer ${newToken}`);
          res = await fetch(url, { ...init, headers });
        }
      }
      return res;
    },
    [state.token, refresh],
  );

  return {
    token: state.token,
    loading: state.loading,
    isLoggedIn: !!state.token,
    saveTokens,
    logout,
    refresh,
    authFetch,
    requestAuthState,
  };
}
