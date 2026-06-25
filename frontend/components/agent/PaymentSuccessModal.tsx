import { X, CheckCircle2, Package, ShoppingBag } from 'lucide-react';

interface PaymentSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewOrders?: () => void;
  onContinueShopping?: () => void;
  orderId?: string;
  amount?: number;
  currency?: string;
}

export function PaymentSuccessModal({
  isOpen,
  onClose,
  onViewOrders,
  onContinueShopping,
  orderId,
  amount,
  currency = 'CNY',
}: PaymentSuccessModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-green-900/90 to-emerald-900/90 rounded-2xl max-w-md w-full border-2 border-green-500/30 shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-green-500/30">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">支付成功！</h2>
          </div>
          <button
            onClick={onClose}
            className="text-green-300 hover:text-white transition-colors"
            aria-label="关闭"
          >
            <X size={24} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-4">
          <div className="text-center">
            <div className="text-6xl mb-4">🎉</div>
            <p className="text-green-200 text-lg mb-2">您的订单已成功支付</p>
            {orderId && (
              <p className="text-green-300 text-sm">订单号: {orderId.slice(0, 8)}...</p>
            )}
            {amount !== undefined && (
              <p className="text-white text-xl font-bold mt-2">
                {currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : ''}
                {amount.toFixed(2)} {currency}
              </p>
            )}
          </div>

          <div className="bg-green-900/30 rounded-lg p-4 space-y-3">
            <p className="text-green-200 text-sm font-semibold">接下来您可以：</p>
            <div className="space-y-2">
              {onViewOrders && (
                <button
                  onClick={() => {
                    onViewOrders();
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg text-white transition-colors"
                >
                  <Package className="w-5 h-5" />
                  <span>查看订单详情</span>
                </button>
              )}
              {onContinueShopping && (
                <button
                  onClick={() => {
                    onContinueShopping();
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg text-white transition-colors"
                >
                  <ShoppingBag className="w-5 h-5" />
                  <span>继续购物</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

