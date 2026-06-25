'use client';

import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, Loader2, Upload, Link, Shield, DollarSign, CheckCircle2, FileText, Database, Store, Key } from 'lucide-react';
import { OnboardingSession } from '../../lib/api/onboarding.api';

interface StepProps {
  session: OnboardingSession;
  onNext: (data?: Record<string, any>) => void;
  onBack: () => void;
  onSkip?: () => void;
  isLoading: boolean;
}

// API Provider Steps

export const ApiProviderVerifyIdentityStep: React.FC<StepProps> = ({ session, onNext, onBack, onSkip, isLoading }) => {
  const [formData, setFormData] = useState({
    companyName: '',
    website: '',
    email: '',
    phone: '',
  });

  const handleSubmit = () => {
    onNext({ identityVerified: true, ...formData });
  };

  return (
    <div className="py-6">
      <h2 className="text-2xl font-bold mb-2">验证身份</h2>
      <p className="text-gray-600 mb-6">请提供您的企业信息以完成身份验证</p>
      
      <div className="space-y-4 mb-8">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">企业名称 *</label>
          <input
            type="text"
            value={formData.companyName}
            onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="如：Agentrix Inc."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">企业网站</label>
          <input
            type="url"
            value={formData.website}
            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="https://example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">联系邮箱 *</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="contact@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">联系电话</label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="+86 138 0000 0000"
          />
        </div>
      </div>

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
            onClick={handleSubmit}
            disabled={isLoading || !formData.companyName || !formData.email}
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

export const ApiProviderImportApiStep: React.FC<StepProps> = ({ session, onNext, onBack, onSkip, isLoading }) => {
  const [formData, setFormData] = useState({
    apiName: '',
    openApiUrl: '',
    description: '',
  });

  const handleSubmit = () => {
    onNext({ apiImported: true, ...formData });
  };

  return (
    <div className="py-6">
      <h2 className="text-2xl font-bold mb-2">导入 API</h2>
      <p className="text-gray-600 mb-6">支持 OpenAPI/Swagger 规范，一键导入您的 API 定义</p>
      
      <div className="space-y-4 mb-8">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">API 名称 *</label>
          <input
            type="text"
            value={formData.apiName}
            onChange={(e) => setFormData({ ...formData, apiName: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="如：Payment Gateway API"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">OpenAPI 文档地址 *</label>
          <input
            type="url"
            value={formData.openApiUrl}
            onChange={(e) => setFormData({ ...formData, openApiUrl: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="https://api.example.com/openapi.json"
          />
          <p className="text-xs text-gray-500 mt-1">支持 OpenAPI 2.0/3.0 规范的 JSON 或 YAML 文件</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">API 描述</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            placeholder="简要描述您的 API 功能和用途..."
          />
        </div>

        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <Link className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900 text-sm mb-1">提示</h4>
              <p className="text-xs text-blue-700">
                导入后系统将自动分析 API 端点，并为每个端点生成对应的 Skill。您可以在下一步配置定价策略。
              </p>
            </div>
          </div>
        </div>
      </div>

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
              稍后导入
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={isLoading || !formData.apiName || !formData.openApiUrl}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <>
                导入并继续
                <ChevronRight className="w-4 h-4 inline ml-1" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export const ApiProviderPricingStep: React.FC<StepProps> = ({ session, onNext, onBack, onSkip, isLoading }) => {
  const [formData, setFormData] = useState({
    pricingModel: 'per_call',
    pricePerCall: '0.01',
    currency: 'USDC',
    freeQuota: '100',
  });

  const handleSubmit = () => {
    onNext({ pricingConfigured: true, ...formData });
  };

  return (
    <div className="py-6">
      <h2 className="text-2xl font-bold mb-2">配置定价策略</h2>
      <p className="text-gray-600 mb-6">设置您的 API 调用费用和计费模式</p>
      
      <div className="space-y-4 mb-8">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">计费模式</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="pricingModel"
                value="per_call"
                checked={formData.pricingModel === 'per_call'}
                onChange={(e) => setFormData({ ...formData, pricingModel: e.target.value })}
                className="text-blue-600"
              />
              <div>
                <div className="font-medium">按次计费</div>
                <div className="text-xs text-gray-500">每次 API 调用收取固定费用</div>
              </div>
            </label>
            <label className="flex items-center gap-2 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="pricingModel"
                value="subscription"
                checked={formData.pricingModel === 'subscription'}
                onChange={(e) => setFormData({ ...formData, pricingModel: e.target.value })}
                className="text-blue-600"
              />
              <div>
                <div className="font-medium">订阅制</div>
                <div className="text-xs text-gray-500">按月收取固定费用，无限调用</div>
              </div>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {formData.pricingModel === 'per_call' ? '单次调用价格' : '月费'}
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.pricePerCall}
              onChange={(e) => setFormData({ ...formData, pricePerCall: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">货币单位</label>
            <select
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="USDC">USDC</option>
              <option value="USDT">USDT</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">免费额度 (可选)</label>
          <input
            type="number"
            value={formData.freeQuota}
            onChange={(e) => setFormData({ ...formData, freeQuota: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="每月免费调用次数"
          />
        </div>

        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <DollarSign className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-green-900 text-sm mb-1">预估收益</h4>
              <p className="text-xs text-green-700">
                如果您的 API 每月被调用 10,000 次，预计月收入: {(parseFloat(formData.pricePerCall) * 10000).toFixed(2)} {formData.currency}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 inline mr-1" />
          上一步
        </button>
        
        <button
          onClick={handleSubmit}
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
  );
};

export const ApiProviderPublishStep: React.FC<StepProps> = ({ session, onNext, onBack, isLoading }) => {
  const [agreed, setAgreed] = useState(false);

  const handleSubmit = () => {
    onNext({ published: true, agreedToTerms: true });
  };

  return (
    <div className="py-6">
      <h2 className="text-2xl font-bold mb-2">发布到市场</h2>
      <p className="text-gray-600 mb-6">确认信息并发布您的 API 技能到 Agentrix 市场</p>
      
      <div className="space-y-4 mb-8">
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-3">发布清单</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span>身份验证已完成</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span>API 文档已导入</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span>定价策略已配置</span>
            </div>
          </div>
        </div>

        <div className="border border-gray-300 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-2">协议集成状态</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>UCP (Gemini)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>MCP (Claude)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>ACP (ChatGPT)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>X402 (Payment)</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            您的技能将自动通过以上协议对外暴露，AI Agent 可直接发现和调用
          </p>
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 text-blue-600"
          />
          <span className="text-sm text-gray-600">
            我已阅读并同意 <a href="#" className="text-blue-600 hover:underline">服务协议</a> 和 <a href="#" className="text-blue-600 hover:underline">分成政策</a>
          </span>
        </label>
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 inline mr-1" />
          上一步
        </button>
        
        <button
          onClick={handleSubmit}
          disabled={isLoading || !agreed}
          className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '发布到市场'}
        </button>
      </div>
    </div>
  );
};

// 其他画像的简化步骤 (可以后续扩展)
export const GenericFormStep: React.FC<StepProps & { title: string; description: string; fields: { name: string; label: string; type: string; required?: boolean; options?: { label: string; value: string }[]; placeholder?: string; helper?: string }[] }> = ({ 
  title, 
  description, 
  fields, 
  session, 
  onNext, 
  onBack, 
  onSkip, 
  isLoading 
}) => {
  const [formData, setFormData] = useState<Record<string, any>>({});

  const isFieldValid = (field: { name: string; type: string; required?: boolean }) => {
    if (!field.required) return true;
    const value = formData[field.name];
    if (field.type === 'checkbox') return value === true;
    if (field.type === 'number') return value !== undefined && value !== '' && !Number.isNaN(Number(value));
    return value !== undefined && String(value).trim().length > 0;
  };

  const isFormValid = fields.every(isFieldValid);

  const handleSubmit = () => {
    onNext(formData);
  };

  return (
    <div className="py-6">
      <h2 className="text-2xl font-bold mb-2">{title}</h2>
      <p className="text-gray-600 mb-6">{description}</p>
      
      <div className="space-y-4 mb-8">
        {fields.map(field => (
          <div key={field.name}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label} {field.required && '*'}
            </label>
            {field.type === 'textarea' ? (
              <textarea
                value={formData[field.name] || ''}
                onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                placeholder={field.placeholder}
              />
            ) : field.type === 'checkbox' ? (
              <label className="flex items-start gap-2 cursor-pointer text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={formData[field.name] || false}
                  onChange={(e) => setFormData({ ...formData, [field.name]: e.target.checked })}
                  className="mt-1 text-blue-600"
                />
                <span>{field.label}</span>
              </label>
            ) : field.type === 'select' ? (
              <select
                value={formData[field.name] || ''}
                onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">请选择</option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.type}
                value={formData[field.name] || ''}
                onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={field.placeholder}
              />
            )}
            {field.helper && field.type !== 'checkbox' && (
              <p className="text-xs text-gray-500 mt-1">{field.helper}</p>
            )}
          </div>
        ))}
      </div>

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
            onClick={handleSubmit}
            disabled={isLoading || !isFormValid}
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
