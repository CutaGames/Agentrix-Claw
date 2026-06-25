import { ChatMessage } from './UnifiedAgentChat';
import { SelectableCart, CartItem } from './SelectableCart';
import { ProductDetailModal } from './ProductDetailModal';
import { MultiAssetProductCard, MultiAssetProductList, MultiAssetProduct } from './MultiAssetProductCard';
import { useState, useEffect, useCallback, useRef } from 'react';
import { ShoppingCart, Eye, Loader2, CheckCircle, XCircle, ExternalLink, Copy, Clock, Plus, Trash2, LayoutDashboard, Check, FileUp, Info } from 'lucide-react';
import { cartApi } from '../../lib/api/cart.api';
import { orderApi } from '../../lib/api/order.api';
import { ProductInfo } from '../../lib/api/product.api';
import { commerceApi } from '../../lib/api/commerce.api';
import { payIntentApi } from '../../lib/api/pay-intent.api';
import { skillApi } from '../../lib/api/skill.api';
import { taskMarketplaceApi } from '../../services/taskMarketplaceApi';
import { commissionApi } from '../../lib/api/commission.api';
import { qrPaymentApi } from '../../lib/api/qr-payment.api';
import { QRCodeSVG } from 'qrcode.react';
import { paymentApi } from '../../lib/api/payment.api';
import { apiClient } from '../../lib/api/client';
import { useUser } from '../../contexts/UserContext';
import type { ProductType, FundingSource, ApprovalType, Artifact } from '../../lib/api/commerce.api';

// Commerce 上下文类型
export interface CommerceContextType {
  lastPoolId?: string;
  lastSplitPlanId?: string;
  lastMilestoneId?: string;
  lastOrderId?: string;
  lastPublishId?: string;
  recentRecipients?: string[];
  defaultCurrency?: string;
}

interface StructuredResponseCardProps {
  message: ChatMessage;
  onCartUpdate?: (items: CartItem[]) => void;
  onSendMessage?: (message: string) => void;
  onBuyNow?: (product: ProductInfo) => void;
  sessionId?: string;
  payingProductId?: string | null;
  onCartChanged?: (cartItems?: CartItem[]) => void; // 购物车更新后的回调，如果购物车消息不存在则创建
  commerceContext?: CommerceContextType; // Commerce 上下文延续
  onCommerceContextUpdate?: (key: keyof CommerceContextType, value: any) => void;
}

/**
 * 结构化响应展示卡片
 * 根据不同的响应类型展示相应的结构化数据
 */
