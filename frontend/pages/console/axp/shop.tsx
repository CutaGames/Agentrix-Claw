import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';

const SHOP_ITEMS = [
  { id: '1', name: { zh: '限定皮肤：赛博龙猫', en: 'Limited Skin: Cyber Chinchilla' }, cost: 5000, stock: 10 },
  { id: '2', name: { zh: '集市置顶 24h', en: 'Marketplace Pin 24h' }, cost: 200, stock: 99 },
  { id: '3', name: { zh: 'A2A 优先匹配券', en: 'A2A Priority Match Ticket' }, cost: 500, stock: 50 },
  { id: '4', name: { zh: '抽奖券 ×1', en: 'Lottery Ticket ×1' }, cost: 100, stock: 999 },
  { id: '5', name: { zh: '宠物创作额度 +5', en: 'Pet Creation Quota +5' }, cost: 300, stock: 30 },
  { id: '6', name: { zh: '限定头像框', en: 'Limited Avatar Frame' }, cost: 2000, stock: 5 },
];

export default function AxpShopPage() {
  const { t } = useLocalization();

  return (
    <ConsoleLayout title={t({ zh: '💎 AXP 兑换商店', en: '💎 AXP Reward Shop' })}>
      <p className="mb-6 text-sm text-gray-400">
        {t({ zh: '使用 AXP 兑换限定物品、特权和配额。1 AXP = $0.001。', en: 'Redeem AXP for limited items, privileges and quotas. 1 AXP = $0.001.' })}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SHOP_ITEMS.map((item) => (
          <div key={item.id} className="rounded-xl border border-gray-700 bg-gray-800/50 p-5">
            <h3 className="text-sm font-bold">{t(item.name)}</h3>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-lg font-extrabold text-purple-400">{item.cost.toLocaleString()} AXP</span>
              <span className="text-xs text-gray-500">{t({ zh: `库存 ${item.stock}`, en: `Stock: ${item.stock}` })}</span>
            </div>
            <button className="mt-3 w-full rounded-lg bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-700">
              {t({ zh: '兑换', en: 'Redeem' })}
            </button>
          </div>
        ))}
      </div>
    </ConsoleLayout>
  );
}
