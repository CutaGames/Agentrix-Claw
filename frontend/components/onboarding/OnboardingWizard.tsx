'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronRight, 
  ChevronLeft,
  Check, 
  Loader2,
  Zap,
  Store,
  GraduationCap,
  Database,
  Code,
  User,
  X,
  Sparkles
} from 'lucide-react';
import { useLocalization } from '../../contexts/LocalizationContext';
import { 
  onboardingApi, 
  OnboardingSession, 
  UserPersona, 
  personaSteps 
} from '../../lib/api/onboarding.api';
import {
  ApiProviderVerifyIdentityStep,
  ApiProviderImportApiStep,
  ApiProviderPricingStep,
  ApiProviderPublishStep,
  GenericFormStep,
} from './OnboardingSteps';

// 画像配置
const personaConfig: Record<UserPersona, {
  icon: React.ReactNode;
  label: string;
  description: string;
  color: string;
  bgColor: string;
}> = {
  personal: {
    icon: <User className="w-8 h-8" />,
    label: '个人用户',
    description: '使用 AI Agent 完成日常任务，购买和使用各种技能',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 hover:bg-blue-100',
  },
  api_provider: {
    icon: <Zap className="w-8 h-8" />,
    label: 'API 厂商',
    description: '将您的 API 转化为 Agent 可调用的技能，按调用付费',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 hover:bg-purple-100',
  },
  merchant: {
    icon: <Store className="w-8 h-8" />,
    label: '实物/服务商',
    description: '让 Agent 能够直接帮用户下单，零门槛入驻 AI 生态',
    color: 'text-green-600',
    bgColor: 'bg-green-50 hover:bg-green-100',
  },
  expert: {
    icon: <GraduationCap className="w-8 h-8" />,
    label: '行业专家',
    description: '将专业知识资产化，提供付费咨询和专业服务',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 hover:bg-amber-100',
  },
  data_provider: {
    icon: <Database className="w-8 h-8" />,
    label: '数据提供方',
    description: '安全共享数据资产，按查询付费的 X402 微支付',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 hover:bg-orange-100',
  },
  developer: {
    icon: <Code className="w-8 h-8" />,
    label: '全能开发者',
    description: '构建复杂的 Skill 和工作流，多平台分发和变现',
    color: 'text-slate-600',
    bgColor: 'bg-slate-50 hover:bg-slate-100',
  },
};

interface OnboardingWizardProps {
  initialPersona?: UserPersona;
  onComplete: (result: OnboardingSession) => void;
  onCancel: () => void;
  allowedPersonas?: UserPersona[];
}

// 步骤组件 Props
interface StepProps {
  session: OnboardingSession;
  onNext: (data?: Record<string, any>) => void;
  onBack: () => void;
  onSkip?: () => void;
  isLoading: boolean;
}

// 欢迎步骤
const WelcomeStep: React.FC<StepProps> = ({ session, onNext, isLoading }) => {
  const config = personaConfig[session.persona];
  
  return (
    <div className="text-center py-8">
      <div className={`inline-flex p-4 rounded-full ${config.bgColor} mb-6`}>
        <span className={config.color}>{config.icon}</span>
      </div>
      <h2 className="text-2xl font-bold mb-3">欢迎成为 {config.label}</h2>
      <p className="text-gray-600 mb-8 max-w-md mx-auto">{config.description}</p>
      
      <div className="bg-blue-50 rounded-lg p-4 mb-8 text-left max-w-md mx-auto">
        <h3 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          接下来我们将帮您完成
        </h3>
        <ul className="text-sm text-blue-800 space-y-1">
          {session.persona === 'personal' && (
            <>
              <li>• 连接您的钱包</li>
              <li>• 创建您的第一个 AI Agent</li>
              <li>• 探索技能市场</li>
            </>
          )}
          {session.persona === 'api_provider' && (
            <>
              <li>• 验证您的身份</li>
              <li>• 导入您的 API (支持 OpenAPI/Swagger)</li>
              <li>• 配置定价策略</li>
              <li>• 发布技能到市场</li>
            </>
          )}
          {session.persona === 'merchant' && (
            <>
              <li>• 验证商户身份</li>
              <li>• 同步您的商品目录</li>
              <li>• 配置 UCP 协议</li>
              <li>• 测试下单流程</li>
            </>
          )}
          {session.persona === 'expert' && (
            <>
              <li>• 验证专业资质</li>
              <li>• 创建能力卡片</li>
              <li>• 设置咨询定价</li>
              <li>• 配置 SLA 承诺</li>
            </>
          )}
          {session.persona === 'data_provider' && (
            <>
              <li>• 验证数据所有权</li>
              <li>• 上传/接入数据集</li>
              <li>• 配置隐私保护级别</li>
              <li>• 设置 X402 查询定价</li>
            </>
          )}
          {session.persona === 'developer' && (
            <>
              <li>• 创建开发者账户</li>
              <li>• 构建您的第一个 Skill</li>
              <li>• 测试与调试</li>
              <li>• 发布到市场</li>
            </>
          )}
        </ul>
      </div>
      
      <button
        onClick={() => onNext()}
        disabled={isLoading}
        className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : '开始入驻'}
      </button>
    </div>
  );
};

