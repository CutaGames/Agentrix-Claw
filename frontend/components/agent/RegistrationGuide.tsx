import { useState } from 'react';
import { useRouter } from 'next/router';

type GuideType = 'user' | 'merchant' | 'agent' | 'api';

interface RegistrationGuideProps {
  type?: GuideType;
}

export function RegistrationGuide({ type = 'user' }: RegistrationGuideProps) {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<GuideType>(type);
  const [currentStep, setCurrentStep] = useState(0);

  const guides: Record<GuideType, { title: string; steps: string[]; actionUrl: string }> = {
    user: {
      title: '用户注册引导',
      steps: [
        '点击右上角"登录"按钮',
        '选择"注册新账户"',
        '填写基本信息（邮箱、密码）',
        '完成邮箱验证',
        '开始使用Agentrix服务',
      ],
      actionUrl: '/app/register/user',
    },
    merchant: {
      title: '商户入驻引导',
      steps: [
        '点击右上角"登录"按钮',
        '选择"商户注册"',
        '填写商户信息（名称、地址、联系方式）',
        '提交资质证明（营业执照等）',
        '等待审核通过',
        '创建店铺并上架商品',
      ],
      actionUrl: '/app/register/merchant',
    },
    agent: {
      title: 'Agent注册引导',
      steps: [
        '点击右上角"登录"按钮',
        '选择"Agent注册"',
        '填写Agent信息（名称、描述）',
        '配置API密钥',
        '开始推荐商品并获得分润',
      ],
      actionUrl: '/app/register/agent',
    },
    api: {
      title: 'API接入引导',
      steps: [
        '注册并登录账户',
        '前往开发者中心获取API Key',
        '安装SDK：npm install @agentrix/sdk',
        '初始化客户端',
        '调用API方法',
        '查看文档了解更多功能',
      ],
      actionUrl: '/developers',
    },
  };

  const currentGuide = guides[selectedType];

  return (
    <div className="space-y-6">
      {/* 类型选择 */}
      <div className="flex space-x-2 overflow-x-auto pb-2">
        {(['user', 'merchant', 'agent', 'api'] as GuideType[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setSelectedType(t);
              setCurrentStep(0);
            }}
            className={`px-4 py-2 rounded-lg whitespace-nowrap ${
              selectedType === t
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {guides[t].title}
          </button>
        ))}
      </div>

      {/* 引导内容 */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">{currentGuide.title}</h2>

        {/* 步骤列表 */}
        <div className="space-y-4 mb-6">
          {currentGuide.steps.map((step, index) => (
            <div
              key={index}
              className={`flex items-start space-x-3 p-4 rounded-lg ${
                index === currentStep
                  ? 'bg-blue-50 border-2 border-blue-500'
                  : 'bg-gray-50 border border-gray-200'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                  index === currentStep
                    ? 'bg-blue-500 text-white'
                    : index < currentStep
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-300 text-gray-600'
                }`}
              >
                {index < currentStep ? '✓' : index + 1}
              </div>
              <div className="flex-1">
                <p className="text-gray-900">{step}</p>
              </div>
            </div>
          ))}
        </div>

        {/* 操作按钮 */}
        <div className="flex space-x-3">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            上一步
          </button>
          <button
            onClick={() => setCurrentStep(Math.min(currentGuide.steps.length - 1, currentStep + 1))}
            disabled={currentStep === currentGuide.steps.length - 1}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            下一步
          </button>
          <button
            onClick={() => router.push(currentGuide.actionUrl)}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            开始{selectedType === 'api' ? '接入' : '注册'}
          </button>
        </div>
      </div>
    </div>
  );
}

