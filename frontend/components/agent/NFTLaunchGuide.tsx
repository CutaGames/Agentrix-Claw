import { useState } from 'react';
import { FileUpload } from './FileUpload';
import { nftApi, NFTCollectionRequest, NFTMintRequest, NFTMintItem } from '../../lib/api/nft.api';

interface NFTLaunchGuideProps {
  onComplete: (collectionData: NFTCollectionRequest, mintData?: NFTMintRequest) => void;
  onCancel: () => void;
}

export function NFTLaunchGuide({ onComplete, onCancel }: NFTLaunchGuideProps) {
  const [step, setStep] = useState(1);
  const [collectionData, setCollectionData] = useState<Partial<NFTCollectionRequest>>({
    chain: 'ethereum',
    standard: 'ERC-721',
    royalty: 0.05,
  });

  const [mintItems, setMintItems] = useState<NFTMintItem[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<Map<number, string>>(new Map());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (currentStep === 1) {
      if (!collectionData.name || collectionData.name.trim().length === 0) {
        newErrors.name = '请输入集合名称';
      }
      if (collectionData.royalty === undefined || collectionData.royalty < 0 || collectionData.royalty > 1) {
        newErrors.royalty = '版税比例必须在 0-1 之间（例如 0.05 表示 5%）';
      }
    }

    if (currentStep === 2) {
      if (mintItems.length === 0) {
        newErrors.items = '请至少上传一个 NFT 文件';
      }
      mintItems.forEach((item, index) => {
        if (!item.name || item.name.trim().length === 0) {
          newErrors[`item_${index}_name`] = '请输入 NFT 名称';
        }
        if (!item.image && !uploadedFiles.has(index)) {
          newErrors[`item_${index}_image`] = '请上传 NFT 图片';
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      if (step < 4) {
        setStep(step + 1);
      } else {
        handleSubmit();
      }
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleFileUpload = async (file: File, index: number): Promise<string> => {
    // 这里应该调用实际的文件上传 API
    // 暂时返回一个模拟的 URL
    const url = URL.createObjectURL(file);
    setUploadedFiles(new Map(uploadedFiles.set(index, url)));
    
    // 更新 mintItems
    const updatedItems = [...mintItems];
    if (updatedItems[index]) {
      updatedItems[index].image = file;
    }
    setMintItems(updatedItems);
    
    return url;
  };

  const handleAddItem = () => {
    setMintItems([...mintItems, {
      name: '',
      description: '',
      image: null as any,
    }]);
  };

  const handleRemoveItem = (index: number) => {
    const updatedItems = mintItems.filter((_, i) => i !== index);
    setMintItems(updatedItems);
    const updatedFiles = new Map(uploadedFiles);
    updatedFiles.delete(index);
    setUploadedFiles(updatedFiles);
  };

  const handleSubmit = async () => {
    if (!validateStep(step)) return;

    try {
      const collectionRequest: NFTCollectionRequest = {
        name: collectionData.name!,
        description: collectionData.description,
        chain: collectionData.chain!,
        standard: collectionData.standard!,
        royalty: collectionData.royalty || 0.05,
        royaltyRecipients: collectionData.royaltyRecipients,
        image: collectionData.image,
      };

      const mintRequest: NFTMintRequest = {
        items: mintItems.map((item, index) => ({
          ...item,
          image: uploadedFiles.get(index) || item.image,
        })),
        uploadTo: 'ipfs',
        autoList: true,
      };

      onComplete(collectionRequest, mintRequest);
    } catch (error) {
      console.error('提交失败:', error);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 mt-3 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-gray-900">🎨 NFT 发行向导</h4>
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
              step === s ? 'bg-purple-600 text-white' :
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

      {/* 步骤1: 创建集合 */}
      {step === 1 && (
        <div className="space-y-4">
          <h5 className="font-medium text-gray-900 mb-3">创建 NFT 集合</h5>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              集合名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={collectionData.name || ''}
              onChange={(e) => setCollectionData({ ...collectionData, name: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${
                errors.name ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="例如: MyNFT Collection"
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              集合描述
            </label>
            <textarea
              value={collectionData.description || ''}
              onChange={(e) => setCollectionData({ ...collectionData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              rows={3}
              placeholder="描述您的 NFT 集合..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              区块链 <span className="text-red-500">*</span>
            </label>
            <select
              value={collectionData.chain || 'ethereum'}
              onChange={(e) => setCollectionData({ ...collectionData, chain: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="ethereum">Ethereum</option>
              <option value="solana">Solana</option>
              <option value="bsc">BSC</option>
              <option value="polygon">Polygon</option>
              <option value="base">Base</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              NFT 标准 <span className="text-red-500">*</span>
            </label>
            <select
              value={collectionData.standard || 'ERC-721'}
              onChange={(e) => setCollectionData({ ...collectionData, standard: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="ERC-721">ERC-721 (单个 NFT)</option>
              <option value="ERC-1155">ERC-1155 (批量 NFT)</option>
              <option value="SPL-NFT">SPL-NFT (Solana)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              版税比例 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={collectionData.royalty || 0.05}
              onChange={(e) => setCollectionData({ ...collectionData, royalty: parseFloat(e.target.value) })}
              className={`w-full px-3 py-2 border rounded-lg ${
                errors.royalty ? 'border-red-500' : 'border-gray-300'
              }`}
              min="0"
              max="1"
              step="0.01"
              placeholder="0.05 表示 5%"
            />
            <p className="text-xs text-gray-500 mt-1">
              版税比例（0-1之间），例如 0.05 表示 5%
            </p>
            {errors.royalty && <p className="text-red-500 text-xs mt-1">{errors.royalty}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              集合封面图（可选）
            </label>
            <FileUpload
              onUpload={async (file) => {
                const url = URL.createObjectURL(file);
                setCollectionData({ ...collectionData, image: url });
                return url;
              }}
              accept="image/*"
              maxSize={10}
              label="上传封面图"
            />
          </div>
        </div>
      )}

      {/* 步骤2: 上传 NFT 文件 */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-medium text-gray-900">上传 NFT 文件</h5>
            <button
              onClick={handleAddItem}
              className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
            >
              + 添加 NFT
            </button>
          </div>

          {errors.items && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-600 text-sm">{errors.items}</p>
            </div>
          )}

          <div className="space-y-4 max-h-96 overflow-y-auto">
            {mintItems.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h6 className="font-medium text-gray-900">NFT #{index + 1}</h6>
                  <button
                    onClick={() => handleRemoveItem(index)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    删除
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      NFT 名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={item.name || ''}
                      onChange={(e) => {
                        const updated = [...mintItems];
                        updated[index].name = e.target.value;
                        setMintItems(updated);
                      }}
                      className={`w-full px-3 py-2 border rounded-lg ${
                        errors[`item_${index}_name`] ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="例如: MyNFT #1"
                    />
                    {errors[`item_${index}_name`] && (
                      <p className="text-red-500 text-xs mt-1">{errors[`item_${index}_name`]}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      NFT 描述
                    </label>
                    <textarea
                      value={item.description || ''}
                      onChange={(e) => {
                        const updated = [...mintItems];
                        updated[index].description = e.target.value;
                        setMintItems(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      rows={2}
                      placeholder="描述这个 NFT..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      NFT 图片 <span className="text-red-500">*</span>
                    </label>
                    <FileUpload
                      onUpload={(file) => handleFileUpload(file, index)}
                      accept="image/*"
                      maxSize={10}
                      label={`上传 NFT #${index + 1} 图片`}
                    />
                    {errors[`item_${index}_image`] && (
                      <p className="text-red-500 text-xs mt-1">{errors[`item_${index}_image`]}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      价格（可选，用于自动上架）
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="number"
                        value={item.price || ''}
                        onChange={(e) => {
                          const updated = [...mintItems];
                          updated[index].price = parseFloat(e.target.value) || undefined;
                          setMintItems(updated);
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="0"
                        min="0"
                        step="0.0001"
                      />
                      <select
                        value={item.currency || 'USDC'}
                        onChange={(e) => {
                          const updated = [...mintItems];
                          updated[index].currency = e.target.value;
                          setMintItems(updated);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="USDC">USDC</option>
                        <option value="USDT">USDT</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {mintItems.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p>还没有添加任何 NFT</p>
              <button
                onClick={handleAddItem}
                className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                添加第一个 NFT
              </button>
            </div>
          )}
        </div>
      )}

      {/* 步骤3: 设置属性（可选） */}
      {step === 3 && (
        <div className="space-y-4">
          <h5 className="font-medium text-gray-900 mb-3">设置属性（可选）</h5>
          <p className="text-sm text-gray-600 mb-4">
            为每个 NFT 添加属性，例如稀有度、颜色等。这些属性将显示在 NFT 详情页。
          </p>

          <div className="space-y-4 max-h-96 overflow-y-auto">
            {mintItems.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <h6 className="font-medium text-gray-900 mb-3">NFT #{index + 1}: {item.name}</h6>
                
                <div className="space-y-2">
                  {(item.attributes || []).map((attr, attrIndex) => (
                    <div key={attrIndex} className="flex space-x-2">
                      <input
                        type="text"
                        value={attr.trait_type}
                        onChange={(e) => {
                          const updated = [...mintItems];
                          if (!updated[index].attributes) updated[index].attributes = [];
                          updated[index].attributes![attrIndex].trait_type = e.target.value;
                          setMintItems(updated);
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="属性名称，例如: Rarity"
                      />
                      <input
                        type="text"
                        value={String(attr.value)}
                        onChange={(e) => {
                          const updated = [...mintItems];
                          if (!updated[index].attributes) updated[index].attributes = [];
                          updated[index].attributes![attrIndex].value = e.target.value;
                          setMintItems(updated);
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="属性值，例如: Legendary"
                      />
                      <button
                        onClick={() => {
                          const updated = [...mintItems];
                          updated[index].attributes = updated[index].attributes?.filter((_, i) => i !== attrIndex);
                          setMintItems(updated);
                        }}
                        className="px-3 py-2 text-red-500 hover:text-red-700"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                  
                  <button
                    onClick={() => {
                      const updated = [...mintItems];
                      if (!updated[index].attributes) updated[index].attributes = [];
                      updated[index].attributes!.push({ trait_type: '', value: '' });
                      setMintItems(updated);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    + 添加属性
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 步骤4: 确认并提交 */}
      {step === 4 && (
        <div className="space-y-4">
          <h5 className="font-medium text-gray-900 mb-3">确认信息</h5>
          
          <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">集合名称:</span>
              <span className="font-medium text-gray-900">{collectionData.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">区块链:</span>
              <span className="font-medium text-gray-900">{collectionData.chain}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">标准:</span>
              <span className="font-medium text-gray-900">{collectionData.standard}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">版税:</span>
              <span className="font-medium text-gray-900">{(collectionData.royalty || 0) * 100}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">NFT 数量:</span>
              <span className="font-medium text-gray-900">{mintItems.length}</span>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800">
              ⚠️ 请确认以上信息无误。NFT 集合部署后将无法修改。
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
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          {step === 4 ? '确认并发行' : '下一步'}
        </button>
      </div>
    </div>
  );
}

