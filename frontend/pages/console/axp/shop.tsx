/**
 * AXP Reward Shop — v4 page with real API + redeem flow.
 *
 * Endpoints:
 *  - GET  /api/v1/axp/shop          → list items
 *  - POST /api/v1/axp/shop/:id/redeem → redeem (deducts AXP server-side)
 */
import React from 'react';
import Link from 'next/link';
import { Coins, Shirt, Zap, ShoppingBag, Sparkles, Image as ImageIcon, AlertCircle, ArrowLeft } from 'lucide-react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { useToast } from '../../../contexts/ToastContext';
import { Button, Card, Badge, Skeleton } from '../../../components/ui/ax';
import { axpApi, type AxpShopItem, type AxpBalance } from '../../../lib/api/axp.api';

// Mock fallback while backend ships
const MOCK_ITEMS: AxpShopItem[] = [
  { id: '1', category: 'skin',    name: { zh: '限定皮肤：赛博龙猫',  en: 'Limited Skin: Cyber Chinchilla' }, cost: 5000, stock: 10,  limited: true },
  { id: '2', category: 'boost',   name: { zh: '集市置顶 24h',         en: 'Marketplace Pin 24h' },            cost: 200,  stock: 99 },
  { id: '3', category: 'ticket',  name: { zh: 'A2A 优先匹配券',       en: 'A2A Priority Match Ticket' },      cost: 500,  stock: 50 },
  { id: '4', category: 'ticket',  name: { zh: '抽奖券 ×1',            en: 'Lottery Ticket ×1' },              cost: 100,  stock: 999 },
  { id: '5', category: 'quota',   name: { zh: '宠物创作额度 +5',      en: 'Pet Creation Quota +5' },          cost: 300,  stock: 30 },
  { id: '6', category: 'frame',   name: { zh: '限定头像框',           en: 'Limited Avatar Frame' },           cost: 2000, stock: 5,   limited: true },
];

const CATEGORY_META: Record<AxpShopItem['category'], { icon: React.ComponentType<{ className?: string }>; color: string; label: { zh: string; en: string } }> = {
  skin:    { icon: Shirt,       color: 'text-ax-purpleSoft bg-ax-purple/15',     label: { zh: '皮肤', en: 'Skin' } },
  boost:   { icon: Zap,         color: 'text-ax-warm bg-ax-warm/15',             label: { zh: '提权', en: 'Boost' } },
  feature: { icon: Sparkles,    color: 'text-ax-accent bg-ax-accent/15',         label: { zh: '功能', en: 'Feature' } },
  quota:   { icon: ImageIcon,   color: 'text-ax-success bg-ax-success/15',       label: { zh: '配额', en: 'Quota' } },
  ticket:  { icon: ShoppingBag, color: 'text-ax-accent bg-ax-accent/15',         label: { zh: '券', en: 'Ticket' } },
  frame:   { icon: Sparkles,    color: 'text-ax-warm bg-ax-warm/15',             label: { zh: '头像框', en: 'Frame' } },
};

