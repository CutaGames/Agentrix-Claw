import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  tokenType: string;
  scope?: string;
}

export interface OAuthProviderConfig {
  name: string;
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  redirectUri: string;
}

@Injectable()
export class McpOAuthService {
  private readonly logger = new Logger(McpOAuthService.name);

  /** userId:providerId → token set */
  private tokenStore = new Map<string, OAuthTokenSet>();

  /** state → { userId, providerId, codeVerifier } */
  private pendingFlows = new Map<
    string,
    { userId: string; providerId: string; codeVerifier: string }
  >();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Initiate OAuth authorization code flow with PKCE.
   * Returns the authorization URL to redirect the user to.
   */
  initiateFlow(
    userId: string,
    provider: OAuthProviderConfig,
  ): { authorizationUrl: string; state: string } {
    const state = crypto.randomBytes(32).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    this.pendingFlows.set(state, {
      userId,
      providerId: provider.name,
      codeVerifier,
    });

    // Auto-expire pending flow after 10 minutes
    setTimeout(() => this.pendingFlows.delete(state), 10 * 60 * 1000);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: provider.clientId,
      redirect_uri: provider.redirectUri,
      scope: provider.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return {
      authorizationUrl: `${provider.authorizationUrl}?${params.toString()}`,
      state,
    };
  }

  /**
   * Handle OAuth callback and exchange authorization code for tokens.
   */
  async handleCallback(
    state: string,
    code: string,
    provider: OAuthProviderConfig,
  ): Promise<OAuthTokenSet | null> {
    const pending = this.pendingFlows.get(state);
    if (!pending) {
      this.logger.warn('OAuth callback with unknown state');
      return null;
    }
    this.pendingFlows.delete(state);

    try {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: provider.redirectUri,
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
        code_verifier: pending.codeVerifier,
      });

      const response = await fetch(provider.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!response.ok) {
        const err = await response.text();
        this.logger.error(`OAuth token exchange failed: ${err}`);
        return null;
      }

      const data = await response.json();
      const tokenSet: OAuthTokenSet = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
        tokenType: data.token_type ?? 'Bearer',
        scope: data.scope,
      };

      const key = `${pending.userId}:${pending.providerId}`;
      this.tokenStore.set(key, tokenSet);

      this.logger.log(`OAuth tokens stored for ${key}`);
      return tokenSet;
    } catch (err: any) {
      this.logger.error(`OAuth callback error: ${err.message}`);
      return null;
    }
  }

  /**
   * Get a valid access token, refreshing if expired.
   */
  async getAccessToken(
    userId: string,
    providerId: string,
    provider?: OAuthProviderConfig,
  ): Promise<string | null> {
    const key = `${userId}:${providerId}`;
    const tokenSet = this.tokenStore.get(key);
    if (!tokenSet) return null;

    // Token still valid (with 60s buffer)
    if (tokenSet.expiresAt > Date.now() + 60_000) {
      return tokenSet.accessToken;
    }

    // Try refresh
    if (tokenSet.refreshToken && provider) {
      const refreshed = await this.refreshTokens(tokenSet, provider);
      if (refreshed) {
        this.tokenStore.set(key, refreshed);
        return refreshed.accessToken;
      }
    }

    // Token expired and no refresh available
    this.tokenStore.delete(key);
    return null;
  }

  /** Check if user has tokens for a provider */
  hasTokens(userId: string, providerId: string): boolean {
    return this.tokenStore.has(`${userId}:${providerId}`);
  }

  /** Revoke stored tokens */
  revokeTokens(userId: string, providerId: string): void {
    this.tokenStore.delete(`${userId}:${providerId}`);
  }

  private async refreshTokens(
    tokenSet: OAuthTokenSet,
    provider: OAuthProviderConfig,
  ): Promise<OAuthTokenSet | null> {
    if (!tokenSet.refreshToken) return null;

    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenSet.refreshToken,
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
      });

      const response = await fetch(provider.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!response.ok) return null;

      const data = await response.json();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? tokenSet.refreshToken,
        expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
        tokenType: data.token_type ?? 'Bearer',
        scope: data.scope ?? tokenSet.scope,
      };
    } catch {
      return null;
    }
  }
}
