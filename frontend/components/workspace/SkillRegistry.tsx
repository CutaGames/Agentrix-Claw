/**
 * Skill Registry 组件
 * 
 * 提供 Skill 的注册、版本管理、校验功能
 */

import React, { useState, useEffect, useCallback } from 'react';
import { skillApi, Skill, CreateSkillDto, SkillCategory, SkillStatus, SkillValidationResult } from '../../lib/api/skill.api';
import { Package, Zap, Check, AlertCircle, Search, Filter, Plus, ExternalLink, ChevronRight } from 'lucide-react';

interface SkillRegistryProps {
  onSkillSelect?: (skill: Skill) => void;
  onSkillCreated?: (skill: Skill) => void;
}

interface SkillFormData {
  name: string;
  displayName: string;  // 新增：人类可读名称
  description: string;
  version: string;
  category: SkillCategory;
  inputSchema: string; // JSON string
  outputSchema: string; // JSON string
  executorType: 'http' | 'internal';
  executorEndpoint: string;
  executorMethod: 'GET' | 'POST' | 'PUT' | 'DELETE';
  internalHandler: string;
  // 定价相关 - 优化版
  pricingType: 'free' | 'per_call' | 'percentage';  // 新增 percentage 类型
  pricePerCall: string;
  platformFeeRate: string;  // 新增：平台服务费比例 (%)
  minFee: string;           // 新增：最低收费
  currency: string;
  // 协议开关
  ucpEnabled: boolean;
  x402Enabled: boolean;
  // 新增：文档与使用说明
  useCases: string;         // 使用场景列表
  callExample: string;      // 调用示例 JSON
  // 新增：组合与标签
  tags: string;             // 标签，逗号分隔
  composableWith: string;   // 可组合的 Skill 列表
}

const defaultFormData: SkillFormData = {
  name: '',
  displayName: '',
  description: '',
  version: '1.0.0',
  category: 'utility',
  inputSchema: JSON.stringify({
    type: 'object',
    properties: {
      query: { type: 'string', description: '查询参数' }
    },
    required: ['query']
  }, null, 2),
  outputSchema: JSON.stringify({
    type: 'object',
    properties: {
      result: { type: 'string', description: '返回结果' }
    }
  }, null, 2),
  executorType: 'internal',
  executorEndpoint: '',
  executorMethod: 'POST',
  internalHandler: 'echo',
  // 定价默认值 - 优化版
  pricingType: 'free',
  pricePerCall: '0.01',
  platformFeeRate: '0.3',
  minFee: '0.01',
  currency: 'USDT',
  // 协议默认开启
  ucpEnabled: true,
  x402Enabled: true,
  // 文档默认值
  useCases: '',
  callExample: '',
  // 组合默认值
  tags: '',
  composableWith: '',
};

