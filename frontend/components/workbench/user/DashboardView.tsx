import { L2SubItem } from '../../layout/L2LeftSidebar';

interface DashboardViewProps {
  activeSubNav: L2SubItem;
  onNavigate?: (l1: string, l2: string) => void;
}

export function UserDashboardView({ activeSubNav, onNavigate }: DashboardViewProps) {
  const goto = (l1: string, l2: string) => onNavigate?.(l1, l2);

  const renderSection = () => {
    switch (activeSubNav) {
      case 'recent':
        return (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-white">最近活动</h2>
            <ul className="space-y-2 text-slate-300 text-sm">
              <li>· 支付成功：订单 #2489</li>
              <li>· 新增技能：AI 产品描述生成</li>
              <li>· Auto-Earn 回款：+120 USDC</li>
            </ul>
          </div>
        );
      case 'recommendations':
        return (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-white">推荐操作</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button className="p-4 bg-blue-600/80 hover:bg-blue-500 rounded-xl text-left text-white" onClick={() => goto('earn', 'auto-tasks')}>
                开启 Auto-Earn 任务
              </button>
              <button className="p-4 bg-slate-800/70 hover:bg-slate-700 rounded-xl text-left text-white" onClick={() => goto('shop', 'browse')}>
                逛逛商品市场
              </button>
            </div>
          </div>
        );
      default:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-white">总览</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
                <p className="text-sm text-slate-400">月度消费</p>
                <p className="text-2xl font-bold text-blue-400">$1,240</p>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
                <p className="text-sm text-slate-400">Auto-Earn 收益</p>
                <p className="text-2xl font-bold text-green-400">+620 USDC</p>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
                <p className="text-sm text-slate-400">活跃授权</p>
                <p className="text-2xl font-bold text-amber-300">4</p>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {renderSection()}
    </div>
  );
}