// 完成步骤
const CompleteStep: React.FC<StepProps & { onFinish: () => void }> = ({ session, onFinish, isLoading }) => {
  const config = personaConfig[session.persona];
  
  return (
    <div className="text-center py-8">
      <div className="inline-flex p-4 rounded-full bg-green-100 mb-6">
        <Check className="w-8 h-8 text-green-600" />
      </div>
      <h2 className="text-2xl font-bold mb-3">恭喜！入驻完成 🎉</h2>
      <p className="text-gray-600 mb-8 max-w-md mx-auto">
        您已成功完成 {config.label} 入驻流程，现在可以开始使用完整功能了。
      </p>
      
      <div className="bg-gray-50 rounded-lg p-4 mb-8 text-left max-w-md mx-auto">
        <h3 className="font-medium text-gray-900 mb-2">已创建的资源</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          {session.createdResources.agentAccountId && (
            <li>✓ Agent 账户已创建</li>
          )}
          {session.createdResources.developerAccountId && (
            <li>✓ 开发者账户已创建</li>
          )}
          {session.createdResources.merchantAccountId && (
            <li>✓ 商户账户已创建</li>
          )}
          {session.createdResources.expertProfileId && (
            <li>✓ 专家档案已创建</li>
          )}
          {session.createdResources.workspaceId && (
            <li>✓ 工作空间已创建</li>
          )}
        </ul>
      </div>
      
      <button
        onClick={onFinish}
        disabled={isLoading}
        className="px-8 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
      >
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : '进入控制台'}
      </button>
    </div>
  );
};

