import { useState, useEffect } from 'react';
import { FileUpload } from './FileUpload';
import { tokenApi, TokenLaunchRequest } from '../../lib/api/token.api';

interface TokenLaunchGuideProps {
  onComplete: (data: TokenLaunchRequest) => void;
  onCancel: () => void;
}

export function TokenLaunchGuide({ onComplete, onCancel }: TokenLaunchGuideProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Partial<TokenLaunchRequest>>({
    decimals: 18,
    chain: 'ethereum',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (currentStep === 1) {
      if (!formData.name || formData.name.trim().length === 0) {
        newErrors.name = '请输入代币名称';
      }
      if (!formData.symbol || formData.symbol.trim().length === 0) {
        newErrors.symbol = '请输入代币符号';
      } else if (formData.symbol.length > 10) {
        newErrors.symbol = '代币符号不能超过10个字符';
      }
      if (!formData.totalSupply || parseFloat(formData.totalSupply) <= 0) {
        newErrors.totalSupply = '请输入有效的总供应量';
      }
    }

    if (currentStep === 2) {
      if (formData.distribution) {
        const total = (formData.distribution.team || 0) +
                     (formData.distribution.investors || 0) +
                     (formData.distribution.public || 0) +
                     (formData.distribution.reserve || 0);
        if (total !== 100) {
          newErrors.distribution = '分配比例总和必须等于100%';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      if (step < 4) {
        setStep(step + 1);
      } else {
        // 最后一步，提交
        handleSubmit();
      }
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep(step)) return;

    try {
      const request: TokenLaunchRequest = {
        name: formData.name!,
        symbol: formData.symbol!,
        totalSupply: formData.totalSupply!,
        decimals: formData.decimals || 18,
        chain: formData.chain || 'ethereum',
        distribution: formData.distribution,
        lockup: formData.lockup,
        presale: formData.presale,
        publicSale: formData.publicSale,
      };
      onComplete(request);
    } catch (error) {
      console.error('提交失败:', error);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 mt-3 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-gray-900">🚀 代币发行向导</h4>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>

      {/* 步骤指示器 */}
      <div className="flex items-center justify-between mb-6">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              step > s ? 'bg-green-500 text-white' :
              step === s ? 'bg-blue-600 text-white' :
              'bg-gray-300 text-gray-600'
            }`}>
              {step > s ? '✓' : s}
            </div>
            {s < 4 && (
              <div className={`flex-1 h-1 mx-2 ${
                step > s ? 'bg-green-500' : 'bg-gray-300'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* 步骤1: 基本信息 */}
      {step === 1 && (
        <div className="space-y-4">
          <h5 className="font-medium text-gray-900 mb-3">基本信息</h5>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              代币名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${
                errors.name ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="例如: MyToken"
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              代币符号 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.symbol || ''}
              onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
              className={`w-full px-3 py-2 border rounded-lg ${
                errors.symbol ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="例如: MTK"
              maxLength={10}
            />
            {errors.symbol && <p className="text-red-500 text-xs mt-1">{errors.symbol}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              总供应量 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={formData.totalSupply || ''}
              onChange={(e) => setFormData({ ...formData, totalSupply: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${
                errors.totalSupply ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="例如: 1000000"
              min="1"
            />
            {errors.totalSupply && <p className="text-red-500 text-xs mt-1">{errors.totalSupply}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              小数位数
            </label>
            <input
              type="number"
              value={formData.decimals || 18}
              onChange={(e) => setFormData({ ...formData, decimals: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              min="0"
              max="18"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              区块链 <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.chain || 'ethereum'}
              onChange={(e) => setFormData({ ...formData, chain: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="ethereum">Ethereum</option>
              <option value="solana">Solana</option>
              <option value="bsc">BSC</option>
              <option value="polygon">Polygon</option>
              <option value="base">Base</option>
            </select>
          </div>
        </div>
      )}

      {/* 步骤2: 代币分配 */}
      {step === 2 && (
        <div className="space-y-4">
          <h5 className="font-medium text-gray-900 mb-3">代币分配（百分比）</h5>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              团队分配 (%)
            </label>
            <input
              type="number"
              value={formData.distribution?.team || 0}
              onChange={(e) => setFormData({
                ...formData,
                distribution: {
                  team: parseFloat(e.target.value) || 0,
                  investors: formData.distribution?.investors || 0,
                  public: formData.distribution?.public || 0,
                  reserve: formData.distribution?.reserve || 0,
                },
              })}
              className={`w-full px-3 py-2 border rounded-lg ${
                errors.distribution ? 'border-red-500' : 'border-gray-300'
              }`}
              min="0"
              max="100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              投资者分配 (%)
            </label>
            <input
              type="number"
              value={formData.distribution?.investors || 0}
              onChange={(e) => setFormData({
                ...formData,
                distribution: {
                  team: formData.distribution?.team || 0,
                  investors: parseFloat(e.target.value) || 0,
                  public: formData.distribution?.public || 0,
                  reserve: formData.distribution?.reserve || 0,
                },
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              min="0"
              max="100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              公开发行 (%)
            </label>
            <input
              type="number"
              value={formData.distribution?.public || 0}
              onChange={(e) => setFormData({
                ...formData,
                distribution: {
                  team: formData.distribution?.team || 0,
                  investors: formData.distribution?.investors || 0,
                  public: parseFloat(e.target.value) || 0,
                  reserve: formData.distribution?.reserve || 0,
                },
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              min="0"
              max="100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              储备 (%)
            </label>
            <input
              type="number"
              value={formData.distribution?.reserve || 0}
              onChange={(e) => setFormData({
                ...formData,
                distribution: {
                  team: formData.distribution?.team || 0,
                  investors: formData.distribution?.investors || 0,
                  public: formData.distribution?.public || 0,
                  reserve: parseFloat(e.target.value) || 0,
                },
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              min="0"
              max="100"
            />
          </div>

          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="text-sm text-gray-600">
              总计: {
                (formData.distribution?.team || 0) +
                (formData.distribution?.investors || 0) +
                (formData.distribution?.public || 0) +
                (formData.distribution?.reserve || 0)
              }%
            </div>
            {errors.distribution && (
              <p className="text-red-500 text-xs mt-1">{errors.distribution}</p>
            )}
          </div>
        </div>
      )}

      {/* 步骤3: 预售配置（可选） */}
      {step === 3 && (
        <div className="space-y-4">
          <h5 className="font-medium text-gray-900 mb-3">预售配置（可选）</h5>
          
          <div className="flex items-center mb-4">
            <input
              type="checkbox"
              id="enablePresale"
              checked={!!formData.presale}
              onChange={(e) => {
                if (e.target.checked) {
                  setFormData({
                    ...formData,
                    presale: {
                      price: 0,
                      amount: 0,
                      startDate: new Date().toISOString().split('T')[0],
                      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    },
                  });
                } else {
                  setFormData({ ...formData, presale: undefined });
                }
              }}
              className="mr-2"
            />
            <label htmlFor="enablePresale" className="text-sm text-gray-700">
              启用预售
            </label>
          </div>

          {formData.presale && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  预售价格 (USDC)
                </label>
                <input
                  type="number"
                  value={formData.presale.price || 0}
                  onChange={(e) => setFormData({
                    ...formData,
                    presale: {
                      ...formData.presale!,
                      price: parseFloat(e.target.value) || 0,
                    },
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  min="0"
                  step="0.0001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  预售数量
                </label>
                <input
                  type="number"
                  value={formData.presale.amount || 0}
                  onChange={(e) => setFormData({
                    ...formData,
                    presale: {
                      ...formData.presale!,
                      amount: parseFloat(e.target.value) || 0,
                    },
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  min="0"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    开始日期
                  </label>
                  <input
                    type="date"
                    value={formData.presale.startDate || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      presale: {
                        ...formData.presale!,
                        startDate: e.target.value,
                      },
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    结束日期
                  </label>
                  <input
                    type="date"
                    value={formData.presale.endDate || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      presale: {
                        ...formData.presale!,
                        endDate: e.target.value,
                      },
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 步骤4: 确认并提交 */}
      {step === 4 && (
        <div className="space-y-4">
          <h5 className="font-medium text-gray-900 mb-3">确认信息</h5>
          
          <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">代币名称:</span>
              <span className="font-medium text-gray-900">{formData.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">代币符号:</span>
              <span className="font-medium text-gray-900">{formData.symbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">总供应量:</span>
              <span className="font-medium text-gray-900">{formData.totalSupply}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">区块链:</span>
              <span className="font-medium text-gray-900">{formData.chain}</span>
            </div>
            {formData.presale && (
              <div className="mt-3 pt-3 border-t border-gray-300">
                <div className="text-gray-600 mb-2">预售配置:</div>
                <div className="pl-4 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">价格:</span>
                    <span className="font-medium">{formData.presale.price} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">数量:</span>
                    <span className="font-medium">{formData.presale.amount}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800">
              ⚠️ 请确认以上信息无误。代币部署后将无法修改。
            </p>
          </div>
        </div>
      )}

      {/* 按钮组 */}
      <div className="flex justify-between mt-6">
        <button
          onClick={handleBack}
          disabled={step === 1}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          上一步
        </button>
        <button
          onClick={handleNext}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {step === 4 ? '确认并发行' : '下一步'}
        </button>
      </div>
    </div>
  );
}

