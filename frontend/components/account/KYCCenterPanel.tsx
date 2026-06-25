'use client';

import React, { useState } from 'react';
import { 
  Shield, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  Upload,
  FileText,
  ChevronRight,
  Loader2,
  ArrowUp,
  User,
  Building,
  MapPin
} from 'lucide-react';
import { useKYC } from '../../contexts/KYCContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { KYCLevel, KYCRecord } from '../../lib/api/kyc.api';

// KYC等级配置
const levelConfig: Record<KYCLevel, { 
  label: string; 
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  requirements: string[];
}> = {
  basic: { 
    label: '基础认证', 
    icon: <User className="w-5 h-5" />,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    requirements: ['邮箱验证', '手机验证']
  },
  standard: { 
    label: '标准认证', 
    icon: <Shield className="w-5 h-5" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    requirements: ['身份证明', '人脸识别', '基础信息']
  },
  advanced: { 
    label: '高级认证', 
    icon: <MapPin className="w-5 h-5" />,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    requirements: ['地址证明', '收入证明', '银行流水']
  },
  enterprise: { 
    label: '企业认证', 
    icon: <Building className="w-5 h-5" />,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    requirements: ['营业执照', '法人证明', '公司章程', '授权书']
  },
};

// 等级顺序
const levelOrder: KYCLevel[] = ['basic', 'standard', 'advanced', 'enterprise'];

interface LevelProgressProps {
  currentLevel: KYCLevel;
}

