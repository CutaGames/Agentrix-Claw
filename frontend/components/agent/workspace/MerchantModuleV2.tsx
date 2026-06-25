import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  TrendingUp, 
  BarChart3, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Activity,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Upload,
  Globe,
  Wallet,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Info,
  ArrowUpRight,
  ArrowDownLeft,
  Shield,
  Zap,
  ChevronRight,
  Bell,
  Code,
  Play,
  FileText,
  PieChart,
  Sparkles,
  CreditCard,
  History,
  Palette,
  Layout,
  Smartphone,
  Users,
  ShoppingBag,
  Calendar,
  DollarSign,
  ArrowRight,
  X,
  Store,
  Share2,
  Key,
  Webhook,
  Settings,
  ShieldCheck,
  PiggyBank,
  Receipt
} from 'lucide-react';
import { L1Tab } from '../../layout/L1TopNav';
import { L2SubItem } from '../../layout/L2LeftSidebar';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { useUser } from '../../../contexts/UserContext';
import { useToast } from '../../../contexts/ToastContext';
import { productApi, type ProductInfo } from '../../../lib/api/product.api';
import { orderApi, type Order } from '../../../lib/api/order.api';
import { commissionApi, type SettlementInfo } from '../../../lib/api/commission.api';
import { analyticsApi } from '../../../lib/api/analytics.api';
import { paymentApi } from '../../../lib/api/payment.api';
import { apiKeyApi, type ApiKey } from '../../../lib/api/api-key.api';
import { webhookApi, type WebhookConfig } from '../../../lib/api/webhook.api';
import { mpcWalletApi, type MPCWallet } from '../../../lib/api/mpc-wallet.api';
import { PromotionPanel } from '../PromotionPanel';
import { EcommerceSyncPanel } from './merchant/EcommerceSyncPanel';
import { ProductListPanel } from './merchant/ProductListPanel';
import { UnifiedPublishingPanel } from './UnifiedPublishingPanel';
import { StripeConnectPanel } from './merchant/StripeConnectPanel';
import { SplitPlansPanel, BudgetPoolsPanel } from './commerce';

interface MerchantModuleV2Props {
  activeL1?: Extract<L1Tab, 'dashboard' | 'products' | 'orders' | 'finance' | 'analytics' | 'settings'>;
  activeL2?: L2SubItem;
  onCommand?: (command: string, data?: any) => void;
}

type MerchantOrder = Order & { description?: string }

const defaultL2: Record<string, L2SubItem> = {
  dashboard: 'overview',
  products: 'list',
  orders: 'all-orders',
  finance: 'overview',
  analytics: 'sales',
  settings: 'general'
};

const PRODUCT_CATEGORIES = [
  { id: 'physical', label: { zh: '实物商品', en: 'Physical Goods' }, commission: 3 },
  { id: 'service', label: { zh: '生活服务', en: 'Services' }, commission: 5 },
  { id: 'virtual', label: { zh: '虚拟资产', en: 'Virtual Assets' }, commission: 3 },
  { id: 'nft-rwa', label: { zh: 'NFT / RWA', en: 'NFT / RWA' }, commission: 2.5 },
  { id: 'dev-tool', label: { zh: '开发者工具/插件', en: 'Developer Tool/Plugin' }, commission: 20 },
  { id: 'subscription', label: { zh: '订阅服务', en: 'Subscriptions' }, commission: 3 },
  { id: 'other', label: { zh: '其他', en: 'Others' }, commission: 3 }
];

const PRODUCT_TYPES = [
  { id: 'physical', label: { zh: '实物商品', en: 'Physical' } },
  { id: 'service', label: { zh: '服务', en: 'Service' } },
  { id: 'nft', label: { zh: 'NFT', en: 'NFT' } },
  { id: 'ft', label: { zh: '同质化代币', en: 'Fungible Token' } },
  { id: 'game_asset', label: { zh: '游戏资产', en: 'Game Asset' } },
  { id: 'rwa', label: { zh: '真实世界资产', en: 'RWA' } },
  { id: 'x402_skill', label: { zh: 'X402 技能', en: 'X402 Skill' } },
  { id: 'x402_metered', label: { zh: 'X402 计量资源', en: 'X402 Metered' } },
];

