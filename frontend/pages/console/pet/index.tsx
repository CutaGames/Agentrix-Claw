/**
 * Pet Workspace v4 — real data from v1Api with emotion visualization.
 *
 * Replaces the hardcoded "Alfred · Lv.7" placeholder with live state from
 * `v1Api.pet.getState()`. Falls back to a friendly empty state when no pet
 * has been created yet.
 */
import React from 'react';
import Link from 'next/link';
import {
  Sparkles, Palette, Shirt, Heart, Dna, Gamepad2, Tag, Zap, ArrowRight,
  Smile, Frown, Meh, type LucideIcon,
} from 'lucide-react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { Button, Card, Badge, Skeleton } from '../../../components/ui/ax';
import { v1Api, type PetState, type PetEmotion } from '../../../lib/api/v1.api';

// Emotion → emoji + color + Lucide icon mapping
const EMOTION_META: Record<PetEmotion, { emoji: string; label: { zh: string; en: string }; color: string; icon: LucideIcon }> = {
  calm:      { emoji: '😌', label: { zh: '平静', en: 'Calm' },      color: 'from-blue-500/30 to-cyan-500/15',    icon: Meh },
  happy:     { emoji: '😊', label: { zh: '开心', en: 'Happy' },     color: 'from-amber-400/30 to-orange-500/15', icon: Smile },
  excited:   { emoji: '🤩', label: { zh: '兴奋', en: 'Excited' },   color: 'from-pink-500/30 to-red-500/15',     icon: Sparkles },
  focused:   { emoji: '🧐', label: { zh: '专注', en: 'Focused' },   color: 'from-indigo-500/30 to-blue-500/15',  icon: Meh },
  concerned: { emoji: '😟', label: { zh: '担忧', en: 'Concerned' }, color: 'from-yellow-500/25 to-amber-500/15', icon: Frown },
  tired:     { emoji: '😴', label: { zh: '疲惫', en: 'Tired' },     color: 'from-slate-500/30 to-gray-500/15',   icon: Frown },
  love:      { emoji: '🥰', label: { zh: '热恋', en: 'Love' },      color: 'from-pink-500/30 to-rose-500/15',    icon: Heart },
  sad:       { emoji: '😢', label: { zh: '难过', en: 'Sad' },       color: 'from-blue-600/25 to-indigo-500/15',  icon: Frown },
  angry:     { emoji: '😠', label: { zh: '生气', en: 'Angry' },     color: 'from-red-500/30 to-rose-500/15',     icon: Frown },
  sleepy:    { emoji: '💤', label: { zh: '困倦', en: 'Sleepy' },    color: 'from-slate-600/25 to-blue-500/10',   icon: Frown },
};

