import { L2SubItem } from '../../layout/L2LeftSidebar';

interface AssetsViewProps {
  activeSubNav: L2SubItem;
}

export function AssetsView({ activeSubNav }: AssetsViewProps) {
  const renderSection = () => {
    switch (activeSubNav) {
      case 'balances':
        return <p className="text-slate-300">资产余额：多链余额与估值汇总。</p>;
      case 'kyc':
        return <p className="text-slate-300">身份认证：KYC/合规状态检查。</p>;
      default:
        return <p className="text-slate-300">钱包管理：绑定/切换主钱包，查看关联授权。</p>;
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h2 className="text-xl font-semibold text-white">资产与安全</h2>
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
        {renderSection()}
      </div>
    </div>
  );
}
