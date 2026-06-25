import { useState, useEffect } from 'react';
import { ProductInfo } from '../../lib/api/product.api';
import { usePayment } from '../../contexts/PaymentContext';
import { CouponPanel } from '../coupon/CouponPanel';
import { Coupon } from '../../lib/api/coupon.api';

export interface CartItem {
  product: ProductInfo;
  quantity: number;
}

interface ShoppingCartProps {
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onCheckout: () => void;
}

export function ShoppingCart({ items, onUpdateQuantity, onRemoveItem, onCheckout }: ShoppingCartProps) {
  const { startPayment } = usePayment();
  const [total, setTotal] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);

  useEffect(() => {
    const sum = items.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
    setTotal(sum);
  }, [items]);

  const handleCouponSelected = (coupon: Coupon | null, discount: number) => {
    setSelectedCoupon(coupon);
    setDiscountAmount(discount);
  };

  const finalTotal = Math.max(0, total - discountAmount);

  const handleCheckout = () => {
    if (items.length === 0) return;

    // 创建支付请求
    const paymentRequest = {
      id: `pay_${Date.now()}`,
      amount: `¥${finalTotal.toFixed(2)}`,
      currency: 'CNY',
      description: `购买 ${items.length} 件商品${selectedCoupon ? ` (使用优惠券: ${selectedCoupon.code})` : ''}`,
      merchant: items[0]?.product.merchantId || 'Agentrix Marketplace',
      agent: 'Agentrix Agent',
      metadata: {
        items: items.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          price: item.product.price,
        })),
        totalAmount: total,
        discountAmount,
        couponId: selectedCoupon?.id,
        couponCode: selectedCoupon?.code,
        finalAmount: finalTotal,
      },
      createdAt: new Date().toISOString(),
    };

    startPayment(paymentRequest);
    onCheckout();
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="text-4xl mb-2">🛒</div>
        <div>购物车是空的</div>
      </div>
    );
  }

  // 获取商户ID（从第一个商品获取）
  const merchantId = items[0]?.product.merchantId;
  const productIds = items.map(item => item.product.id);
  const categoryIds = items.map(item => item.product.category).filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      {/* 优惠券面板 */}
      {merchantId && total > 0 && (
        <CouponPanel
          merchantId={merchantId}
          orderAmount={total}
          productIds={productIds}
          categoryIds={categoryIds}
          onCouponSelected={handleCouponSelected}
        />
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.product.id} className="flex items-center space-x-4 bg-white border border-gray-200 rounded-lg p-4">
            <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center">
              {item.product.metadata?.image ? (
                <img src={item.product.metadata.image} alt={item.product.name} className="w-full h-full object-cover rounded-lg" />
              ) : (
                <div className="text-gray-400 text-2xl">📦</div>
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">{item.product.name}</h3>
              <p className="text-sm text-gray-600">¥{item.product.price}</p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => onUpdateQuantity(item.product.id, Math.max(1, item.quantity - 1))}
                className="w-8 h-8 rounded border border-gray-300 hover:bg-gray-100"
              >
                -
              </button>
              <span className="w-12 text-center">{item.quantity}</span>
              <button
                onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                className="w-8 h-8 rounded border border-gray-300 hover:bg-gray-100"
              >
                +
              </button>
            </div>
            <div className="text-right">
              <div className="font-semibold text-gray-900">¥{(item.product.price * item.quantity).toFixed(2)}</div>
              <button
                onClick={() => onRemoveItem(item.product.id)}
                className="text-sm text-red-600 hover:text-red-700 mt-1"
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200 pt-4">
        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">小计：</span>
            <span className="text-gray-900">¥{total.toFixed(2)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between items-center text-green-600">
              <span>优惠券折扣：</span>
              <span>-¥{discountAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-2 border-t border-gray-200">
            <span className="text-lg font-semibold text-gray-900">总计：</span>
            <span className="text-2xl font-bold text-green-600">¥{finalTotal.toFixed(2)}</span>
          </div>
        </div>
        <button
          onClick={handleCheckout}
          className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition-colors"
        >
          结算
        </button>
      </div>
    </div>
  );
}

