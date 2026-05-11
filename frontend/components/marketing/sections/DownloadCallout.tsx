/**
 * Download callout — final CTA for 5-surface client downloads.
 */
import Link from 'next/link';
import { useLocalization } from '../../../contexts/LocalizationContext';

export function DownloadCallout() {
  const { t } = useLocalization();
  return (
    <section className="bg-gradient-to-br from-agentrix-purple/30 via-agentrix-ink to-agentrix-electric/20 py-20">
      <div className="container mx-auto px-6 text-center">
        <h2 className="text-3xl font-bold text-white md:text-4xl">
          {t({ zh: '现在就把它带回家', en: 'Bring your Agent home today' })}
        </h2>
        <p className="mt-3 text-agentrix-fog">
          {t({
            zh: 'Mobile · Desktop · Web · Watch · Server，5 端无缝同步。',
            en: 'Mobile · Desktop · Web · Watch · Server — synced seamlessly.',
          })}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/downloads"
            className="rounded-full bg-agentrix-solar px-6 py-3 text-sm font-bold text-agentrix-ink hover:opacity-90"
          >
            {t({ zh: '下载客户端', en: 'Download apps' })}
          </Link>
          <Link
            href="/auth/login?next=/console/dashboard"
            className="rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-bold text-white hover:bg-white/10"
          >
            {t({ zh: '打开 Web Console', en: 'Open Web Console' })}
          </Link>
        </div>
      </div>
    </section>
  );
}
