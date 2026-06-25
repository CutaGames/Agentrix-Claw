import { useState, useEffect } from 'react';
import { couponApi, Coupon, CouponCalculationResult } from '../../lib/api/coupon.api';
import { useToast } from '../../contexts/ToastContext';

interface CouponPanelProps {
  merchantId?: string;
  orderAmount: number;
  productIds?: string[];
  categoryIds?: string[];
  onCouponSelected?: (coupon: Coupon | null, discountAmount: number) => void;
}

export function CouponPanel({
  merchantId,
  orderAmount,
  productIds,
  categoryIds,
  onCouponSelected,
}: CouponPanelProps) {
  const { success, error } = useToast();
  const [availableCoupons, setAvailableCoupons] = useState<Coupon[]>([]);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [calculationResult, setCalculationResult] = useState<CouponCalculationResult | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (merchantId && orderAmount > 0) {
      loadAvailableCoupons();
    }
  }, [merchantId, orderAmount, productIds, categoryIds]);

  const loadAvailableCoupons = async () => {
    if (!merchantId) return;
    try {
      setLoading(true);
      const coupons = await couponApi.findAvailableCoupons({
        merchantId,
        orderAmount,
        productIds,
        categoryIds,
      });
      setAvailableCoupons(coupons);
    } catch (err: any) {
      console.error('加载可用优惠券失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCoupon = async (coupon: Coupon) => {
    try {
      setLoading(true);
      const result = await couponApi.calculateCoupon({
        couponCode: coupon.code,
        orderAmount,
        productIds,
        categoryIds,
      });

      if (result.valid) {
        setSelectedCoupon(coupon);
        setCalculationResult(result);
        onCouponSelected?.(coupon, result.discountAmount);
        success(`优惠券已应用，节省 $${result.discountAmount.toFixed(2)}`);
      } else {
        error(result.error || '优惠券不可用');
      }
    } catch (err: any) {
      error(err.message || '应用优惠券失败');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCode = async () => {
    if (!couponCode.trim()) return;
    try {
      setLoading(true);
      const result = await couponApi.calculateCoupon({
        couponCode: couponCode.trim(),
        orderAmount,
        productIds,
        categoryIds,
      });

      if (result.valid && result.coupon) {
        setSelectedCoupon(result.coupon);
        setCalculationResult(result);
        onCouponSelected?.(result.coupon, result.discountAmount);
        success(`优惠券已应用，节省 $${result.discountAmount.toFixed(2)}`);
        setCouponCode('');
      } else {
        error(result.error || '优惠券不可用');
      }
    } catch (err: any) {
      error(err.message || '应用优惠券失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setSelectedCoupon(null);
    setCalculationResult(null);
    onCouponSelected?.(null, 0);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">优惠券</h3>

      {/* 已选优惠券 */}
      {selectedCoupon && calculationResult && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-green-900">{selectedCoupon.name}</div>
              <div className="text-sm text-green-700">
                代码: {selectedCoupon.code} · 节省 ${calculationResult.discountAmount.toFixed(2)}
              </div>
            </div>
            <button
              onClick={handleRemoveCoupon}
              className="text-green-700 hover:text-green-900 font-semibold"
            >
              移除
            </button>
          </div>
        </div>
      )}

      {/* 输入优惠券代码 */}
      <div className="mb-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            placeholder="输入优惠券代码"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={loading}
          />
          <button
            onClick={handleApplyCode}
            disabled={loading || !couponCode.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            应用
          </button>
        </div>
      </div>

      {/* 可用优惠券列表 */}
      {loading && availableCoupons.length === 0 ? (
        <div className="text-center py-8 text-gray-500">加载中...</div>
      ) : availableCoupons.length === 0 ? (
        <div className="text-center py-8 text-gray-500">暂无可用优惠券</div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-gray-600 mb-2">可用优惠券:</div>
          {availableCoupons.map((coupon) => (
            <div
              key={coupon.id}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                selectedCoupon?.id === coupon.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => handleApplyCoupon(coupon)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{coupon.name}</div>
                  {coupon.description && (
                    <div className="text-sm text-gray-600 mt-1">{coupon.description}</div>
                  )}
                  <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                    <span>代码: {coupon.code}</span>
                    {coupon.validUntil && (
                      <span>
                        有效期至: {new Date(coupon.validUntil).toLocaleDateString()}
                      </span>
                    )}
                    {coupon.minPurchaseAmount && (
                      <span>最低消费: ${coupon.minPurchaseAmount}</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-blue-600">
                    {coupon.type === 'percentage'
                      ? `${coupon.value}%`
                      : coupon.type === 'fixed'
                      ? `$${coupon.value}`
                      : '免运费'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

