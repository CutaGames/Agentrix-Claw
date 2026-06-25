import { L2SubItem } from '../../layout/L2LeftSidebar';

interface ShopViewProps {
  activeSubNav: L2SubItem;
}

export function ShopView({ activeSubNav }: ShopViewProps) {
  const renderSection = () => {
    switch (activeSubNav) {
      case 'orders':
        return <p className="text-slate-300">订单中心：跟踪履约、退款与物流。</p>;
      case 'cart':
        return <p className="text-slate-300">购物车：待结算商品、优惠与税费预估。</p>;
      case 'wishlist':
        return <p className="text-slate-300">心愿单：收藏的商品与补货提醒。</p>;
      default:
        return <p className="text-slate-300">浏览商品：AI 商品/技能市场浏览，占位数据。</p>;
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h2 className="text-xl font-semibold text-white">智能购物</h2>
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
        {renderSection()}
      </div>
    </div>
  );
}
