/**
 * 买家服务费显示组件
 * 
 * 在 Checkout 页面透明显示服务费明细
 */

import { useMemo } from 'react';
import { GlassCard } from '../ui/GlassCard';

export type ProductSource = 'internal' | 'external_ucp' | 'partner';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  source: ProductSource;
  merchantName?: string;
}

export interface FeeBreakdown {
  subtotal: number;
  serviceFee: number;
  serviceFeeRate: number;
  platformDiscount?: number;
  vipDiscount?: number;
  totalFees: number;
  grandTotal: number;
}

interface BuyerServiceFeeDisplayProps {
  items: CartItem[];
  userVipLevel?: 'none' | 'bronze' | 'silver' | 'gold';
  onFeeCalculated?: (breakdown: FeeBreakdown) => void;
}

const VIP_DISCOUNTS: Record<string, number> = {
  none: 0,
  bronze: 0.1,   // 10% off fees
  silver: 0.2,   // 20% off fees
  gold: 0.5,     // 50% off fees
};

const SOURCE_LABELS: Record<ProductSource, string> = {
  internal: '自营商品',
  external_ucp: '外部 UCP 商品',
  partner: '合作伙伴商品',
};

export function BuyerServiceFeeDisplay({
  items,
  userVipLevel = 'none',
  onFeeCalculated,
}: BuyerServiceFeeDisplayProps) {
  const feeBreakdown = useMemo(() => {
    let subtotal = 0;
    let serviceFee = 0;
    const serviceFeeRate = 0.02; // 2%

    // 计算每个商品的费用
    for (const item of items) {
      const itemTotal = item.price * item.quantity;
      subtotal += itemTotal;

      // 只对外部 UCP 商品收取服务费
      if (item.source === 'external_ucp') {
        let fee = itemTotal * serviceFeeRate;
        // 最低 $0.10，最高 $50
        fee = Math.max(0.10, Math.min(50, fee));
        serviceFee += fee;
      }
    }

    // 计算 VIP 折扣
    const vipDiscountRate = VIP_DISCOUNTS[userVipLevel] || 0;
    const vipDiscount = serviceFee * vipDiscountRate;
    
    const totalFees = serviceFee - vipDiscount;
    const grandTotal = subtotal + totalFees;

    const breakdown: FeeBreakdown = {
      subtotal,
      serviceFee,
      serviceFeeRate,
      vipDiscount: vipDiscount > 0 ? vipDiscount : undefined,
      totalFees,
      grandTotal,
    };

    onFeeCalculated?.(breakdown);
    return breakdown;
  }, [items, userVipLevel, onFeeCalculated]);

  // 按来源分组商品
  const groupedItems = useMemo(() => {
    const groups: Record<ProductSource, CartItem[]> = {
      internal: [],
      external_ucp: [],
      partner: [],
    };
    
    for (const item of items) {
      groups[item.source].push(item);
    }
    
    return groups;
  }, [items]);

  const hasExternalItems = groupedItems.external_ucp.length > 0;

  return (
    <GlassCard className="space-y-4">
      <h3 className="text-lg font-semibold text-neutral-100">
        订单费用明细
      </h3>

      {/* 商品分组 */}
      <div className="space-y-3">
        {(Object.keys(groupedItems) as ProductSource[]).map((source) => {
          const sourceItems = groupedItems[source];
          if (sourceItems.length === 0) return null;

          const sourceTotal = sourceItems.reduce(
            (sum, item) => sum + item.price * item.quantity, 
            0
          );

          return (
            <div key={source} className="p-3 rounded-lg bg-neutral-800/30">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-neutral-300">
                  {SOURCE_LABELS[source]}
                </span>
                <span className="text-sm text-neutral-400">
                  {sourceItems.length} 件商品
                </span>
              </div>
              
              {/* 商品列表 */}
              <div className="space-y-1">
                {sourceItems.map((item) => (
                  <div 
                    key={item.id}
                    className="flex justify-between text-sm"
                  >
                    <span className="text-neutral-400 truncate flex-1 mr-2">
                      {item.name} × {item.quantity}
                    </span>
                    <span className="text-neutral-300">
                      ${(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-2 pt-2 border-t border-neutral-700/50 flex justify-between">
                <span className="text-sm text-neutral-400">小计</span>
                <span className="text-sm font-medium text-neutral-200">
                  ${sourceTotal.toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 费用汇总 */}
      <div className="border-t border-neutral-700/50 pt-4 space-y-2">
        {/* 商品小计 */}
        <div className="flex justify-between text-sm">
          <span className="text-neutral-400">商品小计</span>
          <span className="text-neutral-200">${feeBreakdown.subtotal.toFixed(2)}</span>
        </div>

        {/* 服务费（仅对外部商品） */}
        {hasExternalItems && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-400 flex items-center gap-2">
                平台代买服务费
                <span className="px-1.5 py-0.5 text-xs rounded bg-amber-500/20 text-amber-400">
                  {(feeBreakdown.serviceFeeRate * 100).toFixed(0)}%
                </span>
              </span>
              <span className="text-neutral-200">
                ${feeBreakdown.serviceFee.toFixed(2)}
              </span>
            </div>

            {/* 服务费说明 */}
            <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-300/80">
                💡 服务费仅针对外部 UCP 商品收取，用于支付跨平台代购和支付通道成本。
                自营和合作伙伴商品无需额外服务费。
              </p>
            </div>

            {/* VIP 折扣 */}
            {feeBreakdown.vipDiscount && feeBreakdown.vipDiscount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-green-400 flex items-center gap-2">
                  VIP 服务费折扣
                  <span className="px-1.5 py-0.5 text-xs rounded bg-green-500/20">
                    {userVipLevel?.toUpperCase()}
                  </span>
                </span>
                <span className="text-green-400">
                  -${feeBreakdown.vipDiscount.toFixed(2)}
                </span>
              </div>
            )}

            {/* 服务费总计 */}
            <div className="flex justify-between text-sm">
              <span className="text-neutral-400">服务费合计</span>
              <span className="text-neutral-200">${feeBreakdown.totalFees.toFixed(2)}</span>
            </div>
          </>
        )}

        {/* 不收服务费提示 */}
        {!hasExternalItems && (
          <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
            <p className="text-xs text-green-400">
              ✓ 本单全部为自营/合作伙伴商品，无需额外服务费
            </p>
          </div>
        )}
      </div>

      {/* 总计 */}
      <div className="border-t border-primary-cyan/30 pt-4">
        <div className="flex justify-between items-center">
          <span className="text-lg font-medium text-neutral-200">应付总额</span>
          <span className="text-2xl font-bold text-primary-neon">
            ${feeBreakdown.grandTotal.toFixed(2)}
          </span>
        </div>
      </div>

      {/* X402 优惠提示 */}
      <div className="p-3 rounded-lg bg-primary-blue/10 border border-primary-blue/20">
        <div className="flex items-start gap-2">
          <span className="text-lg">⚡</span>
          <div>
            <p className="text-sm font-medium text-primary-cyan">
              使用 X402 (AUSDC) 支付
            </p>
            <p className="text-xs text-neutral-400 mt-1">
              链上即时确认，服务费低至 0.5%，支持 Agent 自动支付
            </p>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

export default BuyerServiceFeeDisplay;
