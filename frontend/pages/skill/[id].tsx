/**
 * Skill Detail Page - 技能/商品详情页
 * 
 * 统一入口，根据 skill.layer 显示不同样式：
 * - resource 层：电商商品样式
 * - infra/logic/composite 层：工具应用样式
 */

import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Navigation } from '../../components/ui/Navigation';
import { Footer } from '../../components/layout/Footer';
import { useUser } from '../../contexts/UserContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { 
  ShoppingCart, 
  Heart, 
  Share2, 
  Star, 
  Package, 
  Zap, 
  Code, 
  Layers,
  Download,
  Play,
  CheckCircle,
  Info,
  Clock,
  TrendingUp,
  Shield,
  Globe,
  ChevronRight,
  ArrowLeft,
  MessageSquare,
  Send,
  ThumbsUp,
  Loader2,
} from 'lucide-react';

interface SkillPricing {
  type: 'free' | 'per_call' | 'subscription' | 'one_time' | 'revenue_share';
  pricePerCall?: number;
  subscriptionPrice?: number;
  oneTimePrice?: number;
  currency?: string;
  freeQuota?: number;
  commissionRate?: number;
}

interface Skill {
  id: string;
  name: string;
  displayName?: string;
  description: string;
  layer: 'infra' | 'logic' | 'resource' | 'composite';
  category: string;
  resourceType?: string;
  source: string;
  rating?: number;
  callCount?: number;
  pricing?: SkillPricing;
  tags?: string[];
  authorInfo?: {
    id: string;
    name: string;
    type: string;
    avatar?: string;
  };
  humanAccessible?: boolean;
  imageUrl?: string;
  thumbnailUrl?: string;
  version?: string;
  inputSchema?: any;
  outputSchema?: any;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

export default function SkillDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { t } = useLocalization();
  const { isAuthenticated } = useUser();
  
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  // Reviews state
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [hoverRating, setHoverRating] = useState(0);

  useEffect(() => {
    // 确保 router 已准备好再读取 query 参数
    if (!router.isReady) return;
    
    if (id && typeof id === 'string') {
      loadSkill(id);
    } else {
      setLoading(false);
    }
  }, [router.isReady, id]);