const LevelProgress: React.FC<LevelProgressProps> = ({ currentLevel }) => {
  const currentIndex = levelOrder.indexOf(currentLevel);
  
  return (
    <div className="flex items-center justify-between mb-6">
      {levelOrder.map((level, index) => {
        const config = levelConfig[level];
        const isCompleted = index <= currentIndex;
        const isCurrent = index === currentIndex;
        
        return (
          <React.Fragment key={level}>
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isCompleted ? config.bgColor : 'bg-gray-100'
              } ${isCurrent ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}>
                {isCompleted ? (
                  <CheckCircle className={`w-5 h-5 ${config.color}`} />
                ) : (
                  <span className="text-gray-400">{config.icon}</span>
                )}
              </div>
              <span className={`text-xs mt-2 ${isCompleted ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                {config.label}
              </span>
            </div>
            {index < levelOrder.length - 1 && (
              <div className={`flex-1 h-1 mx-2 rounded ${
                index < currentIndex ? 'bg-blue-500' : 'bg-gray-200'
              }`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

interface BenefitsTableProps {
  currentLevel: KYCLevel;
}

const BenefitsTable: React.FC<BenefitsTableProps> = ({ currentLevel }) => {
  const benefits = [
    { label: '日交易额', values: ['$1,000', '$10,000', '$100,000', '无限'] },
    { label: '提现限额', values: ['$500/日', '$5,000/日', '$50,000/日', '无限'] },
    { label: 'API调用', values: ['1,000/日', '10,000/日', '100,000/日', '无限'] },
    { label: '收益分成', values: ['70%', '75%', '80%', '85%'] },
  ];

  const currentIndex = levelOrder.indexOf(currentLevel);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-3 px-4 font-medium text-gray-500">权益</th>
            {levelOrder.map((level, index) => (
              <th 
                key={level} 
                className={`text-center py-3 px-4 font-medium ${
                  index === currentIndex ? 'text-blue-600 bg-blue-50' : 'text-gray-500'
                }`}
              >
                {levelConfig[level].label}
                {index === currentIndex && <span className="ml-1">✓</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {benefits.map((benefit, rowIndex) => (
            <tr key={benefit.label} className="border-b border-gray-100 dark:border-gray-800">
              <td className="py-3 px-4 text-gray-600">{benefit.label}</td>
              {benefit.values.map((value, colIndex) => (
                <td 
                  key={colIndex} 
                  className={`text-center py-3 px-4 ${
                    colIndex === currentIndex ? 'text-blue-600 bg-blue-50 font-medium' : 'text-gray-900'
                  }`}
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

interface DocumentItemProps {
  document: {
    type: string;
    status: 'pending' | 'verified' | 'rejected';
    uploadedAt: string;
  };
}

const DocumentItem: React.FC<DocumentItemProps> = ({ document }) => {
  const statusConfig = {
    pending: { icon: <Clock className="w-4 h-4" />, color: 'text-yellow-600', label: '审核中' },
    verified: { icon: <CheckCircle className="w-4 h-4" />, color: 'text-green-600', label: '已验证' },
    rejected: { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-red-600', label: '已拒绝' },
  };

  const status = statusConfig[document.status];

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center gap-3">
        <FileText className="w-5 h-5 text-gray-400" />
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {document.type}
          </div>
          <div className="text-xs text-gray-500">
            {new Date(document.uploadedAt).toLocaleDateString('zh-CN')}
          </div>
        </div>
      </div>
      <div className={`flex items-center gap-1 ${status.color}`}>
        {status.icon}
        <span className="text-sm">{status.label}</span>
      </div>
    </div>
  );
};

interface KYCCenterPanelProps {
  onUpgrade?: (level: KYCLevel) => void;
}

const KYCCenterPanel: React.FC<KYCCenterPanelProps> = ({ onUpgrade }) => {
  const { 
    activeKYC, 
    currentLevel, 
    levelBenefits,
    renewalNeeded,
    daysUntilExpiry,
    loading, 
    error 
  } = useKYC();

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const currentConfig = levelConfig[currentLevel];
  const nextLevel = levelOrder[levelOrder.indexOf(currentLevel) + 1];
  const nextConfig = nextLevel ? levelConfig[nextLevel] : null;

  return (
    <div className="space-y-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            KYC 认证中心
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            完成身份认证以解锁更多功能和更高限额
          </p>
        </div>
      </div>

      {/* 续期提醒 */}
      {renewalNeeded && daysUntilExpiry !== null && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <div className="flex-1">
            <div className="font-medium text-amber-800 dark:text-amber-200">
              认证即将过期
            </div>
            <div className="text-sm text-amber-600">
              您的{currentConfig.label}将在 {daysUntilExpiry} 天后过期，请及时续期
            </div>
          </div>
          <button className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700">
            立即续期
          </button>
        </div>
      )}

      {/* 当前等级卡片 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl ${currentConfig.bgColor} flex items-center justify-center`}>
              <span className={currentConfig.color}>{currentConfig.icon}</span>
            </div>
            <div>
              <div className="text-sm text-gray-500">当前等级</div>
              <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {currentConfig.label}
              </div>
            </div>
          </div>
          {activeKYC?.validUntil && (
            <div className="text-right">
              <div className="text-sm text-gray-500">有效期至</div>
              <div className="text-gray-900 dark:text-gray-100">
                {new Date(activeKYC.validUntil).toLocaleDateString('zh-CN')}
              </div>
            </div>
          )}
        </div>

        <LevelProgress currentLevel={currentLevel} />
      </div>

      {/* 等级权益对比 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
          等级权益对比
        </h3>
        <BenefitsTable currentLevel={currentLevel} />
      </div>

      {/* 升级入口 */}
      {nextConfig && (
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-1">
                升级到 {nextConfig.label}
              </h3>
              <p className="text-blue-100 text-sm">
                解锁更高限额和更多专属权益
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {nextConfig.requirements.map((req, i) => (
                  <span key={i} className="text-xs bg-white/20 px-2 py-1 rounded">
                    {req}
                  </span>
                ))}
              </div>
            </div>
            <button 
              onClick={() => onUpgrade?.(nextLevel)}
              className="flex items-center gap-2 px-6 py-3 bg-white text-blue-600 rounded-lg hover:bg-blue-50 font-medium"
            >
              <ArrowUp className="w-4 h-4" />
              开始升级
            </button>
          </div>
        </div>
      )}

      {/* 已提交文档 */}
      {activeKYC?.documents && activeKYC.documents.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            已提交文档
          </h3>
          <div>
            {activeKYC.documents.map((doc, index) => (
              <DocumentItem key={index} document={doc} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default KYCCenterPanel;