export function StructuredResponseCard({ 
  message, 
  onCartUpdate, 
  onSendMessage,
  onBuyNow,
  sessionId,
  payingProductId,
  onCartChanged,
  commerceContext,
  onCommerceContextUpdate,
}: StructuredResponseCardProps) {
  const { user } = useUser();
  const { type, data } = message.metadata || {};
  const [selectedProduct, setSelectedProduct] = useState<ProductInfo | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState<string | null>(null);
  const [cancellingOrders, setCancellingOrders] = useState<Set<string>>(new Set());
  const [cartUpdateStatus, setCartUpdateStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const [openCommerceForm, setOpenCommerceForm] = useState<string | null>(null);
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  // 执行状态
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    type: string;
    data?: any;
    error?: string;
    message?: string;
    link?: string;
    id?: string;
    canRevoke?: boolean;
    revokeDeadline?: number;
  } | null>(null);
  const [revokeCountdown, setRevokeCountdown] = useState<number | null>(null);
  const [commerceForm, setCommerceForm] = useState({
    amount: '',
    currency: 'USDC',
    counterparty: '',
    exchangeType: 'onramp',
    fiatAmount: '',
    fiatCurrency: 'USD',
    cryptoCurrency: 'USDC',
    offrampsTo: '',
    platformShare: '5',
    merchantShare: '85',
    agentShare: '10',
    planName: 'Demo Split Plan',
    budgetAmount: '',
    budgetDeadline: '',
    qualityScore: '80',
    poolId: '',
    milestoneTitle: '',
    milestonePercent: '30',
    collaborationNote: '',
    paymentType: 'ONRAMP',
    publishType: 'task',
    publishTitle: '',
    publishBudget: '',
    publishPrice: '',
    publishDescription: '',
    publishTags: '',
    publishCategory: 'custom_service',
    // 收付款与兑换子动作选择
    payExchangeAction: 'payment',
    // 分佣结算子动作选择
    commissionAction: 'commissions',
    // 查询相关
    queryOrderId: '',
    // 结算相关
    settlementPayeeType: 'merchant' as 'agent' | 'merchant',
    // 收款描述
    receiveDescription: '',
    // 发布商品/Skill扩展字段
    publishSkillDescription: '',
    publishSkillTags: '',
    publishSkillCategory: 'utility',
    // 可选字段
    orderDescription: '',
    callbackUrl: '',
    targetAddress: '',
    // On-ramp / Off-ramp 扩展字段
    onrampNetwork: 'polygon',
    onrampWalletAddress: '',
    offrampBankAccount: '',
    offrampTargetCurrency: 'USD',
    // 协作模块独立子动作（与 publishType 分离）
    collabAction: 'split',
    // 分账方案扩展
    splitProductType: 'service' as ProductType,
    splitRuleCount: '3',
    splitRules: [
      { recipient: 'executor', shareBps: 7000, role: 'executor' as const, source: 'pool' as const, active: true, recipientAddress: '' },
      { recipient: 'referrer', shareBps: 2000, role: 'referrer' as const, source: 'pool' as const, active: true, recipientAddress: '' },
      { recipient: 'promoter', shareBps: 1000, role: 'promoter' as const, source: 'platform' as const, active: true, recipientAddress: '' },
    ] as (
      | { recipient: string; shareBps: number; role: 'executor'; source: 'pool'; active: boolean; recipientAddress: string }
      | { recipient: string; shareBps: number; role: 'referrer'; source: 'pool'; active: boolean; recipientAddress: string }
      | { recipient: string; shareBps: number; role: 'promoter'; source: 'platform'; active: boolean; recipientAddress: string }
      | { recipient: string; shareBps: number; role: 'l1'; source: 'pool'; active: boolean; recipientAddress: string }
      | { recipient: string; shareBps: number; role: 'l2'; source: 'pool'; active: boolean; recipientAddress: string }
    )[],
    splitScenePreset: '',
    // 预算池子动作
    budgetSubAction: 'create',
    budgetFundAmount: '',
    budgetFundSource: 'wallet' as FundingSource,
    budgetFundWallet: '',
    budgetPoolIdForAction: '',
    budgetPoolName: '',
    budgetSplitPlanId: '',
    // 里程碑生命周期
    milestoneSubAction: 'create',
    milestoneId: '',
    milestoneReservedAmount: '',
    milestoneDueDate: '',
    milestoneApprovalType: 'manual' as ApprovalType,
    milestoneArtifactUrl: '',
    milestoneArtifactType: 'document' as Artifact['type'],
    milestoneArtifactDesc: '',
    milestoneReviewNote: '',
    milestoneRejectReason: '',
    // 发布扩展
    publishPricingType: 'per_call',
    publishExecutorType: 'internal',
    publishExecutorEndpoint: '',
    publishFreeQuota: '0',
    publishVersion: '1.0.0',
    publishVisibility: 'public',
    publishRequirements: '',
    publishCommissionEnabled: false,
    publishCommissionTotal: '10',
    publishCommissionL1: '7',
    publishCommissionL2: '3',
    publishCustomCommission: '',
    publishDeadlineDays: '',
    publishMaxApplicants: '',
    publishDigitalAssetType: 'api',
    // 推广链接
    referralTargetType: 'skill',
    referralTargetId: '',
    referralCommissionRate: '10',
    // 实物商品收货信息
    shippingName: '',
    shippingPhone: '',
    shippingAddress: '',
    shippingPostcode: '',
    // 实物商品规格
    productSpecs: '', // 如 "颜色:红,尺寸:XL"
    productStock: '99',
    productTaxRate: '0',
    // 步骤导航
    currentStep: 1,
  });

  useEffect(() => {
    if (type === 'commerce_categories' && data?.openCategory) {
      setOpenCommerceForm(data.openCategory);
    }
  }, [type, data]);

  // 从上下文自动填充表单字段
  useEffect(() => {
    if (commerceContext) {
      setCommerceForm(prev => {
        const updates: any = {};
        if (commerceContext.lastPoolId && !prev.poolId) updates.poolId = commerceContext.lastPoolId;
        if (commerceContext.lastSplitPlanId && !prev.budgetSplitPlanId) updates.budgetSplitPlanId = commerceContext.lastSplitPlanId;
        if (commerceContext.lastMilestoneId && !prev.milestoneId) updates.milestoneId = commerceContext.lastMilestoneId;
        if (commerceContext.defaultCurrency && prev.currency === 'USDC') updates.currency = commerceContext.defaultCurrency;
        
        if (Object.keys(updates).length > 0) {
          return { ...prev, ...updates };
        }
        return prev;
      });
    }
  }, [commerceContext]);

  // 表单实时校验
  const validateField = (key: string, value: string): string => {
    switch (key) {
      case 'amount':
      case 'fiatAmount':
      case 'budgetAmount':
      case 'publishBudget':
      case 'publishPrice':
        if (value && isNaN(Number(value))) return '请输入有效数字';
        if (value && Number(value) <= 0) return '金额必须大于0';
        break;
      case 'platformShare':
      case 'merchantShare':
      case 'agentShare':
      case 'milestonePercent':
        if (value && (isNaN(Number(value)) || Number(value) < 0 || Number(value) > 100)) {
          return '请输入0-100的数字';
        }
        break;
      case 'budgetDeadline':
        if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '格式：YYYY-MM-DD';
        break;
    }
    return '';
  };

  const updateCommerceForm = (key: keyof typeof commerceForm, value: string | boolean | number) => {
    setCommerceForm(prev => ({ ...prev, [key]: value }));
    // 实时校验（仅对字符串值）
    if (typeof value === 'string') {
      const error = validateField(key, value);
      setFormErrors(prev => ({ ...prev, [key]: error }));
    }
  };

  // 校验分账比例总和
  const validateSplitRatios = (): boolean => {
    const total = Number(commerceForm.platformShare || 0) + 
                  Number(commerceForm.merchantShare || 0) + 
                  Number(commerceForm.agentShare || 0);
    if (Math.abs(total - 100) > 0.01) {
      setFormErrors(prev => ({ ...prev, splitTotal: `分账比例总和应为100%，当前：${total}%` }));
      return false;
    }
    setFormErrors(prev => ({ ...prev, splitTotal: '' }));
    return true;
  };

  // 30秒撤回倒计时
  useEffect(() => {
    if (revokeCountdown !== null && revokeCountdown > 0) {
      const timer = setTimeout(() => setRevokeCountdown(revokeCountdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (revokeCountdown === 0) {
      setRevokeCountdown(null);
      // 倒计时结束，执行确认
      if (executionResult?.canRevoke) {
        setExecutionResult(prev => prev ? { ...prev, canRevoke: false, message: '已确认执行，无法撤回' } : null);
      }
    }
  }, [revokeCountdown, executionResult]);

  // 撤回操作
  const handleRevoke = useCallback(async () => {
    if (!executionResult?.id) return;
    try {
      setIsExecuting(true);
      // 根据类型调用不同的取消API
      if (executionResult.type === 'payment') {
        await payIntentApi.cancel(executionResult.id);
      } else if (executionResult.type === 'budget') {
        await commerceApi.cancelBudgetPool(executionResult.id);
      }
      setExecutionResult({
        success: true,
        type: 'revoked',
        message: '✅ 已成功撤回操作',
      });
      setRevokeCountdown(null);
    } catch (error: any) {
      setExecutionResult(prev => prev ? { 
        ...prev, 
        error: `撤回失败: ${error.message}`,
        canRevoke: false 
      } : null);
    } finally {
      setIsExecuting(false);
    }
  }, [executionResult]);

  // 复制到剪贴板
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // 可以添加toast提示
  };

  // 必填字段校验
  const validateRequired = (categoryId: string): string | null => {
    switch (categoryId) {
      case 'payment': {
        const amt = Number(commerceForm.amount);
        if (!amt || amt <= 0) return '请输入有效的支付金额';
        return null;
      }
      case 'onramp': {
        const amt = Number(commerceForm.fiatAmount);
        if (!amt || amt <= 0) return '请输入有效的入金金额';
        return null;
      }
      case 'offramp': {
        const amt = Number(commerceForm.fiatAmount);
        if (!amt || amt <= 0) return '请输入有效的出金金额';
        return null;
      }
      case 'fees': {
        const amt = Number(commerceForm.amount);
        if (!amt || amt <= 0) return '请输入有效的金额';
        return null;
      }
      case 'budget': {
        const sub = commerceForm.budgetSubAction;
        if (sub === 'create') {
          const amt = Number(commerceForm.budgetAmount);
          if (!amt || amt <= 0) return '请输入有效的预算金额';
        }
        if (sub === 'fund') {
          if (!commerceForm.budgetPoolIdForAction && !commerceForm.poolId) return '请填写预算池ID';
          const amt = Number(commerceForm.budgetFundAmount);
          if (!amt || amt <= 0) return '请输入有效的注资金额';
        }
        if (sub === 'stats' && !commerceForm.budgetPoolIdForAction && !commerceForm.poolId) return '请填写预算池ID';
        return null;
      }
      case 'milestone': {
        const sub = commerceForm.milestoneSubAction;
        if (sub === 'create') {
          if (!commerceForm.poolId) return '请填写预算池ID';
          if (!commerceForm.milestoneTitle) return '请填写里程碑标题';
          const amt = Number(commerceForm.milestoneReservedAmount);
          if (!amt || amt <= 0) return '请输入有效的预留金额';
        }
        if (['start','submit','approve','reject','release'].includes(sub) && !commerceForm.milestoneId) return '请填写里程碑ID';
        if (sub === 'list' && !commerceForm.poolId) return '请填写预算池ID';
        if (sub === 'reject' && !commerceForm.milestoneRejectReason) return '请填写驳回原因';
        return null;
      }
      case 'collaboration':
        if (!commerceForm.poolId) return '请填写预算池ID';
        return null;
      case 'publish_task':
      case 'publish': {
        if (commerceForm.publishType === 'task' || categoryId === 'publish_task') {
          if (!commerceForm.publishTitle) return '请填写任务标题';
          const amt = Number(commerceForm.publishBudget);
          if (!amt || amt <= 0) return '请输入有效的预算金额';
        }
        return null;
      }
      case 'publish_product':
      case 'publish_skill': {
        if (!commerceForm.publishTitle) return '请填写标题';
        if (commerceForm.publishPricingType !== 'free') {
          const p = Number(commerceForm.publishPrice);
          if (!p || p <= 0) return '请输入有效的价格';
        }
        return null;
      }
      default:
        return null;
    }
  };

  // 真实执行Commerce操作
  const handleCommerceSubmit = async (categoryId: string) => {
    // 表单校验
    if (categoryId === 'split' && !validateSplitRatios()) {
      return;
    }

    // 必填字段校验
    const validationError = validateRequired(categoryId);
    if (validationError) {
      setExecutionResult({
        success: false,
        type: categoryId,
        error: validationError,
      });
      return;
    }

    setIsExecuting(true);
    setExecutionResult(null);

    try {
      let result: any;
      let resultType = categoryId;

      switch (categoryId) {
        case 'payment': {
          // 创建支付意图 — 使用用户填写的金额（已通过校验）
          const amount = Number(commerceForm.amount);
          const payIntent = await payIntentApi.create({
            type: 'service_payment',
            amount,
            currency: commerceForm.currency,
            description: commerceForm.orderDescription || `支付给 ${commerceForm.counterparty || '商家'}`,
            expiresIn: 86400,
            metadata: {
              counterparty: commerceForm.counterparty,
              returnUrl: commerceForm.callbackUrl || window.location.href,
            },
          });
          
          // 自动打开支付页面触发实际支付流程
          const payUrl = payIntent.metadata?.payUrl || `/pay/intent/${payIntent.id}`;
          window.open(payUrl, '_blank');
          
          result = payIntent;
          setExecutionResult({
            success: true,
            type: 'payment',
            id: payIntent.id,
            data: payIntent,
            message: `✅ 已创建支付意图 ${amount} ${commerceForm.currency}，支付页面已打开`,
            link: payUrl,
            canRevoke: true,
            revokeDeadline: 30,
          });
          setRevokeCountdown(30);
          
          // 更新上下文
          onCommerceContextUpdate?.('lastOrderId', payIntent.id);
          break;
        }

        case 'onramp': {
          // 法币入金 - 调用 Transak Session API
          const onrampAmount = Number(commerceForm.fiatAmount);
          const transakResult = await paymentApi.createTransakSession({
            amount: onrampAmount,
            fiatCurrency: commerceForm.fiatCurrency || 'USD',
            cryptoCurrency: commerceForm.cryptoCurrency || 'USDC',
            network: commerceForm.onrampNetwork || 'polygon',
            walletAddress: commerceForm.onrampWalletAddress || undefined,
            redirectURL: window.location.href,
            disableFiatAmountEditing: false,
          });
          
          // 自动打开 Transak 入金页面
          if (transakResult.widgetUrl) {
            window.open(transakResult.widgetUrl, '_blank');
          }
          
          result = transakResult;
          setExecutionResult({
            success: true,
            type: 'onramp',
            id: transakResult.sessionId,
            data: transakResult,
            message: `✅ Transak 入金会话已创建，金额 ${onrampAmount} ${commerceForm.fiatCurrency}，入金页面已打开`,
            link: transakResult.widgetUrl,
          });
          break;
        }

        case 'offramp': {
          // 加密资产出金 - 先获取费率预览，然后提供提现信息
          const offrampAmount = Number(commerceForm.fiatAmount);
          // 先预览费用
          const feePreview = await commerceApi.previewAllocation({
            amount: offrampAmount,
            currency: commerceForm.cryptoCurrency || 'USDC',
            usesOfframp: true,
          });
          
          // 获取当前汇率
          let rateInfo = null;
          try {
            rateInfo = await paymentApi.getExchangeRate(
              commerceForm.cryptoCurrency || 'USDC',
              commerceForm.offrampTargetCurrency || 'USD'
            );
          } catch { /* rate is optional */ }
          
          result = {
            feePreview,
            rateInfo,
            amount: offrampAmount,
            fromCurrency: commerceForm.cryptoCurrency || 'USDC',
            toCurrency: commerceForm.offrampTargetCurrency || 'USD',
            bankAccount: commerceForm.offrampBankAccount,
            estimatedReceive: rateInfo 
              ? (offrampAmount * rateInfo.rate - (feePreview.fees?.totalFees || 0)).toFixed(2)
              : 'N/A',
          };
          
          setExecutionResult({
            success: true,
            type: 'offramp',
            data: result,
            message: `💱 出金预览：${offrampAmount} ${commerceForm.cryptoCurrency || 'USDC'} → ${result.estimatedReceive} ${commerceForm.offrampTargetCurrency || 'USD'}（含手续费 ${feePreview.fees?.totalFees || 0}）`,
          });
          break;
        }

        case 'receive': {
          // 生成商户收款二维码/链接
          const receiveAmount = Number(commerceForm.amount) || undefined;
          const receiveQR = await qrPaymentApi.generateMerchantReceiveQR({
            defaultAmount: receiveAmount,
            currency: commerceForm.currency || 'USDC',
            description: commerceForm.receiveDescription || `收款${receiveAmount ? ` ${receiveAmount} ${commerceForm.currency}` : ''}`,
          });
          
          result = receiveQR;
          setExecutionResult({
            success: true,
            type: 'receive',
            id: receiveQR.qrId || receiveQR.id,
            data: receiveQR,
            message: `✅ 收款码已生成${receiveAmount ? `，金额 ${receiveAmount} ${commerceForm.currency}` : '（自由金额）'}`,
            link: receiveQR.payUrl || receiveQR.qrCodeUrl,
          });
          break;
        }

        case 'query': {
          // 查询订单/支付意图状态
          const queryId = commerceForm.queryOrderId?.trim();
          if (queryId) {
            // 按ID查询单笔
            try {
              result = await payIntentApi.get(queryId);
              setExecutionResult({
                success: true,
                type: 'query',
                id: result.id,
                data: result,
                message: `📋 支付意图 ${result.id} 状态：${result.status}，金额：${result.amount} ${result.currency}`,
              });
            } catch {
              // 如果不是pay-intent ID，尝试按order查询
              result = await orderApi.getOrder(queryId);
              setExecutionResult({
                success: true,
                type: 'query',
                id: result.id,
                data: result,
                message: `📋 订单 ${result.id} 状态：${result.status}，金额：${result.totalAmount} ${result.currency}`,
              });
            }
          } else {
            // 查询最近订单列表
            result = await orderApi.getOrders({});
            const orders = Array.isArray(result) ? result : (result as any)?.items || [];
            setExecutionResult({
              success: true,
              type: 'query',
              data: { orders, total: orders.length },
              message: `📋 找到 ${orders.length} 笔订单记录`,
            });
          }
          break;
        }

        case 'rate': {
          // 汇率查询 - 使用真实汇率API
          const fromCurrency = commerceForm.fiatCurrency || 'USD';
          const toCurrency = commerceForm.cryptoCurrency || 'USDC';
          
          // 获取实时汇率
          const rateResult = await paymentApi.getExchangeRate(fromCurrency, toCurrency);
          
          // 同时获取费用预览（补充信息）
          let feeInfo = null;
          try {
            feeInfo = await paymentApi.estimateFee({
              amount: Number(commerceForm.fiatAmount) || 1000,
              currency: fromCurrency,
              paymentMethod: 'fiat_to_crypto',
            });
          } catch { /* fee estimate is optional */ }
          
          result = {
            rate: rateResult,
            feeInfo,
            from: fromCurrency,
            to: toCurrency,
          };
          
          setExecutionResult({
            success: true,
            type: 'rate',
            data: result,
            message: `💱 实时汇率：1 ${fromCurrency} = ${rateResult.rate} ${toCurrency}（来源: ${rateResult.source || 'market'}）`,
          });
          break;
        }

        case 'split': {
          // 创建分账方案 - 使用完整的SplitRule配置
          const splitRules = commerceForm.splitRules
            .filter(r => r.active && r.shareBps > 0)
            .map(r => ({
              recipient: r.recipient,
              shareBps: r.shareBps,
              role: r.role,
              source: r.source,
              active: true,
            }));
          
          const splitPlan = await commerceApi.createSplitPlan({
            name: commerceForm.planName || '分账方案',
            productType: commerceForm.splitProductType as ProductType,
            rules: splitRules,
          });
          
          // 自动激活
          let activatedPlan = splitPlan;
          try {
            activatedPlan = await commerceApi.activateSplitPlan(splitPlan.id);
          } catch { /* activation may not be needed immediately */ }
          
          result = activatedPlan;
          setExecutionResult({
            success: true,
            type: 'split',
            id: activatedPlan.id,
            data: activatedPlan,
            message: `✅ 分账方案「${activatedPlan.name}」创建成功（${commerceForm.splitProductType}类型，${splitRules.length}条规则）`,
          });
          
          onCommerceContextUpdate?.('lastSplitPlanId', activatedPlan.id);
          // 自动回填 SplitPlanId，方便创建预算池时关联
          setCommerceForm(prev => ({ ...prev, budgetSplitPlanId: activatedPlan.id }));
          break;
        }

        case 'split_list': {
          // 查看已有分账方案列表
          const plans = await commerceApi.getSplitPlans({});
          result = plans;
          setExecutionResult({
            success: true,
            type: 'split_list',
            data: { plans, total: plans.length },
            message: `📋 共有 ${plans.length} 个分账方案`,
          });
          break;
        }

        case 'split_template': {
          // 获取产品类型默认模板
          const template = await commerceApi.getDefaultTemplate(commerceForm.splitProductType || 'service');
          result = template;
          setExecutionResult({
            success: true,
            type: 'split_template',
            data: template,
            message: template 
              ? `📋 ${commerceForm.splitProductType} 类型默认模板：${template.name}` 
              : `⚠️ ${commerceForm.splitProductType} 类型暂无默认模板`,
          });
          break;
        }

        case 'budget': {
          // 预算池操作 - 根据子动作执行不同操作
          const budgetAction = commerceForm.budgetSubAction || 'create';
          
          if (budgetAction === 'create') {
            const budgetPool = await commerceApi.createBudgetPool({
              name: commerceForm.budgetPoolName || `预算池-${Date.now()}`,
              totalBudget: Number(commerceForm.budgetAmount),
              currency: commerceForm.currency || 'USDC',
              splitPlanId: commerceForm.budgetSplitPlanId || undefined,
              expiresAt: commerceForm.budgetDeadline || undefined,
            });
            
            result = budgetPool;
            setExecutionResult({
              success: true,
              type: 'budget',
              id: budgetPool.id,
              data: budgetPool,
              message: `✅ 预算池「${budgetPool.name}」创建成功，总预算 ${budgetPool.totalBudget} ${budgetPool.currency}`,
              canRevoke: true,
              revokeDeadline: 30,
            });
            setRevokeCountdown(30);
            onCommerceContextUpdate?.('lastPoolId', budgetPool.id);
            // 自动回填 PoolID 到表单，方便后续操作
            setCommerceForm(prev => ({ ...prev, poolId: budgetPool.id, budgetPoolIdForAction: budgetPool.id }));
          } else if (budgetAction === 'fund') {
            const poolId = commerceForm.budgetPoolIdForAction || commerceForm.poolId;
            if (!poolId) throw new Error('请填写预算池ID');
            
            const funded = await commerceApi.fundBudgetPool(poolId, {
              amount: Number(commerceForm.budgetFundAmount),
              fundingSource: commerceForm.budgetFundSource as FundingSource,
              walletAddress: commerceForm.budgetFundWallet || undefined,
            });
            
            result = funded;
            setExecutionResult({
              success: true,
              type: 'budget_fund',
              id: funded.id,
              data: funded,
              message: `✅ 预算池注资成功：+${commerceForm.budgetFundAmount} ${funded.currency}，当前已注资 ${funded.fundedAmount}`,
            });
          } else if (budgetAction === 'stats') {
            const poolId = commerceForm.budgetPoolIdForAction || commerceForm.poolId;
            if (!poolId) throw new Error('请填写预算池ID');
            
            const stats = await commerceApi.getPoolStats(poolId);
            const poolInfo = await commerceApi.getBudgetPool(poolId);
            
            result = { stats, pool: poolInfo };
            setExecutionResult({
              success: true,
              type: 'budget_stats',
              id: poolId,
              data: result,
              message: `📊 预算池「${poolInfo.name}」：总预算 ${stats.totalBudget}，已注资 ${stats.funded}，已释放 ${stats.released}，可用 ${stats.available}`,
            });
          } else if (budgetAction === 'list') {
            const pools = await commerceApi.getBudgetPools({});
            result = pools;
            setExecutionResult({
              success: true,
              type: 'budget_list',
              data: { pools, total: pools.length },
              message: `📋 共有 ${pools.length} 个预算池`,
            });
          }
          break;
        }

        case 'milestone': {
          // 里程碑操作 - 根据子动作执行生命周期操作
          const msAction = commerceForm.milestoneSubAction || 'create';
          
          if (msAction === 'create') {
            if (!commerceForm.poolId) throw new Error('请先填写预算池ID');
            
            const milestone = await commerceApi.createMilestone({
              name: commerceForm.milestoneTitle,
              description: commerceForm.milestoneReviewNote || undefined,
              budgetPoolId: commerceForm.poolId,
              reservedAmount: Number(commerceForm.milestoneReservedAmount),
              approvalType: (commerceForm.milestoneApprovalType as ApprovalType) || 'manual',
              dueDate: commerceForm.milestoneDueDate || undefined,
            });
            
            result = milestone;
            setExecutionResult({
              success: true,
              type: 'milestone',
              id: milestone.id,
              data: milestone,
              message: `✅ 里程碑「${milestone.name}」创建成功，预留金额 ${milestone.reservedAmount}`,
            });
            onCommerceContextUpdate?.('lastMilestoneId', milestone.id);
            // 自动回填里程碑ID，方便后续操作（start/submit/approve等）
            setCommerceForm(prev => ({ ...prev, milestoneId: milestone.id }));
          } else if (msAction === 'start') {
            if (!commerceForm.milestoneId) throw new Error('请填写里程碑ID');
            result = await commerceApi.startMilestone(commerceForm.milestoneId);
            setExecutionResult({
              success: true,
              type: 'milestone_start',
              id: result.id,
              data: result,
              message: `▶️ 里程碑「${result.name}」已开始执行`,
            });
          } else if (msAction === 'submit') {
            if (!commerceForm.milestoneId) throw new Error('请填写里程碑ID');
            const artifacts: Artifact[] = [];
            if (commerceForm.milestoneArtifactUrl) {
              artifacts.push({
                type: (commerceForm.milestoneArtifactType as Artifact['type']) || 'document',
                url: commerceForm.milestoneArtifactUrl,
                description: commerceForm.milestoneArtifactDesc || undefined,
              });
            }
            result = await commerceApi.submitMilestone(commerceForm.milestoneId, {
              artifacts,
              note: commerceForm.milestoneReviewNote || undefined,
            });
            setExecutionResult({
              success: true,
              type: 'milestone_submit',
              id: result.id,
              data: result,
              message: `📤 里程碑「${result.name}」已提交审核（${artifacts.length}个交付物）`,
            });
          } else if (msAction === 'approve') {
            if (!commerceForm.milestoneId) throw new Error('请填写里程碑ID');
            result = await commerceApi.approveMilestone(commerceForm.milestoneId, {
              reviewNote: commerceForm.milestoneReviewNote || undefined,
            });
            setExecutionResult({
              success: true,
              type: 'milestone_approve',
              id: result.id,
              data: result,
              message: `✅ 里程碑「${result.name}」审批通过`,
            });
          } else if (msAction === 'reject') {
            if (!commerceForm.milestoneId) throw new Error('请填写里程碑ID');
            result = await commerceApi.rejectMilestone(commerceForm.milestoneId, {
              reason: commerceForm.milestoneRejectReason || '不符合要求',
              reviewNote: commerceForm.milestoneReviewNote || undefined,
            });
            setExecutionResult({
              success: false,
              type: 'milestone_reject',
              id: result.id,
              data: result,
              message: `❌ 里程碑「${result.name}」已驳回：${commerceForm.milestoneRejectReason}`,
            });
          } else if (msAction === 'release') {
            if (!commerceForm.milestoneId) throw new Error('请填写里程碑ID');
            result = await commerceApi.releaseMilestone(commerceForm.milestoneId);
            setExecutionResult({
              success: true,
              type: 'milestone_release',
              id: result.id,
              data: result,
              message: `💰 里程碑「${result.name}」资金已释放，金额 ${result.releasedAmount}`,
            });
          } else if (msAction === 'list') {
            if (!commerceForm.poolId) throw new Error('请填写预算池ID');
            const milestones = await commerceApi.getMilestones(commerceForm.poolId);
            result = milestones;
            setExecutionResult({
              success: true,
              type: 'milestone_list',
              data: { milestones, total: milestones.length },
              message: `📋 预算池下共有 ${milestones.length} 个里程碑`,
            });
          }
          break;
        }

        case 'collaboration': {
          // 协作视图 - 获取预算池及里程碑全貌
          if (!commerceForm.poolId) throw new Error('请先填写预算池ID');
          
          const pool = await commerceApi.getBudgetPool(commerceForm.poolId);
          const poolStats = await commerceApi.getPoolStats(commerceForm.poolId);
          const milestones = await commerceApi.getMilestones(commerceForm.poolId);
          
          result = { pool, stats: poolStats, milestones };
          setExecutionResult({
            success: true,
            type: 'collaboration',
            id: pool.id,
            data: result,
            message: `📊 协作项目「${pool.name}」：${milestones.length} 个里程碑，已释放 ${poolStats.released}/${poolStats.totalBudget} ${pool.currency}`,
          });
          break;
        }

        case 'fees': {
          // 费用预览
          result = await commerceApi.previewAllocation({
            amount: Number(commerceForm.amount),
            currency: 'USDC',
            usesOnramp: commerceForm.paymentType === 'ONRAMP',
            usesOfframp: commerceForm.paymentType === 'OFFRAMP',
            usesSplit: true,
          });
          
          setExecutionResult({
            success: true,
            type: 'fees',
            data: result,
            message: `📊 费用预览：总费用 ${result.fees?.totalFees || 0} ${result.currency}`,
          });
          break;
        }

        case 'rates': {
          // 获取费率结构 - 获取所有产品类型的模板+实际费率表
          const productTypes: ProductType[] = ['physical', 'service', 'virtual', 'nft', 'skill', 'agent_task'];
          const templates: Record<string, any> = {};
          
          for (const pt of productTypes) {
            try {
              templates[pt] = await commerceApi.getDefaultTemplate(pt);
            } catch { templates[pt] = null; }
          }
          
          // 硬编码费率表（来自 financial-architecture.config.ts）
          const rateTable = {
            physical: { platformFee: '0.5%', poolRate: '2%', total: '2.5%' },
            service: { platformFee: '2%', poolRate: '3%', total: '5%' },
            virtual: { platformFee: '1%', poolRate: '2%', total: '3%' },
            nft: { platformFee: '1%', poolRate: '1.5%', total: '2.5%' },
            dev_tool: { platformFee: '3%', poolRate: '7%', total: '10%' },
            subscription: { platformFee: '1%', poolRate: '2%', total: '3%' },
          };
          
          const commissionModel = {
            executor: { share: '70%', source: 'incentive pool', description: '执行Agent - 实际完成任务的Agent' },
            referrer: { share: '30%', source: 'incentive pool', description: '推荐Agent - 推荐用户/任务的Agent' },
            promoter: { share: '20%', source: 'platform fee', description: '推广Agent - 推广平台/任务的Agent' },
            absentRole: 'Treasury（缺席角色的份额归入国库）',
          };
          
          result = { templates, rateTable, commissionModel };
          setExecutionResult({
            success: true,
            type: 'rates',
            data: result,
            message: '📋 平台费率结构与多级分佣模型',
          });
          break;
        }

        case 'commissions': {
          // 查看分润记录
          result = await commissionApi.getCommissions();
          const commissionList = Array.isArray(result) ? result : [];
          setExecutionResult({
            success: true,
            type: 'commissions',
            data: { commissions: commissionList, total: commissionList.length },
            message: `💸 找到 ${commissionList.length} 条分润记录`,
          });
          break;
        }

        case 'settlements': {
          // 查看结算记录
          result = await commissionApi.getSettlements();
          const settlementList = Array.isArray(result) ? result : [];
          setExecutionResult({
            success: true,
            type: 'settlements',
            data: { settlements: settlementList, total: settlementList.length },
            message: `📊 找到 ${settlementList.length} 条结算记录`,
          });
          break;
        }

        case 'settlement_execute': {
          // 执行结算
          result = await commissionApi.executeSettlement({
            payeeType: commerceForm.settlementPayeeType as 'agent' | 'merchant',
            currency: commerceForm.currency || 'USDC',
          });
          
          setExecutionResult({
            success: true,
            type: 'settlement_execute',
            id: result.id,
            data: result,
            message: `✅ 结算已执行，结算ID: ${result.id}，金额: ${result.amount} ${result.currency}`,
          });
          break;
        }

        case 'referral_link': {
          // 生成分佣推广链接
          const targetType = commerceForm.referralTargetType || 'skill';
          const targetId = commerceForm.referralTargetId;
          if (!targetId) throw new Error('请填写目标 Skill/Task ID');
          
          const commissionRate = Number(commerceForm.referralCommissionRate) || 10;
          
          try {
            const linkResult = await apiClient.post<any>('/referral/links', {
              targetType,
              targetId,
              commissionRate,
              metadata: { createdVia: 'commerce_panel' },
            });
            
            result = linkResult;
            setExecutionResult({
              success: true,
              type: 'referral_link',
              id: linkResult.id || targetId,
              data: linkResult,
              message: `🔗 推广链接已生成！分佣比例 ${commissionRate}%`,
              link: linkResult.shortUrl || linkResult.url,
            });
          } catch (e: any) {
            // 降级：本地生成推广链接
            const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://agentrix.app';
            const referralUrl = `${baseUrl}/${targetType}/${targetId}?ref=${user?.id || 'me'}&commission=${commissionRate}`;
            result = { url: referralUrl, shortUrl: referralUrl, commissionRate };
            setExecutionResult({
              success: true,
              type: 'referral_link',
              id: targetId,
              data: result,
              message: `🔗 推广链接已生成（本地）！分佣比例 ${commissionRate}%`,
              link: referralUrl,
            });
          }
          break;
        }

        case 'publish':
        case 'publish_task':
        case 'publish_product':
        case 'publish_skill': {
          // 发布到marketplace - 创建预算池作为任务载体
          const publishType = commerceForm.publishType;
          let publishResult: any;
          
          if (publishType === 'task' || categoryId === 'publish_task') {
            // 发布协作任务 = 发布到任务市场 + 创建预算池
            const taskTitle = commerceForm.publishTitle;
            const taskBudget = Number(commerceForm.publishBudget);
            
            // Step 1: 发布到任务市场（MerchantTask）
            const taskResult = await taskMarketplaceApi.publishTask({
              type: (commerceForm.publishCategory as any) || 'custom_service',
              title: taskTitle,
              description: commerceForm.publishDescription || `协作任务: ${taskTitle}`,
              budget: taskBudget,
              currency: 'USD',
              tags: commerceForm.publishTags ? commerceForm.publishTags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
              visibility: (commerceForm.publishVisibility as any) || 'public',
              requirements: commerceForm.publishRequirements ? {
                deadline: commerceForm.milestoneDueDate ? new Date(commerceForm.milestoneDueDate) : undefined,
                deliverables: commerceForm.publishRequirements.split('\n').filter(Boolean),
                specifications: commerceForm.publishDescription ? { description: commerceForm.publishDescription } : undefined,
              } : undefined,
            });
            
            // Step 2: 同时创建预算池作为资金托管
            let poolResult: any = null;
            try {
              poolResult = await commerceApi.createBudgetPool({
                name: taskTitle,
                description: `协作任务预算池: ${taskTitle}`,
                totalBudget: taskBudget,
                currency: 'USDC',
                metadata: {
                  type: 'task',
                  taskId: taskResult.id,
                  status: 'published',
                },
              });
            } catch (e) { /* budget pool is optional */ }
            
            publishResult = taskResult;
            
            setExecutionResult({
              success: true,
              type: 'publish',
              id: taskResult.id,
              data: { task: taskResult, budgetPool: poolResult },
              message: `🚀 协作任务「${taskTitle}」已发布到任务市场，预算 $${taskBudget}`,
              link: '/marketplace?tab=tasks',
            });
            
            onCommerceContextUpdate?.('lastPublishId', taskResult.id);
            if (poolResult?.id) onCommerceContextUpdate?.('lastPoolId', poolResult.id);
          } else {
            // 商品/Skill发布 - 使用完整配置
            const skillName = commerceForm.publishTitle || (publishType === 'product' ? '新商品' : '新技能');
            const price = commerceForm.publishPricingType === 'free' ? 0 : Number(commerceForm.publishPrice);
            const description = commerceForm.publishSkillDescription || commerceForm.publishDescription || `${publishType === 'product' ? '商品' : 'Skill'}: ${skillName}`;
            const tags = commerceForm.publishSkillTags ? commerceForm.publishSkillTags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
            const category = commerceForm.publishSkillCategory || (publishType === 'product' ? 'commerce' : 'utility');
            
            // 根据定价类型构建pricing配置
            const pricingType = commerceForm.publishPricingType || 'per_call';
            const pricing: any = { type: pricingType as any, currency: 'USD' };
            if (pricingType === 'per_call') {
              pricing.pricePerCall = price;
            } else if (pricingType === 'subscription') {
              pricing.pricePerCall = price;
              pricing.monthlyPrice = price * 100;
            } else if (pricingType === 'revenue_share') {
              pricing.pricePerCall = 0;
              pricing.revenueSharePercent = price;
            }
            if (Number(commerceForm.publishFreeQuota) > 0) {
              pricing.freeQuota = Number(commerceForm.publishFreeQuota);
            }
            
            // 根据执行器类型构建executor配置
            const executorType = commerceForm.publishExecutorType || 'internal';
            const executor: any = { type: executorType as any };
            if (executorType === 'internal') {
              executor.internalHandler = 'generic_skill_handler';
            } else if (executorType === 'http') {
              executor.endpoint = commerceForm.publishExecutorEndpoint;
              executor.method = 'POST';
            } else if (executorType === 'mcp') {
              executor.endpoint = commerceForm.publishExecutorEndpoint;
              executor.toolName = skillName.toLowerCase().replace(/\s+/g, '_');
            }
            
            const createPayload = {
              name: skillName,
              displayName: skillName,
              description,
              category: category as any,
              version: commerceForm.publishVersion || '1.0.0',
              layer: publishType === 'product' ? 'resource' : 'logic',
              resourceType: publishType === 'product' ? 'digital' : undefined,
              executor,
              inputSchema: {
                type: 'object' as const,
                properties: {} as Record<string, any>,
                required: [] as string[],
              },
              pricing,
              ucpEnabled: true,
              x402Enabled: pricingType === 'per_call',
              metadata: {
                createdVia: 'commerce_panel',
                publishType,
                tags,
                visibility: commerceForm.publishVisibility,
              },
            };
            
            const createRes = await skillApi.create(createPayload);
            const newSkillId = createRes.data?.id;
            
            // 自动发布到marketplace
            if (newSkillId) {
              try { await skillApi.publish(newSkillId); } catch (e) { /* non-blocking */ }
            }
            
            publishResult = createRes.data || createRes;
            setExecutionResult({
              success: true,
              type: 'publish',
              id: newSkillId,
              data: publishResult,
              message: `🚀 ${publishType === 'product' ? '商品' : 'Skill'}「${skillName}」已发布到 Marketplace`,
              link: newSkillId ? `/skill/${newSkillId}` : '/marketplace',
            });
            
            if (newSkillId) {
              onCommerceContextUpdate?.('lastPublishId', newSkillId);
            }
          }
          break;
        }

        case 'sync_external': {
          // 同步到外部平台 — 获取已发布的Skill并生成MCP端点URL
          const mySkills = await skillApi.getMySkills({ status: 'published' as any });
          const publishedSkills = mySkills?.items || [];
          
          const mcpBaseUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/mcp/sse` : 'https://agentrix.app/api/mcp/sse';
          
          result = {
            skills: publishedSkills.map((s: any) => ({
              id: s.id,
              name: s.name || s.displayName,
              status: s.status,
              mcpEndpoint: mcpBaseUrl,
            })),
            total: publishedSkills.length,
            mcpEndpoint: mcpBaseUrl,
            oauthDiscovery: '/.well-known/oauth-authorization-server',
          };
          
          setExecutionResult({
            success: true,
            type: 'sync_external',
            data: result,
            message: `🔗 已获取 ${publishedSkills.length} 个已发布 Skill，MCP 端点: ${mcpBaseUrl}`,
            link: mcpBaseUrl,
          });
          break;
        }

        default:
          throw new Error(`未知的操作类型: ${categoryId}`);
      }

      // 保持表单打开，让用户可以看到执行结果并继续操作

    } catch (error: any) {
      console.error('Commerce执行失败:', error);
      setExecutionResult({
        success: false,
        type: categoryId,
        error: error.message || '操作失败，请稍后重试',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // 处理加入购物车
  const handleAddToCart = async (productId: string, quantity: number = 1) => {
    // 如果用户已登录，不传递sessionId，让后端使用userId（从JWT token获取）
    // 如果用户未登录，传递sessionId
    // 在函数开始就声明变量，避免作用域问题
    const cartSessionId: string | undefined = user ? undefined : sessionId;
    console.log('🛒 开始加入购物车:', { productId, quantity, sessionId, userId: user?.id, cartSessionId });
    
    if (!user && !sessionId) {
      console.warn('⚠️ 用户未登录且没有sessionId，购物车操作可能无法正确同步。建议先发送一条消息给Agent以获取sessionId。');
    }
    setIsAddingToCart(productId);
    try {
      const result = await cartApi.addItem(productId, quantity, cartSessionId);
      console.log('🛒 加入购物车成功:', result);
      
      // 显示成功提示
      setCartUpdateStatus({ type: 'success', message: '✅ 商品已成功加入购物车！' });
      setTimeout(() => {
        setCartUpdateStatus({ type: null, message: '' });
      }, 3000);
      
      // 直接获取最新购物车数据并更新显示
      // 如果用户已登录，不传递sessionId；如果未登录，传递sessionId
      if (user || sessionId) {
        try {
          const updatedCart = await cartApi.getCartWithProducts(cartSessionId);
          // 转换数据格式为 CartItem[] 格式
          const cartItems: CartItem[] = (updatedCart.items || []).map((item: any) => ({
            product: {
              id: item.product?.id || item.productId || '',
              name: item.product?.name || '未知商品',
              description: item.product?.description || '',
              price: item.product?.price || 0,
              currency: item.product?.currency || item.product?.metadata?.currency || 'CNY',
              stock: item.product?.stock || 0,
              category: item.product?.category || '',
              metadata: {
                image: item.product?.metadata?.image || item.product?.image || '',
                description: item.product?.description || '',
                currency: item.product?.currency || item.product?.metadata?.currency || 'CNY',
              },
              merchantId: item.product?.merchantId || '',
              commissionRate: item.product?.commissionRate || 0,
              status: item.product?.status || 'active',
            },
            quantity: item.quantity || 1,
          }));
          
          // 通知父组件购物车已更新，如果购物车消息不存在则创建
          if (onCartChanged) {
            onCartChanged(cartItems);
          } else if (onCartUpdate) {
            // 如果onCartChanged不存在，尝试更新现有购物车
            onCartUpdate(cartItems);
          }
          
          // 如果onCartChanged和onCartUpdate都不存在，发送"查看购物车"消息来显示购物车
          if (!onCartChanged && !onCartUpdate && onSendMessage) {
            setTimeout(() => {
              onSendMessage('查看购物车');
            }, 100);
          }
        } catch (fetchError) {
          console.warn('获取更新后的购物车失败:', fetchError);
          // 如果直接获取失败，发送消息来显示购物车
      if (onSendMessage) {
        setTimeout(() => {
          onSendMessage('查看购物车');
        }, 100);
          }
        }
      }
    } catch (error: any) {
      console.error('❌ 加入购物车失败:', error);
      setCartUpdateStatus({ 
        type: 'error', 
        message: `❌ 加入购物车失败：${error.message || '请稍后重试'}` 
      });
      setTimeout(() => {
        setCartUpdateStatus({ type: null, message: '' });
      }, 3000);
    } finally {
      setIsAddingToCart(null);
    }
  };

  // 打开商品详情
  const handleViewProduct = (product: any) => {
    const productInfo: ProductInfo = {
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      stock: product.stock || (product.inStock ? 999 : 0),
      category: product.category || '',
      commissionRate: product.commissionRate || 0,
      status: 'active',
      merchantId: product.merchantId || '',
      metadata: {
        image: product.image || product.metadata?.image,
        currency: product.currency || product.metadata?.currency,
        ...product.metadata,
      },
    };
    setSelectedProduct(productInfo);
    setIsProductModalOpen(true);
  };

  // 调试：打印所有消息的metadata
  console.log('📋 StructuredResponseCard 收到消息:', {
    type,
    hasData: !!data,
    dataKeys: data ? Object.keys(data) : [],
    fullMetadata: message.metadata,
  });

  if (!data || type === 'error') {
    return null;
  }

  if (type === 'skills_list') {
    const skills = Array.isArray(data.skills) ? data.skills : [];
    const searchLabel = data.search ? `（搜索：${data.search}）` : '';
    const visibleSkills = skills.slice(0, 12);

    return (
      <div className="mt-3 pt-3 border-t border-neutral-700/50">
        <div className="bg-slate-900/70 border border-slate-800/60 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-slate-200">可用技能列表{searchLabel}</div>
              <div className="text-xs text-slate-500">共 {data.total ?? skills.length} 个技能</div>
            </div>
            {skills.length > visibleSkills.length && (
              <div className="text-xs text-slate-500">仅展示前 {visibleSkills.length} 个</div>
            )}
          </div>

          <div className="grid gap-3">
            {visibleSkills.map((skill: any) => (
              <div key={skill.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/60 bg-slate-900/50 p-3">
                <div>
                  <div className="text-sm font-medium text-slate-100">{skill.displayName || skill.name}</div>
                  <div className="text-xs text-slate-500 mt-1 line-clamp-2">{skill.description}</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{skill.category}</span>
                    {skill.ucpEnabled && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">UCP</span>
                    )}
                    {skill.x402Enabled && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300">X402</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => onSendMessage?.(`@${skill.name}`)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600/80 text-white hover:bg-indigo-500"
                  >
                    使用
                  </button>
                  <button
                    onClick={() => onSendMessage?.(`查看技能 ${skill.name}`)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    详情
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'commerce_categories') {
    const categories = Array.isArray(data.categories) ? data.categories : [];
    const isThreeTier = data.layout === 'three-tier';
    const openSubCategory = data.openSubCategory;
    
    // 三层结构渲染
    if (isThreeTier) {
      return (
        <div className="mt-3 pt-3 border-t border-neutral-700/50">
          <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900/60 border border-slate-800/60 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-slate-200">Commerce 能力中心</div>
              <div className="flex gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">UCP</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300">X402</span>
              </div>
            </div>
            
            {/* 第一层：4 个场景入口 */}
            <div className="grid gap-3 sm:grid-cols-2">
              {categories.map((category: any) => (
                <div key={category.id} className={`rounded-lg border ${openCommerceForm === category.id ? 'border-indigo-500/50 bg-indigo-900/20' : 'border-slate-800/60 bg-slate-900/60'} p-3 flex flex-col gap-2 transition-all`}>
                  {/* 场景标题 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{category.icon}</span>
                      <div>
                        <div className="text-sm font-medium text-slate-100">{category.title}</div>
                        <div className="text-xs text-slate-500">{category.description}</div>
                      </div>
                    </div>
                    {category.protocol && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${category.protocol === 'X402' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'}`}>
                        {category.protocol}
                      </span>
                    )}
                  </div>
                  
                  {/* 展开/收起按钮 */}
                  <button
                    onClick={() => setOpenCommerceForm(prev => (prev === category.id ? null : category.id))}
                    className="w-fit px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    {openCommerceForm === category.id ? '收起' : '展开子功能'}
                  </button>
                  
                  {/* 第二层：子功能列表 */}
                  {openCommerceForm === category.id && category.subCategories && (
                    <div className="mt-2 space-y-2 border-t border-slate-800/50 pt-2">
                      {category.subCategories.map((sub: any) => (
                        <div key={sub.id} className={`rounded-md p-2 ${openSubCategory === sub.id ? 'bg-indigo-600/20 border border-indigo-500/30' : 'bg-slate-800/50 hover:bg-slate-800'}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-200">{sub.title}</span>
                            <button
                              onClick={() => {
                                // 直接在当前卡片内设置对应子功能，而非发送消息创建新卡片
                                const subIdMap: Record<string, Record<string, () => void>> = {
                                  pay_exchange: {
                                    payment: () => updateCommerceForm('payExchangeAction', 'payment'),
                                    receive: () => updateCommerceForm('payExchangeAction', 'receive'),
                                    query: () => updateCommerceForm('payExchangeAction', 'query'),
                                    onramp: () => updateCommerceForm('payExchangeAction', 'onramp'),
                                    offramp: () => updateCommerceForm('payExchangeAction', 'offramp'),
                                    rate: () => updateCommerceForm('payExchangeAction', 'rate'),
                                  },
                                  collab: {
                                    split: () => updateCommerceForm('collabAction', 'split'),
                                    referral_link: () => updateCommerceForm('collabAction', 'referral_link'),
                                    budget: () => updateCommerceForm('collabAction', 'budget'),
                                    milestone: () => updateCommerceForm('collabAction', 'milestone'),
                                    collaboration: () => updateCommerceForm('collabAction', 'collaboration'),
                                  },
                                  commission: {
                                    commissions: () => updateCommerceForm('commissionAction', 'commissions'),
                                    settlements: () => updateCommerceForm('commissionAction', 'settlements'),
                                    settlement_execute: () => updateCommerceForm('commissionAction', 'settlement_execute'),
                                    fees: () => updateCommerceForm('commissionAction', 'fees'),
                                    rates: () => updateCommerceForm('commissionAction', 'rates'),
                                  },
                                  publish: {
                                    publish_task: () => updateCommerceForm('publishType', 'task'),
                                    publish_product: () => updateCommerceForm('publishType', 'product'),
                                    publish_skill: () => updateCommerceForm('publishType', 'skill'),
                                    sync_external: () => updateCommerceForm('publishType', 'sync'),
                                  },
                                };
                                const handler = subIdMap[category.id]?.[sub.id];
                                if (handler) {
                                  handler();
                                  // 清除之前的执行结果，准备新操作
                                  setExecutionResult(null);
                                } else {
                                  // 兜底：发送消息
                                  onSendMessage?.(sub.example);
                                }
                              }}
                              className="px-2 py-1 text-[10px] rounded bg-indigo-600/80 text-white hover:bg-indigo-500"
                            >
                              快捷触发
                            </button>
                          </div>
                        </div>
                      ))}
                      
                      {/* 第三层：表单输入区（根据父分类ID显示对应表单） */}
                      <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2 text-xs">
                        {/* 执行状态反馈区 */}
                        {isExecuting && (
                          <div className="flex items-center gap-2 p-2 rounded-lg bg-indigo-600/20 border border-indigo-500/30">
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                            <span className="text-indigo-300">正在执行操作...</span>
                          </div>
                        )}
                        
                        {executionResult && !isExecuting && (
                          <div className={`p-3 rounded-lg border ${executionResult.success ? 'bg-green-900/20 border-green-500/30' : 'bg-red-900/20 border-red-500/30'}`}>
                            <div className="flex items-start gap-2">
                              {executionResult.success ? (
                                <CheckCircle className="w-4 h-4 text-green-400 mt-0.5" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-400 mt-0.5" />
                              )}
                              <div className="flex-1">
                                <div className={`text-sm font-medium ${executionResult.success ? 'text-green-300' : 'text-red-300'}`}>
                                  {executionResult.message || executionResult.error}
                                </div>
                                
                                {/* 结果详情 */}
                                {executionResult.data && (
                                  <div className="mt-2 text-xs text-slate-400 space-y-1">
                                    {executionResult.id && (
                                      <div className="flex items-center gap-1">
                                        <span>ID:</span>
                                        <code className="bg-slate-800 px-1 rounded text-[10px]">{executionResult.id}</code>
                                        <button onClick={() => copyToClipboard(executionResult.id!)} className="text-indigo-400 hover:text-indigo-300">
                                          <Copy className="w-3 h-3" />
                                        </button>
                                      </div>
                                    )}
                                    
                                    {/* 支付意图详情 - 带进入支付页面按钮 */}
                                    {executionResult.type === 'payment' && executionResult.data && (
                                      <div className="mt-2 p-2 bg-indigo-900/30 rounded border border-indigo-500/20">
                                        <div className="font-medium mb-1 text-indigo-300">支付意图详情</div>
                                        <div>金额: {executionResult.data.amount} {executionResult.data.currency}</div>
                                        <div>状态: {executionResult.data.status}</div>
                                        {executionResult.data.description && <div>描述: {executionResult.data.description}</div>}
                                        <a 
                                          href={executionResult.link || `/pay/intent/${executionResult.id}`}
                                          target="_blank" 
                                          rel="noopener noreferrer" 
                                          className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
                                        >
                                          <ExternalLink className="w-3 h-3" />
                                          进入支付页面完成支付
                                        </a>
                                      </div>
                                    )}
                                    
                                    {/* 费用预览详情 */}
                                    {executionResult.type === 'fees' && executionResult.data.fees && (
                                      <div className="mt-2 p-2 bg-slate-800/50 rounded">
                                        <div>总费用: {executionResult.data.fees.totalFees} {executionResult.data.currency}</div>
                                        <div>On-ramp 费: {executionResult.data.fees.onrampFee}</div>
                                        <div>Off-ramp 费: {executionResult.data.fees.offrampFee}</div>
                                        <div>分账费: {executionResult.data.fees.splitFee}</div>
                                        {executionResult.data.allocations && (
                                          <>
                                            <div className="font-medium mt-1">分配预览:</div>
                                            {executionResult.data.allocations.map((alloc: any, idx: number) => (
                                              <div key={idx}>{alloc.role}: {alloc.amount} ({alloc.percentage}%)</div>
                                            ))}
                                          </>
                                        )}
                                        {executionResult.data.merchantNet !== undefined && (
                                          <div className="mt-1 text-green-300">商家实收: {executionResult.data.merchantNet} {executionResult.data.currency}</div>
                                        )}
                                      </div>
                                    )}
                                    
                                    {/* 收款码详情 */}
                                    {executionResult.type === 'receive' && executionResult.data && (
                                      <div className="mt-3 p-3 bg-slate-800/50 rounded-lg">
                                        {/* QR Code Display */}
                                        {(executionResult.data.payUrl || executionResult.data.qrCodeUrl) && (
                                          <div className="flex justify-center mb-3">
                                            <div className="bg-white p-3 rounded-lg">
                                              <QRCodeSVG
                                                value={executionResult.data.payUrl || executionResult.data.qrCodeUrl}
                                                size={160}
                                                level="M"
                                                includeMargin={true}
                                              />
                                            </div>
                                          </div>
                                        )}
                                        <div className="text-center space-y-1">
                                          <div className="text-xs text-slate-400">收款码ID: {executionResult.data.qrId || executionResult.data.id}</div>
                                          {executionResult.data.amount && <div className="text-sm font-medium text-green-400">金额: {executionResult.data.amount} {executionResult.data.currency || 'USDC'}</div>}
                                          {executionResult.data.payUrl && (
                                            <div className="text-xs">
                                              <a href={executionResult.data.payUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 break-all">
                                                {executionResult.data.payUrl}
                                              </a>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* 订单查询详情 */}
                                    {executionResult.type === 'query' && executionResult.data && (
                                      <div className="mt-2 p-2 bg-slate-800/50 rounded">
                                        {executionResult.data.orders ? (
                                          <div>
                                            <div className="font-medium mb-1">最近订单:</div>
                                            {executionResult.data.orders.slice(0, 5).map((o: any, idx: number) => (
                                              <div key={idx} className="flex justify-between py-0.5">
                                                <span>{o.id?.slice(0, 8)}...</span>
                                                <span>{o.status}</span>
                                                <span>{o.totalAmount || o.amount} {o.currency}</span>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <div>
                                            <div>状态: {executionResult.data.status}</div>
                                            <div>金额: {executionResult.data.amount || executionResult.data.totalAmount} {executionResult.data.currency}</div>
                                            {executionResult.data.description && <div>描述: {executionResult.data.description}</div>}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    
                                    {/* 汇率详情 */}
                                    {executionResult.type === 'rate' && executionResult.data && (
                                      <div className="mt-2 p-2 bg-slate-800/50 rounded">
                                        {executionResult.data.rate && (
                                          <>
                                            <div className="font-medium mb-1">实时汇率</div>
                                            <div>1 {executionResult.data.from} = {executionResult.data.rate.rate} {executionResult.data.to}</div>
                                            <div className="text-slate-500">来源: {executionResult.data.rate.source || 'market'}</div>
                                            <div className="text-slate-500">时间: {new Date(executionResult.data.rate.timestamp).toLocaleString('zh-CN')}</div>
                                          </>
                                        )}
                                        {executionResult.data.feeInfo && (
                                          <div className="mt-1 pt-1 border-t border-slate-700/50">
                                            <div>预估手续费: {JSON.stringify(executionResult.data.feeInfo)}</div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    
                                    {/* On-ramp 入金详情 */}
                                    {executionResult.type === 'onramp' && executionResult.data && (
                                      <div className="mt-2 p-2 bg-green-900/30 rounded border border-green-500/20">
                                        <div className="font-medium mb-1 text-green-300">入金会话</div>
                                        <div>Session ID: <code className="bg-slate-800 px-1 rounded">{executionResult.data.sessionId}</code></div>
                                        {executionResult.data.widgetUrl && (
                                          <a href={executionResult.data.widgetUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-green-400 hover:text-green-300">
                                            <ExternalLink className="w-3 h-3" />
                                            <span>打开 Transak 支付页面</span>
                                          </a>
                                        )}
                                      </div>
                                    )}
                                    
                                    {/* Off-ramp 出金详情 */}
                                    {executionResult.type === 'offramp' && executionResult.data && (
                                      <div className="mt-2 p-2 bg-orange-900/30 rounded border border-orange-500/20">
                                        <div className="font-medium mb-1 text-orange-300">出金预览</div>
                                        <div>出金金额: {executionResult.data.amount} {executionResult.data.fromCurrency}</div>
                                        <div>目标币种: {executionResult.data.toCurrency}</div>
                                        <div>预计到账: {executionResult.data.estimatedReceive} {executionResult.data.toCurrency}</div>
                                        {executionResult.data.rateInfo && <div>汇率: 1 {executionResult.data.fromCurrency} = {executionResult.data.rateInfo.rate} {executionResult.data.toCurrency}</div>}
                                        {executionResult.data.feePreview?.fees && (
                                          <div className="mt-1 pt-1 border-t border-slate-700/50">
                                            <div>手续费: {executionResult.data.feePreview.fees.totalFees} {executionResult.data.fromCurrency}</div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    
                                    {/* 费率结构详情 */}
                                    {executionResult.type === 'rates' && executionResult.data && (
                                      <div className="mt-2 p-2 bg-slate-800/50 rounded max-h-48 overflow-y-auto">
                                        {executionResult.data.rateTable && (
                                          <>
                                            <div className="font-medium mb-1">📊 平台费率表（按资产类型）</div>
                                            <div className="grid grid-cols-4 gap-1 text-[10px] mb-1 font-medium text-slate-300">
                                              <span>类型</span><span>平台费</span><span>池费率</span><span>总费率</span>
                                            </div>
                                            {Object.entries(executionResult.data.rateTable).map(([type, rates]: [string, any]) => (
                                              <div key={type} className="grid grid-cols-4 gap-1 text-[10px] py-0.5 border-b border-slate-700/30">
                                                <span className="text-slate-300">{type}</span>
                                                <span>{rates.platformFee}</span>
                                                <span>{rates.poolRate}</span>
                                                <span className="text-indigo-300">{rates.total}</span>
                                              </div>
                                            ))}
                                          </>
                                        )}
                                        {executionResult.data.commissionModel && (
                                          <>
                                            <div className="font-medium mb-1 mt-2">💸 三级分佣模型</div>
                                            {Object.entries(executionResult.data.commissionModel).filter(([k]) => k !== 'absentRole').map(([role, info]: [string, any]) => (
                                              <div key={role} className="py-0.5 border-b border-slate-700/30">
                                                <span className="text-indigo-300">{role}</span>: {info.share}（{info.source}） — {info.description}
                                              </div>
                                            ))}
                                            <div className="mt-1 text-slate-500 text-[10px]">{executionResult.data.commissionModel.absentRole}</div>
                                          </>
                                        )}
                                      </div>
                                    )}
                                    
                                    {/* 预算池统计详情 */}
                                    {(executionResult.type === 'budget_stats' || executionResult.type === 'budget_fund') && executionResult.data && (
                                      <div className="mt-2 p-2 bg-slate-800/50 rounded">
                                        {executionResult.data.stats && (
                                          <>
                                            <div className="font-medium mb-1">预算池统计</div>
                                            <div className="grid grid-cols-2 gap-1">
                                              <span>总预算: {executionResult.data.stats.totalBudget}</span>
                                              <span>已注资: {executionResult.data.stats.funded}</span>
                                              <span>已预留: {executionResult.data.stats.reserved}</span>
                                              <span>已释放: {executionResult.data.stats.released}</span>
                                              <span className="text-green-300">可用: {executionResult.data.stats.available}</span>
                                              <span>里程碑: {executionResult.data.stats.completedMilestones}/{executionResult.data.stats.milestoneCount}</span>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    )}
                                    
                                    {/* 预算池/分账方案列表 */}
                                    {(executionResult.type === 'budget_list' || executionResult.type === 'split_list') && executionResult.data && (
                                      <div className="mt-2 p-2 bg-slate-800/50 rounded max-h-32 overflow-y-auto">
                                        {executionResult.data.pools && executionResult.data.pools.map((p: any, idx: number) => (
                                          <div key={idx} className="flex justify-between py-0.5 border-b border-slate-700/50">
                                            <span>{p.name}</span>
                                            <span>{p.totalBudget || p.fundedAmount} {p.currency}</span>
                                            <span className="text-slate-500">{p.status}</span>
                                          </div>
                                        ))}
                                        {executionResult.data.plans && executionResult.data.plans.map((p: any, idx: number) => (
                                          <div key={idx} className="flex justify-between py-0.5 border-b border-slate-700/50">
                                            <span>{p.name} ({p.productType})</span>
                                            <span>{p.rules?.length || 0} rules</span>
                                            <span className="text-slate-500">{p.status}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    
                                    {/* 里程碑列表 */}
                                    {executionResult.type === 'milestone_list' && executionResult.data?.milestones && (
                                      <div className="mt-2 p-2 bg-slate-800/50 rounded max-h-32 overflow-y-auto">
                                        {executionResult.data.milestones.map((m: any, idx: number) => (
                                          <div key={idx} className="flex justify-between py-0.5 border-b border-slate-700/50">
                                            <span>{m.name}</span>
                                            <span>{m.reservedAmount} / {m.releasedAmount}</span>
                                            <span className={`text-[10px] px-1 rounded ${
                                              m.status === 'released' ? 'bg-green-500/20 text-green-300' :
                                              m.status === 'approved' ? 'bg-blue-500/20 text-blue-300' :
                                              m.status === 'pending_review' ? 'bg-yellow-500/20 text-yellow-300' :
                                              m.status === 'in_progress' ? 'bg-indigo-500/20 text-indigo-300' :
                                              m.status === 'rejected' ? 'bg-red-500/20 text-red-300' :
                                              'bg-slate-500/20 text-slate-300'
                                            }`}>{m.status}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    
                                    {/* 协作全景 */}
                                    {executionResult.type === 'collaboration' && executionResult.data && (
                                      <div className="mt-2 p-2 bg-slate-800/50 rounded max-h-48 overflow-y-auto">
                                        {executionResult.data.pool && (
                                          <div className="mb-2">
                                            <div className="font-medium">预算池: {executionResult.data.pool.name}</div>
                                            <div>状态: {executionResult.data.pool.status} | 币种: {executionResult.data.pool.currency}</div>
                                          </div>
                                        )}
                                        {executionResult.data.stats && (
                                          <div className="mb-2 grid grid-cols-2 gap-1">
                                            <span>总预算: {executionResult.data.stats.totalBudget}</span>
                                            <span>可用: {executionResult.data.stats.available}</span>
                                            <span>已释放: {executionResult.data.stats.released}</span>
                                            <span>完成: {executionResult.data.stats.completedMilestones}/{executionResult.data.stats.milestoneCount}</span>
                                          </div>
                                        )}
                                        {executionResult.data.milestones && (
                                          <>
                                            <div className="font-medium mt-1">里程碑:</div>
                                            {executionResult.data.milestones.map((m: any, idx: number) => (
                                              <div key={idx} className="flex justify-between py-0.5 border-b border-slate-700/50">
                                                <span>{m.name}</span>
                                                <span className="text-slate-500">{m.status}</span>
                                              </div>
                                            ))}
                                          </>
                                        )}
                                      </div>
                                    )}
                                    
                                    {/* 分账模板详情 */}
                                    {executionResult.type === 'split_template' && executionResult.data && (
                                      <div className="mt-2 p-2 bg-slate-800/50 rounded">
                                        <div className="font-medium mb-1">{executionResult.data.name}</div>
                                        <div>产品类型: {executionResult.data.productType}</div>
                                        {executionResult.data.rules && executionResult.data.rules.map((r: any, idx: number) => (
                                          <div key={idx} className="py-0.5">{r.role}: {r.shareBps / 100}%（{r.source}）</div>
                                        ))}
                                      </div>
                                    )}
                                    
                                    {/* 分润记录详情 */}
                                    {executionResult.type === 'commissions' && executionResult.data?.commissions && (
                                      <div className="mt-2 p-2 bg-slate-800/50 rounded max-h-32 overflow-y-auto">
                                        <div className="font-medium mb-1">分润记录:</div>
                                        {executionResult.data.commissions.length === 0 ? (
                                          <div className="text-slate-500">暂无分润记录</div>
                                        ) : executionResult.data.commissions.slice(0, 10).map((c: any, idx: number) => (
                                          <div key={idx} className="flex justify-between py-0.5 border-b border-slate-700/50">
                                            <span>{c.payeeType}</span>
                                            <span>{c.amount} {c.currency}</span>
                                            <span className="text-slate-500">{c.status}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    
                                    {/* 结算记录详情 */}
                                    {executionResult.type === 'settlements' && executionResult.data?.settlements && (
                                      <div className="mt-2 p-2 bg-slate-800/50 rounded max-h-32 overflow-y-auto">
                                        <div className="font-medium mb-1">结算记录:</div>
                                        {executionResult.data.settlements.length === 0 ? (
                                          <div className="text-slate-500">暂无结算记录</div>
                                        ) : executionResult.data.settlements.slice(0, 10).map((s: any, idx: number) => (
                                          <div key={idx} className="flex justify-between py-0.5 border-b border-slate-700/50">
                                            <span>{s.payeeType}</span>
                                            <span>{s.amount} {s.currency}</span>
                                            <span className="text-slate-500">{s.status}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    
                                    {/* 外部同步详情 */}
                                    {executionResult.type === 'sync_external' && executionResult.data && (
                                      <div className="mt-2 p-2 bg-slate-800/50 rounded">
                                        <div>MCP 端点: <span className="text-indigo-400 break-all">{executionResult.data.mcpEndpoint}</span></div>
                                        <div>OAuth 发现: <span className="text-indigo-400">{executionResult.data.oauthDiscovery}</span></div>
                                        <div className="mt-1 font-medium">已发布 Skill ({executionResult.data.total}):</div>
                                        {executionResult.data.skills?.slice(0, 5).map((s: any, idx: number) => (
                                          <div key={idx} className="py-0.5">{s.name} ({s.status})</div>
                                        ))}
                                        {executionResult.data.total === 0 && <div className="text-slate-500">暂无已发布 Skill，请先发布</div>}
                                      </div>
                                    )}
                                  </div>
                                )}
                                
                                {/* 推广链接结果 */}
                                {executionResult.type === 'referral_link' && executionResult.data && (
                                  <div className="mt-2 p-2 bg-indigo-900/30 rounded border border-indigo-500/20">
                                    <div className="font-medium mb-1 text-indigo-300">🔗 推广链接</div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <code className="bg-slate-800 px-2 py-0.5 rounded text-[10px] text-green-300 break-all flex-1">{executionResult.data.shortUrl || executionResult.data.url}</code>
                                      <button onClick={() => {
                                        navigator.clipboard.writeText(executionResult.data.shortUrl || executionResult.data.url);
                                      }} className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300">
                                        <Copy className="w-3 h-3" />
                                      </button>
                                    </div>
                                    {executionResult.data.commissionRate && (
                                      <div className="text-[10px] text-slate-400 mt-1">佣金比例: {executionResult.data.commissionRate}% · 分享此链接，购买者下单后你将获得佣金</div>
                                    )}
                                    <div className="text-[9px] text-slate-500 mt-1">💡 可将链接生成二维码用于线下推广</div>
                                  </div>
                                )}
                                
                                {/* 操作链接 */}
                                {executionResult.link && (
                                  <a href={executionResult.link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300">
                                    <ExternalLink className="w-3 h-3" />
                                    <span>查看详情</span>
                                  </a>
                                )}
                                
                                {/* 30秒撤回 */}
                                {executionResult.canRevoke && revokeCountdown !== null && (
                                  <div className="mt-3 p-2 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2 text-yellow-300">
                                        <Clock className="w-4 h-4" />
                                        <span>{revokeCountdown}s 内可撤回</span>
                                      </div>
                                      <button
                                        onClick={handleRevoke}
                                        disabled={isExecuting}
                                        className="px-2 py-1 text-xs rounded bg-yellow-600 hover:bg-yellow-500 text-white"
                                      >
                                        撤回操作
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {category.id === 'dashboard' && (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="text-slate-400 font-medium">🗓️ Commerce 实时概览</div>
                              <button onClick={() => handleCommerceSubmit('dashboard_refresh')} className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                                <Loader2 className={`w-3 h-3 ${isExecuting ? 'animate-spin' : ''}`} /> 刷新数据
                              </button>
                            </div>
                            
                            {/* 数据卡片 */}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="p-2 bg-slate-900/50 rounded-lg border border-slate-800">
                                <div className="text-[10px] text-slate-500 uppercase">累计总收益</div>
                                <div className="text-lg font-bold text-slate-200 mt-1">$ 1,284.50</div>
                                <div className="text-[9px] text-green-500 mt-1">↑ 12% vs last month</div>
                              </div>
                              <div className="p-2 bg-slate-900/50 rounded-lg border border-slate-800">
                                <div className="text-[10px] text-slate-500 uppercase">处理中订单</div>
                                <div className="text-lg font-bold text-slate-200 mt-1">7</div>
                                <div className="text-[9px] text-indigo-400 mt-1">3 待发货 / 4 待确认</div>
                              </div>
                            </div>

                            {/* 核心待办 */}
                            <div className="bg-slate-900/40 rounded-lg border border-slate-800 overflow-hidden">
                              <div className="bg-slate-800/50 px-2 py-1.5 flex items-center justify-between">
                                <span className="text-[10px] font-medium text-slate-300 flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-orange-400" /> 待处理里程碑 (Critical)
                                </span>
                                <span className="px-1.5 py-0.25 rounded-full bg-orange-500/20 text-orange-400 text-[8px] border border-orange-500/30">3 Urgent</span>
                              </div>
                              <div className="divide-y divide-slate-800/80">
                                {[
                                  { id: 'ms-01', title: '智能合约 V1 代码交付', pool: 'Dev Pool', amount: '500 USDC', time: '2h ago' },
                                  { id: 'ms-02', title: 'UI 设计稿终审', pool: 'Design Pool', amount: '200 USDC', time: '1d ago' },
                                  { id: 'ms-03', title: '文案翻译包 (CN)', pool: 'Content Pool', amount: '50 USDC', time: '3d ago' },
                                ].map((item) => (
                                  <div key={item.id} className="p-2 hover:bg-slate-800/40 transition-colors flex items-center justify-between group">
                                    <div>
                                      <div className="text-[11px] text-slate-200 font-medium">{item.title}</div>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[9px] text-slate-500 uppercase tracking-tighter">Pool: {item.pool}</span>
                                        <span className="text-[9px] text-indigo-400 font-mono">{item.amount}</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button onClick={() => {
                                        updateCommerceForm('collabAction', 'milestone');
                                        updateCommerceForm('milestoneSubAction', 'approve');
                                        updateCommerceForm('milestoneId', item.id);
                                      }} className="p-1 rounded bg-green-500/10 hover:bg-green-500/20 text-green-500 opacity-0 group-hover:opacity-100 transition-all">
                                        <Check className="w-3 h-3" />
                                      </button>
                                      <span className="text-[9px] text-slate-600 font-mono">{item.time}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* 快速链接 */}
                            <div className="grid grid-cols-2 gap-2">
                              <button onClick={() => updateCommerceForm('collabAction', 'split')} className="p-2 bg-slate-900/30 border border-slate-800 rounded-md flex flex-col items-center gap-1 hover:bg-slate-800 transition-all text-slate-400 hover:text-indigo-400">
                                <Plus className="w-4 h-4" />
                                <span className="text-[9px]">新建分账方案</span>
                              </button>
                              <button onClick={() => updateCommerceForm('commissionAction', 'settlements')} className="p-2 bg-slate-900/30 border border-slate-800 rounded-md flex flex-col items-center gap-1 hover:bg-slate-800 transition-all text-slate-400 hover:text-indigo-400">
                                <LayoutDashboard className="w-4 h-4" />
                                <span className="text-[9px]">财务结算对账</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {category.id === 'pay_exchange' && (
                          <>
                            <div className="text-slate-400 font-medium mb-2">💰 收付款与兑换</div>
                            <select value={commerceForm.payExchangeAction} onChange={(e) => updateCommerceForm('payExchangeAction', e.target.value)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200">
                              <option value="payment">发起支付</option>
                              <option value="receive">生成收款码</option>
                              <option value="query">查询订单/支付状态</option>
                              <option value="onramp">法币入金（On-ramp）</option>
                              <option value="offramp">加密资产出金（Off-ramp）</option>
                              <option value="rate">汇率查询</option>
                            </select>
                            
                            {commerceForm.payExchangeAction === 'payment' && (
                              <>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <input value={commerceForm.amount} onChange={(e) => updateCommerceForm('amount', e.target.value)} placeholder="金额 *" className={`bg-slate-950/70 border ${formErrors.amount ? 'border-red-500' : 'border-slate-800'} rounded-md px-2 py-1 text-slate-200 placeholder-slate-500 w-full`} />
                                    {formErrors.amount && <span className="text-[10px] text-red-400">{formErrors.amount}</span>}
                                  </div>
                                  <input value={commerceForm.currency} onChange={(e) => updateCommerceForm('currency', e.target.value)} placeholder="币种" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500" />
                                </div>
                                <input value={commerceForm.counterparty} onChange={(e) => updateCommerceForm('counterparty', e.target.value)} placeholder="收款方" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                <button type="button" onClick={() => setShowOptionalFields(prev => !prev)} className="text-[10px] text-indigo-400 hover:text-indigo-300">
                                  {showOptionalFields ? '▼ 收起可选字段' : '▶ 展开可选字段'}
                                </button>
                                {showOptionalFields && (
                                  <div className="space-y-2 pl-2 border-l-2 border-slate-700">
                                    <input value={commerceForm.orderDescription} onChange={(e) => updateCommerceForm('orderDescription', e.target.value)} placeholder="订单描述（可选）" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                    <input value={commerceForm.callbackUrl} onChange={(e) => updateCommerceForm('callbackUrl', e.target.value)} placeholder="回调URL（可选）" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                    
                                    {/* 实物商品收货控制 */}
                                    <div className="pt-1 border-t border-slate-800 mt-1">
                                      <div className="text-[10px] text-slate-400 mb-1 flex items-center justify-between">
                                        <span>📦 实物收货信息 (可选)</span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <input value={commerceForm.shippingName} onChange={(e) => updateCommerceForm('shippingName', e.target.value)} placeholder="收货人姓名" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-0.5 text-[10px] text-slate-200 placeholder-slate-500" />
                                        <input value={commerceForm.shippingPhone} onChange={(e) => updateCommerceForm('shippingPhone', e.target.value)} placeholder="联系电话" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-0.5 text-[10px] text-slate-200 placeholder-slate-500" />
                                      </div>
                                      <input value={commerceForm.shippingAddress} onChange={(e) => updateCommerceForm('shippingAddress', e.target.value)} placeholder="详细收货地址" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-0.5 w-full text-[10px] text-slate-200 placeholder-slate-500 mt-1" />
                                    </div>
                                  </div>
                                )}
                                <button onClick={() => handleCommerceSubmit('payment')} disabled={!!formErrors.amount || isExecuting} className={`mt-2 w-fit px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${formErrors.amount || isExecuting ? 'bg-slate-600 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500'} text-white`}>
                                  {isExecuting ? <><Loader2 className="w-3 h-3 animate-spin" /> 执行中...</> : '创建支付意图'}
                                </button>
                              </>
                            )}
                            
                            {commerceForm.payExchangeAction === 'receive' && (
                              <>
                                <div className="grid grid-cols-2 gap-2">
                                  <input value={commerceForm.amount} onChange={(e) => updateCommerceForm('amount', e.target.value)} placeholder="金额（可选，不填为自由金额）" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500" />
                                  <input value={commerceForm.currency} onChange={(e) => updateCommerceForm('currency', e.target.value)} placeholder="币种" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500" />
                                </div>
                                <input value={commerceForm.receiveDescription} onChange={(e) => updateCommerceForm('receiveDescription', e.target.value)} placeholder="收款描述（可选）" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                <button onClick={() => handleCommerceSubmit('receive')} disabled={isExecuting} className={`mt-2 w-fit px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${isExecuting ? 'bg-slate-600 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500'} text-white`}>
                                  {isExecuting ? <><Loader2 className="w-3 h-3 animate-spin" /> 执行中...</> : '生成收款码'}
                                </button>
                              </>
                            )}
                            
                            {commerceForm.payExchangeAction === 'query' && (
                              <>
                                <input value={commerceForm.queryOrderId} onChange={(e) => updateCommerceForm('queryOrderId', e.target.value)} placeholder="订单/支付ID（留空查全部）" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                <button onClick={() => handleCommerceSubmit('query')} disabled={isExecuting} className={`mt-2 w-fit px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${isExecuting ? 'bg-slate-600 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500'} text-white`}>
                                  {isExecuting ? <><Loader2 className="w-3 h-3 animate-spin" /> 执行中...</> : '查询状态'}
                                </button>
                              </>
                            )}
                            
                            {(commerceForm.payExchangeAction === 'onramp') && (
                              <>
                                <div className="grid grid-cols-2 gap-2">
                                  <input value={commerceForm.fiatAmount} onChange={(e) => updateCommerceForm('fiatAmount', e.target.value)} placeholder="金额 *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500" />
                                  <input value={commerceForm.fiatCurrency} onChange={(e) => updateCommerceForm('fiatCurrency', e.target.value)} placeholder="法币币种 (USD)" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500" />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <input value={commerceForm.cryptoCurrency} onChange={(e) => updateCommerceForm('cryptoCurrency', e.target.value)} placeholder="目标加密币种 (USDC)" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500" />
                                  <select value={commerceForm.onrampNetwork} onChange={(e) => updateCommerceForm('onrampNetwork', e.target.value)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 text-xs">
                                    <option value="polygon">Polygon</option>
                                    <option value="ethereum">Ethereum</option>
                                    <option value="base">Base</option>
                                    <option value="arbitrum">Arbitrum</option>
                                    <option value="optimism">Optimism</option>
                                    <option value="solana">Solana</option>
                                  </select>
                                </div>
                                <input value={commerceForm.onrampWalletAddress} onChange={(e) => updateCommerceForm('onrampWalletAddress', e.target.value)} placeholder="钱包地址（可选，留空使用默认）" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                <div className="p-1.5 bg-slate-900/50 rounded border border-slate-800/50 text-[10px] text-slate-400 space-y-0.5">
                                  <div>📋 费用说明:</div>
                                  <div>· Transak 服务费: ~1-5%（根据支付方式）</div>
                                  <div>· 平台手续费: 0.1%</div>
                                  {commerceForm.fiatAmount && <div className="text-slate-300">· 预估平台费: ~{(Number(commerceForm.fiatAmount) * 0.001).toFixed(2)} {commerceForm.fiatCurrency}</div>}
                                </div>
                                <button onClick={() => handleCommerceSubmit('onramp')} disabled={isExecuting} className={`mt-2 w-fit px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${isExecuting ? 'bg-slate-600 cursor-not-allowed' : 'bg-green-600/80 hover:bg-green-500'} text-white`}>
                                  {isExecuting ? <><Loader2 className="w-3 h-3 animate-spin" /> 执行中...</> : '💵 开始入金'}
                                </button>
                              </>
                            )}
                            
                            {(commerceForm.payExchangeAction === 'offramp') && (
                              <>
                                <div className="grid grid-cols-2 gap-2">
                                  <input value={commerceForm.fiatAmount} onChange={(e) => updateCommerceForm('fiatAmount', e.target.value)} placeholder="出金金额 *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500" />
                                  <input value={commerceForm.cryptoCurrency} onChange={(e) => updateCommerceForm('cryptoCurrency', e.target.value)} placeholder="加密币种 (USDC)" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500" />
                                </div>
                                <select value={commerceForm.offrampTargetCurrency} onChange={(e) => updateCommerceForm('offrampTargetCurrency', e.target.value)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 text-xs">
                                  <option value="USD">USD 美元</option>
                                  <option value="EUR">EUR 欧元</option>
                                  <option value="GBP">GBP 英镑</option>
                                  <option value="JPY">JPY 日元</option>
                                  <option value="CNY">CNY 人民币（需转为USD）</option>
                                </select>
                                <input value={commerceForm.offrampBankAccount} onChange={(e) => updateCommerceForm('offrampBankAccount', e.target.value)} placeholder="银行账户/收款信息（可选）" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                <div className="p-1.5 bg-slate-900/50 rounded border border-slate-800/50 text-[10px] text-slate-400 space-y-0.5">
                                  <div>📋 费用说明:</div>
                                  <div>· Transak 服务费: ~1-5%（根据出金方式）</div>
                                  <div>· 平台手续费: 0.1%</div>
                                  {commerceForm.fiatAmount && <div className="text-slate-300">· 预估平台费: ~{(Number(commerceForm.fiatAmount) * 0.001).toFixed(4)} {commerceForm.cryptoCurrency}</div>}
                                  {commerceForm.fiatAmount && <div className="text-orange-300">· 预估到账: ~{(Number(commerceForm.fiatAmount) * 0.94).toFixed(2)} {commerceForm.offrampTargetCurrency}</div>}
                                </div>
                                <button onClick={() => handleCommerceSubmit('offramp')} disabled={isExecuting} className={`mt-2 w-fit px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${isExecuting ? 'bg-slate-600 cursor-not-allowed' : 'bg-orange-600/80 hover:bg-orange-500'} text-white`}>
                                  {isExecuting ? <><Loader2 className="w-3 h-3 animate-spin" /> 执行中...</> : '💱 出金预览'}
                                </button>
                              </>
                            )}
                            
                            {commerceForm.payExchangeAction === 'rate' && (
                              <>
                                <div className="grid grid-cols-2 gap-2">
                                  <input value={commerceForm.fiatCurrency} onChange={(e) => updateCommerceForm('fiatCurrency', e.target.value)} placeholder="源币种 (如 USD)" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500" />
                                  <input value={commerceForm.cryptoCurrency} onChange={(e) => updateCommerceForm('cryptoCurrency', e.target.value)} placeholder="目标币种 (如 USDC)" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500" />
                                </div>
                                <button onClick={() => handleCommerceSubmit('rate')} disabled={isExecuting} className={`mt-2 w-fit px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${isExecuting ? 'bg-slate-600 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500'} text-white`}>
                                  {isExecuting ? <><Loader2 className="w-3 h-3 animate-spin" /> 执行中...</> : '查询汇率'}
                                </button>
                              </>
                            )}
                          </>
                        )}
                        
                        {category.id === 'collab' && (
                          <>
                            <div className="text-slate-400 font-medium mb-2">👥 协作分账</div>
                            <select value={commerceForm.collabAction} onChange={(e) => updateCommerceForm('collabAction', e.target.value as any)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200">
                              <option value="split">创建分账方案</option>
                              <option value="referral_link">🔗 分佣推广链接</option>
                              <option value="split_list">查看分账方案</option>
                              <option value="split_template">获取默认模板</option>
                              <option value="budget">管理预算池</option>
                              <option value="milestone">里程碑管理</option>
                              <option value="collaboration">协作全景</option>
                            </select>
                            {commerceForm.collabAction === 'split' && (
                              <>
                                <div className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">⚡ 场景化模板（一键填充）</div>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {[
                                    { id: 'ecommerce', label: '🛒 电商分销', desc: '商家85%+推广10%+平台5%', productType: 'physical' as const, rules: [
                                      { recipient: 'executor', shareBps: 8500, role: 'executor' as const, source: 'pool' as const, active: true, recipientAddress: '' },
                                      { recipient: 'referrer', shareBps: 1000, role: 'referrer' as const, source: 'pool' as const, active: true, recipientAddress: '' },
                                      { recipient: 'platform', shareBps: 500, role: 'promoter' as const, source: 'platform' as const, active: true, recipientAddress: '' },
                                    ]},
                                    { id: 'saas', label: '💻 SaaS/Skill', desc: '开发70%+推荐20%+平台10%', productType: 'skill' as const, rules: [
                                      { recipient: 'executor', shareBps: 7000, role: 'executor' as const, source: 'pool' as const, active: true, recipientAddress: '' },
                                      { recipient: 'referrer', shareBps: 2000, role: 'referrer' as const, source: 'pool' as const, active: true, recipientAddress: '' },
                                      { recipient: 'platform', shareBps: 1000, role: 'promoter' as const, source: 'platform' as const, active: true, recipientAddress: '' },
                                    ]},
                                    { id: 'affiliate', label: '🔗 分佣联盟', desc: 'L1=7%+L2=3%+商家85%+平台5%', productType: 'service' as const, rules: [
                                      { recipient: 'executor', shareBps: 8500, role: 'executor' as const, source: 'pool' as const, active: true, recipientAddress: '' },
                                      { recipient: 'referrer', shareBps: 700, role: 'l1' as const, source: 'pool' as const, active: true, recipientAddress: '' },
                                      { recipient: 'promoter', shareBps: 300, role: 'l2' as const, source: 'pool' as const, active: true, recipientAddress: '' },
                                      { recipient: 'platform', shareBps: 500, role: 'promoter' as const, source: 'platform' as const, active: true, recipientAddress: '' },
                                    ]},
                                    { id: 'agent_task', label: '🤖 Agent任务', desc: '执行70%+推荐人15%+平台15%', productType: 'agent_task' as const, rules: [
                                      { recipient: 'executor', shareBps: 7000, role: 'executor' as const, source: 'pool' as const, active: true, recipientAddress: '' },
                                      { recipient: 'referrer', shareBps: 1500, role: 'referrer' as const, source: 'pool' as const, active: true, recipientAddress: '' },
                                      { recipient: 'platform', shareBps: 1500, role: 'promoter' as const, source: 'platform' as const, active: true, recipientAddress: '' },
                                    ]},
                                  ].map(preset => (
                                    <button key={preset.id} onClick={() => {
                                      setCommerceForm(prev => ({ ...prev, splitScenePreset: preset.id, splitProductType: preset.productType, splitRules: preset.rules, planName: prev.planName || preset.label.replace(/^[^\s]+\s/, '') }));
                                    }} className={`p-1.5 rounded border text-left transition-all ${commerceForm.splitScenePreset === preset.id ? 'border-indigo-500 bg-indigo-900/20' : 'border-slate-800 bg-slate-900/30 hover:border-slate-600'}`}>
                                      <div className="text-[11px] font-medium text-slate-200">{preset.label}</div>
                                      <div className="text-[9px] text-slate-500">{preset.desc}</div>
                                    </button>
                                  ))}
                                </div>
                                <input value={commerceForm.planName} onChange={(e) => updateCommerceForm('planName', e.target.value)} placeholder="方案名称 *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                <select value={commerceForm.splitProductType} onChange={(e) => updateCommerceForm('splitProductType', e.target.value as any)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 text-xs">
                                  <option value="physical">实物商品 (physical)</option>
                                  <option value="service">服务 (service)</option>
                                  <option value="virtual">虚拟商品 (virtual)</option>
                                  <option value="nft">NFT</option>
                                  <option value="skill">Skill</option>
                                  <option value="agent_task">Agent 任务</option>
                                </select>
                                <div className="text-[10px] text-slate-400 font-medium mt-1 uppercase tracking-tight">分账规则配置 (%)</div>
                                <div className="space-y-1 mt-1">
                                  {commerceForm.splitRules.map((rule, idx) => (
                                    <div key={idx} className="p-1.5 bg-slate-900/30 rounded border border-slate-800/50 space-y-1.5 grayscale-[0.5] hover:grayscale-0 transition-all">
                                      <div className="grid grid-cols-4 gap-1 items-center">
                                        <select value={rule.role} onChange={(e) => {
                                          const newRules = [...commerceForm.splitRules];
                                          newRules[idx] = { ...newRules[idx], role: e.target.value as any, recipient: e.target.value };
                                          setCommerceForm(prev => ({ ...prev, splitRules: newRules }));
                                        }} className="bg-slate-950/70 border border-slate-800 rounded-md px-1 py-0.5 text-slate-200 text-[10px]">
                                          <option value="executor">执行端</option>
                                          <option value="referrer">推荐端</option>
                                          <option value="promoter">推广者</option>
                                          <option value="l1">L1上级</option>
                                          <option value="l2">L2上级</option>
                                          <option value="platform">基础奖励</option>
                                          <option value="custom">自定义</option>
                                        </select>
                                        <div className="relative">
                                          <input value={(rule.shareBps / 100).toString()} onChange={(e) => {
                                            const val = e.target.value === '' ? 0 : Number(e.target.value);
                                            const newRules = [...commerceForm.splitRules];
                                            newRules[idx] = { ...newRules[idx], shareBps: Math.min(100, Math.max(0, val)) * 100 };
                                            setCommerceForm(prev => ({ ...prev, splitRules: newRules }));
                                          }} placeholder="%" className="bg-slate-950/70 border border-slate-800 rounded-md px-1 py-0.5 text-slate-200 placeholder-slate-500 text-[10px] w-full" />
                                          <span className="absolute right-1.5 top-0.5 text-[8px] text-slate-500">%</span>
                                        </div>
                                        <select value={rule.source} onChange={(e) => {
                                          const newRules = [...commerceForm.splitRules];
                                          newRules[idx] = { ...newRules[idx], source: e.target.value as any };
                                          setCommerceForm(prev => ({ ...prev, splitRules: newRules }));
                                        }} className="bg-slate-950/70 border border-slate-800 rounded-md px-1 py-0.5 text-slate-200 text-[10px]">
                                          <option value="pool">从池子出</option>
                                          <option value="platform">平台承担</option>
                                          <option value="merchant">商家让利</option>
                                        </select>
                                        <button onClick={() => {
                                          const newRules = commerceForm.splitRules.filter((_, i) => i !== idx);
                                          setCommerceForm(prev => ({ ...prev, splitRules: newRules }));
                                        }} className="text-red-400 hover:text-red-300 text-[10px] flex justify-center">
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <input 
                                        value={rule.recipientAddress || ''} 
                                        onChange={(e) => {
                                          const newRules = [...commerceForm.splitRules];
                                          newRules[idx] = { ...newRules[idx], recipientAddress: e.target.value };
                                          setCommerceForm(prev => ({ ...prev, splitRules: newRules }));
                                        }} 
                                        placeholder="接收钱包地址 (0x... / EVM / Solana)" 
                                        className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-0.5 w-full text-slate-300 placeholder-slate-600 text-[9px]" 
                                      />
                                    </div>
                                  ))}
                                </div>
                                <div className="flex justify-between items-center mt-1">
                                  <button onClick={() => {
                                    setCommerceForm(prev => ({ ...prev, splitRules: [...prev.splitRules, { recipient: 'custom', shareBps: 1000, role: 'custom' as any, source: 'pool' as any, active: true, recipientAddress: '' }] }));
                                  }} className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                                    <Plus className="w-3 h-3" /> 添加参与节点
                                  </button>
                                  <div className={`text-[9px] font-mono ${commerceForm.splitRules.reduce((sum, r) => sum + r.shareBps, 0) === 10000 ? 'text-green-500' : 'text-slate-500'}`}>
                                    合计：{commerceForm.splitRules.reduce((sum, r) => sum + r.shareBps, 0) / 100}%
                                  </div>
                                </div>
                                <button onClick={() => handleCommerceSubmit('split')} disabled={isExecuting} className={`mt-2 w-fit px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${isExecuting ? 'bg-slate-600 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500'} text-white`}>
                                  {isExecuting ? <><Loader2 className="w-3 h-3 animate-spin" /> 执行中...</> : '创建分账方案'}
                                </button>
                              </>
                            )}
                            {commerceForm.collabAction === 'split_list' && (
                              <>
                                <div className="text-[10px] text-slate-500">查看所有已创建的分账方案</div>
                                <button onClick={() => handleCommerceSubmit('split_list')} disabled={isExecuting} className={`mt-2 w-fit px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${isExecuting ? 'bg-slate-600 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500'} text-white`}>
                                  {isExecuting ? <><Loader2 className="w-3 h-3 animate-spin" /> 执行中...</> : '📋 查看方案列表'}
                                </button>
                              </>
                            )}
                            {commerceForm.collabAction === 'split_template' && (
                              <>
                                <select value={commerceForm.splitProductType} onChange={(e) => updateCommerceForm('splitProductType', e.target.value as any)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 text-xs">
                                  <option value="physical">实物商品</option>
                                  <option value="service">服务</option>
                                  <option value="virtual">虚拟商品</option>
                                  <option value="nft">NFT</option>
                                  <option value="skill">Skill</option>
                                  <option value="agent_task">Agent 任务</option>
                                </select>
                                <button onClick={() => handleCommerceSubmit('split_template')} disabled={isExecuting} className={`mt-2 w-fit px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${isExecuting ? 'bg-slate-600 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500'} text-white`}>
                                  {isExecuting ? <><Loader2 className="w-3 h-3 animate-spin" /> 执行中...</> : '📄 获取模板'}
                                </button>
                              </>
                            )}
                            {commerceForm.collabAction === 'budget' && (
                              <>
                                <select value={commerceForm.budgetSubAction} onChange={(e) => updateCommerceForm('budgetSubAction', e.target.value)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 text-xs">
                                  <option value="create">创建预算池</option>
                                  <option value="fund">注资预算池</option>
                                  <option value="stats">查看预算池统计</option>
                                  <option value="list">查看所有预算池</option>
                                </select>
                                {commerceForm.budgetSubAction === 'create' && (
                                  <>
                                    <input value={commerceForm.budgetPoolName} onChange={(e) => updateCommerceForm('budgetPoolName', e.target.value)} placeholder="预算池名称" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <input value={commerceForm.budgetAmount} onChange={(e) => updateCommerceForm('budgetAmount', e.target.value)} placeholder="总预算 *" className={`bg-slate-950/70 border ${formErrors.budgetAmount ? 'border-red-500' : 'border-slate-800'} rounded-md px-2 py-1 text-slate-200 placeholder-slate-500 w-full`} />
                                        {formErrors.budgetAmount && <span className="text-[10px] text-red-400">{formErrors.budgetAmount}</span>}
                                      </div>
                                      <input value={commerceForm.currency} onChange={(e) => updateCommerceForm('currency', e.target.value)} placeholder="币种 (USDC)" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500" />
                                    </div>
                                    <input value={commerceForm.budgetSplitPlanId} onChange={(e) => updateCommerceForm('budgetSplitPlanId', e.target.value)} placeholder="分账方案ID（可选）" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                    <input value={commerceForm.budgetDeadline} onChange={(e) => updateCommerceForm('budgetDeadline', e.target.value)} placeholder="截止日期 YYYY-MM-DD（可选）" className={`bg-slate-950/70 border ${formErrors.budgetDeadline ? 'border-red-500' : 'border-slate-800'} rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500`} />
                                    {formErrors.budgetDeadline && <span className="text-[10px] text-red-400">{formErrors.budgetDeadline}</span>}
                                  </>
                                )}
                                {commerceForm.budgetSubAction === 'fund' && (
                                  <>
                                    <input value={commerceForm.budgetPoolIdForAction} onChange={(e) => updateCommerceForm('budgetPoolIdForAction', e.target.value)} placeholder="预算池ID *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                    <div className="grid grid-cols-2 gap-2">
                                      <input value={commerceForm.budgetFundAmount} onChange={(e) => updateCommerceForm('budgetFundAmount', e.target.value)} placeholder="注资金额 *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500" />
                                      <select value={commerceForm.budgetFundSource} onChange={(e) => updateCommerceForm('budgetFundSource', e.target.value as any)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 text-xs">
                                        <option value="wallet">钱包</option>
                                        <option value="payment">支付</option>
                                        <option value="credit">信用</option>
                                      </select>
                                    </div>
                                    <input value={commerceForm.budgetFundWallet} onChange={(e) => updateCommerceForm('budgetFundWallet', e.target.value)} placeholder="钱包地址（可选）" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                  </>
                                )}
                                {(commerceForm.budgetSubAction === 'stats') && (
                                  <input value={commerceForm.budgetPoolIdForAction} onChange={(e) => updateCommerceForm('budgetPoolIdForAction', e.target.value)} placeholder="预算池ID *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                )}
                                <button onClick={() => handleCommerceSubmit('budget')} disabled={isExecuting} className={`mt-2 w-fit px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${isExecuting ? 'bg-slate-600 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500'} text-white`}>
                                  {isExecuting ? <><Loader2 className="w-3 h-3 animate-spin" /> 执行中...</> : commerceForm.budgetSubAction === 'create' ? '创建预算池' : commerceForm.budgetSubAction === 'fund' ? '💰 注资' : commerceForm.budgetSubAction === 'stats' ? '📊 查看统计' : '📋 查看列表'}
                                </button>
                              </>
                            )}
                            {commerceForm.collabAction === 'milestone' && (
                              <>
                                <select value={commerceForm.milestoneSubAction} onChange={(e) => updateCommerceForm('milestoneSubAction', e.target.value)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 text-xs">
                                  <option value="create">创建里程碑</option>
                                  <option value="list">查看里程碑列表</option>
                                  <option value="start">▶️ 开始执行</option>
                                  <option value="submit">📤 提交交付</option>
                                  <option value="approve">✅ 审批通过</option>
                                  <option value="reject">❌ 驳回</option>
                                  <option value="release">💰 释放资金</option>
                                </select>
                                {commerceForm.milestoneSubAction === 'create' && (
                                  <>
                                    <input value={commerceForm.poolId} onChange={(e) => updateCommerceForm('poolId', e.target.value)} placeholder="预算池ID *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                    <input value={commerceForm.milestoneTitle} onChange={(e) => updateCommerceForm('milestoneTitle', e.target.value)} placeholder="里程碑标题 *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                    <div className="grid grid-cols-2 gap-2">
                                      <input value={commerceForm.milestoneReservedAmount} onChange={(e) => updateCommerceForm('milestoneReservedAmount', e.target.value)} placeholder="预留金额 *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500" />
                                      <select value={commerceForm.milestoneApprovalType} onChange={(e) => updateCommerceForm('milestoneApprovalType', e.target.value as any)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 text-xs">
                                        <option value="manual">手动审批</option>
                                        <option value="auto">自动通过</option>
                                        <option value="quality_gate">质量门控</option>
                                      </select>
                                    </div>
                                    <input value={commerceForm.milestoneDueDate} onChange={(e) => updateCommerceForm('milestoneDueDate', e.target.value)} placeholder="截止日期 YYYY-MM-DD（可选）" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                  </>
                                )}
                                {commerceForm.milestoneSubAction === 'list' && (
                                  <input value={commerceForm.poolId} onChange={(e) => updateCommerceForm('poolId', e.target.value)} placeholder="预算池ID *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                )}
                                {(commerceForm.milestoneSubAction === 'start' || commerceForm.milestoneSubAction === 'release') && (
                                  <input value={commerceForm.milestoneId} onChange={(e) => updateCommerceForm('milestoneId', e.target.value)} placeholder="里程碑ID *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                )}
                                {commerceForm.milestoneSubAction === 'submit' && (
                                  <>
                                    <input value={commerceForm.milestoneId} onChange={(e) => updateCommerceForm('milestoneId', e.target.value)} placeholder="里程碑ID *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                    <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-tight">交付凭证配置</div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <select value={commerceForm.milestoneArtifactType} onChange={(e) => updateCommerceForm('milestoneArtifactType', e.target.value as any)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 text-xs">
                                        <option value="document">文档 (Doc)</option>
                                        <option value="code">代码 (Code)</option>
                                        <option value="design">设计 (Design)</option>
                                        <option value="report">报告 (Report)</option>
                                        <option value="other">其他 (Other)</option>
                                      </select>
                                      <button 
                                        type="button" 
                                        className="flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md py-1 text-[10px] text-slate-300 transition-colors"
                                        onClick={() => {
                                          const input = document.createElement('input');
                                          input.type = 'file';
                                          input.onchange = (e: any) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                              // 模拟上传逻辑
                                              updateCommerceForm('milestoneArtifactUrl', `ipfs://Qm...${file.name.slice(0, 5)}`);
                                              updateCommerceForm('milestoneArtifactDesc', `已上传: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
                                            }
                                          };
                                          input.click();
                                        }}
                                      >
                                        <FileUp className="w-3 h-3" /> 上传文件
                                      </button>
                                    </div>
                                    <input value={commerceForm.milestoneArtifactUrl} onChange={(e) => updateCommerceForm('milestoneArtifactUrl', e.target.value)} placeholder="交付物 URL 或 IPFS Hash" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                    <input value={commerceForm.milestoneArtifactDesc} onChange={(e) => updateCommerceForm('milestoneArtifactDesc', e.target.value)} placeholder="交付物描述 (如: 源码仓库地址)" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                    <div className="relative">
                                      <textarea value={commerceForm.milestoneReviewNote} onChange={(e) => updateCommerceForm('milestoneReviewNote', e.target.value)} placeholder="提交备注 (可选)..." rows={2} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500 resize-none" />
                                      <div className="absolute right-2 bottom-2">
                                        <Info className="w-3 h-3 text-slate-600 hover:text-slate-400 cursor-help" />
                                      </div>
                                    </div>
                                  </>
                                )}
                                {commerceForm.milestoneSubAction === 'approve' && (
                                  <>
                                    <input value={commerceForm.milestoneId} onChange={(e) => updateCommerceForm('milestoneId', e.target.value)} placeholder="里程碑ID *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                    <input value={commerceForm.milestoneReviewNote} onChange={(e) => updateCommerceForm('milestoneReviewNote', e.target.value)} placeholder="审批备注（可选）" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                  </>
                                )}
                                {commerceForm.milestoneSubAction === 'reject' && (
                                  <>
                                    <input value={commerceForm.milestoneId} onChange={(e) => updateCommerceForm('milestoneId', e.target.value)} placeholder="里程碑ID *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                    <input value={commerceForm.milestoneRejectReason} onChange={(e) => updateCommerceForm('milestoneRejectReason', e.target.value)} placeholder="驳回原因 *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                    <input value={commerceForm.milestoneReviewNote} onChange={(e) => updateCommerceForm('milestoneReviewNote', e.target.value)} placeholder="审批备注（可选）" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                  </>
                                )}
                                <button onClick={() => handleCommerceSubmit('milestone')} disabled={isExecuting} className={`mt-2 w-fit px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${isExecuting ? 'bg-slate-600 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500'} text-white`}>
                                  {isExecuting ? <><Loader2 className="w-3 h-3 animate-spin" /> 执行中...</> : {create:'创建里程碑', list:'查看列表', start:'▶️ 开始', submit:'📤 提交', approve:'✅ 通过', reject:'❌ 驳回', release:'💰 释放'}[commerceForm.milestoneSubAction] || '执行'}
                                </button>
                              </>
                            )}
                            {commerceForm.collabAction === 'collaboration' && (
                              <>
                                <input value={commerceForm.poolId} onChange={(e) => updateCommerceForm('poolId', e.target.value)} placeholder="预算池ID *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                <div className="text-[10px] text-slate-500">查看预算池、里程碑、统计完整信息</div>
                                <button onClick={() => handleCommerceSubmit('collaboration')} disabled={isExecuting} className={`mt-2 w-fit px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${isExecuting ? 'bg-slate-600 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500'} text-white`}>
                                  {isExecuting ? <><Loader2 className="w-3 h-3 animate-spin" /> 执行中...</> : '📊 查看协作全景'}
                                </button>
                              </>
                            )}
                            {commerceForm.collabAction === 'referral_link' && (
                              <>
                                <div className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">🔗 生成带分佣的推广链接</div>
                                <select value={commerceForm.referralTargetType} onChange={(e) => updateCommerceForm('referralTargetType', e.target.value)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 text-xs">
                                  <option value="skill">Skill</option>
                                  <option value="task">Task</option>
                                  <option value="product">Product</option>
                                </select>
                                <input value={commerceForm.referralTargetId} onChange={(e) => updateCommerceForm('referralTargetId', e.target.value)} placeholder="目标 ID (Skill/Task/Product ID) *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                <div className="flex items-center gap-2">
                                  <input value={commerceForm.referralCommissionRate} onChange={(e) => updateCommerceForm('referralCommissionRate', e.target.value)} placeholder="佣金比例 (%)" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500 w-20" />
                                  <span className="text-[10px] text-slate-500">% 佣金（推荐人获得）</span>
                                </div>
                                <button onClick={() => handleCommerceSubmit('referral_link')} disabled={isExecuting} className={`mt-2 w-fit px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${isExecuting ? 'bg-slate-600 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500'} text-white`}>
                                  {isExecuting ? <><Loader2 className="w-3 h-3 animate-spin" /> 生成中...</> : '🔗 生成推广链接'}
                                </button>
                              </>
                            )}
                          </>
                        )}
                        
                        {category.id === 'commission' && (
                          <>
                            <div className="text-slate-400 font-medium mb-2">💸 分佣结算</div>
                            <select value={commerceForm.commissionAction} onChange={(e) => updateCommerceForm('commissionAction', e.target.value)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200">
                              <option value="commissions">查看分润记录</option>
                              <option value="settlements">查看结算记录</option>
                              <option value="settlement_execute">执行结算</option>
                              <option value="fees">费用计算/预览</option>
                              <option value="rates">查看费率结构</option>
                            </select>
                            
                            {(commerceForm.commissionAction === 'commissions' || commerceForm.commissionAction === 'settlements') && (
                              <>
                                <div className="text-[10px] text-slate-500">
                                  {commerceForm.commissionAction === 'commissions' ? '将获取您的所有分润记录' : '将获取您的所有结算记录'}
                                </div>
                                <button onClick={() => handleCommerceSubmit(commerceForm.commissionAction)} disabled={isExecuting} className={`mt-2 w-fit px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${isExecuting ? 'bg-slate-600 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500'} text-white`}>
                                  {isExecuting ? <><Loader2 className="w-3 h-3 animate-spin" /> 执行中...</> : '查询记录'}
                                </button>
                              </>
                            )}
                            
                            {commerceForm.commissionAction === 'settlement_execute' && (
                              <>
                                <select value={commerceForm.settlementPayeeType} onChange={(e) => updateCommerceForm('settlementPayeeType', e.target.value)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200">
                                  <option value="merchant">商户结算</option>
                                  <option value="agent">代理结算</option>
                                </select>
                                <input value={commerceForm.currency} onChange={(e) => updateCommerceForm('currency', e.target.value)} placeholder="结算币种" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                <button onClick={() => handleCommerceSubmit('settlement_execute')} disabled={isExecuting} className={`mt-2 w-fit px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${isExecuting ? 'bg-slate-600 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500'} text-white`}>
                                  {isExecuting ? <><Loader2 className="w-3 h-3 animate-spin" /> 执行中...</> : '执行结算'}
                                </button>
                              </>
                            )}
                            
                            {commerceForm.commissionAction === 'fees' && (
                              <>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <input value={commerceForm.amount} onChange={(e) => updateCommerceForm('amount', e.target.value)} placeholder="金额 *" className={`bg-slate-950/70 border ${formErrors.amount ? 'border-red-500' : 'border-slate-800'} rounded-md px-2 py-1 text-slate-200 placeholder-slate-500 w-full`} />
                                    {formErrors.amount && <span className="text-[10px] text-red-400">{formErrors.amount}</span>}
                                  </div>
                                  <select value={commerceForm.splitProductType} onChange={(e) => updateCommerceForm('splitProductType', e.target.value as any)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 text-xs">
                                    <option value="service">服务</option>
                                    <option value="physical">实物</option>
                                    <option value="virtual">虚拟</option>
                                    <option value="nft">NFT</option>
                                    <option value="skill">Skill</option>
                                    <option value="agent_task">Agent任务</option>
                                  </select>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <label className="flex items-center gap-1 text-[10px] text-slate-400">
                                    <input type="checkbox" checked={commerceForm.paymentType === 'ONRAMP'} onChange={(e) => updateCommerceForm('paymentType', e.target.checked ? 'ONRAMP' : '')} className="w-3 h-3" /> On-ramp
                                  </label>
                                  <label className="flex items-center gap-1 text-[10px] text-slate-400">
                                    <input type="checkbox" checked={commerceForm.paymentType === 'OFFRAMP'} onChange={(e) => updateCommerceForm('paymentType', e.target.checked ? 'OFFRAMP' : '')} className="w-3 h-3" /> Off-ramp
                                  </label>
                                  <label className="flex items-center gap-1 text-[10px] text-slate-400">
                                    <input type="checkbox" checked={commerceForm.paymentType === 'SPLIT'} onChange={(e) => updateCommerceForm('paymentType', e.target.checked ? 'SPLIT' : '')} className="w-3 h-3" /> Split
                                  </label>
                                </div>
                                <button onClick={() => handleCommerceSubmit('fees')} disabled={isExecuting} className={`mt-2 w-fit px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${isExecuting ? 'bg-slate-600 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500'} text-white`}>
                                  {isExecuting ? <><Loader2 className="w-3 h-3 animate-spin" /> 执行中...</> : '💰 计算费用'}
                                </button>
                              </>
                            )}
                            
                            {commerceForm.commissionAction === 'rates' && (
                              <>
                                <div className="text-[10px] text-slate-500">将获取平台默认费率结构</div>
                                <button onClick={() => handleCommerceSubmit('rates')} disabled={isExecuting} className={`mt-2 w-fit px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${isExecuting ? 'bg-slate-600 cursor-not-allowed' : 'bg-indigo-600/80 hover:bg-indigo-500'} text-white`}>
                                  {isExecuting ? <><Loader2 className="w-3 h-3 animate-spin" /> 执行中...</> : '查看费率'}
                                </button>
                              </>
                            )}
                          </>
                        )}
                        
                        {category.id === 'publish' && (
                          <>
                            <div className="text-slate-400 font-medium mb-2 flex justify-between items-center">
                              <span>🚀 发布表单</span>
                              <div className="flex gap-1">
                                {[1, 2, 3].map(s => (
                                  <div key={s} className={`w-2 h-2 rounded-full ${commerceForm.currentStep >= s ? 'bg-indigo-500' : 'bg-slate-700'}`} />
                                ))}
                              </div>
                            </div>
                            
                            {commerceForm.currentStep === 1 && (
                              <div className="space-y-2">
                                <select value={commerceForm.publishType} onChange={(e) => updateCommerceForm('publishType', e.target.value)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200">
                                  <option value="task">发布协作任务</option>
                                  <option value="product">发布商品</option>
                                  <option value="skill">发布 Skill / 数字资产</option>
                                  <option value="sync">同步到外部平台</option>
                                </select>
                                {commerceForm.publishType === 'skill' && (
                                  <div className="p-1.5 bg-indigo-900/20 border border-indigo-500/20 rounded text-[10px] text-indigo-300">
                                    💡 可发布 API 服务、MCP 工具、数据集、模板、插件等数字资产到 Marketplace
                                  </div>
                                )}
                                
                                {commerceForm.publishType !== 'sync' && (
                                  <>
                                    <input value={commerceForm.publishTitle} onChange={(e) => updateCommerceForm('publishTitle', e.target.value)} placeholder="标题 *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                    <textarea value={commerceForm.publishType === 'task' ? commerceForm.publishDescription : commerceForm.publishSkillDescription} onChange={(e) => updateCommerceForm(commerceForm.publishType === 'task' ? 'publishDescription' : 'publishSkillDescription', e.target.value)} placeholder={commerceForm.publishType === 'task' ? '详细描述需求、目标和验收标准...' : '描述功能、使用场景和技术特点...'} rows={3} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500 text-xs resize-none" />
                                  </>
                                )}
                                
                                <div className="flex justify-end gap-2 mt-2">
                                  {commerceForm.publishType === 'sync' ? (
                                    <button onClick={() => handleCommerceSubmit('sync_external')} disabled={isExecuting} className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white flex items-center gap-1">
                                      {isExecuting ? <Loader2 className="w-3 h-3 animate-spin"/> : '🔗 获取同步信息'}
                                    </button>
                                  ) : (
                                    <button onClick={() => updateCommerceForm('currentStep', 2)} className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white">下一步 →</button>
                                  )}
                                </div>
                              </div>
                            )}

                            {commerceForm.currentStep === 2 && (
                              <div className="space-y-2">
                                {commerceForm.publishType === 'task' && (
                                  <>
                                    <div className="grid grid-cols-2 gap-2">
                                      <input value={commerceForm.publishBudget} onChange={(e) => updateCommerceForm('publishBudget', e.target.value)} placeholder="预算(USD) *" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500" />
                                      <select value={commerceForm.publishCategory} onChange={(e) => updateCommerceForm('publishCategory', e.target.value)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 text-xs">
                                        <option value="custom_service">定制服务</option>
                                        <option value="development">开发</option>
                                        <option value="design">设计</option>
                                        <option value="translation">翻译</option>
                                        <option value="content">内容创作</option>
                                        <option value="data">数据标注/采集</option>
                                        <option value="other">其他</option>
                                      </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <input value={commerceForm.publishDeadlineDays} onChange={(e) => updateCommerceForm('publishDeadlineDays', e.target.value)} placeholder="截止天数 (如 14)" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500" />
                                      <input value={commerceForm.publishMaxApplicants} onChange={(e) => updateCommerceForm('publishMaxApplicants', e.target.value)} placeholder="最大申请人数" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500" />
                                    </div>
                                    <input value={commerceForm.publishTags} onChange={(e) => updateCommerceForm('publishTags', e.target.value)} placeholder="标签 (UI设计, React)" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                    <textarea value={commerceForm.publishRequirements} onChange={(e) => updateCommerceForm('publishRequirements', e.target.value)} placeholder="验收标准 / 交付要求（每行一条）" rows={2} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500 text-xs resize-none" />
                                  </>
                                )}
                                
                                {(commerceForm.publishType === 'product' || commerceForm.publishType === 'skill') && (
                                  <>
                                    {commerceForm.publishType === 'skill' && (
                                      <select value={commerceForm.publishDigitalAssetType} onChange={(e) => updateCommerceForm('publishDigitalAssetType', e.target.value)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 text-xs">
                                        <option value="api">API 服务</option>
                                        <option value="mcp_tool">MCP 工具</option>
                                        <option value="dataset">数据集</option>
                                        <option value="template">模板</option>
                                        <option value="plugin">插件</option>
                                        <option value="agent_skill">Agent Skill</option>
                                      </select>
                                    )}
                                    <div className="grid grid-cols-2 gap-2">
                                      <select value={commerceForm.publishPricingType} onChange={(e) => updateCommerceForm('publishPricingType', e.target.value)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 text-xs">
                                        <option value="free">免费</option>
                                        <option value="per_call">按次付费</option>
                                        <option value="subscription">订阅制</option>
                                        <option value="revenue_share">收入分成</option>
                                      </select>
                                      {commerceForm.publishPricingType !== 'free' && (
                                        <input value={commerceForm.publishPrice} onChange={(e) => updateCommerceForm('publishPrice', e.target.value)} placeholder={commerceForm.publishPricingType === 'revenue_share' ? '分成比例(%)' : '价格(USD/次) *'} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500" />
                                      )}
                                    </div>
                                    {commerceForm.publishPricingType !== 'free' && (
                                      <input value={commerceForm.publishFreeQuota} onChange={(e) => updateCommerceForm('publishFreeQuota', e.target.value)} placeholder="免费试用次数 (0=不提供)" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                    )}
                                    <input value={commerceForm.publishSkillTags} onChange={(e) => updateCommerceForm('publishSkillTags', e.target.value)} placeholder="标签 (AI, 工具, 数据)" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500" />
                                  </>
                                )}
                                
                                <div className="flex justify-between gap-2 mt-2">
                                  <button onClick={() => updateCommerceForm('currentStep', 1)} className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700">← 上一步</button>
                                  <button onClick={() => updateCommerceForm('currentStep', 3)} className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white">下一步 →</button>
                                </div>
                              </div>
                            )}

                            {commerceForm.currentStep === 3 && (
                              <div className="space-y-2">
                                <div className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">佣金与分销设置</div>
                                <label className="flex items-center gap-2 text-xs text-slate-300">
                                  <input type="checkbox" checked={commerceForm.publishCommissionEnabled} onChange={(e) => updateCommerceForm('publishCommissionEnabled', e.target.checked)} className="w-3.5 h-3.5 rounded" />
                                  启用分佣推广（推荐人/推广者可获得佣金）
                                </label>
                                {commerceForm.publishCommissionEnabled && (
                                  <div className="p-1.5 bg-slate-900/40 rounded border border-slate-800 space-y-1.5">
                                    <div className="grid grid-cols-3 gap-1.5">
                                      <div>
                                        <div className="text-[9px] text-slate-500 mb-0.5">总佣金率 %</div>
                                        <input value={commerceForm.publishCommissionTotal} onChange={(e) => updateCommerceForm('publishCommissionTotal', e.target.value)} className="bg-slate-950/70 border border-slate-800 rounded px-1.5 py-0.5 text-slate-200 text-[10px] w-full" />
                                      </div>
                                      <div>
                                        <div className="text-[9px] text-slate-500 mb-0.5">L1 推荐 %</div>
                                        <input value={commerceForm.publishCommissionL1} onChange={(e) => updateCommerceForm('publishCommissionL1', e.target.value)} className="bg-slate-950/70 border border-slate-800 rounded px-1.5 py-0.5 text-slate-200 text-[10px] w-full" />
                                      </div>
                                      <div>
                                        <div className="text-[9px] text-slate-500 mb-0.5">L2 推荐 %</div>
                                        <input value={commerceForm.publishCommissionL2} onChange={(e) => updateCommerceForm('publishCommissionL2', e.target.value)} className="bg-slate-950/70 border border-slate-800 rounded px-1.5 py-0.5 text-slate-200 text-[10px] w-full" />
                                      </div>
                                    </div>
                                    <div className="text-[9px] text-slate-500">平台佣金: {Math.max(0, Number(commerceForm.publishCommissionTotal || 0) - Number(commerceForm.publishCommissionL1 || 0) - Number(commerceForm.publishCommissionL2 || 0))}%</div>
                                  </div>
                                )}
                                <div className="grid grid-cols-2 gap-2">
                                  <select value={commerceForm.publishVisibility} onChange={(e) => updateCommerceForm('publishVisibility', e.target.value)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 text-xs">
                                    <option value="public">公开 (Public)</option>
                                    <option value="private">私有 (Private)</option>
                                  </select>
                                  <input value={commerceForm.publishVersion} onChange={(e) => updateCommerceForm('publishVersion', e.target.value)} placeholder="版本 (1.0.0)" className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500" />
                                </div>
                                {commerceForm.publishType === 'skill' && (
                                  <select value={commerceForm.publishExecutorType} onChange={(e) => updateCommerceForm('publishExecutorType', e.target.value)} className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 text-xs">
                                    <option value="internal">内置处理器 (Internal)</option>
                                    <option value="http">HTTP API Endpoint</option>
                                    <option value="mcp">MCP Server</option>
                                  </select>
                                )}
                                <div className="flex justify-between gap-2 mt-2">
                                  <button onClick={() => updateCommerceForm('currentStep', 2)} className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700">← 上一步</button>
                                  <button onClick={() => {
                                    handleCommerceSubmit(
                                      commerceForm.publishType === 'task' ? 'publish_task' : 
                                      commerceForm.publishType === 'product' ? 'publish_product' : 'publish_skill'
                                    );
                                  }} disabled={isExecuting} className={`px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${isExecuting ? 'bg-slate-600' : 'bg-green-600/80 hover:bg-green-500'} text-white`}>
                                    {isExecuting ? <Loader2 className="w-3 h-3 animate-spin"/> : '🚀 确认发布'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
    
    // 旧版扁平结构兼容渲染
    return (
      <div className="mt-3 pt-3 border-t border-neutral-700/50">
        <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900/60 border border-slate-800/60 rounded-xl p-4">
          <div className="text-sm font-semibold text-slate-200 mb-3">commerce 能力分类</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {categories.map((category: any) => (
              <div key={category.id} className="rounded-lg border border-slate-800/60 bg-slate-900/60 p-3 flex flex-col gap-2">
                <div className="text-sm font-medium text-slate-100">{category.title}</div>
                <div className="text-xs text-slate-500">{category.description}</div>
                {category.example && (
                  <button
                    onClick={() => onSendMessage?.(category.example)}
                    className="mt-1 w-fit px-3 py-1.5 text-xs rounded-lg bg-indigo-600/80 text-white hover:bg-indigo-500"
                  >
                    示例触发
                  </button>
                )}
                <button
                  onClick={() => setOpenCommerceForm(prev => (prev === category.id ? null : category.id))}
                  className="w-fit px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  {openCommerceForm === category.id ? '收起表单' : '打开表单'}
                </button>
                {openCommerceForm === category.id && (
                  <div className="mt-2 space-y-2 text-xs text-slate-300">
                    {category.id === 'payment' && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={commerceForm.amount}
                            onChange={(e) => updateCommerceForm('amount', e.target.value)}
                            placeholder="金额"
                            className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500"
                          />
                          <input
                            value={commerceForm.currency}
                            onChange={(e) => updateCommerceForm('currency', e.target.value)}
                            placeholder="币种"
                            className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500"
                          />
                        </div>
                        <input
                          value={commerceForm.counterparty}
                          onChange={(e) => updateCommerceForm('counterparty', e.target.value)}
                          placeholder="收款方"
                          className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500"
                        />
                      </>
                    )}

                    {category.id === 'exchange' && (
                      <>
                        <select
                          value={commerceForm.exchangeType}
                          onChange={(e) => updateCommerceForm('exchangeType', e.target.value)}
                          className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200"
                        >
                          <option value="onramp">法币入金（On-ramp）</option>
                          <option value="offramp">加密资产出金（Off-ramp）</option>
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={commerceForm.fiatAmount}
                            onChange={(e) => updateCommerceForm('fiatAmount', e.target.value)}
                            placeholder="金额"
                            className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500"
                          />
                          {commerceForm.exchangeType === 'offramp' ? (
                            <input
                              value={commerceForm.cryptoCurrency}
                              onChange={(e) => updateCommerceForm('cryptoCurrency', e.target.value)}
                              placeholder="币种"
                              className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500"
                            />
                          ) : (
                            <input
                              value={commerceForm.fiatCurrency}
                              onChange={(e) => updateCommerceForm('fiatCurrency', e.target.value)}
                              placeholder="法币"
                              className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500"
                            />
                          )}
                        </div>
                        {commerceForm.exchangeType === 'offramp' ? (
                          <input
                            value={commerceForm.offrampsTo}
                            onChange={(e) => updateCommerceForm('offrampsTo', e.target.value)}
                            placeholder="到账方式/地址"
                            className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500"
                          />
                        ) : (
                          <input
                            value={commerceForm.cryptoCurrency}
                            onChange={(e) => updateCommerceForm('cryptoCurrency', e.target.value)}
                            placeholder="目标加密币种"
                            className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500"
                          />
                        )}
                      </>
                    )}

                    {category.id === 'split' && (
                      <>
                        <input
                          value={commerceForm.planName}
                          onChange={(e) => updateCommerceForm('planName', e.target.value)}
                          placeholder="方案名称"
                          className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            value={commerceForm.platformShare}
                            onChange={(e) => updateCommerceForm('platformShare', e.target.value)}
                            placeholder="平台%"
                            className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500"
                          />
                          <input
                            value={commerceForm.merchantShare}
                            onChange={(e) => updateCommerceForm('merchantShare', e.target.value)}
                            placeholder="商家%"
                            className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500"
                          />
                          <input
                            value={commerceForm.agentShare}
                            onChange={(e) => updateCommerceForm('agentShare', e.target.value)}
                            placeholder="代理%"
                            className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500"
                          />
                        </div>
                      </>
                    )}

                    {category.id === 'budget' && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={commerceForm.budgetAmount}
                            onChange={(e) => updateCommerceForm('budgetAmount', e.target.value)}
                            placeholder="预算(USDC)"
                            className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500"
                          />
                          <input
                            value={commerceForm.qualityScore}
                            onChange={(e) => updateCommerceForm('qualityScore', e.target.value)}
                            placeholder="质量门槛"
                            className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500"
                          />
                        </div>
                        <input
                          value={commerceForm.budgetDeadline}
                          onChange={(e) => updateCommerceForm('budgetDeadline', e.target.value)}
                          placeholder="截止日期(YYYY-MM-DD)"
                          className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500"
                        />
                      </>
                    )}

                    {category.id === 'milestone' && (
                      <>
                        <input
                          value={commerceForm.poolId}
                          onChange={(e) => updateCommerceForm('poolId', e.target.value)}
                          placeholder="预算池ID"
                          className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={commerceForm.milestoneTitle}
                            onChange={(e) => updateCommerceForm('milestoneTitle', e.target.value)}
                            placeholder="里程碑标题"
                            className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500"
                          />
                          <input
                            value={commerceForm.milestonePercent}
                            onChange={(e) => updateCommerceForm('milestonePercent', e.target.value)}
                            placeholder="占比%"
                            className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500"
                          />
                        </div>
                      </>
                    )}

                    {category.id === 'collaboration' && (
                      <>
                        <input
                          value={commerceForm.poolId}
                          onChange={(e) => updateCommerceForm('poolId', e.target.value)}
                          placeholder="预算池ID"
                          className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500"
                        />
                        <input
                          value={commerceForm.collaborationNote}
                          onChange={(e) => updateCommerceForm('collaborationNote', e.target.value)}
                          placeholder="发放说明"
                          className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500"
                        />
                      </>
                    )}

                    {category.id === 'fees' && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={commerceForm.amount}
                            onChange={(e) => updateCommerceForm('amount', e.target.value)}
                            placeholder="金额"
                            className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500"
                          />
                          <input
                            value={commerceForm.paymentType}
                            onChange={(e) => updateCommerceForm('paymentType', e.target.value)}
                            placeholder="支付方式"
                            className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 text-slate-200 placeholder-slate-500"
                          />
                        </div>
                      </>
                    )}

                    {category.id === 'publish' && (
                      <>
                        <select
                          value={commerceForm.publishType}
                          onChange={(e) => updateCommerceForm('publishType', e.target.value)}
                          className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200"
                        >
                          <option value="task">发布任务</option>
                          <option value="product">发布商品</option>
                          <option value="skill">发布Skill</option>
                        </select>
                        <input
                          value={commerceForm.publishTitle}
                          onChange={(e) => updateCommerceForm('publishTitle', e.target.value)}
                          placeholder="标题"
                          className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500"
                        />
                        {commerceForm.publishType === 'task' ? (
                          <>
                            <textarea
                              value={commerceForm.publishDescription}
                              onChange={(e) => updateCommerceForm('publishDescription', e.target.value)}
                              placeholder="任务描述（详细说明需求、目标和期望）"
                              rows={3}
                              className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500 text-xs resize-none"
                            />
                            <select
                              value={commerceForm.publishCategory}
                              onChange={(e) => updateCommerceForm('publishCategory', e.target.value)}
                              className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 text-xs"
                            >
                              <option value="custom_service">定制服务</option>
                              <option value="development">开发</option>
                              <option value="design">设计</option>
                              <option value="content">内容创作</option>
                              <option value="consultation">咨询</option>
                              <option value="other">其他</option>
                            </select>
                            <input
                              value={commerceForm.publishBudget}
                              onChange={(e) => updateCommerceForm('publishBudget', e.target.value)}
                              placeholder="预算(USD)"
                              className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500"
                            />
                            <input
                              value={commerceForm.publishTags}
                              onChange={(e) => updateCommerceForm('publishTags', e.target.value)}
                              placeholder="标签（逗号分隔，如：UI设计,React）"
                              className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500"
                            />
                          </>
                        ) : (
                          <input
                            value={commerceForm.publishPrice}
                            onChange={(e) => updateCommerceForm('publishPrice', e.target.value)}
                            placeholder="价格(USDC)"
                            className="bg-slate-950/70 border border-slate-800 rounded-md px-2 py-1 w-full text-slate-200 placeholder-slate-500"
                          />
                        )}
                      </>
                    )}

                    <button
                      onClick={() => handleCommerceSubmit(category.id)}
                      className="mt-2 w-fit px-3 py-1.5 text-xs rounded-lg bg-indigo-600/80 text-white hover:bg-indigo-500"
                    >
                      生成并发送
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 购物车展示（支持商品点选和选择性支付）
  // 检查多种可能的购物车标识
  const isCartType = type === 'view_cart' || type === 'cart';
  const hasCartItems = data.cartItems && Array.isArray(data.cartItems) && data.cartItems.length > 0;
  const hasItems = data.items && Array.isArray(data.items) && data.items.length > 0;
  
  // 调试日志
  console.log('🛒 购物车数据检测:', {
    type,
    isCartType,
    hasCartItems,
    hasItems,
    cartItems: data.cartItems,
    items: data.items,
    dataKeys: Object.keys(data),
    fullData: data,
  });
  
  if (isCartType || hasCartItems || (data.items && Array.isArray(data.items))) {
    // 优先使用cartItems，如果没有则尝试从items转换
    let cartItems: CartItem[] = [];
    
    if (data.cartItems && Array.isArray(data.cartItems)) {
      cartItems = data.cartItems;
    } else if (data.items && Array.isArray(data.items)) {
      // 转换items格式为cartItems格式
      cartItems = data.items.map((item: any) => ({
        product: {
          id: item.product?.id || item.productId || '',
          name: item.product?.name || '未知商品',
          description: item.product?.description || '',
          price: item.product?.price || 0,
          currency: item.product?.currency || 'CNY',
          stock: item.product?.stock || 0,
          category: item.product?.category || '',
          metadata: {
            image: item.product?.metadata?.image || item.product?.image || '',
            description: item.product?.description || '',
          },
          merchantId: item.product?.merchantId || '',
        },
        quantity: item.quantity || 1,
      }));
    }
    
    console.log('🛒 准备渲染购物车，商品数量:', cartItems.length, '商品数据:', cartItems);
    
    if (cartItems.length === 0) {
      return (
        <div className="mt-3 pt-3 border-t border-neutral-700/50">
          <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg p-4 text-center">
            <div className="text-4xl mb-2">🛒</div>
            <div className="text-neutral-300">购物车是空的</div>
          </div>
        </div>
      );
    }

    // 验证cartItems格式
    const validCartItems = cartItems.filter(item => {
      const isValid = item && item.product && item.product.id && item.quantity > 0;
      if (!isValid) {
        console.warn('🛒 无效的购物车商品:', item);
      }
      return isValid;
    });

    if (validCartItems.length === 0) {
      console.error('🛒 没有有效的购物车商品，原始数据:', cartItems);
      return (
        <div className="mt-3 pt-3 border-t border-neutral-700/50">
          <div className="bg-gradient-to-r from-red-900/30 to-orange-900/30 rounded-lg p-4 text-center">
            <div className="text-red-400">⚠️ 购物车数据格式错误</div>
            <div className="text-xs text-neutral-400 mt-2">请刷新页面重试</div>
            <details className="mt-2 text-left">
              <summary className="text-xs text-neutral-500 cursor-pointer">查看调试信息</summary>
              <pre className="text-xs mt-2 p-2 bg-black/50 rounded overflow-auto max-h-40">
                {JSON.stringify({ type, data, cartItems }, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    console.log('🛒 渲染SelectableCart组件，有效商品数量:', validCartItems.length);

    return (
      <div className="mt-3 pt-3 border-t border-neutral-700/50">
        <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg p-4">
          {/* 购物车操作状态提示 */}
          {cartUpdateStatus.type && (
            <div className={`mb-3 p-2 rounded text-xs ${
              cartUpdateStatus.type === 'success' 
                ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              {cartUpdateStatus.message}
            </div>
          )}
          <div className="text-xs font-semibold text-blue-400 mb-3 flex items-center gap-2">
            <span>🛒</span>
            <span>购物车 ({validCartItems.length} 件商品)</span>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-4 max-h-[600px] overflow-y-auto">
            <SelectableCart
              items={validCartItems}
              onUpdateQuantity={async (productId, quantity) => {
                // 如果用户已登录，不传递sessionId；如果未登录，传递sessionId
                const cartSessionId = user ? undefined : sessionId;
                console.log('🛒 更新购物车数量:', { productId, quantity, sessionId, userId: user?.id, cartSessionId });
                try {
                  // 验证：未登录用户需要 sessionId
                  if (!user && !sessionId) {
                    console.warn('⚠️ 用户未登录且缺少 sessionId，无法更新购物车');
                    alert('无法更新购物车：缺少会话信息，请刷新页面重试');
                    return;
                  }
                  
                  const result = await cartApi.updateItemQuantity(productId, quantity, cartSessionId);
                  console.log('🛒 更新数量成功:', result);
                  
                  // 直接获取最新购物车数据并更新显示，不发送消息给 Agent
                  try {
                    const updatedCart = await cartApi.getCartWithProducts(cartSessionId);
                    // 转换数据格式为 CartItem[] 格式
                    const cartItems: CartItem[] = (updatedCart.items || []).map((item: any) => ({
                      product: {
                        id: item.product?.id || item.productId || '',
                        name: item.product?.name || '未知商品',
                        description: item.product?.description || '',
                        price: item.product?.price || 0,
                        currency: item.product?.currency || item.product?.metadata?.currency || 'CNY',
                        stock: item.product?.stock || 0,
                        category: item.product?.category || '',
                        metadata: {
                          image: item.product?.metadata?.image || item.product?.image || '',
                          description: item.product?.description || '',
                          currency: item.product?.currency || item.product?.metadata?.currency || 'CNY',
                        },
                        merchantId: item.product?.merchantId || '',
                        commissionRate: item.product?.commissionRate || 0,
                        status: item.product?.status || 'active',
                      },
                      quantity: item.quantity || 1,
                    }));
                    if (onCartUpdate) {
                      onCartUpdate(cartItems);
                    }
                    setCartUpdateStatus({ type: 'success', message: '✅ 数量已更新' });
                    setTimeout(() => {
                      setCartUpdateStatus({ type: null, message: '' });
                    }, 2000);
                  } catch (fetchError) {
                    console.warn('获取更新后的购物车失败，使用回调刷新:', fetchError);
                    // 如果直接获取失败，使用回调（但不发送消息）
                  if (onCartChanged) {
                    onCartChanged();
                  }
                  }
                } catch (error: any) {
                  console.error('❌ 更新购物车数量失败:', error);
                  setCartUpdateStatus({ 
                    type: 'error', 
                    message: `❌ 更新数量失败：${error.message || '请稍后重试'}` 
                  });
                  setTimeout(() => {
                    setCartUpdateStatus({ type: null, message: '' });
                  }, 3000);
                }
              }}
              onRemoveItem={async (productId) => {
                // 如果用户已登录，不传递sessionId；如果未登录，传递sessionId
                const cartSessionId = user ? undefined : sessionId;
                console.log('🛒 移除购物车商品:', { productId, sessionId, userId: user?.id, cartSessionId });
                
                // 验证：未登录用户需要 sessionId
                if (!user && !sessionId) {
                  console.warn('⚠️ 用户未登录且缺少 sessionId，无法移除商品');
                  alert('无法移除商品：缺少会话信息，请刷新页面重试');
                  return;
                }
                
                if (!confirm('确定要从购物车中移除这个商品吗？')) {
                  return;
                }
                
                try {
                  const result = await cartApi.removeItem(productId, cartSessionId);
                  console.log('🛒 移除商品成功:', result);
                  
                  // 直接获取最新购物车数据并更新显示，不发送消息给 Agent
                  try {
                    const updatedCart = await cartApi.getCartWithProducts(cartSessionId);
                    // 转换数据格式为 CartItem[] 格式
                    const cartItems: CartItem[] = (updatedCart.items || []).map((item: any) => ({
                      product: {
                        id: item.product?.id || item.productId || '',
                        name: item.product?.name || '未知商品',
                        description: item.product?.description || '',
                        price: item.product?.price || 0,
                        currency: item.product?.currency || item.product?.metadata?.currency || 'CNY',
                        stock: item.product?.stock || 0,
                        category: item.product?.category || '',
                        metadata: {
                          image: item.product?.metadata?.image || item.product?.image || '',
                          description: item.product?.description || '',
                          currency: item.product?.currency || item.product?.metadata?.currency || 'CNY',
                        },
                        merchantId: item.product?.merchantId || '',
                        commissionRate: item.product?.commissionRate || 0,
                        status: item.product?.status || 'active',
                      },
                      quantity: item.quantity || 1,
                    }));
                    if (onCartUpdate) {
                      onCartUpdate(cartItems);
                    }
                    setCartUpdateStatus({ type: 'success', message: '✅ 商品已移除' });
                    setTimeout(() => {
                      setCartUpdateStatus({ type: null, message: '' });
                    }, 2000);
                  } catch (fetchError) {
                    console.warn('获取更新后的购物车失败，使用回调刷新:', fetchError);
                    // 如果直接获取失败，使用回调（但不发送消息）
                  if (onCartChanged) {
                    onCartChanged();
                  }
                  }
                } catch (error: any) {
                  console.error('❌ 移除商品失败:', error);
                  setCartUpdateStatus({ 
                    type: 'error', 
                    message: `❌ 移除商品失败：${error.message || '请稍后重试'}` 
                  });
                  setTimeout(() => {
                    setCartUpdateStatus({ type: null, message: '' });
                  }, 3000);
                }
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // 费用估算展示
  if (type === 'fee_estimation' && data) {
    return (
      <div className="mt-3 pt-3 border-t border-neutral-700/50">
        <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg p-4 space-y-3">
          <div className="text-xs font-semibold text-blue-400 mb-2 flex items-center gap-2">
            <span>💰</span>
            <span>费用估算结果</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-neutral-400 text-xs mb-1">基础金额</div>
              <div className="text-white font-semibold">
                {data.estimatedFee ? `${(data.totalCost - data.estimatedFee).toFixed(2)}` : '-'} {data.currency || 'USD'}
              </div>
            </div>
            <div>
              <div className="text-neutral-400 text-xs mb-1">手续费</div>
              <div className="text-orange-400 font-semibold">
                {data.estimatedFee ? `${data.estimatedFee.toFixed(2)}` : '-'} {data.currency || 'USD'}
              </div>
            </div>
            <div>
              <div className="text-neutral-400 text-xs mb-1">总成本</div>
              <div className="text-green-400 font-semibold">
                {data.totalCost ? `${data.totalCost.toFixed(2)}` : '-'} {data.currency || 'USD'}
              </div>
            </div>
            <div>
              <div className="text-neutral-400 text-xs mb-1">手续费率</div>
              <div className="text-white font-semibold">
                {data.feeRate ? `${data.feeRate.toFixed(2)}%` : '-'}
              </div>
            </div>
          </div>
          {data.estimatedTime && (
            <div className="text-xs text-neutral-400 mt-2">
              预计到账时间: {data.estimatedTime}秒
            </div>
          )}
        </div>
      </div>
    );
  }

  // 风险评估展示
  if (type === 'risk_assessment' && data) {
    const riskLevel = (data.riskLevel || 'medium') as 'low' | 'medium' | 'high';
    const riskColorMap: Record<'low' | 'medium' | 'high', string> = {
      low: 'text-green-400',
      medium: 'text-yellow-400',
      high: 'text-red-400',
    };
    const riskColor = riskColorMap[riskLevel] || 'text-yellow-400';

    return (
      <div className="mt-3 pt-3 border-t border-neutral-700/50">
        <div className="bg-gradient-to-r from-red-900/30 to-orange-900/30 rounded-lg p-4 space-y-3">
          <div className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-2">
            <span>🛡️</span>
            <span>风险评估结果</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">风险等级</span>
              <span className={`font-semibold ${riskColor}`}>
                {riskLevel === 'low' ? '低风险' : riskLevel === 'high' ? '高风险' : '中风险'}
              </span>
            </div>
            {data.riskScore !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">风险评分</span>
                <span className="text-white font-semibold">{data.riskScore}/100</span>
              </div>
            )}
            {data.recommendations && data.recommendations.length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-neutral-400 mb-2">建议:</div>
                <ul className="space-y-1 text-xs text-neutral-300">
                  {data.recommendations.map((rec: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span>•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // KYC状态展示
  if (type === 'kyc_status' && data) {
    const status = (data.status || 'unverified') as 'verified' | 'pending' | 'unverified';
    const statusTextMap: Record<'verified' | 'pending' | 'unverified', string> = {
      verified: '已认证',
      pending: '审核中',
      unverified: '未认证',
    };
    const statusText = statusTextMap[status] || '未知';

    return (
      <div className="mt-3 pt-3 border-t border-neutral-700/50">
        <div className="bg-gradient-to-r from-green-900/30 to-blue-900/30 rounded-lg p-4">
          <div className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-2">
            <span>✅</span>
            <span>KYC状态</span>
          </div>
          <div className="text-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-400">认证状态</span>
              <span className={`font-semibold ${
                status === 'verified' ? 'text-green-400' : 
                status === 'pending' ? 'text-yellow-400' : 
                'text-red-400'
              }`}>
                {statusText}
              </span>
            </div>
            {data.level && (
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">认证等级</span>
                <span className="text-white font-semibold">{data.level}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 预算管理展示
  if (type === 'budget' && data) {
    return (
      <div className="mt-3 pt-3 border-t border-neutral-700/50">
        <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-lg p-4 space-y-3">
          <div className="text-xs font-semibold text-purple-400 mb-2 flex items-center gap-2">
            <span>📊</span>
            <span>预算信息</span>
          </div>
          <div className="space-y-2 text-sm">
            {data.budgets && data.budgets.map((budget: any, idx: number) => (
              <div key={idx} className="bg-neutral-900/50 rounded p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-neutral-300">{budget.category || '总预算'}</span>
                  <span className="text-white font-semibold">
                    {budget.used || 0} / {budget.limit || 0} {budget.currency || 'USD'}
                  </span>
                </div>
                {budget.limit && (
                  <div className="w-full bg-neutral-800 rounded-full h-1.5 mt-1">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-pink-500 h-1.5 rounded-full transition-all"
                      style={{
                        width: `${Math.min(((budget.used || 0) / budget.limit) * 100, 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 订阅管理展示
  if (type === 'subscriptions' && data) {
    return (
      <div className="mt-3 pt-3 border-t border-neutral-700/50">
        <div className="bg-gradient-to-r from-yellow-900/30 to-orange-900/30 rounded-lg p-4 space-y-3">
          <div className="text-xs font-semibold text-yellow-400 mb-2 flex items-center gap-2">
            <span>🔄</span>
            <span>订阅列表</span>
          </div>
          <div className="space-y-2 text-sm">
            {data.subscriptions && data.subscriptions.length > 0 ? (
              data.subscriptions.map((sub: any, idx: number) => (
                <div key={idx} className="bg-neutral-900/50 rounded p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-300">{sub.name || sub.serviceName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      sub.status === 'active' ? 'bg-green-500/20 text-green-400' : 
                      sub.status === 'cancelled' ? 'bg-red-500/20 text-red-400' : 
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {sub.status === 'active' ? '活跃' : sub.status === 'cancelled' ? '已取消' : '暂停'}
                    </span>
                  </div>
                  {sub.amount && (
                    <div className="text-xs text-neutral-400 mt-1">
                      {sub.amount} {sub.currency || 'USD'} / {sub.interval || '月'}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-xs text-neutral-400">暂无订阅</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 商户功能展示
  if (type === 'merchant' && data) {
    if (data.type === 'multi_chain_balance') {
      return (
        <div className="mt-3 pt-3 border-t border-neutral-700/50">
          <div className="bg-gradient-to-r from-blue-900/30 to-cyan-900/30 rounded-lg p-4 space-y-3">
            <div className="text-xs font-semibold text-blue-400 mb-2 flex items-center gap-2">
              <span>💼</span>
              <span>多链账户余额</span>
            </div>
            <div className="space-y-2 text-sm">
              {data.balances && Object.entries(data.balances).map(([chain, balance]: [string, any]) => (
                <div key={chain} className="bg-neutral-900/50 rounded p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-300 capitalize">{chain}</span>
                    <span className="text-white font-semibold">
                      {balance.total || 0} {balance.currency || 'USD'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
  }

  // 代码展示
  if (type === 'code' && data) {
    return (
      <div className="mt-3 pt-3 border-t border-neutral-700/50">
        <div className="bg-neutral-900/70 rounded-lg p-3 overflow-x-auto">
          <div className="text-xs font-semibold text-green-400 mb-2">💻 代码示例</div>
          <pre className="text-xs text-green-400 font-mono">
            {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  // 商品展示
  // 商品搜索结果展示（无论type是什么，只要data.products存在就展示）
  if (data.products && Array.isArray(data.products) && data.products.length > 0) {
    // 转换商品数据为MultiAssetProduct格式
    const multiAssetProducts: MultiAssetProduct[] = data.products.map((product: any) => ({
      id: product.id || '',
      name: product.name || '',
      description: product.description,
      image: product.image,
      price: product.price || 0,
      currency: product.currency || 'CNY',
      priceDisplay: product.priceDisplay,
      // 资产类型检测：优先使用productType或metadata中的assetType
      assetType: product.productType || product.metadata?.assetType || product.assetType || 'physical',
      stock: product.stock,
      inStock: product.inStock,
      category: product.category,
      merchantId: product.merchantId,
      merchantName: product.merchantName,
      // 区块链相关字段
      tokenAddress: product.tokenAddress || product.metadata?.tokenAddress,
      chainId: product.chainId || product.metadata?.chainId,
      tokenId: product.tokenId || product.metadata?.tokenId,
      // 服务类字段
      duration: product.duration || product.metadata?.duration,
      serviceType: product.serviceType || product.metadata?.serviceType,
      // 评分和销量
      rating: product.rating,
      salesCount: product.salesCount || product.sold,
      // 原始metadata
      metadata: product.metadata,
    }));

    return (
      <div className="mt-3 pt-3 border-t border-neutral-700/50">
        <MultiAssetProductList
          products={multiAssetProducts}
          onAddToCart={(productId, quantity) => handleAddToCart(productId, quantity || 1)}
          onBuyNow={(product) => {
            if (onBuyNow) {
              onBuyNow(product as unknown as ProductInfo);
            } else if (onSendMessage) {
              // 回退方案：通过对话触发
              onSendMessage(`结算商品 ${product.name}`);
            }
          }}
          onViewProduct={(product) => handleViewProduct({
            id: product.id,
            name: product.name,
            description: product.description,
            image: product.image,
            price: product.price,
            currency: product.currency,
            stock: product.stock,
            category: product.category,
            merchantId: product.merchantId,
            metadata: product.metadata,
          })}
          isAddingToCart={isAddingToCart}
          payingProductId={payingProductId}
          maxDisplay={5}
          layout="list"
          showTotal={true}
          totalCount={data.total || data.products.length}
        />
        {/* 商品详情弹窗 */}
        {selectedProduct && (
          <ProductDetailModal
            product={selectedProduct}
            isOpen={isProductModalOpen}
            onClose={() => {
              setIsProductModalOpen(false);
              setSelectedProduct(null);
            }}
            onAddToCart={handleAddToCart}
            sessionId={sessionId}
          />
        )}
      </div>
    );
  }

  // 比价结果展示
  if (type === 'price_comparison' && data.comparison) {
    const { cheapest, mostExpensive, averagePrice, bestValue, priceRange } = data.comparison;
    const products = data.products || [];
    
    return (
      <div className="mt-3 pt-3 border-t border-neutral-700/50">
        <div className="bg-gradient-to-r from-green-900/30 to-blue-900/30 rounded-lg p-4 space-y-4">
          <div className="text-xs font-semibold text-green-400 mb-3 flex items-center gap-2">
            <span>💰</span>
            <span>比价结果（{data.total || products.length || 0}件商品）</span>
          </div>
          
          {/* 比价统计卡片 */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-neutral-900/50 rounded-lg p-3">
              <div className="text-neutral-400 text-xs mb-1">最低价</div>
              <div className="text-green-400 font-semibold text-lg">
                ¥{cheapest?.price?.toFixed(2)} {cheapest?.currency || 'CNY'}
              </div>
              <div className="text-neutral-300 text-xs mt-1 truncate">{cheapest?.name}</div>
            </div>
            
            <div className="bg-neutral-900/50 rounded-lg p-3">
              <div className="text-neutral-400 text-xs mb-1">最高价</div>
              <div className="text-red-400 font-semibold text-lg">
                ¥{mostExpensive?.price?.toFixed(2)} {mostExpensive?.currency || 'CNY'}
              </div>
              <div className="text-neutral-300 text-xs mt-1 truncate">{mostExpensive?.name}</div>
            </div>
            
            <div className="bg-neutral-900/50 rounded-lg p-3">
              <div className="text-neutral-400 text-xs mb-1">平均价格</div>
              <div className="text-blue-400 font-semibold text-lg">
                ¥{averagePrice?.toFixed(2)} {cheapest?.currency || 'CNY'}
              </div>
            </div>
            
            <div className="bg-neutral-900/50 rounded-lg p-3">
              <div className="text-neutral-400 text-xs mb-1">最佳性价比</div>
              <div className="text-yellow-400 font-semibold text-lg">
                ¥{bestValue?.price?.toFixed(2)} {bestValue?.currency || 'CNY'}
              </div>
              <div className="text-neutral-300 text-xs mt-1 truncate">{bestValue?.name}</div>
            </div>
          </div>
          
          {priceRange && (
            <div className="bg-neutral-900/50 rounded-lg p-3 text-sm">
              <div className="text-neutral-400 text-xs mb-1">价格差异</div>
              <div className="text-white font-semibold">
                ¥{priceRange.difference?.toFixed(2)} {cheapest?.currency || 'CNY'}
              </div>
              <div className="text-neutral-400 text-xs mt-1">
                价格范围: ¥{priceRange.min?.toFixed(2)} - ¥{priceRange.max?.toFixed(2)}
              </div>
            </div>
          )}

          {/* 商品列表展示 */}
          {products && products.length > 0 && (
            <div className="mt-4 pt-4 border-t border-neutral-700/50">
              <div className="text-xs font-semibold text-blue-400 mb-3 flex items-center gap-2">
                <span>📋</span>
                <span>参与比价的商品列表</span>
              </div>
              <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto">
                {products.slice(0, 10).map((product: any, idx: number) => (
                  <div key={product.id || idx} className="bg-neutral-900/50 rounded-lg p-3 text-sm border border-neutral-800 hover:border-blue-500/50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      {/* 商品图片 */}
                      {product.image && (
                        <div className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-neutral-800">
                          <img 
                            src={product.image} 
                            alt={product.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // 图片加载失败时隐藏
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white mb-1 truncate">{product.name}</div>
                        {product.description && (
                          <div className="text-neutral-400 text-xs mb-2 line-clamp-2">
                            {product.description}
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-green-400 font-semibold">
                            ¥{product.price?.toFixed(2)} {product.currency || 'CNY'}
                          </span>
                          {product.stock !== undefined && (
                            <span className={product.stock > 0 ? 'text-green-400' : 'text-red-400'}>
                              {product.stock > 0 ? '✅ 有货' : '⚠️ 缺货'}
                            </span>
                          )}
                          {product.category && (
                            <span className="text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded">
                              {product.category}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {products.length > 10 && (
                <div className="text-xs text-neutral-400 text-center mt-2">
                  还有 {products.length - 10} 件商品...
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 订单列表展示
  if (type === 'view_orders' && data.orders && Array.isArray(data.orders) && data.orders.length > 0) {
    const getStatusColor = (status: string) => {
      const colors: Record<string, string> = {
        pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        paid: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        completed: 'bg-green-500/20 text-green-400 border-green-500/30',
        cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
        shipped: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      };
      return colors[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    };

    const getStatusText = (status: string) => {
      const texts: Record<string, string> = {
        pending: '待支付',
        paid: '已支付',
        shipped: '已发货',
        completed: '已完成',
        cancelled: '已取消',
      };
      return texts[status] || status;
    };

    const handleCancelOrder = async (orderId: string) => {
      if (!confirm('确定要取消这个订单吗？')) {
        return;
      }
      
      setCancellingOrders(prev => new Set(prev).add(orderId));
      try {
        await orderApi.cancelOrder(orderId);
        // 刷新订单列表
        if (onSendMessage) {
          setTimeout(() => {
            onSendMessage('查看订单');
          }, 300);
        }
      } catch (error: any) {
        console.error('取消订单失败:', error);
        alert(`取消订单失败：${error.message || '请稍后重试'}`);
      } finally {
        setCancellingOrders(prev => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
      }
    };

    return (
      <div className="mt-3 pt-3 border-t border-neutral-700/50">
        <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg p-4">
          <div className="text-xs font-semibold text-blue-400 mb-3 flex items-center gap-2">
            <span>📦</span>
            <span>订单列表（共 {data.total || data.orders.length} 笔）</span>
          </div>
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {data.orders
              .filter((order: any) => order.status !== 'cancelled') // 过滤掉已取消的订单
              .map((order: any, idx: number) => (
              <div
                key={order.id || idx}
                className="bg-neutral-900/50 rounded-lg p-4 border border-neutral-800 hover:border-blue-500/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-white">订单 #{order.id?.slice(0, 8) || idx + 1}</span>
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(order.status)}`}>
                        {getStatusText(order.status)}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-400 mb-2">
                      {new Date(order.createdAt).toLocaleString('zh-CN')}
                    </div>
                    {(order.items && Array.isArray(order.items) && order.items.length > 0) ? (
                      <div className="space-y-2 mt-3">
                        {order.items.map((item: any, itemIdx: number) => (
                          <div key={itemIdx} className="bg-neutral-800/50 rounded p-2 flex items-center justify-between">
                            <div className="flex-1">
                              <div className="text-sm text-white font-medium">{item.productName || item.name || '商品'}</div>
                              {item.productId && (
                                <div className="text-xs text-neutral-400">ID: {item.productId.slice(0, 8)}</div>
                              )}
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-sm font-bold text-white mb-1">
                                <span className="bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded border-2 border-blue-500/30 text-base">
                                  数量: {item.quantity || 1}
                                </span>
                              </div>
                              <div className="text-xs text-neutral-400 mt-1">
                                {order.currency || 'CNY'} {(item.price || 0) * (item.quantity || 1)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-neutral-800/50 rounded p-2 mt-3 flex items-center justify-between">
                        <div className="flex-1">
                          <div className="text-sm text-white font-medium">商品</div>
                          {order.productId && (
                            <div className="text-xs text-neutral-400">ID: {order.productId.slice(0, 8)}</div>
                          )}
                        </div>
                        <div className="text-right ml-4">
                          <div className="text-sm font-bold text-white mb-1">
                            <span className="bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded border-2 border-blue-500/30 text-base">
                              数量: 1
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-700/50">
                  <div className="text-sm">
                    <span className="text-neutral-400">总金额: </span>
                    <span className="text-lg font-bold text-green-400">
                      {order.currency === 'CNY' ? '¥' : order.currency === 'USD' ? '$' : ''}
                      {Number(order.amount || 0).toFixed(2)} {order.currency || 'CNY'}
                    </span>
                  </div>
                  {order.status === 'pending' && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('📦 点击取消订单:', { orderId: order.id });
                        if (order.id) {
                          handleCancelOrder(order.id);
                        }
                      }}
                      disabled={cancellingOrders.has(order.id)}
                      className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer relative z-10"
                      type="button"
                    >
                      {cancellingOrders.has(order.id) ? '取消中...' : '取消订单'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 默认：显示JSON数据（可折叠）
  return (
    <div className="mt-3 pt-3 border-t border-neutral-700/50">
      <details className="text-xs">
        <summary className="cursor-pointer text-blue-400 hover:text-blue-300 mb-2">
          查看详细数据
        </summary>
        <pre className="mt-2 overflow-auto max-h-40 text-neutral-400 bg-neutral-900/50 rounded p-2">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