  const loadSkill = async (skillId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/unified-marketplace/skills/${skillId}`);
      if (!res.ok) {
        throw new Error('Skill not found');
      }
      const data = await res.json();
      setSkill(data);
    } catch (error) {
      console.error('Failed to load skill:', error);
      setSkill(null);
    } finally {
      setLoading(false);
    }
  };

  const handleBuy = () => {
    if (!isAuthenticated) {
      router.push(`/auth/login?redirect=/skill/${id}`);
      return;
    }
    router.push(`/pay/checkout?skillId=${id}`);
  };

  const handleInstall = async () => {
    if (!isAuthenticated) {
      router.push(`/auth/login?redirect=/skill/${id}`);
      return;
    }
    
    setInstalling(true);
    try {
      // 调用安装 API
      const res = await fetch(`/api/skills/${id}/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      if (res.ok) {
        setInstalled(true);
        // 跳转到工作台配置
        router.push(`/workbench?tab=skills&sub=configure&skillId=${id}`);
      }
    } catch (error) {
      console.error('Install failed:', error);
    } finally {
      setInstalling(false);
    }
  };

  const handleTry = () => {
    router.push(`/workbench?tab=agents&action=test&skillId=${id}`);
  };

  // Reviews functions
  const loadReviews = async () => {
    if (!id) return;
    setReviewsLoading(true);
    try {
      const res = await fetch(`/api/skills/${id}/reviews?page=1&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data.data?.reviews || data.reviews || []);
        setReviewsTotal(data.data?.total || data.total || 0);
      }
    } catch (e) {
      console.error('Failed to load reviews:', e);
    } finally {
      setReviewsLoading(false);
    }
  };

  useEffect(() => {
    if (skill && reviews.length === 0 && !reviewsLoading) {
      loadReviews();
    }
  }, [skill]);

  const submitReview = async () => {
    if (!newComment.trim()) { setReviewError(t({ zh: '请输入评价内容', en: 'Please enter your review' })); return; }
    setSubmittingReview(true);
    setReviewError('');
    try {
      const token = typeof window !== 'undefined' ? (localStorage.getItem('access_token') || localStorage.getItem('token')) : null;
      const res = await fetch(`/api/skills/${id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ rating: newRating, comment: newComment }),
      });
      if (res.ok) {
        setNewComment('');
        setNewRating(5);
        await loadReviews();
      } else {
        const err = await res.json().catch(() => ({}));
        setReviewError(err.message || t({ zh: '提交失败，请重试', en: 'Submit failed, please retry' }));
      }
    } catch (e: any) {
      setReviewError(e.message || t({ zh: '网络错误', en: 'Network error' }));
    } finally {
      setSubmittingReview(false);
    }
  };

  const renderStars = (rating: number, size = 'w-4 h-4', interactive = false) => (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`${size} cursor-${interactive ? 'pointer' : 'default'} transition-colors ${
            i <= (interactive ? (hoverRating || newRating) : rating)
              ? 'text-amber-400 fill-amber-400'
              : 'text-slate-600'
          }`}
          onClick={interactive ? () => setNewRating(i) : undefined}
          onMouseEnter={interactive ? () => setHoverRating(i) : undefined}
          onMouseLeave={interactive ? () => setHoverRating(0) : undefined}
        />
      ))}
    </div>
  );

  // 格式化价格显示
  const formatPrice = (pricing?: SkillPricing) => {
    if (!pricing || pricing.type === 'free') {
      return { label: t({ zh: '免费', en: 'Free' }), value: '' };
    }
    
    const currency = pricing.currency || 'USD';
    const symbol = currency === 'CNY' ? '¥' : '$';
    
    // 处理 pricePerCall (包括 per_call 和 revenue_share 类型)
    if (pricing.pricePerCall && pricing.pricePerCall > 0) {
      return { 
        label: `${symbol}${pricing.pricePerCall}`,
        value: pricing.type === 'revenue_share' ? '' : t({ zh: '/次调用', en: '/call' })
      };
    }
    
    if (pricing.type === 'subscription' && pricing.subscriptionPrice) {
      return {
        label: `${symbol}${pricing.subscriptionPrice}`,
        value: t({ zh: '/月', en: '/mo' })
      };
    }
    
    if (pricing.type === 'one_time' && pricing.oneTimePrice) {
      return {
        label: `${symbol}${pricing.oneTimePrice}`,
        value: ''
      };
    }
    
    // 如果有 oneTimePrice，也显示出来
    if (pricing.oneTimePrice && pricing.oneTimePrice > 0) {
      return {
        label: `${symbol}${pricing.oneTimePrice}`,
        value: ''
      };
    }
    
    return { label: t({ zh: '免费', en: 'Free' }), value: '' };
  };

  if (loading) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400">{t({ zh: '加载中...', en: 'Loading...' })}</p>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  if (!skill) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-6">
              <Package className="w-10 h-10 text-slate-600" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">404</h1>
            <p className="text-slate-400 mb-6">{t({ zh: '技能不存在或已下架', en: 'Skill not found or removed' })}</p>
            <button
              onClick={() => router.push('/marketplace')}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors"
            >
              {t({ zh: '返回市场', en: 'Back to Marketplace' })}
            </button>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  const isResource = skill.layer === 'resource';
  const price = formatPrice(skill.pricing);

  return (
    <>
      <Head>
        <title>{skill.displayName || skill.name} | Agentrix</title>
        <meta name="description" content={skill.description} />
      </Head>

      <Navigation />

      <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        {/* Breadcrumb */}
        <div className="container mx-auto px-6 py-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
            <span>{t({ zh: '返回', en: 'Back' })}</span>
          </button>
        </div>

        <div className="container mx-auto px-6 pb-16">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* 左侧：主要内容 */}
            <div className="lg:col-span-2 space-y-8">
              {/* 头部信息 */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                <div className="flex gap-6">
                  {/* 图片/图标 */}
                  <div className={`flex-shrink-0 ${isResource ? 'w-40 h-40' : 'w-20 h-20'} rounded-xl overflow-hidden bg-slate-700/50 relative`}>
                    {skill.imageUrl || skill.thumbnailUrl ? (
                      <Image 
                        src={skill.imageUrl || skill.thumbnailUrl}
                        alt={skill.displayName || skill.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center ${
                        skill.layer === 'infra' ? 'bg-amber-500/20' :
                        skill.layer === 'logic' ? 'bg-blue-500/20' :
                        skill.layer === 'resource' ? 'bg-green-500/20' :
                        'bg-purple-500/20'
                      }`}>
                        {skill.layer === 'infra' ? <Zap className="w-10 h-10 text-amber-400" /> :
                         skill.layer === 'logic' ? <Code className="w-10 h-10 text-blue-400" /> :
                         skill.layer === 'resource' ? <Package className="w-10 h-10 text-green-400" /> :
                         <Layers className="w-10 h-10 text-purple-400" />}
                      </div>
                    )}
                  </div>

                  {/* 信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        skill.layer === 'infra' ? 'bg-amber-500/20 text-amber-400' :
                        skill.layer === 'logic' ? 'bg-blue-500/20 text-blue-400' :
                        skill.layer === 'resource' ? 'bg-green-500/20 text-green-400' :
                        'bg-purple-500/20 text-purple-400'
                      }`}>
                        {skill.layer.toUpperCase()}
                      </span>
                      <span className="text-xs text-slate-500">v{skill.version || '1.0.0'}</span>
                    </div>
                    
                    <h1 className="text-2xl font-bold text-white mb-2">
                      {skill.displayName || skill.name}
                    </h1>
                    
                    <p className="text-slate-400 mb-4 line-clamp-2">
                      {skill.description}
                    </p>

                    {/* 统计信息 */}
                    <div className="flex items-center gap-4 text-sm">
                      {skill.rating && (
                        <span className="flex items-center gap-1 text-amber-400">
                          <Star size={14} className="fill-amber-400" />
                          {typeof skill.rating === 'number' ? skill.rating.toFixed(1) : skill.rating}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-slate-400">
                        <TrendingUp size={14} />
                        {skill.callCount?.toLocaleString() || 0} {t({ zh: '次调用', en: 'calls' })}
                      </span>
                      {skill.authorInfo && (
                        <span className="text-slate-500">
                          by {skill.authorInfo.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 详细描述 */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">
                  {t({ zh: '详细介绍', en: 'Description' })}
                </h2>
                <div className="prose prose-invert max-w-none text-slate-300">
                  {skill.description}
                </div>
                
                {skill.metadata?.features && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-white mb-3">
                      {t({ zh: '功能特点', en: 'Features' })}
                    </h3>
                    <ul className="space-y-2">
                      {(skill.metadata.features as string[]).map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-slate-400">
                          <CheckCircle size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* 技术规格（工具类） */}
              {!isResource && skill.inputSchema && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                  <h2 className="text-lg font-semibold text-white mb-4">
                    {t({ zh: '接口规格', en: 'API Specification' })}
                  </h2>
                  
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-slate-400 mb-2">
                        {t({ zh: '输入参数', en: 'Input Parameters' })}
                      </h3>
                      <pre className="bg-slate-900 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto">
                        {JSON.stringify(skill.inputSchema, null, 2)}
                      </pre>
                    </div>
                    
                    {skill.outputSchema && (
                      <div>
                        <h3 className="text-sm font-medium text-slate-400 mb-2">
                          {t({ zh: '输出格式', en: 'Output Format' })}
                        </h3>
                        <pre className="bg-slate-900 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto">
                          {JSON.stringify(skill.outputSchema, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 标签 */}
              {skill.tags && skill.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {skill.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-slate-800/50 text-slate-400 text-sm rounded-full border border-slate-700/50"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* 评价区域 */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <MessageSquare size={20} />
                    {t({ zh: '用户评价', en: 'Reviews' })}
                    {reviewsTotal > 0 && <span className="ml-1 px-2 py-0.5 text-xs bg-slate-700 rounded-full text-slate-300">{reviewsTotal}</span>}
                  </h2>
                </div>

                {/* Rating Summary */}
                <div className="flex items-center gap-8 p-5 bg-slate-900/50 rounded-xl mb-6">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-white">{Number(skill.rating || 0).toFixed(1)}</div>
                    {renderStars(Number(skill.rating || 0), 'w-5 h-5')}
                    <div className="text-sm text-slate-500 mt-1">{reviewsTotal} {t({ zh: '条评价', en: 'reviews' })}</div>
                  </div>
                  <div className="flex-1 space-y-1">
                    {[5, 4, 3, 2, 1].map(star => {
                      const count = reviews.filter(r => Math.round(r.rating) === star).length;
                      const pct = reviewsTotal > 0 ? (count / reviewsTotal) * 100 : 0;
                      return (
                        <div key={star} className="flex items-center gap-2 text-sm">
                          <span className="w-3 text-slate-500">{star}</span>
                          <Star size={12} className="text-amber-400 fill-amber-400" />
                          <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-8 text-right text-slate-500 text-xs">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Submit Review */}
                <div className="p-4 border border-slate-700/50 rounded-xl space-y-3 mb-6">
                  <h4 className="font-semibold text-white">{t({ zh: '写评价', en: 'Write a Review' })}</h4>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-400">{t({ zh: '评分:', en: 'Rating:' })}</span>
                    {renderStars(newRating, 'w-6 h-6', true)}
                    <span className="text-sm text-slate-500">{newRating}.0</span>
                  </div>
                  <textarea
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder={t({ zh: '分享您的使用体验...', en: 'Share your experience...' })}
                    className="w-full h-20 px-3 py-2 text-sm bg-slate-900 border border-slate-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none placeholder:text-slate-600"
                  />
                  {reviewError && <p className="text-sm text-red-400">{reviewError}</p>}
                  <button
                    onClick={submitReview}
                    disabled={submittingReview || !newComment.trim()}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
                  >
                    {submittingReview ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {submittingReview ? t({ zh: '提交中...', en: 'Submitting...' }) : t({ zh: '提交评价', en: 'Submit Review' })}
                  </button>
                </div>

                {/* Reviews List */}
                {reviewsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  </div>
                ) : reviews.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>{t({ zh: '暂无评价，来做第一个评价者吧！', en: 'No reviews yet. Be the first!' })}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reviews.map((review: any) => (
                      <div key={review.id} className="p-4 bg-slate-900/50 rounded-xl">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                              <span className="text-blue-400 text-sm font-bold">{(review.userName || 'A').charAt(0).toUpperCase()}</span>
                            </div>
                            <div>
                              <span className="text-sm font-medium text-white">{review.userName || t({ zh: '匿名用户', en: 'Anonymous' })}</span>
                              {review.verifiedUsage && (
                                <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-green-500/20 text-green-400 rounded">
                                  {t({ zh: '已验证', en: 'Verified' })}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-xs text-slate-500">{new Date(review.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="mb-2">{renderStars(review.rating, 'w-3.5 h-3.5')}</div>
                        <p className="text-sm text-slate-300 leading-relaxed">{review.comment}</p>
                        {review.helpfulCount > 0 && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                            <ThumbsUp size={12} /> {review.helpfulCount} {t({ zh: '人觉得有帮助', en: 'found helpful' })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 右侧：操作面板 */}
            <div className="space-y-6">
              {/* 价格卡片 */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 sticky top-24">
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-white">{price.label}</span>
                    <span className="text-slate-400">{price.value}</span>
                  </div>
                  {skill.pricing?.freeQuota && skill.pricing.freeQuota > 0 && (
                    <p className="text-sm text-green-400 mt-1">
                      {t({ zh: `含 ${skill.pricing.freeQuota} 次免费额度`, en: `Includes ${skill.pricing.freeQuota} free calls` })}
                    </p>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="space-y-3">
                  {isResource ? (
                    // 资源类：购买流程
                    <>
                      <button
                        onClick={handleBuy}
                        className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
                      >
                        <ShoppingCart size={18} />
                        {t({ zh: '立即购买', en: 'Buy Now' })}
                      </button>
                      <button className="w-full py-3 bg-slate-700/50 hover:bg-slate-700 text-white rounded-xl transition-colors flex items-center justify-center gap-2">
                        <Heart size={18} />
                        {t({ zh: '加入心愿单', en: 'Add to Wishlist' })}
                      </button>
                    </>
                  ) : (
                    // 工具类：安装/试用流程
                    <>
                      <button
                        onClick={handleInstall}
                        disabled={installing || installed}
                        className={`w-full py-3 font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                          installed
                            ? 'bg-green-600 text-white'
                            : 'bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white'
                        }`}
                      >
                        {installed ? (
                          <>
                            <CheckCircle size={18} />
                            {t({ zh: '已安装', en: 'Installed' })}
                          </>
                        ) : installing ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            {t({ zh: '安装中...', en: 'Installing...' })}
                          </>
                        ) : (
                          <>
                            <Download size={18} />
                            {t({ zh: '安装到工作台', en: 'Install' })}
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleTry}
                        className="w-full py-3 bg-slate-700/50 hover:bg-slate-700 text-white rounded-xl transition-colors flex items-center justify-center gap-2"
                      >
                        <Play size={18} />
                        {t({ zh: '在线试用', en: 'Try Now' })}
                      </button>
                    </>
                  )}
                  
                  <button className="w-full py-3 text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-2">
                    <Share2 size={18} />
                    {t({ zh: '分享', en: 'Share' })}
                  </button>
                </div>

                {/* 信息列表 */}
                <div className="mt-6 pt-6 border-t border-slate-700/50 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 flex items-center gap-2">
                      <Globe size={14} />
                      {t({ zh: '来源', en: 'Source' })}
                    </span>
                    <span className="text-white capitalize">{skill.source}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 flex items-center gap-2">
                      <Shield size={14} />
                      {t({ zh: '分类', en: 'Category' })}
                    </span>
                    <span className="text-white">{skill.category}</span>
                  </div>
                  {skill.createdAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-2">
                        <Clock size={14} />
                        {t({ zh: '发布时间', en: 'Published' })}
                      </span>
                      <span className="text-white">
                        {new Date(skill.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 作者信息 */}
              {skill.authorInfo && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                  <h3 className="text-sm font-semibold text-white mb-4">
                    {t({ zh: '发布者', en: 'Publisher' })}
                  </h3>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center relative overflow-hidden">
                      {skill.authorInfo.avatar ? (
                        <Image src={skill.authorInfo.avatar} alt="" fill className="rounded-full object-cover" unoptimized />
                      ) : (
                        <span className="text-blue-400 font-bold text-lg">
                          {skill.authorInfo.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-white">{skill.authorInfo.name}</p>
                      <p className="text-xs text-slate-400">{skill.authorInfo.type}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
