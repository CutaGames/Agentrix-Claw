/**
 * MobileDeepLink — 跨平台导航组件
 *
 * 生成 agentrix:// URI scheme deep link，支持：
 * - 已认证用户自动注入 userId + token（避免移动端重新登录）
 * - QR code 渲染（showQR=true 时）
 * - Fallback 到 App Store / Google Play 下载链接
 *
 * Requirements: 7.1, 7.2, 7.4
 */

import { Smartphone, Download, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useUser } from '../../contexts/UserContext';
import { useLocalization } from '../../contexts/LocalizationContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeepLinkAction = 'buy' | 'bid' | 'install_skill' | 'accept_task';

export interface UserContext {
  userId: string;
  token: string;
}

export interface MobileDeepLinkProps {
  action: DeepLinkAction;
  resourceId: string;
  userContext?: UserContext;
  showQR?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APP_STORE_URL = 'https://apps.apple.com/app/agentrix/id6744941703';
const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.agentrix.app';

// ---------------------------------------------------------------------------
// Helper: Deep Link URI 生成（exported for testability）
// ---------------------------------------------------------------------------

/**
 * Generates an agentrix:// deep link URI.
 *
 * Format: agentrix://{action}?resourceId={resourceId}&userId={userId}&token={token}
 *
 * @param action - The transaction action (buy, bid, install_skill, accept_task)
 * @param resourceId - The target resource identifier
 * @param userContext - Optional user context for pre-authentication
 * @returns The formatted deep link URI string
 */
export function generateDeepLink(
  action: DeepLinkAction,
  resourceId: string,
  userContext?: UserContext,
): string {
  const params = new URLSearchParams();
  params.set('resourceId', resourceId);

  if (userContext) {
    params.set('userId', userContext.userId);
    params.set('token', userContext.token);
  }

  return `agentrix://${action}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Action label mapping
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<DeepLinkAction, { zh: string; en: string }> = {
  buy: { zh: '在 App 中购买', en: 'Buy on Mobile' },
  bid: { zh: '在 App 中出价', en: 'Bid on Mobile' },
  install_skill: { zh: '在 App 中安装', en: 'Install on Mobile' },
  accept_task: { zh: '在 App 中接受任务', en: 'Accept on Mobile' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MobileDeepLink({
  action,
  resourceId,
  userContext: userContextProp,
  showQR = false,
}: MobileDeepLinkProps) {
  const { user, isAuthenticated } = useUser();
  const { t } = useLocalization();

  // Resolve user context: prop takes priority, then derive from UserContext
  const resolvedUserContext: UserContext | undefined = (() => {
    if (userContextProp) return userContextProp;
    if (isAuthenticated && user) {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('access_token') ||
            localStorage.getItem('authToken') ||
            sessionStorage.getItem('authToken')
          : null;
      if (token) {
        return { userId: user.id, token };
      }
    }
    return undefined;
  })();

  const deepLinkUri = generateDeepLink(action, resourceId, resolvedUserContext);
  const label = ACTION_LABELS[action];

  return (
    <div className="flex flex-col gap-3">
      {/* Primary Deep Link Button */}
      <a
        href={deepLinkUri}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:from-purple-500 hover:to-blue-400 hover:shadow-xl"
        aria-label={t(label)}
      >
        <Smartphone size={16} />
        <span>{t(label)}</span>
      </a>

      {/* QR Code (optional) */}
      {showQR && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 p-4">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <QrCode size={12} />
            <span>{t({ zh: '扫码在手机上打开', en: 'Scan to open on mobile' })}</span>
          </div>
          <div className="rounded-lg bg-white p-2">
            <QRCodeSVG
              value={deepLinkUri}
              size={120}
              level="M"
              includeMargin={false}
            />
          </div>
        </div>
      )}

      {/* Fallback Store Links */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">
          {t({ zh: '没有 App？', en: "Don't have the app?" })}
        </span>
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
        >
          <Download size={11} />
          App Store
        </a>
        <a
          href={GOOGLE_PLAY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
        >
          <Download size={11} />
          Google Play
        </a>
      </div>
    </div>
  );
}

export default MobileDeepLink;
