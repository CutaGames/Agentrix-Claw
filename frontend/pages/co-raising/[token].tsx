import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useUser } from '../../contexts/UserContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { Heart, Zap, Gift, ArrowRight } from 'lucide-react';

// Mock peek response — W2 will call GET /api/v1/co-raising/peek?token=xxx
interface CoRaisingPeek {
  petName: string;
  petLevel: number;
  petEmotion: string;
  petEnergy: number;
  inviterName: string;
  inviterAvatar: string;
  alreadyFedToday: boolean;
}

const MOCK_PEEK: CoRaisingPeek = {
  petName: 'Alfred',
  petLevel: 7,
  petEmotion: '😊',
  petEnergy: 72,
  inviterName: 'Alex',
  inviterAvatar: '',
  alreadyFedToday: false,
};

export default function CoRaisingLanding() {
  const router = useRouter();
  const { token } = router.query;
  const { isAuthenticated } = useUser();
  const { t } = useLocalization();
  const [peek, setPeek] = useState<CoRaisingPeek | null>(null);
  const [fed, setFed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    // TODO W2: Replace with real API call
    // fetch(`/api/v1/co-raising/peek?token=${token}`).then(r => r.json()).then(setPeek)
    setTimeout(() => {
      setPeek(MOCK_PEEK);
      setLoading(false);
    }, 300);
  }, [token]);

  const handleFeed = async () => {
    if (!isAuthenticated) {
      router.push(`/auth/register?next=/co-raising/${token}&reward=500`);
      return;
    }
    // TODO W2: POST /api/v1/co-raising/feed
    setFed(true);
  };

  if (loading || !peek) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-agentrix-ink text-white">
        <p className="animate-pulse">{t({ zh: '加载中…', en: 'Loading…' })}</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{`${peek.petName} ${t({ zh: '想让你帮它喂食', en: 'wants you to feed it' })} · Agentrix`}</title>
        <meta name="description" content={t({ zh: `帮 ${peek.inviterName} 的 ${peek.petName} 喂食，获得 AXP 积分`, en: `Feed ${peek.inviterName}'s ${peek.petName} and earn AXP` })} />
        <meta property="og:title" content={`🐾 ${peek.petName} ${t({ zh: '想让你帮它喂食', en: 'wants you to feed it' })}`} />
        <meta property="og:type" content="website" />
      </Head>
      <div className="flex min-h-screen flex-col items-center justify-center bg-agentrix-ink px-6 py-12 text-white">
        <div className="w-full max-w-md rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-8 text-center shadow-2xl">
          {/* Pet visual */}
          <div className="mx-auto mb-6 flex h-36 w-36 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/40 via-indigo-600/30 to-cyan-400/20 shadow-lg shadow-purple-500/20 ring-2 ring-agentrix-electric/20">
            <span className="text-5xl drop-shadow-lg">{peek.petEmotion}</span>
          </div>

          <h1 className="text-2xl font-extrabold">
            🐾 {peek.petName} {t({ zh: '想让你帮它喂食', en: 'wants you to feed it' })}
          </h1>

          <div className="mt-4 flex items-center justify-center gap-4 text-sm text-agentrix-fog">
            <span>Lv.{peek.petLevel}</span>
            <span>{peek.petEmotion}</span>
            <span className="inline-flex items-center gap-1"><Zap size={14} className="text-agentrix-solar" /> {peek.petEnergy}%</span>
          </div>

          <p className="mt-3 text-sm text-agentrix-mist">
            {t({ zh: `邀请人：${peek.inviterName}`, en: `Invited by: ${peek.inviterName}` })}
          </p>

          {/* Action */}
          {fed || peek.alreadyFedToday ? (
            <div className="mt-8 rounded-xl bg-agentrix-electric/10 border border-agentrix-electric/30 p-4">
              <p className="text-sm font-semibold text-agentrix-electric">
                {t({ zh: '✅ 喂食成功！+2 能量 +5 AXP', en: '✅ Fed! +2 energy +5 AXP' })}
              </p>
              <p className="mt-2 text-xs text-agentrix-fog">
                {t({ zh: '明天再来帮它喂食吧 🌱', en: 'Come back tomorrow to feed again 🌱' })}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleFeed}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-agentrix-solar px-8 py-3 text-sm font-bold text-agentrix-ink shadow-lg shadow-agentrix-solar/30 transition-transform hover:-translate-y-0.5"
            >
              <Heart size={16} />
              {t({ zh: '喂食 +2 能量 +5 AXP', en: 'Feed +2 energy +5 AXP' })}
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
                href={`/auth/register?next=/co-raising/${token}&reward=500`}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-agentrix-electric hover:underline"
              >
                {t({ zh: '立即注册 →', en: 'Register now →' })} <ArrowRight size={12} />
              </Link>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 flex items-center justify-center gap-4 text-xs text-agentrix-mist">
            <Link href="/" className="hover:text-white">{t({ zh: '关于 Pet-as-Agent', en: 'About Pet-as-Agent' })}</Link>
            <span>·</span>
            <Link href="/security" className="hover:text-white">{t({ zh: '隐私政策', en: 'Privacy' })}</Link>
          </div>
        </div>
      </div>
    </>
  );
}