// 通用步骤占位符（实际实现时替换）
const GenericStep: React.FC<StepProps & { stepId: string }> = ({ 
  session, 
  stepId, 
  onNext, 
  onBack, 
  onSkip, 
  isLoading 
}) => {
  const stepName = stepId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  
  return (
    <div className="py-8">
      <h2 className="text-xl font-bold mb-4">{stepName}</h2>
      <p className="text-gray-600 mb-8">
        此步骤正在开发中...
      </p>
      
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 inline mr-1" />
          上一步
        </button>
        
        <div className="flex gap-3">
          {onSkip && (
            <button
              onClick={onSkip}
              className="px-6 py-2 text-gray-500 hover:text-gray-700 transition-colors"
            >
              跳过
            </button>
          )}
          <button
            onClick={() => onNext()}
            disabled={isLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <>
                下一步
                <ChevronRight className="w-4 h-4 inline ml-1" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// 画像选择器
const PersonaSelector: React.FC<{
  onSelect: (persona: UserPersona) => void;
  isLoading: boolean;
  allowedPersonas?: UserPersona[];
}> = ({ onSelect, isLoading, allowedPersonas }) => {
  const [selected, setSelected] = useState<UserPersona | null>(null);
  
  const allPersonas: UserPersona[] = ['api_provider', 'merchant', 'expert', 'data_provider', 'developer'];
  const personas = allowedPersonas || allPersonas;
  
  return (
    <div className="py-8">
      <h2 className="text-2xl font-bold text-center mb-2">欢迎加入 Agentrix 生态</h2>
      <p className="text-gray-600 text-center mb-8">您是哪类生态参与者？</p>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {personas.map((persona) => {
          const config = personaConfig[persona];
          const isSelected = selected === persona;
          
          return (
            <button
              key={persona}
              onClick={() => setSelected(persona)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                isSelected 
                  ? `border-blue-500 ${config.bgColor}` 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className={`${config.color} mb-3`}>{config.icon}</div>
              <div className="font-medium text-gray-900">{config.label}</div>
              <div className="text-xs text-gray-500 mt-1 line-clamp-2">{config.description}</div>
            </button>
          );
        })}
      </div>
      
      <div className="text-center mb-6">
        <button
          onClick={() => onSelect('personal')}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          我只是想使用 Agent 服务 → 个人用户入口
        </button>
      </div>
      
      <div className="flex justify-center">
        <button
          onClick={() => selected && onSelect(selected)}
          disabled={!selected || isLoading}
          className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : '继续'}
        </button>
      </div>
    </div>
  );
};

// 进度条
const ProgressBar: React.FC<{ steps: string[]; currentStep: string }> = ({ steps, currentStep }) => {
  const currentIndex = steps.indexOf(currentStep);
  
  return (
    <div className="flex items-center justify-center mb-8">
      {steps.map((step, index) => (
        <React.Fragment key={step}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            index < currentIndex 
              ? 'bg-green-500 text-white' 
              : index === currentIndex 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 text-gray-500'
          }`}>
            {index < currentIndex ? <Check className="w-4 h-4" /> : index + 1}
          </div>
          {index < steps.length - 1 && (
            <div className={`w-12 h-1 ${
              index < currentIndex ? 'bg-green-500' : 'bg-gray-200'
            }`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// 主组件
const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  initialPersona,
  onComplete,
  onCancel,
  allowedPersonas,
}) => {
  const { t } = useLocalization();
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPersonaSelector, setShowPersonaSelector] = useState(!initialPersona);

  // 初始化或恢复会话
  useEffect(() => {
    if (initialPersona) {
      startOnboarding(initialPersona);
    } else {
      checkExistingSession();
    }
  }, [initialPersona]);

  const checkExistingSession = async () => {
    try {
      const current = await onboardingApi.getCurrentSession();
      if (current && current.status === 'in_progress') {
        setSession(current);
        setShowPersonaSelector(false);
      }
    } catch (err) {
      // 没有现有会话，显示选择器
    }
  };

  const startOnboarding = async (persona: UserPersona) => {
    setIsLoading(true);
    setError(null);
    try {
      const newSession = await onboardingApi.start({ persona });
      setSession(newSession);
      setShowPersonaSelector(false);
    } catch (err: any) {
      setError(err.message || '启动入驻流程失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNext = async (data?: Record<string, any>) => {
    if (!session) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const result = await onboardingApi.completeStep(session.id, session.currentStep, data);
      if (result.nextStep) {
        const updated = await onboardingApi.getCurrentSession();
        setSession(updated);
      }
    } catch (err: any) {
      setError(err.message || '步骤完成失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = async () => {
    if (!session) return;
    
    setIsLoading(true);
    try {
      const updated = await onboardingApi.goBack(session.id);
      setSession(updated);
    } catch (err: any) {
      setError(err.message || '返回上一步失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = async () => {
    if (!session) return;
    
    setIsLoading(true);
    try {
      const result = await onboardingApi.skipStep(session.id, session.currentStep);
      if (result.nextStep) {
        const updated = await onboardingApi.getCurrentSession();
        setSession(updated);
      }
    } catch (err: any) {
      setError(err.message || '跳过步骤失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinish = () => {
    if (session) {
      onComplete(session);
    }
  };

  const handleCancel = async () => {
    if (session) {
      try {
        await onboardingApi.abandon(session.id);
      } catch (err) {
        // 忽略错误
      }
    }
    onCancel();
  };

  // 渲染当前步骤
  const renderStep = () => {
    if (!session) return null;

    const stepProps: StepProps = {
      session,
      onNext: handleNext,
      onBack: handleBack,
      onSkip: handleSkip,
      isLoading,
    };

    // API Provider 画像步骤
    if (session.persona === 'api_provider') {
      switch (session.currentStep) {
        case 'welcome':
          return <WelcomeStep {...stepProps} />;
        case 'verify-identity':
          return <ApiProviderVerifyIdentityStep {...stepProps} />;
        case 'import-api':
          return <ApiProviderImportApiStep {...stepProps} />;
        case 'configure-pricing':
          return <ApiProviderPricingStep {...stepProps} />;
        case 'publish':
        case 'publish-skill':
          return <ApiProviderPublishStep {...stepProps} />;
        case 'complete':
          return <CompleteStep {...stepProps} onFinish={handleFinish} />;
        default:
          return <GenericStep {...stepProps} stepId={session.currentStep} />;
      }
    }

    // Data Provider 画像步骤
    if (session.persona === 'data_provider') {
      switch (session.currentStep) {
        case 'welcome':
          return <WelcomeStep {...stepProps} />;
        case 'verify-identity':
          return <GenericFormStep {...stepProps} 
            title="验证数据所有权与合规" 
            description="请提供数据来源与合法性证明，并完成合规声明"
            fields={[
              { name: 'orgName', label: '机构名称', type: 'text', required: true, placeholder: '如：Agentrix Data Lab' },
              { name: 'dataSteward', label: '数据负责人', type: 'text', required: true },
              { name: 'dataSource', label: '数据来源', type: 'text', required: true },
              { name: 'ownershipProof', label: '所有权/授权证明链接', type: 'url', required: true, helper: '可提供授权书、合同或公开许可链接' },
              { name: 'complianceContact', label: '合规联系人邮箱', type: 'email', required: true },
              { name: 'sanctionsCheck', label: '我确认数据不包含受制裁或违规来源', type: 'checkbox', required: true },
              { name: 'privacyConsent', label: '我已确保数据满足隐私与数据保护要求（如脱敏）', type: 'checkbox', required: true },
            ]}
          />;
        case 'upload-dataset':
          return <GenericFormStep {...stepProps} 
            title="上传或接入数据集" 
            description="提供数据接入方式与更新频率"
            fields={[
              { name: 'datasetName', label: '数据集名称', type: 'text', required: true },
              { name: 'datasetUrl', label: '数据集地址/接口', type: 'url', required: true },
              { name: 'format', label: '数据格式', type: 'select', required: true, options: [
                { label: 'CSV', value: 'csv' },
                { label: 'JSON', value: 'json' },
                { label: 'Parquet', value: 'parquet' },
                { label: 'API', value: 'api' },
                { label: '其他', value: 'other' },
              ] },
              { name: 'updateFrequency', label: '更新频率', type: 'text', placeholder: '如：每日/每周/实时' },
              { name: 'accessKey', label: '访问凭证（如需）', type: 'password' },
            ]}
          />;
        case 'configure-privacy':
          return <GenericFormStep {...stepProps} 
            title="配置隐私与访问控制" 
            description="设置隐私级别与数据保护策略"
            fields={[
              { name: 'privacyLevel', label: '隐私级别', type: 'select', required: true, options: [
                { label: '公开', value: 'public' },
                { label: '受控访问', value: 'controlled' },
                { label: '严格限制', value: 'restricted' },
              ] },
              { name: 'anonymization', label: '脱敏/匿名化说明', type: 'textarea', required: true, placeholder: '说明脱敏/匿名化方法' },
              { name: 'retention', label: '数据保留期限', type: 'text', placeholder: '如：90 天/1 年' },
              { name: 'legalBasis', label: '合法性依据', type: 'text', placeholder: '如：用户授权/公开许可/合同' },
            ]}
          />;
        case 'set-x402-pricing':
          return <ApiProviderPricingStep {...stepProps} />;
        case 'complete':
          return <CompleteStep {...stepProps} onFinish={handleFinish} />;
        default:
          return <GenericStep {...stepProps} stepId={session.currentStep} />;
      }
    }

    // Expert 画像步骤
    if (session.persona === 'expert') {
      switch (session.currentStep) {
        case 'welcome':
          return <WelcomeStep {...stepProps} />;
        case 'verify-identity':
          return <GenericFormStep {...stepProps} 
            title="验证专业资质与身份" 
            description="提交资质与合规声明，保障服务可信"
            fields={[
              { name: 'fullName', label: '姓名/机构名称', type: 'text', required: true },
              { name: 'expertise', label: '专业领域', type: 'text', required: true },
              { name: 'yearsOfExperience', label: '从业年限', type: 'number', required: true },
              { name: 'credentials', label: '资质证书链接', type: 'url', required: true },
              { name: 'affiliation', label: '机构/协会', type: 'text' },
              { name: 'ethicsConsent', label: '我承诺遵守行业伦理与合规要求', type: 'checkbox', required: true },
              { name: 'privacyConsent', label: '我承诺严格保护用户隐私与数据安全', type: 'checkbox', required: true },
            ]}
          />;
        case 'create-capability-card':
          return <GenericFormStep {...stepProps} 
            title="创建能力卡片" 
            description="展示服务内容、范围与交付方式"
            fields={[
              { name: 'title', label: '服务标题', type: 'text', required: true },
              { name: 'description', label: '服务描述', type: 'textarea', required: true, placeholder: '请描述您的服务内容与边界' },
              { name: 'specialties', label: '专长领域', type: 'text' },
              { name: 'deliverables', label: '交付物说明', type: 'textarea' },
            ]}
          />;
        case 'set-pricing':
          return <ApiProviderPricingStep {...stepProps} />;
        case 'configure-sla':
          return <GenericFormStep {...stepProps} 
            title="配置 SLA 与风控" 
            description="设置响应时间、服务范围与争议处理"
            fields={[
              { name: 'responseTime', label: '响应时间 (小时)', type: 'number', required: true },
              { name: 'availability', label: '可用时间段', type: 'text', placeholder: '如：工作日 9:00-18:00' },
              { name: 'disputePolicy', label: '争议处理与退款政策', type: 'textarea', required: true },
              { name: 'slaConsent', label: '我同意遵守平台服务标准与风控规则', type: 'checkbox', required: true },
            ]}
          />;
        case 'complete':
          return <CompleteStep {...stepProps} onFinish={handleFinish} />;
        default:
          return <GenericStep {...stepProps} stepId={session.currentStep} />;
      }
    }

    // Merchant 画像步骤
    if (session.persona === 'merchant') {
      switch (session.currentStep) {
        case 'welcome':
          return <WelcomeStep {...stepProps} />;
        case 'verify-identity':
          return <GenericFormStep {...stepProps}
            title="商户身份与合规核验"
            description="用于支付与结算合规，请提供真实信息"
            fields={[
              { name: 'companyName', label: '商户/公司名称', type: 'text', required: true },
              { name: 'registrationNumber', label: '营业执照/注册号', type: 'text', required: true },
              { name: 'legalRepresentative', label: '法定代表人', type: 'text', required: true },
              { name: 'businessAddress', label: '经营地址', type: 'textarea', required: true },
              { name: 'country', label: '所在国家/地区', type: 'select', required: true, options: [
                { label: '中国', value: 'CN' },
                { label: '新加坡', value: 'SG' },
                { label: '美国', value: 'US' },
                { label: '其他', value: 'OTHER' },
              ] },
              { name: 'website', label: '官方网站', type: 'url' },
              { name: 'contactEmail', label: '联系邮箱', type: 'email', required: true },
              { name: 'contactPhone', label: '联系电话', type: 'tel' },
              { name: 'amlConsent', label: '我已阅读并遵守反洗钱与制裁合规要求', type: 'checkbox', required: true },
              { name: 'termsConsent', label: '我同意平台服务协议与风控条款', type: 'checkbox', required: true },
            ]}
          />;
        case 'sync-store':
          return <GenericFormStep {...stepProps}
            title="同步商品目录"
            description="连接您的店铺或上传商品清单"
            fields={[
              { name: 'storeName', label: '店铺名称', type: 'text', required: true },
              { name: 'platform', label: '平台类型', type: 'select', required: true, options: [
                { label: 'Shopify', value: 'shopify' },
                { label: 'WooCommerce', value: 'woocommerce' },
                { label: 'Amazon', value: 'amazon' },
                { label: '其他', value: 'other' },
              ] },
              { name: 'storeUrl', label: '店铺地址', type: 'url', required: true },
              { name: 'productCount', label: '预计商品数量', type: 'number' },
              { name: 'syncNote', label: '同步说明', type: 'textarea' },
            ]}
          />;
        case 'configure-ucp':
          return <GenericFormStep {...stepProps}
            title="配置 UCP 协议与结算"
            description="设置收款地址与退款政策"
            fields={[
              { name: 'settlementAddress', label: '结算钱包地址', type: 'text', required: true },
              { name: 'payoutCurrency', label: '结算币种', type: 'select', required: true, options: [
                { label: 'USDT', value: 'USDT' },
                { label: 'USDC', value: 'USDC' },
                { label: 'USD', value: 'USD' },
              ] },
              { name: 'refundPolicy', label: '退款/取消政策', type: 'textarea', required: true },
              { name: 'deliverySla', label: '履约 SLA', type: 'text', placeholder: '如：48 小时内发货' },
              { name: 'ucpConsent', label: '我同意 UCP 协议与自动结算条款', type: 'checkbox', required: true },
            ]}
          />;
        case 'test-order':
          return <GenericFormStep {...stepProps}
            title="测试下单流程"
            description="完成测试单以验证商品与支付链路"
            fields={[
              { name: 'testContact', label: '测试联系人', type: 'text', required: true },
              { name: 'testScenario', label: '测试场景描述', type: 'textarea', required: true },
              { name: 'chargebackConsent', label: '我已了解并接受拒付/纠纷处理规则', type: 'checkbox', required: true },
            ]}
          />;
        case 'complete':
          return <CompleteStep {...stepProps} onFinish={handleFinish} />;
        default:
          return <GenericStep {...stepProps} stepId={session.currentStep} />;
      }
    }

    // Developer 画像步骤
    if (session.persona === 'developer') {
      switch (session.currentStep) {
        case 'welcome':
          return <WelcomeStep {...stepProps} />;
        case 'create-developer-account':
          return <GenericFormStep {...stepProps}
            title="创建开发者账户"
            description="用于访问 API 与结算，请填写真实信息"
            fields={[
              { name: 'developerName', label: '开发者名称', type: 'text', required: true },
              { name: 'organization', label: '组织/公司（可选）', type: 'text' },
              { name: 'region', label: '所在国家/地区', type: 'select', required: true, options: [
                { label: '中国', value: 'CN' },
                { label: '新加坡', value: 'SG' },
                { label: '美国', value: 'US' },
                { label: '其他', value: 'OTHER' },
              ] },
              { name: 'securityEmail', label: '安全邮箱', type: 'email', required: true },
              { name: 'twoFactor', label: '我已启用或承诺启用 2FA', type: 'checkbox', required: true },
              { name: 'termsConsent', label: '我同意平台开发者协议与合规要求', type: 'checkbox', required: true },
            ]}
          />;
        case 'create-skill':
          return <GenericFormStep {...stepProps}
            title="创建 Skill"
            description="完善能力信息与数据处理说明"
            fields={[
              { name: 'skillName', label: 'Skill 名称', type: 'text', required: true },
              { name: 'inputSpec', label: '输入规范链接', type: 'url', required: true },
              { name: 'outputSpec', label: '输出规范链接', type: 'url' },
              { name: 'riskLevel', label: '风险级别', type: 'select', required: true, options: [
                { label: '低', value: 'low' },
                { label: '中', value: 'medium' },
                { label: '高', value: 'high' },
              ] },
              { name: 'dataHandling', label: '数据处理说明', type: 'textarea', required: true },
            ]}
          />;
        case 'test-skill':
          return <GenericFormStep {...stepProps}
            title="测试与验证"
            description="提供测试信息与监控联系"
            fields={[
              { name: 'testEndpoint', label: '测试端点', type: 'url', required: true },
              { name: 'testCases', label: '测试用例说明', type: 'textarea', required: true },
              { name: 'monitoringContact', label: '运维联系人邮箱', type: 'email', required: true },
            ]}
          />;
        case 'publish-skill':
          return <GenericFormStep {...stepProps}
            title="发布确认"
            description="确认合规与内容授权后发布"
            fields={[
              { name: 'contentRights', label: '我确认拥有相关内容/数据的发布权利', type: 'checkbox', required: true },
              { name: 'securityPolicy', label: '我已阅读并遵守安全与风控要求', type: 'checkbox', required: true },
            ]}
          />;
        case 'complete':
          return <CompleteStep {...stepProps} onFinish={handleFinish} />;
        default:
          return <GenericStep {...stepProps} stepId={session.currentStep} />;
      }
    }

    // 其他画像使用通用步骤
    switch (session.currentStep) {
      case 'welcome':
        return <WelcomeStep {...stepProps} />;
      case 'complete':
        return <CompleteStep {...stepProps} onFinish={handleFinish} />;
      default:
        return <GenericStep {...stepProps} stepId={session.currentStep} />;
    }
  };

  const steps = session ? personaSteps[session.persona] : [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            <span className="font-semibold">入驻向导</span>
          </div>
          <button
            onClick={handleCancel}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {showPersonaSelector ? (
            <PersonaSelector 
              onSelect={startOnboarding} 
              isLoading={isLoading} 
              allowedPersonas={allowedPersonas}
            />
          ) : (
            <>
              {session && steps.length > 0 && (
                <ProgressBar steps={steps} currentStep={session.currentStep} />
              )}
              {renderStep()}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
