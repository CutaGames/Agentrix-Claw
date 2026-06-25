import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useUser } from '../../contexts/UserContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { coRaisingApi, CoRaisingPeekView, FeedResult } from '../../lib/api/coraising.api';
import { Heart, Zap, Gift, ArrowRight, AlertCircle } from 'lucide-react';

export default function CoRaisingLanding() {
  const router = useRouter();
  const { token } = router.query;
  const { isAuthenticated } = useUser();
  const { t } = useLocalization();
  const [peek, setPeek] = useState<CoRaisingPeekView | null>(null);
  const [fed, setFed] = useState<FeedResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feeding, setFeeding] = useState(false);

  useEffect(() => {
    if (!token || typeof token !== 'string') return;
    setLoading(true);
    setError(null);
    coRaisingApi
      .peekByToken(token)
      .then((data) => setPeek(data))
      .catch((err: any) => {
        const status = err?.response?.status;
        if (status === 404) {
          setError(t({ zh: '邀请链接已失效或不存在', en: 'Invite link is invalid or expired' }));
        } else {
          setError(t({ zh: '加载失败，请稍后再试', en: 'Failed to load, please try again later' }));
        }
      })
      .finally(() => setLoading(false));
  }, [token, t]);

  const handleFeed = useCallback(async () => {
    if (!token || typeof token !== 'string') return;
    if (!isAuthenticated) {
      router.push(`/auth/register?next=/co-raising/${token}&reward=500`);
      return;
    }
    setFeeding(true);
    try {
      const result = await coRaisingApi.feed({ token });
      setFed(result);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Unknown error';
      setError(msg);
    } finally {
      setFeeding(false);
    }
  }, [token, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-agentrix-ink text-white">
        <p className="animate-pulse">{t({ zh: '加载中…', en: 'Loading…' })}</p>
      </div>
    );
  }

  if (error || !peek) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-agentrix-ink px-6 text-white">
        <div className="max-w-md text-center">
          <AlertCircle size={48} className="mx-auto text-agentrix-solar" />
          <h1 className="mt-4 text-xl font-bold">
            {t({ zh: '无法打开邀请', en: 'Cannot open invite' })}
          </h1>
          <p className="mt-2 text-sm text-agentrix-mist">{error ?? ''}</p>
          <Link
            href="/showcase"
            className="mt-6 inline-block rounded-full bg-agentrix-solar px-6 py-2 text-sm font-bold text-agentrix-ink"
          >
            {t({ zh: '探索 Agentrix', en: 'Explore Agentrix' })}
          </Link>
        </div>
      </div>
    );
  }

  const petEmotion = peek.pet_emotion ?? '🐾';
  const petName = peek.pet_name ?? 'a pet';
  const inviterName = peek.inviter_name ?? t({ zh: '主人', en: 'owner' });
  const splitPct = (peek.split_bps / 100).toFixed(peek.split_bps % 100 === 0 ? 0 : 2);

  return (
    <>
      <Head>
        <title>{`${petName} ${t({ zh: '想让你帮它喂食', en: 'wants you to feed it' })} · Agentrix`}</title>
        <meta
          name="description"
          content={t({
            zh: `帮 ${inviterName} 的 ${petName} 喂食，获得 AXP 积分`,
            en: `Feed ${inviterName}'s ${petName} and earn AXP`,
          })}
        />
        <meta property="og:title" content={`🐾 ${petName} ${t({ zh: '想让你帮它喂食', en: 'wants you to feed it' })}`} />
        <meta property="og:type" content="website" />
      </Head>
      <div className="flex min-h-screen flex-col items-center justify-center bg-agentrix-ink px-6 py-12 text-white">
        <div className="w-full max-w-md rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-8 text-center shadow-2xl">
          {/* Pet visual */}
          <div className="mx-auto mb-6 flex h-36 w-36 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/40 via-indigo-600/30 to-cyan-400/20 shadow-lg shadow-purple-500/20 ring-2 ring-agentrix-electric/20">
            <span className="text-5xl drop-shadow-lg">{petEmotion}</span>
          </div>

          <h1 className="text-2xl font-extrabold">
            🐾 {petName} {t({ zh: '想让你帮它喂食', en: 'wants you to feed it' })}
          </h1>

          <div className="mt-4 flex items-center justify-center gap-4 text-sm text-agentrix-fog">
            {peek.pet_level != null && <span>Lv.{peek.pet_level}</span>}
            {peek.pet_energy != null && (
              <span className="inline-flex items-center gap-1">
                <Zap size={14} className="text-agentrix-solar" /> {peek.pet_energy}%
              </span>
            )}
          </div>

          <p className="mt-3 text-sm text-agentrix-mist">
            {t({ zh: `邀请人：${inviterName}`, en: `Invited by: ${inviterName}` })}
          </p>
          <p className="mt-1 text-xs text-agentrix-mist">
            {t({ zh: `好友共养分成 ${splitPct}%`, en: `Friend earns ${splitPct}% of future revenue` })}
          </p>

          {/* Action */}
          {fed ? (
            <div className="mt-8 rounded-xl bg-agentrix-electric/10 border border-agentrix-electric/30 p-4">
              <p className="text-sm font-semibold text-agentrix-electric">
                ✅ {t({ zh: '喂食成功！', en: 'Fed successfully!' })} +{fed.energy_given}{' '}
                {t({ zh: '能量', en: 'energy' })} +{fed.axp_awarded} AXP
              </p>
              <p className="mt-2 text-xs text-agentrix-fog">
                {t({ zh: '明天再来帮它喂食吧 🌱', en: 'Come back tomorrow 🌱' })}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleFeed}
              disabled={feeding}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-agentrix-solar px-8 py-3 text-sm font-bold text-agentrix-ink shadow-lg shadow-agentrix-solar/30 transition-transform hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Heart size={16} />
              {feeding
                ? t({ zh: '喂食中…', en: 'Feeding…' })
                : t({ zh: '喂食 +能量 +AXP', en: 'Feed +energy +AXP' })}
            </button>
          )}

          {/* Register CTA */}
          {!isAuthenticated && (
            <div className="mt-6 rounded-xl border border-agentrix-inkLine bg-white/5 p-4">
              <p className="flex items-center justify-center gap-2 text-sm font-semibold text-agentrix-solar">
                <Gift size={16} />
                {t({ zh: '注册就送 500 AXP', en: 'Register and get 500 AXP' })}
              </p>
              <Link
                href={`/auth/register?next=/co-raising/${String(token)}&reward=500`}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-agentrix-electric hover:underline"
              >
                {t({ zh: '立即注册 →', en: 'Register now →' })} <ArrowRight size={12} />
              </Link>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 flex items-center justify-center gap-4 text-xs text-agentrix-mist">
            <Link href="/" className="hover:text-white">
              {t({ zh: '关于 Pet-as-Agent', en: 'About Pet-as-Agent' })}
            </Link>
            <span>·</span>
            <Link href="/security" className="hover:text-white">
              {t({ zh: '隐私政策', en: 'Privacy' })}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
