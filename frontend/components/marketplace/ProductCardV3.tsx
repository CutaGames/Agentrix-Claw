import { GlassCard } from '../ui/GlassCard';
import { AIButton } from '../ui/AIButton';

interface ProductCardV3Props {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  image?: string;
  category?: string;
  onSelect?: (id: string) => void;
  onAddToCart?: (id: string) => void;
}

/**
 * 商品卡片组件（Agentrix V3.0设计规范）
 * 商城商品展示卡片
 */
export function ProductCardV3({
  id,
  name,
  description,
  price,
  currency,
  image,
  category,
  onSelect,
  onAddToCart,
}: ProductCardV3Props) {
  return (
    <GlassCard className="cursor-pointer hover:scale-105 transition-all duration-300" hover>
      {/* 商品图片 */}
      <div className="w-full h-48 bg-gradient-to-br from-primary-blue/20 to-primary-cyan/20 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
        {image ? (
          <img src={image} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-5xl">🛍️</span>
        )}
      </div>

      {/* 商品信息 */}
      <div className="mb-3">
        {category && (
          <div className="text-xs text-primary-cyan mb-1">{category}</div>
        )}
        <div className="text-base font-semibold text-neutral-100 mb-1 line-clamp-2">
          {name}
        </div>
        {description && (
          <div className="text-xs text-neutral-400 line-clamp-2 mb-3">
            {description}
          </div>
        )}
        
        {/* 价格 */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-primary-neon">
            {price} {currency}
          </span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <AIButton
          variant="outline"
          className="flex-1 text-sm py-2"
          onClick={() => onSelect?.(id)}
        >
          查看详情
        </AIButton>
        <AIButton
          className="flex-1 text-sm py-2"
          onClick={() => onAddToCart?.(id)}
        >
          加入购物车
        </AIButton>
      </div>
    </GlassCard>
  );
}

