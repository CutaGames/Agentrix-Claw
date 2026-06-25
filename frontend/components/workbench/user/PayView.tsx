import { L2SubItem } from '../../layout/L2LeftSidebar';

interface PayViewProps {
  activeSubNav: L2SubItem;
}

export function PayView({ activeSubNav }: PayViewProps) {
  const renderSection = () => {
    switch (activeSubNav) {
      case 'subscriptions':
        return <p className="text-slate-300">订阅管理：续费、停用与账单周期。</p>;
      case 'invoices':
        return <p className="text-slate-300">账单与发票：导出 PDF，支持公司抬头。</p>;
      default:
        return <p className="text-slate-300">支付历史：最近交易与通道（卡、USDC、X402）。</p>;
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h2 className="text-xl font-semibold text-white">支付中心</h2>
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
        {renderSection()}
      </div>
    </div>
  );
}
