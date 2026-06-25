import { L2SubItem } from '../../layout/L2LeftSidebar';

interface EarnViewProps {
  activeSubNav: L2SubItem;
}

export function EarnView({ activeSubNav }: EarnViewProps) {
  const renderSection = () => {
    switch (activeSubNav) {
      case 'airdrops':
        return <p className="text-slate-300">空投发现：同步热门空投与资格检查。</p>;
      case 'strategies':
        return <p className="text-slate-300">策略管理：配置自动执行的收益策略。</p>;
      case 'history':
        return <p className="text-slate-300">收益历史：查看近期待收益曲线。</p>;
      default:
        return <p className="text-slate-300">自动任务：一键开启收益任务，含质押、刷单、积分。</p>;
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h2 className="text-xl font-semibold text-white">自动赚钱</h2>
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
        {renderSection()}
      </div>
    </div>
  );
}