export const SkillRegistry: React.FC<SkillRegistryProps> = ({
  onSkillSelect,
  onSkillCreated
}) => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<SkillFormData>(defaultFormData);
  const [validation, setValidation] = useState<SkillValidationResult | null>(null);
  const [filter, setFilter] = useState<{ category?: SkillCategory; status?: SkillStatus; search?: string }>({});

  // 加载 Skills 列表
  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await skillApi.list({
        ...filter,
        limit: 50
      });
      setSkills(response.items || []);
    } catch (err: any) {
      setError(err.message || '加载 Skills 失败');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  // 校验 Skill 定义
  const validateSkill = async () => {
    try {
      const dto = buildCreateDto();
      if (!dto) return;
      
      const result = await skillApi.validate(dto);
      setValidation(result);
    } catch (err: any) {
      setValidation({ valid: false, errors: [err.message] });
    }
  };

  // 构建创建 DTO
  const buildCreateDto = (): CreateSkillDto | null => {
    try {
      // 验证必填字段
      if (!formData.name?.trim()) {
        throw new Error('Skill 名称 (name) 不能为空');
      }
      if (!formData.description?.trim()) {
        throw new Error('功能描述 (description) 不能为空');
      }
      
      // 清理 JSON 字符串中的多余字符
      const cleanJson = (str: string) => str?.trim() || '';
      
      let inputSchema: any;
      let outputSchema: any;
      
      // 分别验证 inputSchema 和 outputSchema 以提供更精确的错误信息
      try {
        const inputSchemaStr = cleanJson(formData.inputSchema);
        if (!inputSchemaStr) {
          throw new Error('Input Schema 不能为空');
        }
        inputSchema = JSON.parse(inputSchemaStr);
      } catch (e: any) {
        throw new Error(`Input Schema JSON 格式错误: ${e.message}`);
      }
      
      if (formData.outputSchema?.trim()) {
        try {
          outputSchema = JSON.parse(cleanJson(formData.outputSchema));
        } catch (e: any) {
          throw new Error(`Output Schema JSON 格式错误: ${e.message}`);
        }
      }

      // 构建定价信息 - 优化版
      const pricing: any = {
        type: formData.pricingType || 'free',
        currency: formData.currency || 'USDT',
        minFee: parseFloat(formData.minFee) || 0.01,
      };

      if (formData.pricingType === 'per_call') {
        pricing.pricePerCall = parseFloat(formData.pricePerCall) || 0.01;
      } else if (formData.pricingType === 'percentage') {
        pricing.platformFeeRate = parseFloat(formData.platformFeeRate) || 0.3;
      }

      // 构建文档信息
      const documentation: any = {};
      if (formData.useCases?.trim()) {
        documentation.useCases = formData.useCases.split('\n').filter(s => s.trim());
      }
      if (formData.callExample?.trim()) {
        try {
          documentation.callExample = JSON.parse(cleanJson(formData.callExample));
        } catch {
          documentation.callExample = formData.callExample;
        }
      }

      return {
        name: formData.name.trim(),
        displayName: (formData.displayName?.trim() || formData.name.trim()),
        description: formData.description.trim(),
        version: formData.version?.trim() || '1.0.0',
        category: formData.category || 'utility',
        inputSchema,
        outputSchema,
        executor: formData.executorType === 'http' 
          ? {
              type: 'http',
              endpoint: formData.executorEndpoint?.trim() || '',
              method: formData.executorMethod || 'POST'
            }
          : {
              type: 'internal',
              internalHandler: formData.internalHandler?.trim() || 'echo'
            },
        pricing,
        ucpEnabled: formData.ucpEnabled ?? true,
        x402Enabled: formData.x402Enabled ?? true,
        tags: formData.tags ? formData.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
        metadata: {
          documentation,
          composableWith: formData.composableWith ? formData.composableWith.split(',').map(s => s.trim()).filter(Boolean) : [],
        }
      };
    } catch (err: any) {
      console.error('buildCreateDto error:', err);
      setError(err.message || 'DTO 构建失败');
      return null;
    }
  };

  // 创建 Skill
  const createSkill = async () => {
    // 验证必填字段
    if (!formData.name?.trim()) {
      setError('请填写 Skill 名称 (name)');
      return;
    }
    if (!formData.description?.trim()) {
      setError('请填写功能描述 (description)');
      return;
    }
    if (!formData.inputSchema?.trim()) {
      setError('请填写 Input Schema');
      return;
    }
    
    const dto = buildCreateDto();
    if (!dto) return;

    setLoading(true);
    setError(null);
    try {
      const response = await skillApi.create(dto);
      setSkills(prev => [response.data, ...prev]);
      setShowCreateForm(false);
      setFormData(defaultFormData);
      setValidation(null);
      onSkillCreated?.(response.data);
    } catch (err: any) {
      console.error('Skill creation error:', err);
      setError(err.message || err.response?.data?.message || '创建 Skill 失败');
    } finally {
      setLoading(false);
    }
  };

  // 发布 Skill
  const publishSkill = async (skill: Skill) => {
    try {
      const response = await skillApi.publish(skill.id);
      setSkills(prev => prev.map(s => s.id === skill.id ? response.data : s));
    } catch (err: any) {
      setError(err.message || '发布失败');
    }
  };

  return (
    <div className="skill-registry bg-slate-900 rounded-2xl shadow-2xl border border-white/10 text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Package className="text-blue-400" size={24} />
            Skill Registry
          </h2>
          <p className="text-xs text-slate-400 mt-1">管理 AX Skill 定义、版本与校验</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className={`px-5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 ${
            showCreateForm 
              ? 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10' 
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25'
          }`}
        >
          {showCreateForm ? '取消' : <><Plus size={18} /> 新建 Skill</>}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-500/10 border-b border-red-500/20 flex items-center gap-3">
          <AlertCircle size={18} className="text-red-400" />
          <p className="text-red-400 text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <div className="p-6 bg-slate-800/30 border-b border-white/5 animate-in fade-in slide-in-from-top-4 duration-300">
          {/* 基础信息区 */}
          <div className="mb-6 p-4 bg-slate-900/50 rounded-xl border border-white/5">
            <h4 className="text-sm font-bold text-slate-400 mb-4 flex items-center gap-2">
              <span>📋</span> 基础信息
            </h4>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Skill 名称 (snake_case)</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-white transition-all placeholder:text-slate-600"
                  placeholder="如: commission_distribute"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">显示名称</label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={e => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-white transition-all placeholder:text-slate-600"
                  placeholder="如: 佣金自动分配服务"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">版本号</label>
                <input
                  type="text"
                  value={formData.version}
                  onChange={e => setFormData(prev => ({ ...prev, version: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-white transition-all"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">功能描述</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-white transition-all resize-none"
                rows={3}
                placeholder="详细描述此 Skill 的功能，帮助 AI 和用户理解其用途和调用时机..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">所属分类</label>
                <select
                  value={formData.category}
                  onChange={e => setFormData(prev => ({ ...prev, category: e.target.value as SkillCategory }))}
                  className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-white transition-all appearance-none"
                >
                  <option value="payment">Payment - 支付类</option>
                  <option value="commerce">Commerce - 电商类</option>
                  <option value="data">Data - 数据类</option>
                  <option value="utility">Utility - 工具类</option>
                  <option value="integration">Integration - 集成类</option>
                  <option value="custom">Custom - 自定义</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">标签 (逗号分隔)</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={e => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-white transition-all placeholder:text-slate-600"
                  placeholder="如: payment, commission, agent"
                />
              </div>
            </div>
          </div>

          {/* 使用场景与示例区 */}
          <div className="mb-6 p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/20">
            <h4 className="text-sm font-bold text-emerald-400 mb-4 flex items-center gap-2">
              <span>📖</span> 使用说明 (帮助用户了解如何使用)
            </h4>
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">使用场景 (每行一个)</label>
              <textarea
                value={formData.useCases}
                onChange={e => setFormData(prev => ({ ...prev, useCases: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-white transition-all resize-none"
                rows={4}
                placeholder={`电商订单完成后自动给商户、推广者、平台分佣\nAgent 之间协作完成任务后的收益分配\n联盟营销的推广返佣\n多级分销的层级分佣`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">调用示例 (JSON)</label>
              <textarea
                value={formData.callExample}
                onChange={e => setFormData(prev => ({ ...prev, callExample: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-950 border border-white/5 rounded-xl font-mono text-xs text-emerald-300 outline-none focus:ring-1 focus:ring-emerald-500/50 leading-relaxed"
                rows={6}
                placeholder={`{\n  "totalAmount": 100,\n  "recipients": [\n    {"address": "0x商户地址", "share": 7000, "role": "merchant"},\n    {"address": "0xAgent地址", "share": 2000, "role": "agent"}\n  ]\n}`}
              />
            </div>
          </div>

          {/* 执行器配置 */}
          <div className="mb-6">
            <div className="grid grid-cols-2 gap-6 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">执行器类型</label>
                <select
                  value={formData.executorType}
                  onChange={e => setFormData(prev => ({ ...prev, executorType: e.target.value as 'http' | 'internal' }))}
                  className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-white transition-all appearance-none"
                >
                  <option value="internal">Internal Handler - 内部逻辑</option>
                  <option value="http">HTTP Endpoint - 外部接口</option>
                </select>
              </div>
              {formData.executorType === 'internal' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">内部处理器</label>
                  <input
                    type="text"
                    value={formData.internalHandler}
                    onChange={e => setFormData(prev => ({ ...prev, internalHandler: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl outline-none text-white focus:ring-2 focus:ring-blue-500"
                    placeholder="如: commission_distribute"
                  />
                </div>
              )}
            </div>

            {formData.executorType === 'http' && (
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Endpoint URL</label>
                  <input
                    type="text"
                    value={formData.executorEndpoint}
                    onChange={e => setFormData(prev => ({ ...prev, executorEndpoint: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl outline-none text-white focus:ring-2 focus:ring-blue-500"
                    placeholder="https://api.example.com/action"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Method</label>
                  <select
                    value={formData.executorMethod}
                    onChange={e => setFormData(prev => ({ ...prev, executorMethod: e.target.value as any }))}
                    className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl outline-none text-white focus:ring-2 focus:ring-blue-500 appearance-none"
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                    <option value="PUT">PUT</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* 定价模式 - 优化版 */}
          <div className="mb-6 p-5 bg-blue-500/5 border border-blue-500/20 rounded-xl">
            <h4 className="text-sm font-bold text-blue-400 mb-4 flex items-center gap-2">
              <span>💰</span> 定价模式
            </h4>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">定价类型</label>
                <select
                  value={formData.pricingType}
                  onChange={e => setFormData(prev => ({ ...prev, pricingType: e.target.value as any }))}
                  className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-white transition-all appearance-none"
                >
                  <option value="free">免费 (Free)</option>
                  <option value="per_call">固定价格 (Per Call)</option>
                  <option value="percentage">按比例收费 (%)</option>
                </select>
              </div>

              {formData.pricingType === 'per_call' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">单次价格</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.pricePerCall}
                    onChange={e => setFormData(prev => ({ ...prev, pricePerCall: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-white transition-all"
                    placeholder="0.01"
                  />
                </div>
              )}

              {formData.pricingType === 'percentage' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">平台服务费 (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={formData.platformFeeRate}
                    onChange={e => setFormData(prev => ({ ...prev, platformFeeRate: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-white transition-all"
                    placeholder="0.3"
                  />
                </div>
              )}

              {formData.pricingType !== 'free' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">最低收费</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.minFee}
                    onChange={e => setFormData(prev => ({ ...prev, minFee: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-white transition-all"
                    placeholder="0.01"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">货币</label>
                <select
                  value={formData.currency}
                  onChange={e => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-white transition-all appearance-none"
                >
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>

            {formData.pricingType === 'percentage' && (
              <p className="text-xs text-blue-400/80 mb-4 p-3 bg-blue-500/10 rounded-lg">
                💡 按比例收费：每次调用按交易金额的 {formData.platformFeeRate}% 收取服务费，最低 {formData.minFee} {formData.currency}
              </p>
            )}

            <div className="flex gap-4">
              <label className="flex items-center gap-3 flex-1 p-3 bg-slate-900 border border-white/10 rounded-xl cursor-pointer hover:bg-white/5 transition-all">
                <input
                  type="checkbox"
                  checked={formData.ucpEnabled}
                  onChange={e => setFormData(prev => ({ ...prev, ucpEnabled: e.target.checked }))}
                  className="w-5 h-5 rounded bg-slate-800 border-white/20 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <div>
                  <p className="text-sm font-bold text-white">支持 UCP 协议</p>
                  <p className="text-xs text-slate-500">启用统一结账协议</p>
                </div>
              </label>

              <label className="flex items-center gap-3 flex-1 p-3 bg-slate-900 border border-white/10 rounded-xl cursor-pointer hover:bg-white/5 transition-all">
                <input
                  type="checkbox"
                  checked={formData.x402Enabled}
                  onChange={e => setFormData(prev => ({ ...prev, x402Enabled: e.target.checked }))}
                  className="w-5 h-5 rounded bg-slate-800 border-white/20 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <div>
                  <p className="text-sm font-bold text-white">支持 X402 协议</p>
                  <p className="text-xs text-slate-500">启用HTTP支付协议</p>
                </div>
              </label>
            </div>
          </div>

          {/* Schema 定义 */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Input Schema (JSON)</label>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ 
                    ...prev, 
                    inputSchema: JSON.stringify({
                      type: 'object',
                      properties: {
                        query: { type: 'string', description: '查询参数' }
                      },
                      required: ['query']
                    }, null, 2)
                  }))}
                  className="text-xs text-blue-400 hover:text-blue-300 underline"
                >
                  重置默认格式
                </button>
              </div>
              <textarea
                value={formData.inputSchema}
                onChange={e => setFormData(prev => ({ ...prev, inputSchema: e.target.value }))}
                className="w-full px-4 py-4 bg-slate-950 border border-white/5 rounded-xl font-mono text-xs text-blue-300 outline-none focus:ring-1 focus:ring-blue-500/50 leading-relaxed"
                rows={12}
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Output Schema (JSON)</label>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ 
                    ...prev, 
                    outputSchema: JSON.stringify({
                      type: 'object',
                      properties: {
                        result: { type: 'string', description: '返回结果' }
                      }
                    }, null, 2)
                  }))}
                  className="text-xs text-blue-400 hover:text-blue-300 underline"
                >
                  重置默认格式
                </button>
              </div>
              <textarea
                value={formData.outputSchema}
                onChange={e => setFormData(prev => ({ ...prev, outputSchema: e.target.value }))}
                className="w-full px-4 py-4 bg-slate-950 border border-white/5 rounded-xl font-mono text-xs text-green-300 outline-none focus:ring-1 focus:ring-green-500/50 leading-relaxed"
                rows={12}
              />
            </div>
          </div>

          {/* 组合性配置 */}
          <div className="mb-6 p-4 bg-purple-500/5 rounded-xl border border-purple-500/20">
            <h4 className="text-sm font-bold text-purple-400 mb-3 flex items-center gap-2">
              <span>🔗</span> Skill 组合 (可选)
            </h4>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">可组合的 Skill (逗号分隔)</label>
              <input
                type="text"
                value={formData.composableWith}
                onChange={e => setFormData(prev => ({ ...prev, composableWith: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-900 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-white transition-all placeholder:text-slate-600"
                placeholder="如: agent_payment, workflow_trigger, notification_send"
              />
              <p className="text-xs text-slate-500 mt-2">声明此 Skill 可以与哪些 Skill 组合使用，便于被其他 Agent 发现和编排</p>
            </div>
          </div>

          {/* Validation Result */}
          {validation && (
            <div className={`p-4 rounded-xl mb-6 border animate-in zoom-in-95 duration-200 ${validation.valid ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              <div className="flex items-start gap-3">
                {validation.valid ? <Check size={20} className="mt-0.5" /> : <AlertCircle size={20} className="mt-0.5" />}
                <div>
                  <p className="font-bold">{validation.valid ? 'Skill 定义验证通过' : 'Skill 定义验证失败'}</p>
                  {validation.errors && validation.errors.length > 0 && (
                    <ul className="list-disc list-inside text-xs mt-2 space-y-1 opacity-80">
                      {validation.errors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={validateSkill}
              className="flex-1 px-6 py-3 bg-white/5 text-slate-300 rounded-xl hover:bg-white/10 border border-white/10 transition-all font-bold"
            >
              运行校验
            </button>
            <button
              onClick={createSkill}
              disabled={loading}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all font-bold shadow-lg shadow-blue-500/25"
            >
              {loading ? '处理中...' : '确认创建 Skill'}
            </button>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="p-4 border-b border-white/5 flex gap-4 bg-slate-900/50">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="搜索 Skill 名称或描述..."
            value={filter.search || ''}
            onChange={e => setFilter(prev => ({ ...prev, search: e.target.value }))}
            className="w-full pl-11 pr-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl outline-none text-white text-sm focus:border-blue-500/50 transition-all"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filter.category || ''}
            onChange={e => setFilter(prev => ({ ...prev, category: e.target.value as SkillCategory || undefined }))}
            className="px-4 py-2 bg-slate-950 border border-white/10 rounded-xl outline-none text-white text-sm focus:border-blue-500/50 appearance-none"
          >
            <option value="">全部分类</option>
            <option value="payment">Payment</option>
            <option value="commerce">Commerce</option>
            <option value="utility">Utility</option>
          </select>
          <select
            value={filter.status || ''}
            onChange={e => setFilter(prev => ({ ...prev, status: e.target.value as SkillStatus || undefined }))}
            className="px-4 py-2 bg-slate-950 border border-white/10 rounded-xl outline-none text-white text-sm focus:border-blue-500/50 appearance-none"
          >
            <option value="">全部状态</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>
      </div>

      {/* Skills List */}
      <div className="divide-y divide-white/5">
        {loading && skills.length === 0 ? (
          <div className="p-20 text-center text-slate-500">
            <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            正在同步全球技能库...
          </div>
        ) : skills.length === 0 ? (
          <div className="p-20 text-center text-slate-500">
            <Package size={48} className="mx-auto mb-4 opacity-10" />
            <p className="text-lg font-medium text-slate-400">暂无 Skill 定义</p>
            <p className="text-sm mt-1">开始创建您的第一个 AX Skill 赋能 Agent</p>
            <button 
              onClick={() => setShowCreateForm(true)}
              className="mt-6 px-6 py-2 bg-white/5 border border-white/10 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition-all"
            >
              快速开始
            </button>
          </div>
        ) : (
          skills.map(skill => (
            <div 
              key={skill.id} 
              className="group p-6 hover:bg-white/[0.02] cursor-pointer transition-all border-l-4 border-transparent hover:border-blue-500"
              onClick={() => onSkillSelect?.(skill)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold text-lg text-white group-hover:text-blue-400 transition-colors">{skill.name}</h3>
                    <span className="text-[10px] font-mono text-slate-500 bg-white/5 px-2 py-0.5 rounded border border-white/5 uppercase">v{skill.version}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      skill.status === 'published' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {skill.status}
                    </span>
                    {skill.pricing && skill.pricing.type !== 'free' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400">
                        {skill.pricing.type === 'per_call' 
                          ? `$${skill.pricing.pricePerCall}/call`
                          : skill.pricing.type === 'percentage'
                            ? `${skill.pricing.platformFeeRate}% (min $${skill.pricing.minFee || 0.01})`
                            : `${skill.pricing.commissionRate}% 分成`
                        }
                      </span>
                    )}
                    {skill.pricing?.type === 'free' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/20 text-green-400">
                        免费
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 line-clamp-2 max-w-2xl leading-relaxed">{skill.description}</p>
                  <div className="flex gap-6 mt-4 text-[11px] font-medium text-slate-500">
                    <span className="flex items-center gap-2"><Package size={14} className="text-slate-600" /> {skill.category}</span>
                    <span className="flex items-center gap-2"><Zap size={14} className="text-slate-600" /> {skill.callCount} 次成功调用</span>
                    <span className="flex items-center gap-2 text-amber-500/80">★ {skill.rating.toFixed(1)}</span>
                    <span className="flex items-center gap-2"><ChevronRight size={14} className="text-slate-600" /> ID: {skill.id.slice(0, 8)}...</span>
                  </div>
                </div>
                <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  {skill.status === 'draft' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); publishSkill(skill); }}
                      className="px-4 py-2 text-xs bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-bold shadow-lg shadow-emerald-600/20"
                    >
                      发布到市场
                    </button>
                  )}
                  <button className="w-10 h-10 flex items-center justify-center bg-white/5 text-slate-400 rounded-xl hover:text-white hover:bg-white/10 border border-white/10 transition-all">
                    <ExternalLink size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SkillRegistry;
