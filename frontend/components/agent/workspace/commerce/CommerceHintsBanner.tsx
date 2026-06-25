import React, { useEffect, useState } from 'react';
import { Sparkles, X, ArrowUpRight } from 'lucide-react';
import { useLocalization } from '../../../../contexts/LocalizationContext';
import { useToast } from '../../../../contexts/ToastContext';
import { commerceApi, UsageHint } from '../../../../lib/api/commerce.api';

interface CommerceHintsBannerProps {
  className?: string;
}

export const CommerceHintsBanner: React.FC<CommerceHintsBannerProps> = ({ className }) => {
  const { t, language } = useLocalization();
  const { error: showError } = useToast();
  const [hint, setHint] = useState<UsageHint | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const loadHint = async () => {
      try {
        setLoading(true);
        const data = await commerceApi.getConversionHints();
        setHint(data || null);
      } catch (err: any) {
        if (err?.message) {
          showError(err.message);
        }
      } finally {
        setLoading(false);
      }
    };

    loadHint();
  }, [showError]);

  const handleDismiss = async () => {
    if (!hint?.key) {
      setDismissed(true);
      return;
    }

    try {
      await commerceApi.dismissHint(hint.key);
      setDismissed(true);
    } catch (err: any) {
      if (err?.message) {
        showError(err.message);
      }
    }
  };

  const handleAction = () => {
    if (!hint?.link) return;

    if (hint.link.startsWith('http')) {
      window.open(hint.link, '_blank');
      return;
    }

    window.location.href = hint.link;
  };

  if (loading || dismissed || !hint) {
    return null;
  }

  const message = language === 'zh' ? hint.messageZh : hint.message;
  const actionLabel = language === 'zh' ? hint.actionZh : hint.action;

  return (
    <div
      data-testid="commerce-hints-banner"
      className={`rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-500/10 via-slate-900/40 to-purple-500/10 p-4 ${className || ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-1 rounded-full bg-blue-500/20 p-2 text-blue-400">
            <Sparkles size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-100">
              {t({ zh: '智能引导', en: 'Smart Hint' })}
            </p>
            <p className="text-sm text-slate-200 mt-1">{message}</p>
            {hint.suggestedConfig && (
              <div className="mt-2 text-xs text-slate-400">
                {hint.suggestedConfig.productType && (
                  <span className="mr-3">{t({ zh: '建议类型', en: 'Suggested Type' })}: {hint.suggestedConfig.productType}</span>
                )}
                {hint.suggestedConfig.fee && (
                  <span>{t({ zh: '建议费率', en: 'Suggested Fee' })}: {hint.suggestedConfig.fee}</span>
                )}
              </div>
            )}
          </div>
        </div>
        <button
          data-testid="commerce-hints-dismiss"
          onClick={handleDismiss}
          className="text-slate-400 hover:text-white transition-colors"
          aria-label={t({ zh: '关闭提示', en: 'Dismiss hint' })}
        >
          <X size={16} />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          data-testid="commerce-hints-action"
          onClick={handleAction}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600/30 px-3 py-1.5 text-xs font-semibold text-blue-100 hover:bg-blue-600/40 transition-colors"
        >
          {actionLabel}
          <ArrowUpRight size={12} />
        </button>
      </div>
    </div>
  );
};

export default CommerceHintsBanner;
