import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';

export default function ConsolePetIndex() {
  const { t } = useLocalization();

  return (
    <ConsoleLayout title={t({ zh: '主宠工作区', en: 'Pet Workspace' })}>
      {/* Pet 3D placeholder */}
      <div className="mb-8 flex items-center gap-6 rounded-xl border border-gray-700 bg-gray-800/50 p-6">
        <div className="h-24 w-24 rounded-full bg-gradient-to-br from-purple-500/30 to-cyan-500/20 flex items-center justify-center text-4xl">
          😊
        </div>
        <div>
          <h2 className="text-xl font-bold">Alfred · Lv.7</h2>
          <p className="text-sm text-gray-400">XP 342/500 · ⚡ 能量 72% · Clan A</p>
          <div className="mt-3 flex gap-2">
            <Link href="/console/pet/create" className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-700">
              {t({ zh: '🎨 PetCreator 工坊', en: '🎨 PetCreator Studio' })}
            </Link>
            <Link href="/console/pet/wardrobe" className="rounded-lg bg-gray-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-gray-600">
              {t({ zh: '👕 衣柜', en: '👕 Wardrobe' })}
            </Link>
            <Link href="/console/pet/souls" className="rounded-lg bg-gray-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-gray-600">
              {t({ zh: '💫 灵魂切换', en: '💫 Soul Switch' })}
            </Link>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { href: '/console/pet/breed', icon: '🧬', label: t({ zh: '繁育', en: 'Breed' }) },
          { href: '/console/pet/playground', icon: '🎮', label: t({ zh: 'Playground', en: 'Playground' }) },
          { href: '/market/sell', icon: '🏷️', label: t({ zh: '上架皮肤到集市', en: 'List skin on market' }) },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/30 p-4 hover:border-indigo-500/50">
            <span className="text-2xl">{item.icon}</span>
            <span className="text-sm font-medium">{item.label}</span>
          </Link>
        ))}
      </div>
    </ConsoleLayout>
  );
}
