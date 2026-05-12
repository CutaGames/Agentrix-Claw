/**
 * AxpPurchaseModal — AXP 积分购买皮肤弹窗
 *
 * 展示皮肤信息、AXP 价格、用户余额，确认后调用
 * POST /api/v1/pet-skin/marketplace/:skinId/install-with-axp
 *
 * Requirements: 10.1, 10.4
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Zap, AlertCircle, CheckCircle2, LogIn } from 'lucide-react';
import Image from 'next/image';
import axios from 'axios';
import { useLocalization } from '../../contexts/LocalizationContext';
import { fetchAxpBalance, SkinListItem } from '../../services/marketplaceApi';

// ---------------------------------------------------------------------------
// Clan gradient mapping (fallback for missing thumbnails)
// ---------------------------------------------------------------------------

const CLAN_GRADIENTS: Record<SkinListItem['clan'], string> = {
  A: 'from-blue-500 to-cyan-500',
  B: 'from-green-500 to-emerald-500',
  C: 'from-purple-500 to-violet-500',
  D: 'from-orange-500 to-yellow-500',
  E: 'from-pink-500 to-rose-500',
  F: 'from-teal-500 to-sky-500',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AxpPurchaseModalProps {
  skin: SkinListItem | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: (clonedSkinId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AxpPurchaseModal({ skin, open, onClose, onSuccess }: AxpPurchaseModalProps) {
  const { t } = useLocalization();

  const [balance, setBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(true);

  // Check login status & fetch balance on open
  useEffect(() => {
    if (!open || !skin) return;

    // Reset state
    setError('');
    setSuccess(false);
    setBalance(null);

    if (typeof window !== 'undefined') {
      const token =
        localStorage.getItem('access_token') ||
        localStorage.getItem('authToken') ||
        sessionStorage.getItem('authToken');

      if (!token) {
        setIsLoggedIn(false);
        return;
      }
      setIsLoggedIn(true);
    }

    // Fetch AXP balance
    setLoadingBalance(true);
    fetchAxpBalance()
      .then((res) => {
        setBalance(res.balance);
      })
      .catch(() => {
        setBalance(null);
        setError(t({ zh: '无法获取 AXP 余额', en: 'Failed to fetch AXP balance' }));
      })
      .finally(() => {
        setLoadingBalance(false);
      });
  }, [open, skin, t]);

  const handleConfirm = useCallback(async () => {
    if (!skin || !skin.priceAxp) return;

    setError('');
    setSubmitting(true);

    try {
      const token =
        localStorage.getItem('access_token') ||
        localStorage.getItem('authToken') ||
        sessionStorage.getItem('authToken');

      const res = await axios.post(
        `/api/v1/pet-skin/marketplace/${skin.id}/install-with-axp`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      setSuccess(true);
      const clonedSkinId: string = res.data?.clonedSkinId || res.data?.skin?.id || '';
      onSuccess?.(clonedSkinId);

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        t({ zh: '购买失败，请稍后再试', en: 'Purchase failed. Please try again later.' });
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [skin, onClose, onSuccess, t]);

  if (!open || !skin) return null;

  const priceAxp = skin.priceAxp ?? 0;
  const insufficientBalance = balance !== null && balance < priceAxp;
  const gradient = CLAN_GRADIENTS[skin.clan];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-2xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
          aria-label={t({ zh: '关闭', en: 'Close' })}
        >
          <X size={18} />
        </button>

        {/* Title */}
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
          <Zap size={20} className="text-yellow-400" />
          {t({ zh: '用 AXP 购买', en: 'Buy with AXP' })}
        </h2>

        {/* Not logged in */}
        {!isLoggedIn ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <LogIn size={36} className="text-gray-500" />
            <p className="text-center text-sm text-gray-300">
              {t({
                zh: '请先登录后再使用 AXP 购买',
                en: 'Please log in to purchase with AXP',
              })}
            </p>
            <a
              href="/login?redirect=/market"
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500"
            >
              {t({ zh: '前往登录', en: 'Go to Login' })}
            </a>
          </div>
        ) : success ? (
          /* Success state */
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 size={40} className="text-green-400" />
            <p className="text-center text-sm font-medium text-green-300">
              {t({
                zh: '购买成功！皮肤已添加到你的收藏。',
                en: 'Purchase successful! Skin added to your collection.',
              })}
            </p>
          </div>
        ) : (
          /* Purchase content */
          <div className="space-y-4">
            {/* Skin info */}
            <div className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-900 p-3">
              {/* Thumbnail */}
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                {skin.thumbnailUrl ? (
                  <Image
                    src={skin.thumbnailUrl}
                    alt={skin.displayName}
                    fill
                    className="object-cover"
                    sizes="56px"
                  />
                ) : (
                  <div
                    className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient}`}
                  >
                    <span className="text-lg font-bold text-white/60">{skin.clan}</span>
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">{skin.displayName}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-yellow-400">
                  <Zap size={12} />
                  {priceAxp} AXP
                </p>
              </div>
            </div>

            {/* Balance info */}
            <div className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {t({ zh: '你的 AXP 余额', en: 'Your AXP Balance' })}
                </span>
                {loadingBalance ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-yellow-400" />
                ) : balance !== null ? (
                  <span className={`text-sm font-bold ${insufficientBalance ? 'text-red-400' : 'text-white'}`}>
                    {balance.toLocaleString()} AXP
                  </span>
                ) : (
                  <span className="text-sm text-gray-500">--</span>
                )}
              </div>
              {insufficientBalance && (
                <p className="mt-1.5 text-xs text-red-400">
                  {t({ zh: '余额不足，无法购买此皮肤', en: 'Insufficient balance for this skin' })}
                </p>
              )}
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5">
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-400" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            {/* Confirm button */}
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting || insufficientBalance || loadingBalance || balance === null}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Zap size={14} />
              )}
              {submitting
                ? t({ zh: '购买中…', en: 'Purchasing…' })
                : t({ zh: `确认支付 ${priceAxp} AXP`, en: `Confirm ${priceAxp} AXP` })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AxpPurchaseModal;
