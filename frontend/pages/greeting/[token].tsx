import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useUser } from '../../contexts/UserContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { Gift, ArrowRight, Send } from 'lucide-react';

interface GreetingPeek {
  senderName: string;
  petName: string;
  petEmotion: string;
  templateName: string;
  message: string;
  alreadyRedeemed: boolean;
}

const MOCK_PEEK: GreetingPeek = {
  senderName: 'Alex',
  petName: 'Alfred',
  petEmotion: '🎂',
  templateName: 'birthday',
  message: '祝你生日快乐！一起来养我吧 🎂',
  alreadyRedeemed: false,
};

export default function GreetingLanding() {
  const router = useRouter();
  const { token } = router.query;
  const { isAuthenticated } = useUser();
  const { t } = useLocalization();
  const [peek, setPeek] = useState<GreetingPeek | null>(null);
  const [redeemed, setRedeemed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    // TODO W2: GET /api/v1/greeting/peek?token=xxx
    setTimeout(() => {
      setPeek(MOCK_PEEK);
      setLoading(false);
    }, 300);
  }, [token]);

  const handleRedeem = async () => {
    if (!isAuthenticated) {
      router.push(`/auth/register?next=/greeting/${token}&reward=520`);
      return;
    }
    // TODO W2: POST /api/v1/greeting/redeem
    setRedeemed(true);
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
        <title>{`🎁 ${peek.senderName} ${t({ zh: '给你发了一张贺卡', en: 'sent you a greeting card' })} · Agentrix`}</title>
        <meta name="description" content={peek.message} />
        <meta property="og:title" content={`🎁 ${peek.senderName} 的 ${peek.petName} 给你发了贺卡`} />
        <meta property="og:type" content="website" />
      </Head>
      <div className="flex min-h-screen flex-col items-center justify-center bg-agentrix-ink px-6 py-12 text-white">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft shadow-2xl">
          {/* Card visual */}
          <div className="relative flex h-72 items-center justify-center overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-600/50 via-indigo-900/70 to-cyan-500/30" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(250,204,21,0.15)_0%,transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,rgba(34,211,255,0.1)_0%,transparent_40%)]" />
            <span className="relative text-7xl drop-shadow-2xl">{peek.petEmotion}</span>
            <div className="absolute bottom-6 left-6 right-6 text-center">
              <p className="text-lg font-bold text-white drop-shadow-lg bg-black/20 backdrop-blur-sm rounded-xl px-4 py-2">&ldquo;{peek.message}&rdquo;</p>
            </div>
          </div>

          <div className="p-6 text-center">
            <p className="text-sm text-agentrix-fog">
              🎁 {peek.senderName} {t({ zh: '的', en: "'s" })} {peek.petName} {t({ zh: '给你发了一张贺卡', en: 'sent you a greeting card' })}
            </p>

            {/* Action */}
            {redeemed || peek.alreadyRedeemed ? (
              <div className="mt-6 rounded-xl bg-agentrix-electric/10 border border-agentrix-electric/30 p-4">
                <p className="text-sm font-semibold text-agentrix-electric">
                  {t({ zh: '✅ 已收下！+20 AXP', en: '✅ Received! +20 AXP' })}
                </p>
                <Link
                  href="/console/pet/create"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-agentrix-solar hover:underline"
                >
                  <Send size={12} />
                  {t({ zh: '回一张给 TA →', en: 'Send one back →' })}
                </Link>
              </div>
            ) : (
              <div className="mt-6 flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={handleRedeem}
                  className="inline-flex items-center gap-2 rounded-full bg-agentrix-solar px-8 py-3 text-sm font-bold text-agentrix-ink shadow-lg shadow-agentrix-solar/30 transition-transform hover:-translate-y-0.5"
                >
                  <Gift size={16} />
                  {t({ zh: '收下 +20 AXP', en: 'Accept +20 AXP' })}
                </button>
                <Link
                  href="/console/pet/create"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-agentrix-electric hover:underline"
                >
                  <Send size={12} />
                  {t({ zh: '回一张我家的 →', en: 'Send one back →' })}
                </Link>
              </div>
            )}

            {/* Register CTA */}
            {!isAuthenticated && (
              <div className="mt-6 rounded-xl border border-agentrix-inkLine bg-white/5 p-4">
                <p className="flex items-center justify-center gap-2 text-sm font-semibold text-agentrix-solar">
                  <Gift size={16} />
                  {t({ zh: '未注册？收下自动注册 + 520 AXP', en: 'Not registered? Accept to sign up + 520 AXP' })}
                </p>
                <Link
                  href={`/auth/register?next=/greeting/${token}&reward=520`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-agentrix-electric hover:underline"
                >
                  {t({ zh: '立即注册 →', en: 'Register now →' })} <ArrowRight size={12} />
                </Link>
              </div>
            )}

            {/* Footer */}
            <div className="mt-6 flex items-center justify-center gap-4 text-xs text-agentrix-mist">
              <Link href="/" className="hover:text-white">{t({ zh: '关于 Agentrix', en: 'About Agentrix' })}</Link>
              <span>·</span>
              <Link href="/security" className="hover:text-white">{t({ zh: '隐私政策', en: 'Privacy' })}</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
