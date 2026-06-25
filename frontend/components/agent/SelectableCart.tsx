import { useState, useEffect } from 'react';
import { ProductInfo } from '../../lib/api/product.api';
import { usePayment } from '../../contexts/PaymentContext';
import { paymentApi } from '../../lib/api/payment.api';

export interface CartItem {
  product: ProductInfo;
  quantity: number;
}

interface SelectableCartProps {
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onCheckout?: (selectedItems: CartItem[]) => void;
}

/**
 * 可选择的购物车组件
 * 支持商品点选，根据选择显示不同价格，然后支付
 * 参考电商流程，提供更好的用户体验
 */
export function SelectableCart({ 
  items, 
  onUpdateQuantity, 
  onRemoveItem,
  onCheckout 
}: SelectableCartProps) {
  const { startPayment } = usePayment();
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectedTotal, setSelectedTotal] = useState(0);
  const [totalInUSDC, setTotalInUSDC] = useState(0);
  const [isCalculating, setIsCalculating] = useState(false);

  // 初始化：默认选中所有商品
  useEffect(() => {
    if (items.length > 0 && selectedItems.size === 0) {
      const allIds = new Set(items.map(item => item.product.id));
      setSelectedItems(allIds);
    }
  }, [items]);

  // 计算选中商品的总价，并转换为USDC
  useEffect(() => {
    const calculateTotal = async () => {
      const selectedCartItems = items.filter(item => selectedItems.has(item.product.id));
      
      if (selectedCartItems.length === 0) {
        setSelectedTotal(0);
        setTotalInUSDC(0);
        return;
      }

      // 先计算各货币的总价
      const totalsByCurrency: Record<string, number> = {};
      selectedCartItems.forEach(item => {
        const currency = (item.product as any)?.currency || 
                        item.product.metadata?.currency || 
                        'CNY';
        const itemTotal = item.product.price * item.quantity;
        totalsByCurrency[currency] = (totalsByCurrency[currency] || 0) + itemTotal;
      });

      // 计算USDC总价
      setIsCalculating(true);
      let totalUSDC = 0;
      
      try {
        for (const [currency, amount] of Object.entries(totalsByCurrency)) {
          if (currency === 'USDC' || currency === 'USDT' || currency === 'USD') {
            // 1 USD = 1 USDT = 1 USDC
            totalUSDC += amount;
          } else {
            // 获取汇率并转换
            try {
              const rateInfo = await paymentApi.getExchangeRate(currency, 'USDC');
              const rate = rateInfo.rate || 0.138889; // 默认汇率（CNY -> USDC）
              totalUSDC += amount * rate;
            } catch (error) {
              console.warn(`获取汇率失败 ${currency} -> USDC:`, error);
              // 使用默认汇率
              const defaultRate = currency === 'CNY' ? 0.138889 : 1.0;
              totalUSDC += amount * defaultRate;
            }
          }
        }
      } catch (error) {
        console.error('计算USDC总价失败:', error);
      } finally {
        setIsCalculating(false);
      }

      setTotalInUSDC(totalUSDC);
      
      // 显示主要货币的总价（用于显示，实际支付用USDC）
      const firstSelectedItem = selectedCartItems[0];
      if (firstSelectedItem) {
        const mainCurrency = (firstSelectedItem.product as any)?.currency || 
                            firstSelectedItem.product.metadata?.currency || 
                            'CNY';
        setSelectedTotal(totalsByCurrency[mainCurrency] || 0);
      } else {
        setSelectedTotal(0);
      }
    };

    calculateTotal();
  }, [items, selectedItems]);

  // 切换商品选择
  const toggleItemSelection = (productId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedItems(newSelected);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map(item => item.product.id)));
    }
  };

  // 处理支付
  const handlePayment = () => {
    const selectedCartItems = items.filter(item => selectedItems.has(item.product.id));
    
    if (selectedCartItems.length === 0) {
      alert('请至少选择一个商品');
      return;
    }

    // 创建支付请求（使用USDC）
    const paymentRequest = {
      id: `pay_${Date.now()}`,
      amount: totalInUSDC.toFixed(2),
      currency: 'USDC',
      description: `购买 ${selectedCartItems.length} 件商品`,
      merchantId: selectedCartItems[0]?.product.merchantId || 'Agentrix Marketplace',
      metadata: {
        items: selectedCartItems.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          price: item.product.price,
          currency: (item.product as any)?.currency || item.product.metadata?.currency || 'CNY',
        })),
        totalAmount: totalInUSDC,
        totalAmountInUSDC: totalInUSDC,
        itemCount: selectedCartItems.length,
      },
      createdAt: new Date().toISOString(),
    };

    startPayment(paymentRequest as any);
    
    // 如果提供了onCheckout回调，也调用它
    if (onCheckout) {
      onCheckout(selectedCartItems);
    }
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="text-4xl mb-2">🛒</div>
        <div>购物车是空的</div>
      </div>
    );
  }

  const allSelected = selectedItems.size === items.length;
  const someSelected = selectedItems.size > 0 && selectedItems.size < items.length;

  return (
    <div className="space-y-4">
      {/* 全选栏 */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-4">
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(input) => {
              if (input) input.indeterminate = someSelected;
            }}
            onChange={toggleSelectAll}
            className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">
            全选 ({selectedItems.size}/{items.length})
          </span>
        </label>
        <div className="text-sm text-gray-600">
          已选 <span className="font-semibold text-blue-600">{selectedItems.size}</span> 件商品
        </div>
      </div>

      {/* 商品列表 */}
      <div className="space-y-3">
        {items.map((item) => {
          const isSelected = selectedItems.has(item.product.id);
          const itemTotal = item.product.price * item.quantity;
          
          return (
            <div
              key={item.product.id}
              className={`flex items-center space-x-4 bg-white border rounded-lg p-4 transition-all ${
                isSelected
                  ? 'border-blue-500 shadow-md'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* 选择框 */}
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleItemSelection(item.product.id)}
                  className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
              </label>

              {/* 商品图片 */}
              <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                {item.product.metadata?.image ? (
                  <img
                    src={item.product.metadata.image}
                    alt={item.product.name}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <div className="text-gray-400 text-2xl">📦</div>
                )}
              </div>

              {/* 商品信息 */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">{item.product.name}</h3>
                <p className="text-sm text-gray-600 line-clamp-2">
                  {item.product.description || item.product.metadata?.description || ''}
                </p>
                <div className="flex items-center space-x-4 mt-2">
                  <span className="text-sm font-medium text-gray-900">
                    {(() => {
                      const currency = (item.product as any)?.currency || item.product.metadata?.currency || 'CNY';
                      return currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : '';
                    })()}
                    {item.product.price.toFixed(2)}
                  </span>
                  {item.product.stock !== undefined && (
                    <span className={`text-xs ${
                      item.product.stock > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {item.product.stock > 0 ? '✅ 有货' : '⚠️ 缺货'}
                    </span>
                  )}
                </div>
              </div>

              {/* 数量控制 */}
              <div className="flex items-center space-x-2 relative" style={{ zIndex: 10 }}>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🛒 点击减少数量:', { productId: item.product.id, currentQuantity: item.quantity });
                    if (onUpdateQuantity && item.product.id) {
                      onUpdateQuantity(item.product.id, Math.max(1, item.quantity - 1));
                    }
                  }}
                  className="w-10 h-10 rounded border-2 border-gray-300 hover:bg-gray-100 hover:border-blue-500 flex items-center justify-center text-lg font-bold text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer relative z-10"
                  disabled={item.quantity <= 1}
                  aria-label="减少数量"
                  type="button"
                >
                  −
                </button>
                <div className="w-16 h-10 bg-gray-50 border-2 border-gray-300 rounded flex items-center justify-center">
                  <span className="text-lg font-bold text-gray-900">{item.quantity}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🛒 点击增加数量:', { productId: item.product.id, currentQuantity: item.quantity });
                    if (onUpdateQuantity && item.product.id) {
                      onUpdateQuantity(item.product.id, item.quantity + 1);
                    }
                  }}
                  className="w-10 h-10 rounded border-2 border-gray-300 hover:bg-gray-100 hover:border-blue-500 flex items-center justify-center text-lg font-bold text-gray-700 transition-colors cursor-pointer relative z-10"
                  aria-label="增加数量"
                  type="button"
                >
                  +
                </button>
              </div>

              {/* 小计 */}
              <div className="text-right min-w-[100px]">
                <div className="font-semibold text-gray-900">
                  {(() => {
                    const currency = (item.product as any)?.currency || item.product.metadata?.currency || 'CNY';
                    return currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : '';
                  })()}
                  {itemTotal.toFixed(2)}
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🛒 点击删除商品:', { productId: item.product.id });
                    if (onRemoveItem && item.product.id) {
                      onRemoveItem(item.product.id);
                    }
                  }}
                  className="text-sm text-red-600 hover:text-red-700 mt-1 cursor-pointer relative z-10"
                  type="button"
                >
                  删除
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部结算栏 */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 rounded-lg p-4 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-600">
            已选 <span className="font-semibold text-blue-600">{selectedItems.size}</span> 件商品
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">合计：</div>
            <div className="text-2xl font-bold text-blue-600">
              {isCalculating ? (
                <span className="text-sm">计算中...</span>
              ) : (
                `$${totalInUSDC.toFixed(2)} USDC`
              )}
            </div>
            {!isCalculating && selectedItems.size > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                (已转换为USDC)
              </div>
            )}
          </div>
        </div>
        <button
          onClick={handlePayment}
          disabled={selectedItems.size === 0 || isCalculating}
          className={`w-full py-3 rounded-lg font-semibold transition-colors ${
            selectedItems.size === 0 || isCalculating
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {selectedItems.size === 0 ? '请选择商品' : isCalculating ? '计算中...' : `支付 (${selectedItems.size}件)`}
        </button>
      </div>
    </div>
  );
}

