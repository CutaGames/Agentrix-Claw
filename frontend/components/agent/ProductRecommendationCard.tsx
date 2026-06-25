import { ProductSearchResult } from '../../lib/api/agent.api';
import { GlassCard } from '../ui/GlassCard';
import { AIButton } from '../ui/AIButton';

interface ProductRecommendationCardProps {
  product: ProductSearchResult;
  reason?: string;
  source?: string;
  onSelect?: (productId: string) => void;
  onAddToCart?: (productId: string) => void;
}

/**
 * 商品推荐卡片组件（Agentrix V3.0设计规范）
 * 显示来源、价格、库存、快速操作
 */
export function ProductRecommendationCard({
  product,
  reason,
  source,
  onSelect,
  onAddToCart,
}: ProductRecommendationCardProps) {
  return (
    <GlassCard className="min-w-[240px] cursor-pointer hover:scale-105 transition-all duration-300" hover>
      {/* 商品图片占位 */}
      <div className="w-full h-32 bg-gradient-to-br from-primary-blue/20 to-primary-cyan/20 rounded-lg mb-3 flex items-center justify-center">
        <span className="text-4xl">🛍️</span>
      </div>

      {/* 商品信息 */}
      <div className="mb-3">
        <div className="text-sm font-semibold text-neutral-100 mb-1 line-clamp-2">
          {product.name}
        </div>
        {product.description && (
          <div className="text-xs text-neutral-400 line-clamp-2 mb-2">
            {product.description}
          </div>
        )}
        
        {/* 价格 */}
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-xl font-bold text-primary-neon">
            {product.price} {product.currency}
          </span>
        </div>

        {/* 推荐理由 */}
        {reason && (
          <div className="text-xs text-primary-cyan mb-2 flex items-center gap-1">
            <span>✨</span>
            <span>{reason}</span>
          </div>
        )}

        {/* 来源标签 */}
        {source && (
          <div className="inline-block px-2 py-0.5 text-xs glass rounded-full text-neutral-300 mb-2">
            {source === 'user_profile' && '👤 基于您的偏好'}
            {source === 'context' && '💬 基于对话上下文'}
            {source === 'similar' && '🔗 相似商品'}
            {source === 'popular' && '🔥 热门商品'}
          </div>
        )}
      </div>

      {/* 快速操作 */}
      <div className="flex gap-2">
        <AIButton
          variant="outline"
          className="flex-1 text-xs py-2"
          onClick={() => onSelect?.(product.id)}
        >
          查看详情
        </AIButton>
        <AIButton
          className="flex-1 text-xs py-2"
          onClick={() => onAddToCart?.(product.id)}
        >
          加入购物车
        </AIButton>
      </div>
    </GlassCard>
  );
}