export const MerchantModuleV2: React.FC<MerchantModuleV2Props> = ({ activeL1, activeL2, onCommand }) => {
  const { t } = useLocalization();
  const { user, registerRole } = useUser();
  const { success, error: showError } = useToast();

  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<MerchantOrder | null>(null);
  const [settlement, setSettlement] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isTestingPayment, setIsTestingPayment] = useState(false);

  // API Keys & Webhooks
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  
  // MPC Wallet
  const [mpcWallet, setMpcWallet] = useState<MPCWallet | null>(null);
  const [mpcLoading, setMpcLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Ecommerce
  const [connections, setConnections] = useState<any[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [showAddConnectionModal, setShowAddConnectionModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [connectionFormData, setConnectionFormData] = useState<Record<string, string>>({
    storeName: '',
    storeUrl: '',
    apiKey: '',
    apiSecret: '',
    consumerKey: '',
    consumerSecret: '',
    accessToken: '',
    storeHash: '',
    clientId: '',
    apiEndpoint: '',
  });

  const defaultProductForm = {
    name: '',
    description: '',
    price: 0,
    stock: 0,
    category: '',
    productType: 'physical' as const,
    currency: 'USD',
    commissionRate: 5,
    image: '',
    skillDescription: '', // V3.0: 技能描述帮紝供 Agent 理解
    parameters: '', // V3.0: 技能参数帮紝JSON 格式
    // X402 涓撳睘瀛楁
    billingMode: 'one_time' as 'one_time' | 'per_use' | 'metered',
    pricingUnit: 'request' as 'request' | 'token' | 'minute',
    unitPrice: 0,
    executionEndpoint: '', // API 鍥炶皟鍦板潃
  };

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductInfo | null>(null);
  const [productForm, setProductForm] = useState(defaultProductForm);
  const [productSubmitting, setProductSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const currentL1 = activeL1 || 'dashboard';
  const currentL2 = activeL2 || defaultL2[currentL1] || 'overview';

  // Data Fetching
  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await productApi.getProducts();
      setProducts(data || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await orderApi.getOrders();
      setOrders(data || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const loadSettlement = useCallback(async () => {
    try {
      const data = await commissionApi.getSettlements();
      setSettlement(data && data.length > 0 ? data[0] : null);
    } catch (err: any) {
      console.error('Failed to load settlement:', err);
    }
  }, []);

  const loadApiKeys = useCallback(async () => {
    try {
      const data = await apiKeyApi.list();
      setApiKeys(data || []);
    } catch (err) {
      console.error('Failed to load API keys:', err);
    }
  }, []);

  const loadWebhooks = useCallback(async () => {
    try {
      const data = await webhookApi.getWebhooks();
      setWebhooks(data || []);
    } catch (err) {
      console.error('Failed to load webhooks:', err);
    }
  }, []);

  const loadMpcWallet = useCallback(async () => {
    try {
      setMpcLoading(true);
      const data = await mpcWalletApi.getMyWallet();
      setMpcWallet(data);
    } catch (err) {
      console.error('Failed to load MPC wallet:', err);
    } finally {
      setMpcLoading(false);
    }
  }, []);

  const loadConnections = useCallback(async () => {
    try {
      const data = await productApi.getEcommerceConnections();
      setConnections(data || []);
    } catch (err) {
      console.error('Failed to load ecommerce connections:', err);
    }
  }, []);

  // Handlers
  const handleCreateConnection = async () => {
    if (!selectedPlatform) return;
    try {
      const credentials: Record<string, string> = {};
      const platformFields: Record<string, string[]> = {
        shopify: ['apiKey', 'apiSecret', 'storeDomain'],
        woocommerce: ['consumerKey', 'consumerSecret', 'storeUrl'],
        taobao: ['apiKey', 'apiSecret'],
        jd: ['apiKey', 'apiSecret'],
      };
      const fields = platformFields[selectedPlatform] || [];
      fields.forEach(f => { if (connectionFormData[f]) credentials[f] = connectionFormData[f]; });

      await productApi.createEcommerceConnection({
        platform: selectedPlatform as any,
        storeName: connectionFormData.storeName,
        storeUrl: connectionFormData.storeUrl,
        credentials,
      });
      success(t({ zh: '连接创建成功', en: 'Connection created' }));
      setShowAddConnectionModal(false);
      loadConnections();
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleSync = async (id: string) => {
    try {
      setSyncingId(id);
      await productApi.syncEcommerceConnection(id);
      success(t({ zh: '同步成功', en: 'Sync successful' }));
      loadProducts();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setSyncingId(null);
    }
  };

  const handleSaveProduct = async () => {
    try {
      setProductSubmitting(true);
      
      // 将 skill 相关字段移到 metadata 中，避免 DTO 验证错误
      const { 
        skillDescription, 
        parameters, 
        billingMode, 
        pricingUnit, 
        unitPrice, 
        executionEndpoint,
        ...baseFields 
      } = productForm;
      
      const productData = {
        ...baseFields,
        metadata: {
          ...(editingProduct?.metadata || {}),
          skillDescription,
          parameters,
          billingMode,
          pricingUnit,
          unitPrice,
          executionEndpoint,
          currency: productForm.currency,
          image: productForm.image,
        },
      };
      
      if (editingProduct) {
        await productApi.updateProduct(editingProduct.id, productData);
        success(t({ zh: '商品已更新', en: 'Product updated' }));
      } else {
        await productApi.createProduct(productData as any);
        success(t({ zh: '商品已创建', en: 'Product created' }));
      }
      setProductModalOpen(false);
      loadProducts();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setProductSubmitting(false);
    }
  };

  const handleBatchImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const text = event.target?.result as string;
          const lines = text.split('\n').filter(l => l.trim());
          if (lines.length < 2) {
            showError(t({ zh: 'CSV 格式错误或数据为空', en: 'CSV format error or empty data' }));
            return;
          }
          const headers = lines[0].split(',').map(h => h.trim());
          const productsData = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim());
            const obj: any = {};
            headers.forEach((h, i) => {
              if (h === 'price' || h === 'stock' || h === 'commissionRate') {
                obj[h] = Number(values[i]) || 0;
              } else {
                obj[h] = values[i];
              }
            });

            // 自动根据品类纠正佣金比例
            const category = obj.category?.toLowerCase();
            const catConfig = PRODUCT_CATEGORIES.find(c => c.id === category);
            if (catConfig) {
              obj.commissionRate = catConfig.commission;
            } else if (!obj.commissionRate) {
              obj.commissionRate = 10; // 默认值?
            }

            return obj;
          });

          const res = await productApi.batchImport({ products: productsData });
          success(t({ 
            zh: `成功导入 ${res.success} 个商品`, 
            en: `Successfully imported ${res.success} products` 
          }));
          loadProducts();
          if (res.errors && res.errors.length > 0) {
            console.warn('Import warnings:', res.errors);
          }
        } catch (err: any) {
          showError(err.message || 'Parse error');
        }
      };
      reader.readAsText(file);
    } catch (err: any) {
      showError(err.message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const downloadTemplate = () => {
    const headers = 'name,category,price,stock,commissionRate,description,image\n';
    const sample = 'Sample Product,software,9.99,100,15,A great digital product,https://example.com/image.png\n';
    const blob = new Blob([headers + sample], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', 'agentrix_product_template.csv');
    a.click();
    success(t({ zh: '模板已开始下载', en: 'Template download started' }));
  };

  const handleLaunchTestPayment = async () => {
    try {
      setIsTestingPayment(true);
      const res = await paymentApi.createIntent({
        amount: 10,
        currency: 'USDC',
        paymentMethod: 'x402' as any,
        description: 'Agentrix Integration Test Payment',
      });
      if ((res as any).checkoutUrl) {
        window.open((res as any).checkoutUrl, '_blank');
      }
    } catch (err: any) {
      showError(err.message);
    } finally {
      setIsTestingPayment(false);
    }
  };

  useEffect(() => {
    if (currentL1 === 'products') loadProducts();
    if (currentL1 === 'orders') loadOrders();
    if (currentL1 === 'finance') {
      loadSettlement();
      loadMpcWallet();
    }
    if (currentL1 === 'settings') {
      loadApiKeys();
      loadWebhooks();
    }
    if (currentL1 === 'dashboard') {
      loadProducts();
      loadOrders();
      loadSettlement();
    }
    if (currentL2 === 'ecommerce-sync') {
      loadConnections();
    }
  }, [currentL1, currentL2, loadProducts, loadOrders, loadSettlement, loadApiKeys, loadWebhooks, loadMpcWallet, loadConnections]);

  // CopyableCommand component for SDK commands
  const CopyableCommand = ({ command }: { command: string }) => {
    const [copied, setCopied] = useState(false);
    
    const handleCopyCommand = async () => {
      try {
        await navigator.clipboard.writeText(command);
        setCopied(true);
        success(t({ zh: '已复制到剪贴板', en: 'Copied to clipboard' }));
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        showError(t({ zh: '复制失败', en: 'Copy failed' }));
      }
    };
    
    return (
      <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 rounded-lg px-3 py-2 group">
        <code className="flex-1 text-sm text-blue-300 font-mono truncate">{command}</code>
        <button
          onClick={handleCopyCommand}
          className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
          title={t({ zh: '复制', en: 'Copy' })}
        >
          {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
        </button>
      </div>
    );
  };

  const sectionTitle = (title: string, desc?: string) => (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
        {desc && <p className="text-sm text-slate-400 mt-1">{desc}</p>}
      </div>
    </div>
  );

  const statCard = (label: string, value: string, accent: string) => (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
      <p className="text-sm text-slate-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
    </div>
  );

  const renderDashboard = () => {
    if (currentL2 === 'revenue') {
      return (
        <div className="space-y-6">
          {sectionTitle(t({ zh: '收入统计', en: 'Revenue Stats' }))}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {statCard(t({ zh: '今日 GMV', en: 'Today GMV' }), `$${settlement?.todayGmv || '0.00'}`, 'text-green-400')}
            {statCard(t({ zh: '本月 GMV', en: 'Monthly GMV' }), `$${settlement?.monthlyGmv || '0.00'}`, 'text-blue-400')}
            {statCard(t({ zh: '待结算', en: 'Pending' }), `$${settlement?.pendingAmount || '0.00'}`, 'text-amber-300')}
          </div>
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
            <p className="text-slate-300 text-sm">{t({ zh: '收入趋势图预留区域', en: 'Revenue trend chart placeholder' })}</p>
          </div>
        </div>
      );
    }

    if (currentL2 === 'ai-traffic') {
      return (
        <div className="space-y-6">
          {sectionTitle(t({ zh: 'AI 流量', en: 'AI Traffic' }), t({ zh: '监控 Agent 调用来源与转化', en: 'Monitor Agent sources and conversion' }))}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {statCard(t({ zh: '过去24h 调用', en: '24h Calls' }), '1,248', 'text-blue-400')}
            {statCard(t({ zh: '平均转化率', en: 'Avg. Conversion' }), '12.4%', 'text-green-400')}
          </div>
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
            <p className="text-slate-300 text-sm">{t({ zh: '渠道分布与热门技能调用占位', en: 'Channel distribution and hot skills placeholder' })}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {sectionTitle(t({ zh: '今日概览', en: 'Today Overview' }), t({ zh: '商品即技能，数据实时同步', en: 'Product as Skill, real-time sync' }))}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {statCard(t({ zh: '商品总数', en: 'Total Products' }), products.length.toString(), 'text-blue-400')}
          {statCard(t({ zh: '待处理订单', en: 'Pending Orders' }), orders.filter(o => o.status === 'pending').length.toString(), 'text-orange-300')}
          {statCard(t({ zh: '今日GMV', en: 'Today GMV' }), `$${settlement?.todayGmv || '0.00'}`, 'text-green-400')}
          {statCard(t({ zh: 'AI 访问量', en: 'AI Visits' }), '3,210', 'text-purple-300')}
        </div>
        <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl p-5">
          <h3 className="text-lg font-semibold text-white mb-2">💡 {t({ zh: '商品即技能（Product as Skill）', en: 'Product as Skill' })}</h3>
          <p className="text-slate-200 text-sm">{t({ zh: '自动生成可调用技能，让 Agent 理解并推荐你的商品，零开发上线。', en: 'Automatically generate callable skills, let Agents understand and recommend your products.' })}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <Play size={18} className="text-blue-400" />
              {t({ zh: '商品上架入门', en: 'Product Listing Guide' })}
            </h3>
            <div className="space-y-4">
              {[
                { step: 1, title: { zh: '添加商品', en: 'Add Product' }, desc: { zh: '填写商品基本信息与分类', en: 'Fill in basic info and category' } },
                { step: 2, title: { zh: '进入 AI 市场', en: 'Marketplace Entry' }, desc: { zh: '系统自动生成 Agent 技能，无需手动配置', en: 'System auto-generates skills for Agents' } },
                { step: 3, title: { zh: '获取订单', en: 'Receive Orders' }, desc: { zh: 'Agent 即可在对话中发现并推荐', en: 'Agents will discover and recommend' } },
              ].map((item) => (
                <div key={item.step} className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">
                    {item.step}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{t(item.title)}</p>
                    <p className="text-xs text-slate-500">{t(item.desc)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <Zap size={18} className="text-amber-400" />
              {t({ zh: '商家增长引导', en: 'Merchant Growth' })}
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              {t({ 
                zh: '更快上新与同步，让商品进入 AI 市场。', 
                en: 'Accelerate listing and sync to enter AI marketplace.' 
              })}
            </p>
            <div className="space-y-3">
              <button
                onClick={() => onCommand?.('navigate', { l1: 'products', l2: 'batch-import' })}
                className="w-full flex items-center justify-between px-4 py-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/20 rounded-xl text-blue-200 text-sm font-semibold"
              >
                <span>{t({ zh: '批量上传商品（CSV）', en: 'Bulk Upload (CSV)' })}</span>
                <ArrowRight size={16} />
              </button>
              <button
                onClick={() => onCommand?.('navigate', { l1: 'products', l2: 'ecommerce-sync' })}
                className="w-full flex items-center justify-between px-4 py-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/20 rounded-xl text-emerald-200 text-sm font-semibold"
              >
                <span>{t({ zh: '一键同步其他店铺', en: 'Sync Existing Store' })}</span>
                <ArrowRight size={16} />
              </button>
              <button
                onClick={() => onCommand?.('navigate', { l1: 'products', l2: 'add-new' })}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-700/40 hover:bg-slate-700/60 border border-white/10 rounded-xl text-slate-200 text-sm font-semibold"
              >
                <span>{t({ zh: '创建首个商品', en: 'Create First Product' })}</span>
                <ArrowRight size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-4">
              {t({ zh: '建议：先同步存量商品，再用 AI 自动生成技能描述。', en: 'Tip: sync existing catalog first, then let AI auto-generate skills.' })}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderProducts = () => {
    switch (currentL2) {
      case 'add-new':
        return (
          <div className="space-y-4">
            {sectionTitle(editingProduct ? t({ zh: '编辑商品', en: 'Edit Product' }) : t({ zh: '添加商品', en: 'Add Product' }))}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Name</label>
                  <input 
                    type="text" 
                    value={productForm.name}
                    onChange={e => setProductForm({...productForm, name: e.target.value})}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Category</label>
                  <select 
                    value={productForm.category}
                    onChange={e => {
                      const cat = PRODUCT_CATEGORIES.find(c => c.id === e.target.value);
                      setProductForm({
                        ...productForm, 
                        category: e.target.value,
                        commissionRate: cat ? cat.commission : productForm.commissionRate
                      });
                    }}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500"
                  >
                    <option value="">{t({ zh: '选择分类', en: 'Select Category' })}</option>
                    {PRODUCT_CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>{t(cat.label)} ({cat.commission}%)</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Price</label>
                  <input 
                    type="number" 
                    value={productForm.price}
                    onChange={e => setProductForm({...productForm, price: Number(e.target.value)})}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Currency</label>
                  <select 
                    value={productForm.currency}
                    onChange={e => setProductForm({...productForm, currency: e.target.value})}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500"
                  >
                    <option value="USD">USD</option>
                    <option value="USDC">USDC</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="CNY">CNY</option>
                    <option value="INR">INR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Commission Rate (%)</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={productForm.commissionRate}
                      readOnly
                      className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-4 py-2 text-slate-400 outline-none cursor-not-allowed" 
                    />
                    <div className="absolute top-full left-0 mt-1 text-[10px] text-slate-500">
                      {t({ zh: '佣金比例由品类决定，不可手动修改', en: 'Commission rate is determined by category and cannot be manually changed' })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Stock Field */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">{t({ zh: '库存数量', en: 'Stock Quantity' })}</label>
                <input 
                  type="number" 
                  value={productForm.stock}
                  onChange={e => setProductForm({...productForm, stock: Number(e.target.value)})}
                  min={0}
                  placeholder={t({ zh: '输入库存数量', en: 'Enter stock quantity' })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500" 
                />
                <p className="text-[10px] text-slate-500 mt-1">{t({ zh: '设置商品库存数量，0 表示无限或不跟踪库存', en: 'Set product stock quantity, 0 means unlimited or not tracking' })}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Image</label>
                <div className="flex gap-4">
                  <div className="flex-1 space-y-2">
                    <input 
                      type="text" 
                      value={productForm.image}
                      onChange={e => setProductForm({...productForm, image: e.target.value})}
                      placeholder="https://example.com/image.png"
                      className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500" 
                    />
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded border border-white/5 transition-colors flex items-center gap-2">
                        <Upload size={12} />
                        {t({ zh: '上传图片', en: 'Upload Image' })}
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const formData = new FormData();
                              formData.append('file', file);
                              const res = await fetch('/api/upload/image', {
                                method: 'POST',
                                body: formData,
                                headers: {
                                  'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                                }
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setProductForm({...productForm, image: data.url});
                                success(t({ zh: '图片上传成功', en: 'Image uploaded' }));
                              } else {
                                showError('Upload failed');
                              }
                            } catch (err: any) {
                              showError(err.message);
                            }
                          }}
                        />
                      </label>
                      <span className="text-[10px] text-slate-500">Support JPG, PNG, GIF. Max 2MB.</span>
                    </div>
                  </div>
                  {productForm.image && (
                    <div className="w-20 h-20 rounded-lg border border-white/10 overflow-hidden bg-black/20 flex items-center justify-center shrink-0">
                      <img src={productForm.image} alt="Preview" className="max-w-full max-h-full object-contain" />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Description</label>
                <textarea 
                  value={productForm.description}
                  onChange={e => setProductForm({...productForm, description: e.target.value})}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500 h-24" 
                />
              </div>

              {/* X402 技能配置潰鏉?- 浠呭綋閫夋嫨 X402 绫诲瀷鏃舵樉绀?*/}
              {(productForm.category === 'x402-skill' || productForm.category === 'x402-metered') && (
                <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl space-y-4">
                  <div className="flex items-center gap-2 text-purple-400 mb-2">
                    <Zap size={16} />
                    <span className="text-sm font-bold uppercase tracking-wider">{t({ zh: 'X402 技能配置', en: 'X402 Skill Configuration' })}</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{t({ zh: '计费模式', en: 'Billing Mode' })}</label>
                      <select 
                        value={productForm.billingMode}
                        onChange={e => setProductForm({...productForm, billingMode: e.target.value as any})}
                        className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-purple-500"
                      >
                        <option value="one_time">{t({ zh: '一次性付费', en: 'One-time' })}</option>
                        <option value="per_use">{t({ zh: '按次付费', en: 'Pay-per-use' })}</option>
                        <option value="metered">{t({ zh: '鎸夐噺璁¤垂', en: 'Metered' })}</option>
                      </select>
                    </div>
                    
                    {productForm.billingMode === 'metered' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{t({ zh: '计量单位', en: 'Pricing Unit' })}</label>
                        <select 
                          value={productForm.pricingUnit}
                          onChange={e => setProductForm({...productForm, pricingUnit: e.target.value as any})}
                          className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-purple-500"
                        >
                          <option value="request">{t({ zh: '每次请求', en: 'Per Request' })}</option>
                          <option value="token">{t({ zh: '每千 Tokens', en: 'Per 1K Tokens' })}</option>
                          <option value="minute">{t({ zh: '每分钟', en: 'Per Minute' })}</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{t({ zh: 'API 执行端点 (可选)?', en: 'Execution Endpoint (Optional)' })}</label>
                    <input 
                      type="text" 
                      value={productForm.executionEndpoint}
                      onChange={e => setProductForm({...productForm, executionEndpoint: e.target.value})}
                      placeholder="https://your-api.com/execute"
                      className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-purple-500 text-sm font-mono" 
                    />
                    <p className="text-[10px] text-slate-500 mt-1">{t({ zh: '支付成功后，系统将自动调用此端点执行技能', en: 'After successful payment, system will call this endpoint to execute the skill' })}</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{t({ zh: '技能参数?Schema (JSON)', en: 'Input Schema (JSON)' })}</label>
                    <textarea 
                      value={productForm.parameters}
                      onChange={e => setProductForm({...productForm, parameters: e.target.value})}
                      placeholder='{"text": {"type": "string", "description": "Input text"}, "language": {"type": "string", "enum": ["en", "zh", "ja"]}}'
                      className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-purple-500 h-20 text-sm font-mono" 
                    />
                  </div>
                </div>
              )}

              <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl space-y-4 hidden">
                <div className="flex items-center gap-2 text-blue-400 mb-2">
                  <Sparkles size={16} />
                  <span className="text-sm font-bold uppercase tracking-wider">{t({ zh: 'Agent 技能化配置', en: 'Agent Skill Configuration' })}</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{t({ zh: '技能描述?(供 Agent 理解)', en: 'Skill Description (for Agent)' })}</label>
                  <textarea 
                    value={productForm.skillDescription}
                    onChange={e => setProductForm({...productForm, skillDescription: e.target.value})}
                    placeholder={t({ zh: '例如：氳繖鏄竴涓彲浠ュ府鍔╃敤鎴烽璁㈠叏鐞冮厭搴楃殑鎶€鑳?..', en: 'e.g. This is a skill that helps users book hotels worldwide...' })}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500 h-20 text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{t({ zh: '技能参数?(JSON)', en: 'Skill Parameters (JSON)' })}</label>
                  <input 
                    type="text" 
                    value={productForm.parameters}
                    onChange={e => setProductForm({...productForm, parameters: e.target.value})}
                    placeholder='{"location": "string", "date": "string"}'
                    className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500 text-sm font-mono" 
                  />
                </div>
              </div>

              <button 
                onClick={handleSaveProduct}
                disabled={productSubmitting}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-bold disabled:opacity-50"
              >
                {productSubmitting ? t({ zh: '保存中...', en: 'Saving...' }) : t({ zh: '保存商品', en: 'Save Product' })}
              </button>
            </div>
          </div>
        );
      case 'unified-publish':
        return (
          <div className="space-y-4">
            {sectionTitle(t({ zh: '发布资产', en: 'Publish Assets' }), t({ zh: '通过 X402 引擎发布标准化服务或产品', en: 'Publish standardized services or products via X402 engine' }))}
            <UnifiedPublishingPanel 
              initialType="service" 
              allowedTypes={['service', 'other']}
              allowedPersonas={['merchant']}
              onSuccess={() => loadProducts()} 
            />
          </div>
        );
      case 'as-skills':
        return <ProductAsSkillPanel products={products} loading={loading} onRefresh={loadProducts} />;
      case 'batch-import':
        return (
          <div className="space-y-4">
            {sectionTitle(t({ zh: '批量导入', en: 'Batch Import' }))}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-10 text-center">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleBatchImport} 
                className="hidden" 
                accept=".csv"
              />
              <Package className="w-12 h-12 mx-auto text-slate-400 mb-3" />
              <p className="text-slate-200 mb-2">{t({ zh: '拖拽 CSV 到此处', en: 'Drag CSV here' })}</p>
              <p className="text-slate-500 text-sm mb-4">{t({ zh: '支持 CSV 格式，首行为列名（name, price, category...）', en: 'Supports CSV format, first row as headers' })}</p>
              <div className="flex items-center justify-center gap-4">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-bold disabled:opacity-50 flex items-center gap-2"
                >
                  <Upload size={16} />
                  {importing ? t({ zh: '正在导入...', en: 'Importing...' }) : t({ zh: '选择 CSV 文件', en: 'Select CSV File' })}
                </button>
                <button 
                  onClick={downloadTemplate}
                  className="px-6 py-2 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-lg text-slate-300 font-bold flex items-center gap-2 transition-colors"
                >
                  <Download size={16} />
                  {t({ zh: '下载 CSV 模板', en: 'Download CSV Template' })}
                </button>
              </div>
            </div>
          </div>
        );
      case 'ecommerce-sync':
        return <EcommerceSyncPanel />;
      default:
        return (
          <ProductListPanel
            products={products}
            loading={loading}
            onAddProduct={() => {
              setEditingProduct(null);
              setProductForm(defaultProductForm);
              setProductModalOpen(true);
            }}
            onEditProduct={(p) => {
              setEditingProduct(p);
              setProductForm({
                name: p.name,
                description: p.description || '',
                price: p.price,
                stock: p.stock,
                category: p.category || '',
                productType: (p as any).productType || 'physical',
                currency: p.metadata?.currency || 'USD',
                commissionRate: (p as any).commissionRate || 5,
                image: p.metadata?.image || '',
                skillDescription: p.metadata?.skillDescription || '',
                parameters: p.metadata?.parameters || '',
                billingMode: p.metadata?.billingMode || 'one_time',
                pricingUnit: p.metadata?.pricingUnit || 'request',
                unitPrice: p.metadata?.unitPrice || 0,
                executionEndpoint: p.metadata?.executionEndpoint || '',
              });
              setProductModalOpen(true);
            }}
            onImport={handleBatchImport}
          />
        );
    }
  };

  const renderOrders = () => {
    const filteredOrders = orders.filter(o => {
      if (currentL2 === 'pending') return o.status === 'pending';
      if (currentL2 === 'shipping') return o.status === 'shipped';
      if (currentL2 === 'refunds') return o.status === 'refunded';
      return true;
    });

    return (
      <div className="space-y-4">
        {sectionTitle(
          currentL2 === 'pending' ? t({ zh: '待处理订单', en: 'Pending Orders' }) :
          currentL2 === 'shipping' ? t({ zh: '配送中订单', en: 'Shipping Orders' }) :
          currentL2 === 'refunds' ? t({ zh: '退款管理', en: 'Refunds' }) :
          t({ zh: '全部订单', en: 'All Orders' })
        )}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="grid grid-cols-6 px-4 py-3 border-b border-slate-700/50 text-slate-400 text-xs uppercase tracking-wider">
            <span>{t({ zh: '订单号', en: 'Order ID' })}</span>
            <span>{t({ zh: '金额', en: 'Amount' })}</span>
            <span>{t({ zh: '状态', en: 'Status' })}</span>
            <span>{t({ zh: '创建时间', en: 'Created' })}</span>
            <span>{t({ zh: '支付方式', en: 'Method' })}</span>
            <span>{t({ zh: '操作', en: 'Actions' })}</span>
          </div>
          {loading ? (
            <div className="p-12 text-center text-slate-500">{t({ zh: '加载中...', en: 'Loading...' })}</div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-12 text-center text-slate-500">{t({ zh: '暂无订单', en: 'No orders found' })}</div>
          ) : (
            filteredOrders.map((o) => (
              <div key={o.id} className="grid grid-cols-6 px-4 py-4 border-b border-slate-700/30 last:border-0 items-center hover:bg-white/5 transition-colors">
                <span className="text-xs font-mono text-slate-300 truncate pr-2">{o.id}</span>
                <span className="text-sm text-white font-medium">{o.amount} {o.currency}</span>
                <div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                    o.status === 'completed' || o.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : 
                    o.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'
                  }`}>
                    {t({ zh: o.status, en: o.status })}
                  </span>
                </div>
                <span className="text-xs text-slate-500">{new Date(o.createdAt).toLocaleString()}</span>
                <span className="text-xs text-slate-500">{o.paymentMethod || '-'}</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setSelectedOrder(o)}
                    className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                  >
                    <Eye size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {selectedOrder && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">{t({ zh: '订单详情', en: 'Order Details' })}</h3>
                <button onClick={() => setSelectedOrder(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 uppercase text-xs font-bold">{t({ zh: '订单号', en: 'Order ID' })}</p>
                  <p className="text-white font-mono">{selectedOrder.id}</p>
                </div>
                <div>
                  <p className="text-slate-500 uppercase text-xs font-bold">{t({ zh: '状态', en: 'Status' })}</p>
                  <p className="text-white">{selectedOrder.status}</p>
                </div>
                <div>
                  <p className="text-slate-500 uppercase text-xs font-bold">{t({ zh: '金额', en: 'Amount' })}</p>
                  <p className="text-white">{selectedOrder.amount} {selectedOrder.currency}</p>
                </div>
                <div>
                  <p className="text-slate-500 uppercase text-xs font-bold">{t({ zh: '创建时间', en: 'Created' })}</p>
                  <p className="text-white">{new Date(selectedOrder.createdAt).toLocaleString()}</p>
                </div>
              </div>
              <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                <p className="text-slate-500 uppercase text-xs font-bold mb-2">{t({ zh: '商品信息', en: 'Product Info' })}</p>
                <p className="text-white">{selectedOrder.description || t({ zh: '无描述', en: 'No description' })}</p>
              </div>
              <div className="flex gap-3">
                <button className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">{t({ zh: '更新状态', en: 'Update Status' })}</button>
                <button className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold">{t({ zh: '打印发票', en: 'Print Invoice' })}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderFinance = () => {
    switch (currentL2) {
      case 'stripe-connect':
        return <StripeConnectPanel />;
      case 'transactions':
        return (
          <div className="space-y-4">
            {sectionTitle(t({ zh: '交易记录', en: 'Transactions' }))}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="p-12 text-center text-slate-500">
                <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                {t({ zh: '暂无交易记录', en: 'No transactions found' })}
              </div>
            </div>
          </div>
        );
      case 'commission-plans':
        return <SplitPlansPanel />;
      case 'budget-pools':
        return <BudgetPoolsPanel />;
      case 'settlements':
        return (
          <div className="space-y-4">
            {sectionTitle(t({ zh: '分账结算', en: 'Settlements' }), t({ zh: '查看分账明细与结算状态', en: 'Review split details and settlement status' }))}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-12 text-center text-slate-500">
              <Receipt className="w-12 h-12 mx-auto mb-4 opacity-20" />
              {t({ zh: '暂无结算记录', en: 'No settlements found' })}
            </div>
          </div>
        );
      case 'withdrawals':
        return (
          <div className="space-y-6">
            {sectionTitle(t({ zh: '提现管理', en: 'Withdrawals' }))}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <CreditCard size={20} className="text-blue-400" />
                  {t({ zh: '法币提现 (Off-ramp)', en: 'Fiat Withdrawal' })}
                </h3>
                <p className="text-sm text-slate-400 mb-6">{t({ zh: '通过 Transak 或 Stripe 将加密货币提现到您的银行卡。', en: 'Withdraw crypto to your bank card via Transak or Stripe.' })}</p>
                <button className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors">
                  {t({ zh: '立即提现', en: 'Withdraw Now' })}
                </button>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Wallet size={20} className="text-purple-400" />
                  {t({ zh: 'MPC 钱包', en: 'MPC Wallet' })}
                </h3>
                {mpcLoading ? (
                  <div className="py-10 text-center"><RefreshCw className="animate-spin mx-auto" /></div>
                ) : mpcWallet ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-slate-900/50 rounded-xl border border-white/5">
                      <p className="text-xs text-slate-500 uppercase font-bold mb-1">Wallet Address</p>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-mono text-slate-200 break-all">{mpcWallet.walletAddress}</p>
                        <button onClick={() => handleCopy(mpcWallet.walletAddress, 'mpc')} className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400">
                          {copiedId === 'mpc' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                    <button className="w-full py-3 border border-purple-500/30 hover:bg-purple-500/10 text-purple-400 font-bold rounded-xl transition-colors">
                      {t({ zh: '管理 MPC 钱包', en: 'Manage MPC Wallet' })}
                    </button>
                  </div>
                ) : (
                  <button className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-colors">
                    {t({ zh: '创建 MPC 钱包', en: 'Create MPC Wallet' })}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      case 'invoices':
        return (
          <div className="space-y-4">
            {sectionTitle(t({ zh: '发票管理', en: 'Invoices' }))}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-12 text-center text-slate-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
              {t({ zh: '暂无发票记录', en: 'No invoices found' })}
            </div>
          </div>
        );
      default:
        return (
          <div className="space-y-6">
            {sectionTitle(t({ zh: '财务概览', en: 'Finance Overview' }))}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {statCard(t({ zh: '账户余额', en: 'Balance' }), `$${settlement?.balance || '0.00'}`, 'text-white')}
              {statCard(t({ zh: '本月收入', en: 'Monthly Revenue' }), `$${settlement?.monthlyGmv || '0.00'}`, 'text-green-400')}
              {statCard(t({ zh: '待提现', en: 'Pending Withdrawal' }), `$${settlement?.pendingAmount || '0.00'}`, 'text-amber-300')}
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 flex items-center justify-between">
              <div>
                <h4 className="text-white font-semibold mb-1">{t({ zh: '结算设置', en: 'Settlement Settings' })}</h4>
                <p className="text-sm text-slate-400">{t({ zh: '配置您的收款钱包与结算周期', en: 'Configure your payout wallet and cycle' })}</p>
              </div>
              <button 
                onClick={() => onCommand?.('navigate', { l1: 'finance', l2: 'stripe-connect' })}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-colors"
              >
                {t({ zh: '去配置', en: 'Configure' })}
              </button>
            </div>
          </div>
        );
    }
  };

  const renderSettings = () => {
    switch (currentL2) {
      case 'api-keys':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              {sectionTitle(t({ zh: 'API 密钥', en: 'API Keys' }), t({ zh: '管理您的商户 API 访问权限', en: 'Manage your merchant API access' }))}
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors flex items-center gap-2">
                <Plus size={18} />
                {t({ zh: '创建密钥', en: 'Create Key' })}
              </button>
            </div>
            <div className="grid gap-4">
              {apiKeys.length === 0 ? (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-12 text-center text-slate-500">
                  {t({ zh: '鏆傛棤 API 密钥', en: 'No API keys found' })}
                </div>
              ) : (
                apiKeys.map(key => (
                  <div key={key.id} className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                        <Key size={24} />
                      </div>
                      <div>
                        <p className="font-bold text-white">{key.name}</p>
                        <p className="text-xs text-slate-500 mt-1 font-mono">{key.keyPrefix}****************</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"><Copy size={16} /></button>
                      <button className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      case 'webhooks':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              {sectionTitle(t({ zh: 'Webhooks', en: 'Webhooks' }), t({ zh: '閰嶇疆瀹炴椂浜嬩欢閫氱煡鍥炶皟', en: 'Configure real-time event notifications' }))}
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors flex items-center gap-2">
                <Plus size={18} />
                {t({ zh: '添加 Webhook', en: 'Add Webhook' })}
              </button>
            </div>
            <div className="grid gap-4">
              {webhooks.length === 0 ? (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-12 text-center text-slate-500">
                  {t({ zh: '暂无 Webhook 配置', en: 'No webhooks configured' })}
                </div>
              ) : (
                webhooks.map(wh => (
                  <div key={wh.id} className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                        <Webhook size={24} />
                      </div>
                      <div>
                        <p className="font-bold text-white">{wh.url}</p>
                        <p className="text-xs text-slate-500 mt-1">{wh.events.join(', ')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"><Settings size={16} /></button>
                      <button className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      case 'checkout-config':
        return (
          <div className="space-y-6">
            {sectionTitle(t({ zh: '收银台配置', en: 'Checkout Config' }), t({ zh: '自定义您的支付页面外观', en: 'Customize your checkout page appearance' }))}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Store Logo</label>
                    <div className="w-24 h-24 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center text-slate-400 hover:border-blue-500 hover:text-white transition-colors cursor-pointer">
                      <Upload size={24} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Primary Color</label>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-600 border border-white/20" />
                      <input type="text" defaultValue="#2563eb" className="bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-blue-500" />
                    </div>
                  </div>
                </div>
                <div className="bg-slate-900 rounded-2xl border border-white/5 p-4 flex flex-col items-center justify-center">
                  <p className="text-xs text-slate-500 uppercase font-bold mb-4">Preview</p>
                  <div className="w-full max-w-[200px] bg-white rounded-xl p-4 shadow-2xl">
                    <div className="w-8 h-8 bg-blue-600 rounded-full mb-4" />
                    <div className="h-2 w-20 bg-slate-200 rounded mb-2" />
                    <div className="h-2 w-12 bg-slate-100 rounded mb-6" />
                    <div className="h-8 w-full bg-blue-600 rounded-lg" />
                  </div>
                </div>
              </div>
              <button className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors">
                {t({ zh: '保存配置', en: 'Save Configuration' })}
              </button>
            </div>
          </div>
        );
      case 'promotions':
        return (
          <div className="space-y-6">
            {sectionTitle(t({ zh: '鎺ㄥ箍涓績', en: 'Promotion Center' }))}
            <PromotionPanel />
          </div>
        );
      default:
        return (
          <div className="space-y-6">
            {sectionTitle(t({ zh: '商户设置', en: 'Merchant Settings' }))}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 max-w-2xl">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Merchant Name</label>
                  <input type="text" defaultValue={user?.nickname || ''} className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Business Website</label>
                  <input type="text" placeholder="https://example.com" className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500" />
                </div>
                <button className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors mt-4">
                  {t({ zh: '更新信息', en: 'Update Info' })}
                </button>
              </div>
            </div>
          </div>
        );
    }
  };

  const renderAnalytics = () => {
    switch (currentL2) {
      case 'customers':
        return sectionTitle(t({ zh: '客户分析', en: 'Customer Analytics' }));
      case 'products':
        return sectionTitle(t({ zh: '商品分析', en: 'Product Analytics' }));
      default:
        return (
          <div className="space-y-6">
            {sectionTitle(t({ zh: '销售分析', en: 'Sales Analytics' }))}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                  <TrendingUp size={18} className="text-green-400" />
                  {t({ zh: '销售趋势', en: 'Sales Trend' })}
                </h3>
                <div className="h-48 flex items-end gap-2">
                  {[40, 70, 45, 90, 65, 80, 95].map((h, i) => (
                    <div key={i} className="flex-1 bg-blue-500/20 rounded-t-lg relative group">
                      <div className="absolute bottom-0 left-0 right-0 bg-blue-500 rounded-t-lg transition-all duration-500" style={{ height: `${h}%` }} />
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        ${h * 100}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-4 text-xs text-slate-500 font-bold uppercase tracking-widest">
                  <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                </div>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                  <PieChart size={18} className="text-purple-400" />
                  {t({ zh: '渠道分布', en: 'Channel Distribution' })}
                </h3>
                <div className="space-y-4">
                  {[
                    { name: 'Direct', value: 45, color: 'bg-blue-500' },
                    { name: 'AI Agents', value: 35, color: 'bg-purple-500' },
                    { name: 'Referrals', value: 20, color: 'bg-emerald-500' }
                  ].map(c => (
                    <div key={c.name} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300">{c.name}</span>
                        <span className="text-white font-bold">{c.value}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <div className={`${c.color} h-full`} style={{ width: `${c.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  const renderContent = () => {
    switch (currentL1) {
      case 'products':
        return renderProducts();
      case 'orders':
        return renderOrders();
      case 'finance':
        return renderFinance();
      case 'analytics':
        return renderAnalytics();
      case 'settings':
        return renderSettings();
      default:
        return renderDashboard();
    }
  };

  return (
    <div className="p-4 md:p-6 text-slate-100">
      {renderContent()}

      {productModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">{editingProduct ? t({ zh: '编辑商品', en: 'Edit Product' }) : t({ zh: '添加商品', en: 'Add Product' })}</h3>
              <button onClick={() => setProductModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Name</label>
                  <input 
                    type="text" 
                    value={productForm.name}
                    onChange={e => setProductForm({...productForm, name: e.target.value})}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Category</label>
                  <select 
                    value={productForm.category}
                    onChange={e => {
                      const cat = PRODUCT_CATEGORIES.find(c => c.id === e.target.value);
                      setProductForm({
                        ...productForm, 
                        category: e.target.value,
                        commissionRate: cat ? cat.commission : productForm.commissionRate
                      });
                    }}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500"
                  >
                    <option value="">{t({ zh: '选择分类', en: 'Select Category' })}</option>
                    {PRODUCT_CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>{t(cat.label)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Price</label>
                  <input 
                    type="number" 
                    value={productForm.price}
                    onChange={e => setProductForm({...productForm, price: Number(e.target.value)})}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Currency</label>
                  <select 
                    value={productForm.currency}
                    onChange={e => setProductForm({...productForm, currency: e.target.value})}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500"
                  >
                    <option value="USD">USD</option>
                    <option value="USDC">USDC</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="CNY">CNY</option>
                    <option value="INR">INR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Commission Rate (%)</label>
                  <input 
                    type="number" 
                    value={productForm.commissionRate}
                    disabled
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-slate-400 outline-none cursor-not-allowed" 
                  />
                  <p className="text-[10px] text-slate-500 mt-1 italic">* Fixed based on category</p>
                </div>
              </div>

              {/* Stock Quantity Field */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">{t({ zh: '库存数量', en: 'Stock Quantity' })}</label>
                <input 
                  type="number" 
                  value={productForm.stock}
                  onChange={e => setProductForm({...productForm, stock: Number(e.target.value)})}
                  min={0}
                  placeholder={t({ zh: '输入库存数量', en: 'Enter stock quantity' })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500" 
                />
                <p className="text-[10px] text-slate-500 mt-1">{t({ zh: '设置商品库存数量，0 表示无限或不跟踪库存', en: 'Set stock quantity, 0 means unlimited' })}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Image</label>
                <div className="flex gap-4">
                  <div className="flex-1 space-y-2">
                    <input 
                      type="text" 
                      value={productForm.image}
                      onChange={e => setProductForm({...productForm, image: e.target.value})}
                      placeholder="https://example.com/image.png"
                      className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500" 
                    />
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded border border-white/5 transition-colors flex items-center gap-2">
                        <Upload size={12} />
                        {t({ zh: '上传图片', en: 'Upload Image' })}
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const formData = new FormData();
                              formData.append('file', file);
                              const res = await fetch('/api/upload/image', {
                                method: 'POST',
                                body: formData,
                                headers: {
                                  'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                                }
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setProductForm({...productForm, image: data.url});
                                success(t({ zh: '图片上传成功', en: 'Image uploaded' }));
                              } else {
                                showError('Upload failed');
                              }
                            } catch (err: any) {
                              showError(err.message);
                            }
                          }}
                        />
                      </label>
                      <span className="text-[10px] text-slate-500">Support JPG, PNG, GIF. Max 2MB.</span>
                    </div>
                  </div>
                  {productForm.image && (
                    <div className="w-24 h-24 rounded-lg border border-white/10 overflow-hidden bg-black/20 flex items-center justify-center shrink-0">
                      <img src={productForm.image} alt="Preview" className="max-w-full max-h-full object-contain" />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Description</label>
                <textarea 
                  value={productForm.description}
                  onChange={e => setProductForm({...productForm, description: e.target.value})}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500 h-24" 
                />
              </div>

              {/* Skill configuration hidden as per requirement */}
              <div className="hidden">
                <div className="flex items-center gap-2 text-blue-400 mb-2">
                  <Sparkles size={16} />
                  <span className="text-sm font-bold uppercase tracking-wider">{t({ zh: 'Agent 技能化配置', en: 'Agent Skill Configuration' })}</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{t({ zh: '技能描述(供 Agent 理解)', en: 'Skill Description (for Agent)' })}</label>
                  <textarea 
                    value={productForm.skillDescription}
                    onChange={e => setProductForm({...productForm, skillDescription: e.target.value})}
                    placeholder={t({ zh: '例如：这是一个可以帮助用户预订全球酒店的技能...', en: 'e.g. This is a skill that helps users book hotels worldwide...' })}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500 h-20 text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{t({ zh: '技能参数(JSON)', en: 'Skill Parameters (JSON)' })}</label>
                  <input 
                    type="text" 
                    value={productForm.parameters}
                    onChange={e => setProductForm({...productForm, parameters: e.target.value})}
                    placeholder='{"location": "string", "date": "string"}'
                    className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500 text-sm font-mono" 
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setProductModalOpen(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-colors"
                >
                  {t({ zh: '取消', en: 'Cancel' })}
                </button>
                <button 
                  onClick={handleSaveProduct}
                  disabled={productSubmitting}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
                >
                  {productSubmitting ? t({ zh: '保存中...', en: 'Saving...' }) : t({ zh: '保存商品', en: 'Save Product' })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- 子组件: 商品技能化管理面板 ---
const ProductAsSkillPanel = ({ products, loading, onRefresh }: { products: any[], loading: boolean, onRefresh: () => void }) => {
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [paramsJson, setParamsJson] = useState('{}');
  const [endpoint, setEndpoint] = useState('');
  const { t } = useLocalization();
  const { success: showToast } = useToast();

  useEffect(() => {
    if (selectedProduct) {
      setParamsJson(selectedProduct.metadata?.parameters || '{}');
      setEndpoint(selectedProduct.metadata?.executionEndpoint || '');
    }
  }, [selectedProduct]);

  // 技能化的商品分类
  const skillProducts = products.filter(p => 
    p.category === 'x402-skill' || p.category === 'x402-metered' || p.productType?.startsWith('x402')
  );

  // 普通商品（可以一键转换的）
  const regularProducts = products.filter(p => 
    !skillProducts.find(sp => sp.id === p.id)
  );

  const handleOneClickGenerate = async (product: any) => {
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'x402-skill',
          productType: 'x402_skill',
          metadata: {
            ...product.metadata,
            billingMode: 'per_use',
            pricingUnit: 'request',
            unitPrice: product.price,
            executionEndpoint: 'https://api.yourdomain.com/v1/execute',
            parameters: JSON.stringify({
              query: { type: 'string', description: 'Parameter for ' + product.name }
            })
          }
        }),
      });

      if (response.ok) {
        onRefresh();
        showToast(t({ zh: '技能转化成功', en: 'Skillized successfully' }));
      }
    } catch (error) {
      console.error('Failed to generate skill:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyChanges = async () => {
    if (!selectedProduct) return;
    setIsUpdating(true);
    try {
      // 验证 JSON
      try {
        JSON.parse(paramsJson);
      } catch (e) {
        alert(t({ zh: 'JSON 格式错误', en: 'Invalid JSON format' }));
        setIsUpdating(false);
        return;
      }

      const response = await fetch(`/api/products/${selectedProduct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata: {
            ...selectedProduct.metadata,
            parameters: paramsJson,
            executionEndpoint: endpoint
          }
        }),
      });

      if (response.ok) {
        onRefresh();
        showToast(t({ zh: '技能配置已更新', en: 'Skill config updated' }));
      }
    } catch (error) {
      console.error('Failed to update skill:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const generateSchemaPreview = (product: any) => {
    if (!product) return '';
    const schema = {
      name: product.name.toLowerCase().replace(/\s+/g, '_'),
      description: product.description || `Skill for ${product.name}`,
      inputSchema: {
        type: 'object',
        properties: product.metadata?.parameters ? JSON.parse(product.metadata.parameters) : {},
        required: [] as string[]
      },
      metadata: {
        productId: product.id,
        price: product.price,
        billingMode: product.metadata?.billingMode || 'one_time'
      }
    };
    return JSON.stringify(schema, null, 2);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <Zap className="text-purple-400" />
          {t({ zh: '商品技能化 (Everything as a Skill)', en: 'Product as a Skill' })}
        </h3>
        <p className="text-xs text-slate-500 max-w-md text-right">
          {t({ zh: '将普通商品转化为 AI 可直接调用的原子技能，支持 X402 协议自动支付与执行。', en: 'Convert regular products into AI-callable atomic skills with X402 support.' })}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：已有的技能列表 */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4">
            <h4 className="text-sm font-bold text-slate-400 uppercase mb-4 flex items-center justify-between">
              {t({ zh: '已激活技能', en: 'Active Skills' })}
              <span className="bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded text-[10px]">{skillProducts.length}</span>
            </h4>
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
              {skillProducts.length === 0 ? (
                <div className="py-10 text-center text-slate-600 border border-dashed border-white/5 rounded-lg text-xs">
                  {t({ zh: '暂无技能化商品', en: 'No skilled products yet' })}
                </div>
              ) : (
                skillProducts.map(p => (
                  <button 
                    key={p.id}
                    onClick={() => setSelectedProduct(p)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedProduct?.id === p.id 
                        ? 'bg-purple-500/10 border-purple-500/50' 
                        : 'bg-slate-800/50 border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-white text-sm truncate">{p.name}</span>
                      <span className="text-[10px] text-purple-400 bg-purple-400/10 px-1.5 rounded uppercase font-mono">X402</span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">{p.id}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4">
            <h4 className="text-sm font-bold text-slate-400 uppercase mb-4">
              {t({ zh: '从普通商品生成', en: 'Generate from Products' })}
            </h4>
            <div className="space-y-2">
              {regularProducts.slice(0, 5).map(p => (
                <div key={p.id} className="flex items-center justify-between p-2 bg-slate-800/30 rounded border border-white/5">
                  <span className="text-xs text-slate-300 truncate max-w-[120px]">{p.name}</span>
                  <button 
                    onClick={() => handleOneClickGenerate(p)}
                    disabled={isGenerating}
                    className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded flex items-center gap-1"
                  >
                    <Plus size={10} /> {t({ zh: '技能化', en: 'Skillize' })}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右侧：预览与配置 */}
        <div className="lg:col-span-2">
          {selectedProduct ? (
            <div className="bg-slate-900/50 border border-white/10 rounded-xl overflow-hidden flex flex-col h-full">
              <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white mb-1">{selectedProduct.name}</h4>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 font-mono">ID: {selectedProduct.id}</span>
                    <span className="text-xs px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full">{t({ zh: '已上架', en: 'Active' })}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="p-2 hover:bg-white/10 rounded-lg text-slate-400"><Trash2 size={16} /></button>
                </div>
              </div>

              <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                {/* 技能预览区 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <Code size={14} className="text-blue-400" />
                      {t({ zh: 'MCP 技能预览 (Tool Schema)', en: 'MCP Skill Preview' })}
                    </label>
                    <span className="text-[10px] text-slate-500">{t({ zh: 'AI 识别此 JSON 来调用您的接口', en: 'AI reads this JSON to call your API' })}</span>
                  </div>
                  <div className="relative group">
                    <pre className="bg-black/40 border border-white/10 rounded-lg p-4 font-mono text-[11px] text-blue-300 overflow-x-auto min-h-[200px]">
                      {generateSchemaPreview(selectedProduct)}
                    </pre>
                    <button className="absolute top-2 right-2 p-2 bg-slate-800/80 hover:bg-slate-700 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity">
                      <Copy size={12} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                   <div className="space-y-3">
                    <label className="text-xs font-bold text-slate-400 uppercase">{t({ zh: '计费详情', en: 'Billing Detail' })}</label>
                    <div className="bg-slate-800/50 border border-white/5 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">{t({ zh: '金额', en: 'Price' })}:</span>
                        <span className="text-white font-mono">{selectedProduct.price} {selectedProduct.metadata?.currency || 'USD'}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">{t({ zh: '模式', en: 'Mode' })}:</span>
                        <span className="text-purple-400 uppercase">{selectedProduct.metadata?.billingMode || 'one_time'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-slate-400 uppercase">{t({ zh: '执行端点', en: 'Execution Endpoint' })}</label>
                    <div className="bg-slate-800/50 border border-white/5 rounded-lg p-1">
                      <input 
                        type="text"
                        className="w-full bg-transparent border-0 outline-none text-xs font-mono text-slate-300 px-2 py-2"
                        value={endpoint}
                        onChange={e => setEndpoint(e.target.value)}
                        placeholder="https://api.yourdomain.com/v1/execute"
                      />
                    </div>
                  </div>
                </div>

                {/* Schema 编辑器 (JSON 输入) */}
                <div className="space-y-3">
                   <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                    <Settings size={14} />
                    {t({ zh: '输入参数 Schema 编辑器 (JSON Alpha)', en: 'Input Schema Editor (JSON)' })}
                  </label>
                  <textarea 
                    className="w-full bg-slate-900 border border-white/10 rounded-lg p-4 font-mono text-sm text-white h-32 outline-none focus:border-purple-500"
                    placeholder='{"paramName": {"type": "string", "description": "..."}}'
                    value={paramsJson}
                    onChange={e => setParamsJson(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => setParamsJson(selectedProduct.metadata?.parameters || '{}')}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors"
                    >
                      {t({ zh: '重置', en: 'Reset' })}
                    </button>
                    <button 
                      onClick={handleApplyChanges}
                      disabled={isUpdating}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isUpdating ? t({ zh: '正在保存...', en: 'Saving...' }) : t({ zh: '应用更改', en: 'Apply Changes' })}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/50 border border-dashed border-white/10 rounded-xl h-full flex flex-col items-center justify-center text-slate-600 p-10 text-center">
              <Zap size={40} className="mb-4 opacity-20" />
              <h4 className="font-bold text-slate-500 mb-2">{t({ zh: '选择一个技能进行预览', en: 'Select a skill to preview' })}</h4>
              <p className="text-sm max-w-xs">{t({ zh: '您可以从左侧列表中选择已有的技能进行预览和调试，或从普通商品一键开启。', en: 'Choose an existing skill to preview and debug, or skillize from products.' })}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

