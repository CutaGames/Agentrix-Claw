import { ProductInfo } from '../../lib/api/product.api';
import { usePayment } from '../../contexts/PaymentContext';

interface StructuredMessageCardProps {
  type: 'product' | 'product_search' | 'price_comparison' | 'order' | 'payment' | 'code' | 'comparison' | 'recommendation' | 'token' | 'nft' | 'presale';
  data: any;
  onAction?: (action: string, data?: any) => void;
}

export function StructuredMessageCard({ type, data, onAction }: StructuredMessageCardProps) {
  const { startPayment } = usePayment();

  if (type === 'product') {
    const product = data as ProductInfo;
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm mt-3">
        <div className="flex space-x-4">
          {product.metadata?.image && (
            <img
              src={product.metadata.image}
              alt={product.name}
              className="w-24 h-24 object-cover rounded-lg"
            />
          )}
          <div className="flex-1">
            <h4 className="font-semibold text-gray-900 mb-1">{product.name}</h4>
            <p className="text-sm text-gray-600 mb-2 line-clamp-2">{product.description}</p>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-lg font-bold text-blue-600">
                  {product.price} {product.metadata?.currency || 'USDC'}
                </span>
                {product.category && (
                  <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                    {product.category}
                  </span>
                )}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => onAction?.('add_to_cart', product)}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                >
                  加入购物车
                </button>
                <button
                  onClick={() => {
                    startPayment({
                      id: `payment_${Date.now()}`,
                      amount: product.price.toString(),
                      currency: product.metadata?.currency || 'USDC',
                      description: product.name,
                      merchant: product.merchantId,
                      metadata: {
                        productId: product.id,
                        orderType: product.category === 'nft' ? 'nft' : 'product',
                      },
                      createdAt: new Date().toISOString(),
                    } as any);
                    onAction?.('buy_now', product);
                  }}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                >
                  立即购买
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'order') {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4 mt-3">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-900">订单流程</h4>
          <span className="text-xs text-gray-600">订单号: {data.orderId || 'N/A'}</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              data.step >= 1 ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
            }`}>
              {data.step >= 1 ? '✓' : '1'}
            </div>
            <span className={`text-sm ${data.step >= 1 ? 'text-green-600 font-medium' : 'text-gray-600'}`}>
              确认订单信息
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              data.step >= 2 ? 'bg-green-500 text-white' : data.step >= 1 ? 'bg-blue-500 text-white animate-pulse' : 'bg-gray-300 text-gray-600'
            }`}>
              {data.step >= 2 ? '✓' : '2'}
            </div>
            <span className={`text-sm ${data.step >= 2 ? 'text-green-600 font-medium' : data.step >= 1 ? 'text-blue-600' : 'text-gray-600'}`}>
              选择支付方式
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              data.step >= 3 ? 'bg-green-500 text-white' : data.step >= 2 ? 'bg-blue-500 text-white animate-pulse' : 'bg-gray-300 text-gray-600'
            }`}>
              {data.step >= 3 ? '✓' : '3'}
            </div>
            <span className={`text-sm ${data.step >= 3 ? 'text-green-600 font-medium' : data.step >= 2 ? 'text-blue-600' : 'text-gray-600'}`}>
              确认收货地址
            </span>
          </div>
          {data.step >= 3 && (
            <button
              onClick={() => onAction?.('complete_order', data)}
              className="w-full mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              完成订单
            </button>
          )}
        </div>
      </div>
    );
  }

  if (type === 'payment') {
    return (
      <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4 mt-3">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-900">支付结果</h4>
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            data.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          }`}>
            {data.status === 'completed' ? '支付成功' : '处理中'}
          </span>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">支付金额</span>
            <span className="font-semibold text-gray-900">
              {data.amount} {data.currency}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">支付方式</span>
            <span className="font-medium text-gray-900">{data.paymentMethod}</span>
          </div>
          {data.transactionHash && (
            <div className="flex justify-between">
              <span className="text-gray-600">交易哈希</span>
              <span className="font-mono text-xs text-blue-600">{data.transactionHash.slice(0, 10)}...</span>
            </div>
          )}
          {data.orderId && (
            <button
              onClick={() => onAction?.('view_order', { orderId: data.orderId })}
              className="w-full mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              查看订单详情
            </button>
          )}
        </div>
      </div>
    );
  }

  if (type === 'code') {
    return (
      <div className="bg-gray-900 rounded-lg p-4 mt-3 border border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-400">{data.language || 'TypeScript'}</span>
            {data.framework && (
              <span className="text-xs text-gray-500">• {data.framework}</span>
            )}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(data.code);
              onAction?.('code_copied');
            }}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            复制代码
          </button>
        </div>
        <pre className="text-xs text-gray-300 overflow-x-auto">
          <code>{data.code}</code>
        </pre>
      </div>
    );
  }

  // 处理商品搜索结果
  if (type === 'product_search') {
    const products = data.products || [];
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 mt-3">
        <h4 className="font-semibold text-gray-900 mb-3">商品搜索结果</h4>
        <div className="space-y-2">
          {products.map((product: any, index: number) => (
            <div
              key={product.id || index}
              className="p-3 rounded-lg border border-gray-200 bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{product.name}</div>
                  {product.description && (
                    <div className="text-sm text-gray-600 mt-1 line-clamp-2">{product.description}</div>
                  )}
                  <div className="text-sm text-blue-600 font-semibold mt-1">
                    {product.price?.toFixed(2)} {product.currency || 'CNY'}
                  </div>
                </div>
                <div className="flex space-x-2 ml-4">
                  <button
                    onClick={() => onAction?.('add_to_cart', product)}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    加入购物车
                  </button>
                  <button
                    onClick={() => {
                      startPayment({
                        id: `payment_${Date.now()}`,
                        amount: product.price.toString(),
                        currency: product.currency || 'CNY',
                        description: product.name,
                        merchant: product.merchantId,
                        metadata: {
                          productId: product.id,
                        },
                        createdAt: new Date().toISOString(),
                      } as any);
                      onAction?.('buy_now', product);
                    }}
                    className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                  >
                    立即购买
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 处理价格比较结果
  if (type === 'price_comparison') {
    const products = data.products || [];
    const comparison = data.comparison || {};
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 mt-3">
        <h4 className="font-semibold text-gray-900 mb-3">价格对比结果</h4>
        {comparison.cheapest && (
          <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="text-sm text-gray-600">最低价</div>
            <div className="text-lg font-bold text-green-600">
              {comparison.cheapest.price?.toFixed(2)} {comparison.cheapest.currency || 'CNY'}
            </div>
            <div className="text-sm text-gray-700 mt-1">{comparison.cheapest.name}</div>
          </div>
        )}
        <div className="space-y-2">
          {products.map((product: any, index: number) => (
            <div
              key={product.id || index}
              className="p-3 rounded-lg border border-gray-200 bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{product.name}</div>
                  <div className="text-sm text-blue-600 font-semibold mt-1">
                    {product.price?.toFixed(2)} {product.currency || 'CNY'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'comparison') {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 mt-3">
        <h4 className="font-semibold text-gray-900 mb-3">价格对比</h4>
        <div className="space-y-2">
          {data.items?.map((item: any, index: number) => (
            <div
              key={index}
              className={`p-3 rounded-lg border ${
                item.recommended
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">{item.name}</div>
                  <div className="text-xs text-gray-600 mt-1">{item.description}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-gray-900">{item.price} {item.currency}</div>
                  {item.recommended && (
                    <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded mt-1 inline-block">
                      推荐
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'recommendation') {
    return (
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-4 mt-3">
        <h4 className="font-semibold text-gray-900 mb-3">💡 智能推荐</h4>
        <div className="space-y-3">
          {data.items?.map((item: any, index: number) => (
            <div key={index} className="bg-white rounded-lg p-3 border border-purple-100">
              <div className="flex items-start space-x-3">
                <span className="text-2xl">{item.icon || '🎯'}</span>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{item.title}</div>
                  <div className="text-sm text-gray-600 mt-1">{item.description}</div>
                  {item.action && (
                    <button
                      onClick={() => onAction?.(item.action, item)}
                      className="mt-2 text-sm text-purple-600 hover:text-purple-700 font-medium"
                    >
                      {item.actionLabel || '查看详情 →'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'token') {
    if (data.guide) {
      // 代币发行引导卡片
      return (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mt-3">
          <h4 className="font-semibold text-gray-900 mb-3">🚀 代币发行向导</h4>
          <div className="space-y-2 text-sm text-gray-700">
            <div className="flex items-center space-x-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${
                data.step >= 1 ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                {data.step >= 1 ? '✓' : '1'}
              </span>
              <span>填写代币基本信息</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${
                data.step >= 2 ? 'bg-green-500 text-white' : data.step >= 1 ? 'bg-blue-500 text-white animate-pulse' : 'bg-gray-300 text-gray-600'
              }`}>
                {data.step >= 2 ? '✓' : '2'}
              </span>
              <span>配置代币分配和锁仓</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${
                data.step >= 3 ? 'bg-green-500 text-white' : data.step >= 2 ? 'bg-blue-500 text-white animate-pulse' : 'bg-gray-300 text-gray-600'
              }`}>
                {data.step >= 3 ? '✓' : '3'}
              </span>
              <span>设置预售（可选）</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${
                data.step >= 4 ? 'bg-green-500 text-white' : data.step >= 3 ? 'bg-blue-500 text-white animate-pulse' : 'bg-gray-300 text-gray-600'
              }`}>
                {data.step >= 4 ? '✓' : '4'}
              </span>
              <span>部署智能合约</span>
            </div>
          </div>
        </div>
      );
    }
    
    // 代币信息卡片
    return (
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-4 mt-3">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-900">🪙 代币信息</h4>
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            data.status === 'deployed' ? 'bg-green-100 text-green-700' : 
            data.status === 'deploying' ? 'bg-yellow-100 text-yellow-700' : 
            'bg-gray-100 text-gray-700'
          }`}>
            {data.status === 'deployed' ? '已部署' : data.status === 'deploying' ? '部署中' : '待部署'}
          </span>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">代币名称</span>
            <span className="font-semibold text-gray-900">{data.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">代币符号</span>
            <span className="font-semibold text-gray-900">{data.symbol}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">总供应量</span>
            <span className="font-semibold text-gray-900">{data.totalSupply}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">区块链</span>
            <span className="font-medium text-gray-900">{data.chain}</span>
          </div>
          {data.contractAddress && (
            <div className="flex justify-between">
              <span className="text-gray-600">合约地址</span>
              <span className="font-mono text-xs text-blue-600">{data.contractAddress.slice(0, 10)}...</span>
            </div>
          )}
          {data.status === 'deployed' && (
            <div className="flex space-x-2 mt-3">
              <button
                onClick={() => onAction?.('view_token', data)}
                className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                查看详情
              </button>
              <button
                onClick={() => onAction?.('buy_token', data)}
                className="flex-1 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
              >
                购买代币
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (type === 'nft') {
    if (data.guide) {
      // NFT 发行引导卡片
      return (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-4 mt-3">
          <h4 className="font-semibold text-gray-900 mb-3">🎨 NFT 发行向导</h4>
          <div className="space-y-2 text-sm text-gray-700">
            <div className="flex items-center space-x-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${
                data.step >= 1 ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                {data.step >= 1 ? '✓' : '1'}
              </span>
              <span>创建 NFT 集合</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${
                data.step >= 2 ? 'bg-green-500 text-white' : data.step >= 1 ? 'bg-blue-500 text-white animate-pulse' : 'bg-gray-300 text-gray-600'
              }`}>
                {data.step >= 2 ? '✓' : '2'}
              </span>
              <span>上传 NFT 文件</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${
                data.step >= 3 ? 'bg-green-500 text-white' : data.step >= 2 ? 'bg-blue-500 text-white animate-pulse' : 'bg-gray-300 text-gray-600'
              }`}>
                {data.step >= 3 ? '✓' : '3'}
              </span>
              <span>设置元数据和属性</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${
                data.step >= 4 ? 'bg-green-500 text-white' : data.step >= 3 ? 'bg-blue-500 text-white animate-pulse' : 'bg-gray-300 text-gray-600'
              }`}>
                {data.step >= 4 ? '✓' : '4'}
              </span>
              <span>批量 Mint NFT</span>
            </div>
          </div>
        </div>
      );
    }
    
    // NFT 信息卡片
    return (
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-4 mt-3">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-900">🎨 NFT 信息</h4>
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            data.status === 'minted' ? 'bg-green-100 text-green-700' : 
            data.status === 'minting' ? 'bg-yellow-100 text-yellow-700' : 
            'bg-gray-100 text-gray-700'
          }`}>
            {data.status === 'minted' ? '已铸造' : data.status === 'minting' ? '铸造中' : '待铸造'}
          </span>
        </div>
        {data.image && (
          <img
            src={data.image}
            alt={data.name}
            className="w-full h-48 object-cover rounded-lg mb-3"
          />
        )}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">集合名称</span>
            <span className="font-semibold text-gray-900">{data.collectionName || data.name}</span>
          </div>
          {data.description && (
            <div className="text-gray-600 text-xs">{data.description}</div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-600">区块链</span>
            <span className="font-medium text-gray-900">{data.chain}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">标准</span>
            <span className="font-medium text-gray-900">{data.standard}</span>
          </div>
          {data.price && (
            <div className="flex justify-between">
              <span className="text-gray-600">价格</span>
              <span className="font-semibold text-gray-900">{data.price} {data.currency || 'USDC'}</span>
            </div>
          )}
          {data.contractAddress && (
            <div className="flex justify-between">
              <span className="text-gray-600">合约地址</span>
              <span className="font-mono text-xs text-blue-600">{data.contractAddress.slice(0, 10)}...</span>
            </div>
          )}
          {data.status === 'minted' && (
            <div className="flex space-x-2 mt-3">
              <button
                onClick={() => onAction?.('view_nft', data)}
                className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                查看详情
              </button>
              {data.price && (
                <button
                  onClick={() => onAction?.('buy_nft', data)}
                  className="flex-1 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                >
                  购买 NFT
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