export default function AxpShopPage() {
  const { t } = useLocalization();
  const toast = useToast();
  const [items, setItems] = React.useState<AxpShopItem[]>([]);
  const [balance, setBalance] = React.useState<AxpBalance | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [redeemingId, setRedeemingId] = React.useState<string | null>(null);
  const [usingMock, setUsingMock] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, balRes] = await Promise.allSettled([
        axpApi.listShopItems(),
        axpApi.getBalance(),
      ]);
      if (itemsRes.status === 'fulfilled') {
        setItems(itemsRes.value.items);
        setUsingMock(false);
      } else {
        setItems(MOCK_ITEMS);
        setUsingMock(true);
      }
      if (balRes.status === 'fulfilled') {
        setBalance(balRes.value);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void reload(); }, [reload]);

  const handleRedeem = async (item: AxpShopItem) => {
    if (redeemingId) return;
    if ((balance?.balance ?? 0) < item.cost) {
      toast.error(t({
        zh: `AXP 不足 · 还差 ${(item.cost - (balance?.balance ?? 0)).toLocaleString()}`,
        en: `Insufficient AXP · need ${(item.cost - (balance?.balance ?? 0)).toLocaleString()} more`,
      }));
      return;
    }
    setRedeemingId(item.id);
    try {
      const r = await axpApi.redeem(item.id);
      toast.success(r.message || t({ zh: '兑换成功！', en: 'Redeemed!' }));
      // Optimistic balance update + reload from server
      if (balance) setBalance({ ...balance, balance: r.newBalance });
      await reload();
    } catch (e) {
      const msg = (e as { message?: string })?.message;
      toast.error(msg || t({ zh: '兑换失败，请稍后再试', en: 'Redeem failed, please retry' }));
    } finally {
      setRedeemingId(null);
    }
  };

  return (
    <ConsoleLayout
      title={t({ zh: 'AXP 兑换商店', en: 'AXP Reward Shop' })}
      subtitle={t({ zh: '使用 AXP 兑换皮肤、券、配额和限定特权。1 AXP = $0.001。', en: 'Redeem AXP for skins, tickets, quotas and limited perks. 1 AXP = $0.001.' })}
      action={
        <div className="flex items-center gap-2">
          {usingMock && (
            <Badge variant="warning" size="sm">
              <AlertCircle className="h-3 w-3" />
              {t({ zh: '示例数据', en: 'Mock data' })}
            </Badge>
          )}
          <Link href="/console/axp" className="inline-flex items-center gap-1.5 text-xs text-ax-mist hover:text-ax-ink transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            {t({ zh: '返回中心', en: 'Back to Center' })}
          </Link>
        </div>
      }
    >
      {/* Balance pill */}
      <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-ax-line bg-gradient-to-r from-ax-purple/15 to-ax-accent/10 px-4 py-2">
        <Coins className="h-4 w-4 text-ax-warm" />
        <span className="text-xs text-ax-mist uppercase tracking-wider">{t({ zh: '当前余额', en: 'Balance' })}</span>
        <span className="text-sm font-bold text-ax-ink tabular-nums">
          {balance ? balance.balance.toLocaleString() : '—'} AXP
        </span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} variant="default" padding="md">
              <Skeleton className="h-8 w-8 rounded-full mb-3" />
              <Skeleton className="h-5 w-4/5 mb-2" />
              <Skeleton className="h-4 w-1/3 mb-4" />
              <Skeleton className="h-10 w-full" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const meta = CATEGORY_META[item.category];
            const Icon = meta.icon;
            const insufficient = (balance?.balance ?? 0) < item.cost;
            const outOfStock = item.stock <= 0;
            const isRedeeming = redeemingId === item.id;
            return (
              <Card key={item.id} variant="elevated" padding="md" hoverable className="flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-ax-md ${meta.color}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="flex flex-col gap-1.5 items-end">
                    {item.limited && (
                      <Badge variant="warm" size="sm">{t({ zh: '限定', en: 'Limited' })}</Badge>
                    )}
                    <Badge variant="subtle" size="sm">{t(meta.label)}</Badge>
                  </div>
                </div>
                <h3 className="text-base font-bold text-ax-ink leading-snug">{t(item.name)}</h3>
                {item.description && (
                  <p className="mt-1 text-xs text-ax-mist leading-relaxed line-clamp-2">{t(item.description)}</p>
                )}
                <div className="mt-4 flex items-baseline justify-between">
                  <div>
                    <div className="text-xs text-ax-mist uppercase tracking-wider mb-0.5">{t({ zh: '价格', en: 'Cost' })}</div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-extrabold tabular-nums text-ax-accent">{item.cost.toLocaleString()}</span>
                      <span className="text-xs font-bold text-ax-fog">AXP</span>
                    </div>
                  </div>
                  <span className={`text-xs ${outOfStock ? 'text-ax-danger' : 'text-ax-mist'}`}>
                    {outOfStock
                      ? t({ zh: '已售罄', en: 'Sold out' })
                      : t({ zh: `库存 ${item.stock}`, en: `Stock ${item.stock}` })}
                  </span>
                </div>
                <Button
                  variant={insufficient || outOfStock ? 'secondary' : 'primary'}
                  size="md"
                  fullWidth
                  loading={isRedeeming}
                  disabled={loading || insufficient || outOfStock}
                  onClick={() => handleRedeem(item)}
                  className="mt-4"
                >
                  {outOfStock
                    ? t({ zh: '已售罄', en: 'Sold out' })
                    : insufficient
                    ? t({ zh: 'AXP 不足', en: 'Need more AXP' })
                    : t({ zh: '立即兑换', en: 'Redeem' })}
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </ConsoleLayout>
  );
}