export default function ConsolePetIndex() {
  const { t } = useLocalization();
  const [pet, setPet] = React.useState<PetState | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    void v1Api.pet.getState()
      .catch((): null => null)
      .then((s: PetState | null): void => { if (alive) { setPet(s); setLoading(false); } });
    return (): void => { alive = false; };
  }, []);

  // XP progression: assume each level requires (level * 100) XP — adjust to match backend if needed
  const xpForNextLevel = pet ? (pet.intimacy_level + 1) * 100 : 100;
  const xpProgress = pet ? Math.min(100, Math.round((pet.intimacy_xp / xpForNextLevel) * 100)) : 0;
  // Energy is a derived UI metric — use emotion_intensity (0-3) as a rough proxy until backend exposes a dedicated field
  const energyPercent = pet ? Math.min(100, Math.round(((pet.emotion_intensity ?? 1) / 3) * 100)) : 0;

  const emotionMeta = pet ? EMOTION_META[pet.emotion] ?? EMOTION_META.calm : EMOTION_META.calm;

  return (
    <ConsoleLayout
      title={t({ zh: '主宠工作区', en: 'Pet Workspace' })}
      subtitle={t({
        zh: '管理你的 AI 宠物 · 切换灵魂 · 装备皮肤 · 上架集市',
        en: 'Manage your AI pet · switch souls · equip skins · list on market',
      })}
    >
      {/* Hero pet card */}
      {loading ? (
        <Card variant="elevated" padding="lg" className="mb-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <Skeleton className="h-28 w-28 shrink-0 rounded-full" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-72" />
              <div className="flex gap-2">
                <Skeleton className="h-9 w-32" />
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>
          </div>
        </Card>
      ) : pet ? (
        <section className={`relative mb-8 overflow-hidden rounded-ax-xl border border-ax-line bg-gradient-to-br ${emotionMeta.color} p-6 md:p-8`}>
          <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-ax-accent/8 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-ax-purple/8 blur-3xl" />

          <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
            {/* Avatar (emoji-based until 3D renderer ships) */}
            <div className="relative shrink-0">
              <div className="h-28 w-28 rounded-full bg-gradient-to-br from-white/12 to-white/4 backdrop-blur-md border border-white/10 shadow-ax-lg flex items-center justify-center text-6xl">
                {emotionMeta.emoji}
              </div>
              {/* Pulse ring */}
              <div className="absolute inset-0 rounded-full border-2 border-ax-accent/30 animate-ping" style={{ animationDuration: '3s' }} />
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="text-2xl font-bold tracking-tight text-ax-ink">
                  {pet.soul_template_id ?? 'Claw'}
                </h2>
                <Badge variant="purple" size="md">
                  Lv.{pet.intimacy_level}
                </Badge>
                <Badge variant="accent" size="md">
                  {t(emotionMeta.label)}
                </Badge>
              </div>

              {pet.recent_memory_snippets && pet.recent_memory_snippets.length > 0 && (
                <p className="mb-3 text-sm text-ax-fog line-clamp-1 italic">
                  "{pet.recent_memory_snippets[0]}"
                </p>
              )}

              {/* Progress bars */}
              <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
                <ProgressBar
                  label={t({ zh: '亲密度 XP', en: 'Intimacy XP' })}
                  value={pet.intimacy_xp}
                  max={xpForNextLevel}
                  percent={xpProgress}
                  color="purple"
                  icon={<Heart className="h-3.5 w-3.5" />}
                />
                <ProgressBar
                  label={t({ zh: '能量', en: 'Energy' })}
                  value={energyPercent}
                  max={100}
                  percent={energyPercent}
                  color="warm"
                  icon={<Zap className="h-3.5 w-3.5" />}
                />
              </div>

              {/* Quick CTAs */}
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href="/console/pet/create">
                  <Button variant="primary" size="sm" leftIcon={<Palette />}>
                    {t({ zh: 'PetCreator 工坊', en: 'PetCreator Studio' })}
                  </Button>
                </Link>
                <Link href="/console/pet/wardrobe">
                  <Button variant="secondary" size="sm" leftIcon={<Shirt />}>
                    {t({ zh: '衣柜', en: 'Wardrobe' })}
                  </Button>
                </Link>
                <Link href="/console/pet/souls">
                  <Button variant="secondary" size="sm" leftIcon={<Sparkles />}>
                    {t({ zh: '灵魂切换', en: 'Soul Switch' })}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : (
        // No pet yet — onboarding card
        <Card variant="accent" padding="lg" className="mb-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-ax-purple/30 to-ax-accent/20 text-5xl mb-4">
            🥚
          </div>
          <h2 className="text-xl font-bold text-ax-ink mb-2">
            {t({ zh: '还没有你的宠物', en: "You don't have a pet yet" })}
          </h2>
          <p className="text-sm text-ax-fog max-w-md mx-auto mb-5">
            {t({
              zh: '在 Mobile 端创建你的第一只 AI 宠物，或使用 PetCreator 工坊在浏览器中生成。',
              en: 'Create your first AI pet on Mobile, or generate one right in the browser with PetCreator Studio.',
            })}
          </p>
          <Link href="/console/pet/create">
            <Button variant="primary" size="lg" leftIcon={<Palette />} rightIcon={<ArrowRight />}>
              {t({ zh: '打开 PetCreator', en: 'Open PetCreator' })}
            </Button>
          </Link>
        </Card>
      )}

      {/* Quick links grid */}
      <h3 className="mb-4 text-lg font-bold text-ax-ink">
        {t({ zh: '更多操作', en: 'More Actions' })}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {([
          { href: '/console/pet/breed',      icon: Dna,      label: { zh: '繁育', en: 'Breed' },                desc: { zh: '两只宠物孕育新生命', en: 'Breed two pets to create new life' } },
          { href: '/console/pet/playground', icon: Gamepad2, label: { zh: 'Playground', en: 'Playground' },    desc: { zh: '互动游戏与训练', en: 'Interactive games and training' } },
          { href: '/market/sell',            icon: Tag,      label: { zh: '上架到集市', en: 'List on market' }, desc: { zh: '出售你的皮肤创作', en: 'Sell your skin creations' } },
        ] as const).map(({ href, icon: Icon, label, desc }) => (
          <Link key={href} href={href}>
            <Card variant="default" padding="md" hoverable className="h-full">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-ax-md bg-ax-accent/10 text-ax-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-bold text-ax-ink">{t(label)}</h4>
                  <p className="mt-0.5 text-xs text-ax-mist line-clamp-2">{t(desc)}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-ax-mist" />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </ConsoleLayout>
  );
}

function ProgressBar({
  label, value, max, percent, color, icon,
}: {
  label: React.ReactNode;
  value: number;
  max: number;
  percent: number;
  color: 'accent' | 'purple' | 'warm' | 'success';
  icon?: React.ReactNode;
}) {
  const barColor =
    color === 'purple'  ? 'bg-gradient-to-r from-ax-purple to-ax-purpleSoft' :
    color === 'warm'    ? 'bg-gradient-to-r from-ax-warm to-ax-warmSoft' :
    color === 'success' ? 'bg-gradient-to-r from-ax-success to-emerald-400' :
                          'bg-gradient-to-r from-ax-accent to-ax-accentSoft';
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-ax-mist">
        <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider">
          {icon}
          {label}
        </span>
        <span className="tabular-nums font-medium text-ax-fog">{value} / {max}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full ${barColor} transition-all duration-500`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
