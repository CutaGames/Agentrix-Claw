import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import { useLocalization } from '../../../contexts/LocalizationContext'
import { useUser } from '../../../contexts/UserContext'
import { useToast } from '../../../contexts/ToastContext'
import { productApi, type ProductInfo } from '../../../lib/api/product.api'
import { userApi } from '../../../lib/api/user.api'
import { orderApi, type Order } from '../../../lib/api/order.api'
import { commissionApi, type SettlementInfo } from '../../../lib/api/commission.api'
import { analyticsApi } from '../../../lib/api/analytics.api'
import { aiCapabilityApi } from '../../../lib/api/ai-capability.api'
import { apiKeyApi, type ApiKey } from '../../../lib/api/api-key.api'
import { PromotionPanel } from '../PromotionPanel'
import { webhookApi, type WebhookConfig } from '../../../lib/api/webhook.api'
import { mpcWalletApi, type MPCWallet } from '../../../lib/api/mpc-wallet.api'
import { paymentApi } from '../../../lib/api/payment.api'
import { 
  Plus, 
  Search, 
  Filter, 
  Download, 
  TrendingUp, 
  BarChart3, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Key,
  Webhook,
  Settings,
  ShieldCheck,
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
  Package,
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
  Share2
} from 'lucide-react'


interface MerchantModuleProps {
  onCommand?: (command: string, data?: any) => any
  initialTab?: 'checklist' | 'products' | 'orders' | 'settlement' | 'analytics' | 'api_keys' | 'webhooks' | 'audit' | 'settings' | 'ecommerce' | 'batch_import' | 'mpc_wallet' | 'off_ramp' | 'integration_guide' | 'subscriptions' | 'checkout_config' | 'promotion'
}

type MerchantOrder = Order & { description?: string }

interface ProductFormState {
  name: string
  description: string
  price: number
  stock: number
  category: string
  productType: 'physical' | 'service' | 'nft' | 'ft' | 'plugin' | 'subscription' | 'game_asset' | 'rwa'
  currency: string
  commissionRate: number
  image?: string
  tags: string[]
}

const defaultProductForm: ProductFormState = {
  name: '',
  description: '',
  price: 0,
  stock: 0,
  category: '',
  productType: 'physical',
  currency: 'CNY',
  commissionRate: 5,
  tags: []
}

/**
 * 商户功能模块
 * 集成商品管理、订单管理、结算管理、数据分析等功能
 */
export function MerchantModule({ onCommand, initialTab }: MerchantModuleProps) {
  const { t } = useLocalization()
  const { user, registerRole } = useUser()
  const { success, error: showError } = useToast()
  
  // 增加日志以诊断注册跳转问题
  useEffect(() => {
    console.log('[MerchantModule] User state changed:', {
      hasUser: !!user,
      roles: user?.roles,
      isMerchant: user?.roles?.includes('merchant' as any)
    })
  }, [user])

  const isMerchant = user?.roles?.includes('merchant' as any)

  const [activeTab, setActiveTab] = useState<'checklist' | 'products' | 'orders' | 'settlement' | 'analytics' | 'api_keys' | 'webhooks' | 'audit' | 'settings' | 'ecommerce' | 'batch_import' | 'mpc_wallet' | 'off_ramp' | 'integration_guide' | 'subscriptions' | 'checkout_config' | 'promotion'>(initialTab || 'checklist')


  // 注册表单状态
  const [registering, setRegistering] = useState(false)
  const [regForm, setRegForm] = useState({
    merchantName: '',
    businessType: 'individual',
    website: '',
    description: ''
  })

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegistering(true)
    try {
      console.log('[MerchantModule] Registering as merchant...')
      // 调用后端API注册角色
      await registerRole('merchant', regForm)
      
      // 提醒用户并强制刷新以确保所有状态同步
      if (confirm(t({ 
        zh: '商户注册成功！点击“确定”刷新页面进入商户后台。', 
        en: 'Merchant registration successful! Click OK to refresh and enter dashboard.' 
      }))) {
        window.location.reload()
      } else {
        // 如果不刷新，也尝试分发事件
        window.dispatchEvent(new Event('role-updated'))
      }
    } catch (error) {
      console.error('注册失败:', error)
      showError(t({ zh: '注册失败，请稍后重试', en: 'Registration failed, please try again' }))
    } finally {
      setRegistering(false)
    }
  }



  // 当 initialTab 改变时更新 activeTab
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])

  // 处理命令
  useEffect(() => {
    if (onCommand) {
      const handleCommand = (command: string) => {
        const result = onCommand(command)
        if (result?.view === 'merchant') {
          if (result.action === 'view_checklist') {
            setActiveTab('checklist')
          } else if (result.action === 'view_products') {
            setActiveTab('products')
          } else if (result.action === 'view_orders') {
            setActiveTab('orders')
          } else if (result.action === 'view_settlement') {
            setActiveTab('settlement')
          } else if (result.action === 'add_product') {
            setActiveTab('products')
            // 如果有 openCreateProduct 函数，可以在这里调用
          } else if (result.action === 'view_analytics') {
            setActiveTab('analytics')
          }

        }
      }
    }
  }, [onCommand])


  const [products, setProducts] = useState<ProductInfo[]>([])
  const [orders, setOrders] = useState<MerchantOrder[]>([])
  const [settlement, setSettlement] = useState<any>(null)
  const [analytics, setAnalytics] = useState<any>(null)
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [integrationType, setIntegrationType] = useState<'hosted' | 'x402'>('x402')
  const [isTestingPayment, setIsTestingPayment] = useState(false)

  const handleLaunchTestPayment = async () => {
    try {
      setIsTestingPayment(true)
      const res = await paymentApi.createIntent({
        amount: 10,
        currency: 'USDC',
        paymentMethod: 'x402' as any,
        description: 'Agentrix Integration Test Payment',
        metadata: {
          test: true,
          source: 'merchant_wizard',
          integrationType
        }
      })

      if ((res as any).checkoutUrl) {
        success(t({ zh: '正在跳转到测试支付页面...', en: 'Redirecting to test payment page...' }))
        window.open((res as any).checkoutUrl, '_blank')
      } else {
        success(t({ zh: '测试支付意图已创建: ' + (res as any).id, en: 'Test payment intent created: ' + (res as any).id }))
      }
    } catch (err: any) {
      showError(t({ zh: '发起测试支付失败: ' + err.message, en: 'Failed to launch test payment: ' + err.message }))
    } finally {
      setIsTestingPayment(false)
    }
  }

  // 电商同步状态
  const [connections, setConnections] = useState<any[]>([])
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<{
    imported: number
    updated: number
    failed: number
    errors: string[]
  } | null>(null)
  const [showAddConnectionModal, setShowAddConnectionModal] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null)
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
  })

  const fetchConnections = useCallback(async () => {
    try {
      const response = await productApi.getEcommerceConnections()
      setConnections(response || [])
    } catch (err: any) {
      console.error('获取连接列表失败:', err)
    }
  }, [])

  const handleCreateConnection = async () => {
    if (!selectedPlatform) return

    try {
      const credentials: Record<string, string> = {}
      const platformFields: Record<string, string[]> = {
        shopify: ['apiKey', 'apiSecret', 'storeDomain'],
        woocommerce: ['consumerKey', 'consumerSecret', 'storeUrl'],
        magento: ['accessToken', 'storeUrl'],
        bigcommerce: ['accessToken', 'storeHash', 'clientId'],
        custom: ['apiEndpoint', 'apiKey'],
      }
      
      const fields = platformFields[selectedPlatform] || []
      fields.forEach(field => {
        if (connectionFormData[field]) {
          credentials[field] = connectionFormData[field]
        }
      })

      await productApi.createEcommerceConnection({
        platform: selectedPlatform as any,
        storeName: connectionFormData.storeName,
        storeUrl: connectionFormData.storeUrl,
        credentials,
      })

      alert(t({ zh: '连接创建成功！', en: 'Connection created successfully!' }))
      setShowAddConnectionModal(false)
      setSelectedPlatform(null)
      setConnectionFormData({
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
      })
      fetchConnections()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleSync = async (connectionId: string) => {
    try {
      setSyncingId(connectionId)
      setSyncResult(null)
      const response = await productApi.syncEcommerceConnection(connectionId)
      setSyncResult(response)
      alert(t({ zh: '同步成功！', en: 'Sync successful!' }))
      fetchConnections()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSyncingId(null)
    }
  }

  const handleToggleConnectionActive = async (connectionId: string, isActive: boolean) => {
    try {
      await productApi.updateEcommerceConnection(connectionId, { isActive: !isActive })
      fetchConnections()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleDeleteConnection = async (connectionId: string) => {
    if (!confirm(t({ zh: '确定要删除此连接吗？', en: 'Are you sure you want to delete this connection?' }))) return

    try {
      await productApi.deleteEcommerceConnection(connectionId)
      fetchConnections()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleCreateApiKey = async () => {
    const name = prompt(t({ zh: '请输入密钥名称', en: 'Please enter key name' }), 'My API Key')
    if (!name) return

    try {
      setLoading(true)
      await apiKeyApi.create({ name, mode: 'production' })
      alert(t({ zh: 'API 密钥创建成功！', en: 'API Key created successfully!' }))
      loadApiKeys()
    } catch (error: any) {
      console.error('创建 API Key 失败:', error)
      alert(error.message || t({ zh: '创建失败', en: 'Creation failed' }))
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteApiKey = async (id: string) => {
    if (!confirm(t({ zh: '确定要删除此密钥吗？', en: 'Are you sure you want to delete this key?' }))) return

    try {
      setLoading(true)
      await apiKeyApi.delete(id)
      loadApiKeys()
    } catch (error: any) {
      console.error('删除 API Key 失败:', error)
      alert(error.message || t({ zh: '删除失败', en: 'Deletion failed' }))
    } finally {
      setLoading(false)
    }
  }

  // 批量导入状态
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<any>(null)
  const [importing, setImporting] = useState(false)

  // MPC 钱包状态
  const [mpcWallet, setMpcWallet] = useState<MPCWallet | null>(null)
  const [showMpcPassword, setShowMpcPassword] = useState(false)
  const [mpcLoading, setMpcLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const loadMpcWallet = useCallback(async () => {
    setMpcLoading(true)
    try {
      const data = await mpcWalletApi.getMyWallet()
      setMpcWallet(data)
    } catch (error) {
      console.error('加载 MPC 钱包失败:', error)
    } finally {
      setMpcLoading(false)
    }
  }, [])

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetch('/api/ecommerce/connections', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
      })
      const data = await res.json()
      setConnections(data || [])
    } catch (error) {
      console.error('加载电商连接失败:', error)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'mpc_wallet') {
      loadMpcWallet()
    } else if (activeTab === 'ecommerce') {
      loadConnections()
    }
  }, [activeTab, loadMpcWallet, loadConnections])

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }
  const [productSearch, setProductSearch] = useState('')
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductInfo | null>(null)
  const [productForm, setProductForm] = useState<ProductFormState>(defaultProductForm)
  const [productSubmitting, setProductSubmitting] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)

  const handleImageUpload = async (file: File) => {
    // 检查文件大小 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert(t({ zh: '图片大小不能超过 5MB', en: 'Image size cannot exceed 5MB' }))
      return
    }

    setIsUploadingImage(true)
    try {
      const response = await userApi.uploadFile(file)
      setProductForm(prev => ({ ...prev, image: response.url }))
    } catch (error) {
      console.error('图片上传失败:', error)
      alert(t({ zh: '图片上传失败，请重试', en: 'Image upload failed, please try again' }))
    } finally {
      setIsUploadingImage(false)
    }
  }

  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | Order['status']>('all')
  const [orderSearch, setOrderSearch] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<MerchantOrder | null>(null)
  const [orderActionLoading, setOrderActionLoading] = useState(false)
  const [settlementHistory, setSettlementHistory] = useState<SettlementInfo[]>([])
  const [settlementExpanded, setSettlementExpanded] = useState(false)

  const loadProducts = useCallback(async (keyword?: string) => {
    setLoading(true)
    try {
      const data = await productApi.getProducts({
        search: keyword || undefined,
      })
      setProducts(data || [])
    } catch (error: any) {
      console.error('加载商品失败:', error)
      // 如果API失败，使用mock数据作为fallback
      if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        // 未授权，显示空列表
        setProducts([])
      } else {
        // 其他错误，使用mock数据
        setProducts([
          {
            id: 'prod_1',
            name: '示例商品1',
            description: '这是一个示例商品',
            price: 99.00,
            stock: 100,
            category: '电子产品',
            commissionRate: 5,
            status: 'active',
            merchantId: 'merchant_demo',
            metadata: { image: '/placeholder-product.jpg' },
          },
        ])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadOrders = useCallback(async (status?: 'all' | Order['status'], keyword?: string) => {
    setLoading(true)
    try {
      // 调用订单API
      const data = await orderApi.getOrders({
        status: status && status !== 'all' ? (status as Order['status']) : undefined,
        merchantId: keyword,
      })
      setOrders(
        data.map((order) => ({
          ...order,
          description: order.metadata?.description || order.metadata?.title || `订单 ${order.id}`,
        })),
      )
    } catch (error: any) {
      console.error('加载订单失败:', error)
      // 如果API失败，使用mock数据作为fallback
      if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        setOrders([])
      } else {
        setOrders([
          {
            id: 'ORD-001',
            merchantId: 'merchant_demo',
            amount: 99.0,
            currency: 'CNY',
            status: 'completed',
            createdAt: new Date().toISOString(),
            metadata: {
              description: '订单示例',
            },
          },
        ])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSettlement = useCallback(async () => {
    setLoading(true)
    try {
      // 调用结算API
      const settlements = await commissionApi.getSettlements()
      const commissions = await commissionApi.getCommissions()
      setSettlementHistory(settlements.slice(0, 20))
      // 计算结算数据
      const totalSettled = settlements
        .filter((s) => s.status === 'completed')
        .reduce((sum, s) => sum + s.amount, 0)
      
      const pendingCommissions = commissions
        .filter((c) => c.status === 'pending')
        .reduce((sum, c) => sum + c.amount, 0)
      
      const totalRevenue = settlements.reduce((sum, s) => sum + s.amount, 0) + pendingCommissions
      const aiCommission = totalRevenue * 0.03 // 假设3%的AI佣金
      const netRevenue = totalRevenue - aiCommission
      
      setSettlement({
        totalRevenue: `¥${totalRevenue.toLocaleString()}`,
        pendingSettlement: `¥${pendingCommissions.toLocaleString()}`,
        settledAmount: `¥${totalSettled.toLocaleString()}`,
        aiCommission: `¥${aiCommission.toLocaleString()}`,
        netRevenue: `¥${netRevenue.toLocaleString()}`,
      })
    } catch (error: any) {
      console.error('加载结算数据失败:', error)
      // 如果API失败，使用mock数据作为fallback
      setSettlement({
        totalRevenue: '¥125,000',
        pendingSettlement: '¥15,000',
        settledAmount: '¥110,000',
        aiCommission: '¥3,750',
        netRevenue: '¥106,250',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const loadAnalytics = useCallback(async () => {
    setLoading(true)
    try {
      // 调用数据分析API
      const data = await analyticsApi.getMerchantAnalytics()
      setAnalytics({
        todayGMV: `¥${data.todayGMV.toLocaleString()}`,
        todayOrders: data.todayOrders,
        successRate: `${(data.successRate * 100).toFixed(1)}%`,
        avgOrderValue: `¥${data.avgOrderValue.toLocaleString()}`,
      })
    } catch (error: any) {
      console.error('加载分析数据失败:', error)
      // 如果API失败，使用mock数据作为fallback
      setAnalytics({
        todayGMV: '¥12,560',
        todayOrders: 45,
        successRate: '99.2%',
        avgOrderValue: '¥279',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const loadApiKeys = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiKeyApi.list()
      setApiKeys(data || [])
    } catch (error) {
      console.error('加载API Key失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadWebhooks = useCallback(async () => {
    setLoading(true)
    try {
      const data = await webhookApi.getWebhooks()
      setWebhooks(data || [])
    } catch (error) {
      console.error('加载Webhook失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isMerchant) return

    if (activeTab === 'products') {
      loadProducts(productSearch)
    } else if (activeTab === 'orders') {
      loadOrders(orderStatusFilter, orderSearch.trim() || undefined)
    } else if (activeTab === 'settlement') {
      loadSettlement()
    } else if (activeTab === 'analytics') {
      loadAnalytics()
    } else if (activeTab === 'api_keys') {
      loadApiKeys()
    } else if (activeTab === 'webhooks') {
      loadWebhooks()
    } else if (activeTab === 'mpc_wallet') {
      loadMpcWallet()
    } else if (activeTab === 'ecommerce') {
      fetchConnections()
    }
  }, [
    activeTab,
    productSearch,
    orderStatusFilter,
    orderSearch,
    isMerchant,
    loadProducts,
    loadOrders,
    loadSettlement,
    loadAnalytics,
    loadApiKeys,
    loadWebhooks,
    loadMpcWallet,
    fetchConnections
  ])

  const debouncedProductSearch = useMemo(() => productSearch, [productSearch])
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'products') {
        loadProducts(debouncedProductSearch)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [debouncedProductSearch, activeTab, loadProducts])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'orders') {
        loadOrders(orderStatusFilter, orderSearch.trim() || undefined)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [orderStatusFilter, orderSearch, activeTab, loadOrders])

  const openCreateProduct = () => {
    setEditingProduct(null)
    setProductForm(defaultProductForm)
    setProductModalOpen(true)
  }

  const openEditProduct = (product: ProductInfo) => {
    setEditingProduct(product)
    setProductForm({
      name: product.name,
      description: product.description || '',
      price: product.price,
      stock: product.stock,
      category: product.category,
      productType: (product.metadata?.productType as any) || 'physical',
      currency: product.metadata?.currency || 'CNY',
      commissionRate: product.commissionRate,
      image: product.metadata?.image,
      tags: product.metadata?.tags || [],
    })
    setProductModalOpen(true)
  }

  const handleProductSubmit = async () => {
    if (!productForm.name) {
      alert(t({ zh: '请输入商品名称', en: 'Please enter product name' }))
      return
    }
    if (productForm.price === undefined || productForm.price === null) {
      alert(t({ zh: '请输入商品价格', en: 'Please enter product price' }))
      return
    }
    if (!productForm.category) {
      alert(t({ zh: '请选择或输入商品分类', en: 'Please enter product category' }))
      return
    }
    if (!productForm.description) {
      alert(t({ zh: '请输入商品描述', en: 'Please enter product description' }))
      return
    }
    if (!productForm.image) {
      alert(t({ zh: '请上传商品图片', en: 'Please upload product image' }))
      return
    }

    setProductSubmitting(true)
    try {
      // 导入转换工具
      const { convertToUnifiedProduct, convertToUpdateProductDto } = await import('../../../lib/utils/product-converter')
      
      if (editingProduct) {
        // 更新时使用 UpdateProductDto 格式（简单字段）
        const updateDto = convertToUpdateProductDto({
          name: productForm.name,
          description: productForm.description,
          price: productForm.price,
          stock: productForm.stock,
          category: productForm.category,
          productType: productForm.productType,
          currency: productForm.currency,
          commissionRate: productForm.commissionRate,
          image: productForm.image,
          tags: productForm.tags,
        })
        await productApi.updateProduct(editingProduct.id, updateDto)
      } else {
        // 创建时使用统一数据标准格式
        const unifiedProduct = convertToUnifiedProduct({
          name: productForm.name,
          description: productForm.description,
          price: productForm.price,
          stock: productForm.stock,
          category: productForm.category,
          productType: productForm.productType,
          currency: productForm.currency,
          commissionRate: productForm.commissionRate,
          image: productForm.image,
          tags: productForm.tags,
        })
        await productApi.createProduct(unifiedProduct)
      }
      setProductModalOpen(false)
      setEditingProduct(null)
      setProductForm(defaultProductForm)
      loadProducts(productSearch)
    } catch (error) {
      console.error('保存商品失败:', error)
      alert(t({ zh: '保存商品失败，请稍后再试', en: 'Failed to save product, please try again later' }))
    } finally {
      setProductSubmitting(false)
    }
  }

  const handleDeleteProduct = async (product: ProductInfo) => {
    if (!confirm(t({ zh: `确认删除商品「${product.name}」？`, en: `Delete product “${product.name}”?` }))) return
    try {
      await productApi.deleteProduct(product.id)
      loadProducts(productSearch)
    } catch (error) {
      console.error('删除商品失败:', error)
      alert(t({ zh: '删除失败，请稍后再试', en: 'Failed to delete, please try again later' }))
    }
  }

  const handleOrderStatusUpdate = async (nextStatus: Order['status']) => {
    if (!selectedOrder) return
    setOrderActionLoading(true)
    try {
      await orderApi.updateOrderStatus(selectedOrder.id, nextStatus)
      const updated = await orderApi.getOrder(selectedOrder.id)
      setSelectedOrder(updated)
      loadOrders(orderStatusFilter, orderSearch.trim() || undefined)
    } catch (error) {
      console.error('更新订单状态失败', error)
      alert(t({ zh: '更新订单失败，请稍后再试', en: 'Failed to update order, please try again later' }))
    } finally {
      setOrderActionLoading(false)
    }
  }

  const handleOrderRefund = async () => {
    if (!selectedOrder) return
    if (!confirm(t({ zh: '确认对该订单发起退款？', en: 'Refund this order?' }))) return
    setOrderActionLoading(true)
    try {
      await orderApi.refundOrder(selectedOrder.id, 'manual_refund')
      const updated = await orderApi.getOrder(selectedOrder.id)
      setSelectedOrder(updated)
      loadOrders(orderStatusFilter, orderSearch.trim() || undefined)
    } catch (error) {
      console.error('退款失败', error)
      alert(t({ zh: '退款失败，请稍后再试', en: 'Refund failed, please try again later' }))
    } finally {
      setOrderActionLoading(false)
    }
  }

  const settlementCards = [
    { key: 'totalRevenue', label: { zh: '总收入', en: 'Total Revenue' } },
    { key: 'pendingSettlement', label: { zh: '待结算', en: 'Pending Settlement' } },
    { key: 'settledAmount', label: { zh: '已结算', en: 'Settled' } },
    { key: 'aiCommission', label: { zh: 'AI佣金', en: 'AI Commission' } },
    { key: 'netRevenue', label: { zh: '净收入', en: 'Net Revenue' } },
  ]

  if (!isMerchant) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-950 p-6">
        <div className="max-w-md w-full bg-slate-900 border border-white/10 rounded-2xl p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-blue-500" />
            </div>
            <h2 className="text-2xl font-bold text-white">{t({ zh: '开通商户权限', en: 'Enable Merchant Access' })}</h2>
            <p className="text-slate-400">
              {t({ zh: '您尚未开通商户权限，请填写以下信息完成注册。', en: 'You have not enabled merchant access yet. Please fill in the information below to register.' })}
            </p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                {t({ zh: '商户名称', en: 'Merchant Name' })}
              </label>
              <input
                type="text"
                required
                value={regForm.merchantName}
                onChange={(e) => setRegForm({ ...regForm, merchantName: e.target.value })}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t({ zh: '例如：Agentrix 官方店', en: 'e.g. Agentrix Official Store' })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                {t({ zh: '业务类型', en: 'Business Type' })}
              </label>
              <select
                value={regForm.businessType}
                onChange={(e) => setRegForm({ ...regForm, businessType: e.target.value })}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="individual">{t({ zh: '个人商户', en: 'Individual' })}</option>
                <option value="company">{t({ zh: '企业商户', en: 'Company' })}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                {t({ zh: '官方网站 (可选)', en: 'Website (Optional)' })}
              </label>
              <input
                type="url"
                value={regForm.website}
                onChange={(e) => setRegForm({ ...regForm, website: e.target.value })}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://example.com"
              />
            </div>
            <button
              type="submit"
              disabled={registering}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              {registering ? t({ zh: '注册中...', en: 'Registering...' }) : t({ zh: '立即开通', en: 'Register Now' })}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* 标签页 */}
      <div className="border-b border-white/10 bg-slate-900/50 px-6 overflow-x-auto">
        <div className="flex space-x-1 min-w-max">
          {[
            { key: 'checklist' as const, label: { zh: '上线清单', en: 'Checklist' } },
            { key: 'products' as const, label: { zh: '商品管理', en: 'Products' } },
            { key: 'ecommerce' as const, label: { zh: '电商同步', en: 'Ecommerce' } },
            { key: 'subscriptions' as const, label: { zh: '订阅管理', en: 'Subscriptions' } },
            { key: 'batch_import' as const, label: { zh: '批量导入', en: 'Batch Import' } },
            { key: 'orders' as const, label: { zh: '订单管理', en: 'Orders' } },
            { key: 'settlement' as const, label: { zh: '结算管理', en: 'Settlement' } },
            { key: 'off_ramp' as const, label: { zh: 'Off-ramp 出金', en: 'Off-ramp' } },
            { key: 'mpc_wallet' as const, label: { zh: 'MPC 钱包', en: 'MPC Wallet' } },
            { key: 'analytics' as const, label: { zh: '数据分析', en: 'Analytics' } },
            { key: 'api_keys' as const, label: { zh: 'API 密钥', en: 'API Keys' } },
            { key: 'integration_guide' as const, label: { zh: '支付集成', en: 'Integration' } },
            { key: 'checkout_config' as const, label: { zh: '收银台配置', en: 'Checkout' } },
            { key: 'webhooks' as const, label: { zh: 'Webhooks', en: 'Webhooks' } },
            { key: 'audit' as const, label: { zh: '审计链', en: 'Audit Chain' } },
            { key: 'promotion' as const, label: { zh: '推广中心', en: 'Promotion' } },
            { key: 'settings' as const, label: { zh: '商户设置', en: 'Settings' } },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              {t(tab.label)}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'checklist' && (
          <div className="space-y-6 max-w-4xl">
            <div className="bg-blue-600/10 border border-blue-500/20 rounded-2xl p-6 mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-blue-400 mb-2">Merchant Go-live Checklist</h3>
                  <p className="text-sm text-slate-400">完成以下步骤即可正式开始收款并接入 AI 生态</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-bold text-blue-400">40%</span>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Completion</p>
                </div>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full mt-4 overflow-hidden">
                <div className="bg-blue-500 h-full w-[40%] transition-all"></div>
              </div>
            </div>

            <div className="grid gap-4">
              {[
                { title: '创建商户 & 绑定 AX ID', desc: '完成商户基本信息录入与链上身份初始化', status: 'completed', tab: 'settings' },
                { title: '上传/导入 Catalog', desc: '添加至少 1 个商品，支持 AI 搜索识别与导入', status: 'completed', tab: 'products' },
                { title: '配置 Fulfillment', desc: '设置交付规则与 Webhook 签名校验', status: 'pending', tab: 'webhooks' },
                { title: '开通支付方式', desc: '启用 AX Checkout 及其 Fallback 模式', status: 'pending', tab: 'integration_guide' },
                { title: '配置 Webhook', desc: '签名校验 + 重放测试', status: 'pending', tab: 'webhooks' },
                { title: '跑通沙箱 E2E', desc: '自动生成审计 Receipts 与测试记录', status: 'pending', tab: 'integration_guide' },
                { title: '发布到 Marketplace', desc: '将商户信息发布到生态市场 (可选)', status: 'pending', tab: 'settings' },
                { title: '启用 Attribution & Rev-share', desc: '使用默认分润模板开启生态收益分享', status: 'pending', tab: 'settlement' }
              ].map((step, i) => (

                <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-5 flex items-center justify-between hover:bg-white/10 transition-all">
                  <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      step.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {step.status === 'completed' ? <Check size={16} /> : i + 1}
                    </div>
                    <div>
                      <h4 className={`font-bold ${step.status === 'completed' ? 'text-slate-300' : 'text-white'}`}>{step.title}</h4>
                      <p className="text-xs text-slate-500">{step.desc}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveTab(step.tab as any)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                      step.status === 'completed' ? 'bg-slate-800 text-slate-500' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {step.status === 'completed' ? '重新查看' : '立即处理'}
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-8 p-6 bg-slate-900 border border-white/5 rounded-2xl">
              <h4 className="font-bold mb-4 flex items-center gap-2">
                <ShieldCheck size={18} className="text-blue-400" />
                商户接入证明包 (Proof Package)
              </h4>
              <p className="text-sm text-slate-400 mb-4">
                包含当前的配置快照、沙盒测试回执以及安全策略定义，用于满足合规审计需求。
              </p>
              <div className="flex items-center justify-between p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <FileText size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-200 uppercase">Go-live Proof Ready</p>
                    <p className="text-[10px] text-slate-500">Last updated: Just now</p>
                  </div>
                </div>
                <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-all">
                  下载证明包 (ZIP)
                </button>
              </div>
            </div>

          </div>
        )}


        {activeTab === 'products' && (

          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-lg font-semibold">{t({ zh: '商品管理', en: 'Product Management' })}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {t({ zh: '管理商品、库存和佣金设置', en: 'Manage catalog, inventory and commissions' })}
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder={t({ zh: '搜索名称/分类', en: 'Search name / category' })}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-400/30"
                />
                <button
                  onClick={openCreateProduct}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
                >
                  {t({ zh: '添加商品', en: 'Add Product' })}
                </button>
              </div>
            </div>
            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                {t({ zh: '暂无商品', en: 'No products' })}
                <button
                  onClick={openCreateProduct}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
                >
                  {t({ zh: '添加第一个商品', en: 'Add first product' })}
                </button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map((product) => (
                  <div key={product.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-white">{product.name}</h4>
                        <p className="text-xs text-slate-400">{product.category || '-'}</p>
                      </div>
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full ${
                          product.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-600/40 text-slate-200'
                        }`}
                      >
                        {product.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 line-clamp-3">{product.description}</p>
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <p className="text-lg font-bold text-white">
                          {product.metadata?.currency || '¥'}
                          {product.price.toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-400">
                          {t({ zh: '佣金', en: 'Commission' })}: {product.commissionRate}%
                        </p>
                      </div>
                      <div className="text-right text-xs text-slate-400">
                        <p>
                          {t({ zh: '库存', en: 'Stock' })}:{' '}
                          <span className="text-white">{product.stock ?? 0}</span>
                        </p>
                        {product.metadata?.image && (
                          <img
                            src={product.metadata.image}
                            alt={product.name}
                            className="w-12 h-12 rounded-lg border border-white/10 mt-2 object-cover"
                          />
                        )}
                      </div>
                    </div>
                    {/* AI 能力状态 - 动态显示所有已注册的平台 */}
                    {product.metadata?.aiCompatible && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400">{t({ zh: 'AI 能力', en: 'AI Capabilities' })}:</span>
                        <div className="flex gap-1 flex-wrap">
                          {Object.keys(product.metadata.aiCompatible).map((platformId) => {
                            const platformNames: Record<string, { name: string; color: string }> = {
                              openai: { name: 'GPT', color: 'bg-green-500/20 text-green-300' },
                              claude: { name: 'Claude', color: 'bg-orange-500/20 text-orange-300' },
                              gemini: { name: 'Gemini', color: 'bg-blue-500/20 text-blue-300' },
                            };
                            const platformInfo = platformNames[platformId] || {
                              name: platformId,
                              color: 'bg-purple-500/20 text-purple-300',
                            };
                            return (
                              <span
                                key={platformId}
                                className={`px-2 py-0.5 ${platformInfo.color} rounded`}
                                title={platformId}
                              >
                                {platformInfo.name}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs">
                      <button
                        onClick={() => openEditProduct(product)}
                        className="text-blue-300 hover:text-blue-100 transition-colors"
                      >
                        {t({ zh: '编辑', en: 'Edit' })}
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product)}
                        className="text-red-300 hover:text-red-100 transition-colors"
                      >
                        {t({ zh: '删除', en: 'Delete' })}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{t({ zh: '订单管理', en: 'Order Management' })}</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {t({ zh: '按状态筛选订单，支持退款与状态更新', en: 'Filter orders, refund or update status' })}
                  </p>
                </div>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
                  {t({ zh: '导出订单', en: 'Export Orders' })}
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value as any)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="all">{t({ zh: '全部状态', en: 'All statuses' })}</option>
                  {['pending', 'paid', 'shipped', 'completed', 'cancelled', 'refunded'].map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <input
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder={t({ zh: '按商户/订单号搜索', en: 'Search merchant / order id' })}
                  className="flex-1 min-w-[200px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-400/30"
                />
              </div>
            </div>
            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                {t({ zh: '暂无订单', en: 'No orders' })}
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className="w-full text-left bg-white/5 border border-white/10 rounded-lg p-4 hover:border-blue-500/40 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{order.id}</p>
                        <p className="text-sm text-slate-400">
                          {new Date(order.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          {order.amount} {order.currency}
                        </p>
                        <p className="text-sm text-green-400">{order.status}</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 line-clamp-1">{order.description}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settlement' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{t({ zh: '结算管理', en: 'Settlement Management' })}</h3>
              <p className="text-xs text-slate-400">{t({ zh: '查看收入、佣金与结算记录', en: 'View revenue, commissions and settlements' })}</p>
            </div>

            <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
              <Shield className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-white">{t({ zh: '非托管分账原则', en: 'Non-custodial Splitting' })}</h4>
                <p className="text-xs text-slate-300 mt-1">
                  {t({ 
                    zh: 'Agentrix 采用非托管架构，资金始终在智能合约中，由合约自动执行分账。Agentrix 仅收取 0.1% 的 Off-ramp 服务费（可配置为 0）。', 
                    en: 'Agentrix uses a non-custodial architecture. Funds stay in smart contracts and are split automatically. Agentrix only charges a 0.1% Off-ramp service fee (configurable to 0).' 
                  })}
                </p>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : settlement ? (
              <>
                <div className="grid md:grid-cols-3 gap-4">
                  {settlementCards.map((card) => (
                    <div key={card.key} className="bg-white/5 border border-white/10 rounded-lg p-4">
                      <p className="text-sm text-slate-400 mb-1">{t(card.label)}</p>
                      <p className="text-2xl font-bold">{settlement[card.key]}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-slate-200">{t({ zh: '最近结算记录', en: 'Recent settlements' })}</h4>
                    <button
                      onClick={() => setSettlementExpanded((prev) => !prev)}
                      className="text-xs text-blue-300 hover:text-blue-100"
                    >
                      {settlementExpanded ? t({ zh: '收起', en: 'Collapse' }) : t({ zh: '展开全部', en: 'Show all' })}
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {settlementHistory
                      .slice(0, settlementExpanded ? settlementHistory.length : 5)
                      .map((record) => (
                        <div key={record.id} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-xs">
                          <div>
                            <p className="font-semibold text-white">{record.amount} {record.currency}</p>
                            <p className="text-slate-400">
                              {new Date(record.settlementDate || record.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full ${
                              record.status === 'completed'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-200'
                            }`}
                          >
                            {record.status}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-slate-400">
                {t({ zh: '暂无结算数据', en: 'No settlement data' })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{t({ zh: '数据分析与财务报表', en: 'Analytics & Financial Reports' })}</h3>
                <p className="text-xs text-slate-400">{t({ zh: '监控业务增长与下载对账单', en: 'Monitor growth and download reconciliation statements' })}</p>
              </div>
              <div className="flex gap-2">
                <button className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-300 hover:bg-white/10 transition-all">
                  <Download size={16} />
                  {t({ zh: '导出 CSV', en: 'Export CSV' })}
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-all">
                  <BarChart3 size={16} />
                  {t({ zh: '生成月报', en: 'Monthly Report' })}
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : analytics ? (
              <>
                <div className="grid md:grid-cols-4 gap-4">
                  <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t({ zh: '今日GMV', en: 'Today GMV' })}</p>
                    <p className="text-2xl font-bold text-white">{analytics.todayGMV}</p>
                    <div className="flex items-center gap-1 mt-2 text-emerald-400 text-[10px] font-bold">
                      <TrendingUp size={12} />
                      +12.5%
                    </div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t({ zh: '今日订单', en: 'Today Orders' })}</p>
                    <p className="text-2xl font-bold text-white">{analytics.todayOrders}</p>
                    <div className="flex items-center gap-1 mt-2 text-emerald-400 text-[10px] font-bold">
                      <TrendingUp size={12} />
                      +5.2%
                    </div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t({ zh: '支付成功率', en: 'Success Rate' })}</p>
                    <p className="text-2xl font-bold text-white">{analytics.successRate}</p>
                    <div className="flex items-center gap-1 mt-2 text-blue-400 text-[10px] font-bold">
                      <Activity size={12} />
                      Stable
                    </div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t({ zh: '平均订单金额', en: 'Avg Order Value' })}</p>
                    <p className="text-2xl font-bold text-white">{analytics.avgOrderValue}</p>
                    <div className="flex items-center gap-1 mt-2 text-slate-500 text-[10px] font-bold">
                      <Clock size={12} />
                      Last 24h
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h4 className="font-bold text-white mb-6 flex items-center gap-2">
                      <TrendingUp size={18} className="text-blue-400" />
                      {t({ zh: '收入趋势', en: 'Revenue Trend' })}
                    </h4>
                    <div className="h-48 flex items-end gap-2 px-2">
                      {[40, 60, 45, 90, 65, 80, 100].map((h, i) => (
                        <div key={i} className="flex-1 bg-blue-600/20 rounded-t-lg relative group">
                          <div 
                            className="absolute bottom-0 left-0 right-0 bg-blue-500 rounded-t-lg transition-all duration-1000 group-hover:bg-blue-400" 
                            style={{ height: `${h}%` }}
                          ></div>
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                            Day {i+1}: ${h*10}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between mt-4 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                      <span>Mon</span>
                      <span>Tue</span>
                      <span>Wed</span>
                      <span>Thu</span>
                      <span>Fri</span>
                      <span>Sat</span>
                      <span>Sun</span>
                    </div>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h4 className="font-bold text-white mb-6 flex items-center gap-2">
                      <PieChart size={18} className="text-purple-400" />
                      {t({ zh: '支付方式分布', en: 'Payment Methods' })}
                    </h4>
                    <div className="space-y-4">
                      {[
                        { label: 'QuickPay (X402)', value: 65, color: 'bg-blue-500' },
                        { label: 'Wallet Pay', value: 25, color: 'bg-purple-500' },
                        { label: 'Fiat (Transak)', value: 10, color: 'bg-emerald-500' }
                      ].map((item, i) => (
                        <div key={i} className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-300">{item.label}</span>
                            <span className="text-white font-bold">{item.value}%</span>
                          </div>
                          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                            <div className={`h-full ${item.color}`} style={{ width: `${item.value}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-slate-400">
                {t({ zh: '暂无分析数据', en: 'No analytics data' })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'subscriptions' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{t({ zh: '订阅管理', en: 'Subscription Management' })}</h3>
                <p className="text-xs text-slate-400">{t({ zh: '管理周期性扣款与订阅用户', en: 'Manage recurring payments and subscribers' })}</p>
              </div>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
                {t({ zh: '创建订阅计划', en: 'Create Plan' })}
              </button>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t({ zh: '活跃订阅', en: 'Active Subs' })}</p>
                <p className="text-2xl font-bold text-white">128</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t({ zh: 'MRR (月经常性收入)', en: 'MRR' })}</p>
                <p className="text-2xl font-bold text-emerald-400">$12,450</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t({ zh: '流失率', en: 'Churn Rate' })}</p>
                <p className="text-2xl font-bold text-amber-400">2.4%</p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">{t({ zh: '用户', en: 'User' })}</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">{t({ zh: '计划', en: 'Plan' })}</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">{t({ zh: '金额', en: 'Amount' })}</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">{t({ zh: '下次账单', en: 'Next Billing' })}</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">{t({ zh: '状态', en: 'Status' })}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-medium text-white">AX-8829...1022</td>
                    <td className="px-6 py-4 text-slate-300">Premium AI Agent</td>
                    <td className="px-6 py-4 text-white font-bold">$49.00/mo</td>
                    <td className="px-6 py-4 text-slate-400">2025-01-15</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-bold">ACTIVE</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'checkout_config' && (
          <div className="space-y-6 max-w-4xl">
            <div>
              <h3 className="text-lg font-semibold">{t({ zh: '托管收银台配置', en: 'Hosted Checkout Config' })}</h3>
              <p className="text-xs text-slate-400">{t({ zh: '自定义您的支付页面外观与体验', en: 'Customize your payment page look and feel' })}</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                  <h4 className="font-bold text-white flex items-center gap-2">
                    <Sparkles size={18} className="text-amber-400" />
                    {t({ zh: '品牌设置', en: 'Branding' })}
                  </h4>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">{t({ zh: '品牌颜色', en: 'Brand Color' })}</label>
                    <div className="flex gap-3">
                      {['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706'].map(color => (
                        <button 
                          key={color}
                          className="w-8 h-8 rounded-full border-2 border-white/10"
                          style={{ backgroundColor: color }}
                        ></button>
                      ))}
                      <button className="w-8 h-8 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center text-slate-500">+</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">{t({ zh: '商户 Logo', en: 'Merchant Logo' })}</label>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-slate-800 rounded-xl border border-white/10 flex items-center justify-center text-slate-600">
                        <Store size={24} />
                      </div>
                      <button className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-white hover:bg-white/10 transition-all">
                        {t({ zh: '上传图片', en: 'Upload Image' })}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                  <h4 className="font-bold text-white flex items-center gap-2">
                    <Settings size={18} className="text-blue-400" />
                    {t({ zh: '支付选项', en: 'Payment Options' })}
                  </h4>
                  <div className="space-y-3">
                    {[
                      { label: 'QuickPay (One-click)', enabled: true },
                      { label: 'Wallet Transfer', enabled: true },
                      { label: 'Fiat On-ramp (Transak)', enabled: false },
                      { label: 'Apple/Google Pay', enabled: false }
                    ].map((opt, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                        <span className="text-sm text-slate-300">{opt.label}</span>
                        <div className={`w-10 h-5 rounded-full relative transition-colors ${opt.enabled ? 'bg-blue-600' : 'bg-slate-700'}`}>
                          <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${opt.enabled ? 'right-1' : 'left-1'}`}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">{t({ zh: '实时预览', en: 'Live Preview' })}</label>
                <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl aspect-[9/16] max-w-[300px] mx-auto">
                  <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg"></div>
                    <div className="w-20 h-2 bg-slate-800 rounded"></div>
                  </div>
                  <div className="p-6 space-y-6">
                    <div className="space-y-2">
                      <div className="w-full h-4 bg-slate-800 rounded"></div>
                      <div className="w-2/3 h-3 bg-slate-800/50 rounded"></div>
                    </div>
                    <div className="text-center py-8">
                      <div className="text-3xl font-bold text-white">$49.00</div>
                      <div className="text-[10px] text-slate-500 uppercase mt-1">Total Amount</div>
                    </div>
                    <div className="space-y-3">
                      <div className="w-full h-12 bg-blue-600 rounded-xl flex items-center justify-center gap-2">
                        <Zap size={16} className="text-white" />
                        <div className="w-20 h-3 bg-white/20 rounded"></div>
                      </div>
                      <div className="w-full h-12 bg-white/5 border border-white/10 rounded-xl"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'api_keys' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{t({ zh: 'API密钥', en: 'API Keys' })}</h3>
                <p className="text-xs text-slate-400">{t({ zh: '管理您的 API 访问密钥', en: 'Manage your API access keys' })}</p>
              </div>
              <button 
                onClick={handleCreateApiKey}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>{t({ zh: '创建密钥', en: 'Create Key' })}</span>
              </button>
            </div>

            <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
              <Key className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-white">{t({ zh: '关于 API 密钥', en: 'About API Keys' })}</h4>
                <p className="text-xs text-slate-300 mt-1">
                  {t({ 
                    zh: 'API 密钥允许您的应用程序以商户身份访问 Agentrix 平台。您可以创建多个密钥用于不同的环境（如开发、生产）。请妥善保管您的密钥，不要将其泄露给他人。', 
                    en: 'API keys allow your applications to access the Agentrix platform as a merchant. You can create multiple keys for different environments (e.g., dev, prod). Please keep your keys secure and do not share them.' 
                  })}
                </p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">{t({ zh: '名称', en: 'Name' })}</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">{t({ zh: '密钥', en: 'Key' })}</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">{t({ zh: '模式', en: 'Mode' })}</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">{t({ zh: '操作', en: 'Actions' })}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {apiKeys.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                        {t({ zh: '暂无 API 密钥', en: 'No API Keys found' })}
                      </td>
                    </tr>
                  ) : (
                    apiKeys.map((key) => (
                      <tr key={key.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-medium text-white">{key.name}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2">
                            <code className="bg-slate-800 px-2 py-1 rounded text-xs font-mono text-slate-300">
                              {key.keyPrefix}****************
                            </code>
                            <button 
                              onClick={() => handleCopy(key.keyPrefix, key.id)}
                              className="text-slate-400 hover:text-blue-400 transition-colors"
                            >
                              {copiedId === key.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            key.mode === 'production' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'
                          }`}>
                            {key.mode.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => handleDeleteApiKey(key.id)}
                            className="text-slate-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'webhooks' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{t({ zh: 'Webhooks', en: 'Webhooks' })}</h3>
                <p className="text-xs text-slate-400">{t({ zh: '接收实时事件通知', en: 'Receive real-time event notifications' })}</p>
              </div>
              <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
                <Plus className="w-4 h-4" />
                <span>{t({ zh: '添加端点', en: 'Add Endpoint' })}</span>
              </button>
            </div>

            {webhooks.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
                <Webhook className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <h4 className="text-lg font-bold text-white mb-2">{t({ zh: '尚未配置 Webhook', en: 'No Webhooks Configured' })}</h4>
                <p className="text-slate-400 max-w-sm mx-auto mb-6">
                  {t({ zh: '配置 Webhook 端点，在支付完成或失败时接收自动通知。', en: 'Configure a webhook endpoint to receive automated notifications when payments are completed or failed.' })}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {webhooks.map((hook) => (
                  <div key={hook.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">{hook.url}</p>
                      <p className="text-xs text-slate-400">{hook.events.join(', ')}</p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${hook.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-600/40 text-slate-200'}`}>
                        {hook.active ? 'Active' : 'Inactive'}
                      </span>
                      <button className="text-slate-400 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{t({ zh: '审计链', en: 'Audit Chain' })}</h3>
                <p className="text-xs text-slate-400">{t({ zh: '基于区块链的交易审计与存证', en: 'Blockchain-based transaction audit and evidence' })}</p>
              </div>
              <div className="flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                <Activity className="w-3 h-3 animate-pulse" />
                <span>{t({ zh: '审计同步中', en: 'Audit Syncing' })}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-1">{t({ zh: '已存证交易', en: 'Audited Transactions' })}</p>
                <p className="text-xl font-bold text-white">1,284</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-1">{t({ zh: '链上区块高度', en: 'Block Height' })}</p>
                <p className="text-xl font-bold text-white">#18,294,102</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-1">{t({ zh: '审计节点状态', en: 'Node Status' })}</p>
                <p className="text-xl font-bold text-emerald-400">{t({ zh: '运行中', en: 'Running' })}</p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 bg-white/5">
                <h4 className="text-sm font-semibold text-white">{t({ zh: '最近审计记录', en: 'Recent Audit Records' })}</h4>
              </div>
              <div className="divide-y divide-white/5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                        <ShieldCheck className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">TX-AUDIT-00{i}</p>
                        <p className="text-xs text-slate-500">2025-12-22 14:30:2{i}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <code className="text-[10px] text-slate-400 font-mono">0x7f...a2{i}b</code>
                      <p className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider">Verified</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ecommerce' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-medium text-white">{t({ zh: '电商平台同步', en: 'Ecommerce Sync' })}</h3>
                <p className="text-sm text-slate-400">{t({ zh: '连接您的 Shopify, WooCommerce 或 Amazon 店铺', en: 'Connect your Shopify, WooCommerce or Amazon stores' })}</p>
              </div>
              <button 
                onClick={() => setShowAddConnectionModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t({ zh: '连接新平台', en: 'Connect New Platform' })}
              </button>
            </div>

            {syncResult && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-bold text-green-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    {t({ zh: '同步完成', en: 'Sync Completed' })}
                  </h4>
                  <button onClick={() => setSyncResult(null)} className="text-slate-400 hover:text-white">×</button>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xl font-bold text-green-400">{syncResult.imported}</div>
                    <div className="text-xs text-slate-400">{t({ zh: '新增商品', en: 'New Products' })}</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-blue-400">{syncResult.updated}</div>
                    <div className="text-xs text-slate-400">{t({ zh: '更新商品', en: 'Updated' })}</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-red-400">{syncResult.failed}</div>
                    <div className="text-xs text-slate-400">{t({ zh: '失败', en: 'Failed' })}</div>
                  </div>
                </div>
                {syncResult.errors.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-green-500/10">
                    <p className="text-xs text-red-400 font-medium mb-1">{t({ zh: '错误详情:', en: 'Error Details:' })}</p>
                    <ul className="text-[10px] text-slate-400 list-disc list-inside">
                      {syncResult.errors.slice(0, 3).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                      {syncResult.errors.length > 3 && <li>...</li>}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {connections.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {connections.map((conn) => (
                  <div key={conn.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-2xl">
                          {conn.platform === 'shopify' ? '🛍️' : conn.platform === 'woocommerce' ? '🛒' : '📦'}
                        </div>
                        <div>
                          <h4 className="font-medium text-white">{conn.storeName}</h4>
                          <p className={`text-xs ${conn.isActive ? 'text-green-400' : 'text-slate-400'}`}>
                            {conn.isActive ? t({ zh: '已连接', en: 'Connected' }) : t({ zh: '未连接', en: 'Disconnected' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleSync(conn.id)}
                          disabled={syncingId === conn.id}
                          className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 transition-colors"
                        >
                          <RefreshCw className={`w-4 h-4 ${syncingId === conn.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button 
                          onClick={() => handleToggleConnectionActive(conn.id, conn.isActive)}
                          className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 transition-colors"
                        >
                          {conn.isActive ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                        </button>
                        <button 
                          onClick={() => handleDeleteConnection(conn.id)}
                          className="p-2 hover:bg-slate-700 rounded-lg text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-400">
                      {t({ zh: '已同步商品: ', en: 'Synced products: ' })}{conn.stats?.syncedProducts || 0}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { id: 'shopify', name: 'Shopify', icon: '🛍️', color: 'bg-green-600' },
                  { id: 'woocommerce', name: 'WooCommerce', icon: '🛒', color: 'bg-purple-600' },
                  { id: 'amazon', name: 'Amazon', icon: '📦', color: 'bg-orange-500' },
                ].map((platform) => (
                  <div key={platform.id} className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col items-center text-center space-y-4">
                    <div className={`w-16 h-16 ${platform.color} rounded-2xl flex items-center justify-center text-3xl shadow-lg`}>
                      {platform.icon}
                    </div>
                    <div>
                      <h4 className="font-bold text-white">{platform.name}</h4>
                      <p className="text-xs text-slate-400 mt-1">{t({ zh: '自动同步商品与订单', en: 'Auto-sync products & orders' })}</p>
                    </div>
                    <button 
                      onClick={() => {
                        setSelectedPlatform(platform.id)
                        setShowAddConnectionModal(true)
                      }}
                      className="w-full py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-colors"
                    >
                      {t({ zh: '立即连接', en: 'Connect Now' })}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-blue-600/10 border border-blue-500/20 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 shrink-0">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white">{t({ zh: '同步状态', en: 'Sync Status' })}</h4>
                  <p className="text-sm text-slate-300 mt-1">
                    {t({ zh: '连接店铺后，Agentrix 将每 15 分钟自动同步一次数据。', en: 'Once connected, Agentrix will auto-sync every 15 minutes.' })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'batch_import' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{t({ zh: '批量导入', en: 'Batch Import' })}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {t({ zh: '通过 CSV 或 Excel 文件批量上传商品', en: 'Upload products in bulk via CSV or Excel' })}
                </p>
              </div>
            </div>

            <div className="bg-white/5 border-2 border-dashed border-white/10 rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-400">
                <Package className="w-10 h-10" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-white">{t({ zh: '拖放文件至此处', en: 'Drag & Drop Files' })}</h4>
                <p className="text-slate-400 mt-2">
                  {t({ zh: '支持 .csv, .xlsx 格式，单次最多 5000 条记录', en: 'Supports .csv, .xlsx, up to 5000 records' })}
                </p>
              </div>
              
              <div className="flex flex-col items-center gap-4 w-full max-w-md">
                <label className="w-full">
                  <div className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors cursor-pointer">
                    {importFile ? importFile.name : t({ zh: '选择文件', en: 'Select File' })}
                  </div>
                  <input type="file" className="hidden" accept=".csv,.xlsx" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
                </label>
                
                {importFile && (
                  <div className="flex gap-3 w-full">
                    <button 
                      onClick={() => setImportFile(null)}
                      className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                    >
                      {t({ zh: '取消', en: 'Cancel' })}
                    </button>
                    <button 
                      disabled={importing}
                      className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                    >
                      {importing ? t({ zh: '正在导入...', en: 'Importing...' }) : t({ zh: '开始导入', en: 'Start Import' })}
                    </button>
                  </div>
                )}
                
                {!importFile && (
                  <button className="px-6 py-2 bg-white/5 text-white border border-white/10 rounded-xl font-medium hover:bg-white/10 transition-colors">
                    {t({ zh: '下载模板', en: 'Download Template' })}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'mpc_wallet' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-medium text-white">MPC 托管钱包</h3>
                <p className="text-sm text-slate-400">基于多方计算技术的安全托管方案，无需管理私钥</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={loadMpcWallet}
                  className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${mpcLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {mpcWallet ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-xl">
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <p className="text-blue-100 text-sm mb-1">总资产估值</p>
                        <h4 className="text-3xl font-bold">${(mpcWallet as any).balance?.toFixed(2) || '0.00'}</h4>
                      </div>
                      <div className="px-3 py-1 bg-white/20 rounded-full text-xs backdrop-blur-sm">
                        MPC 安全保护
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <p className="text-blue-100 text-xs mb-1">钱包地址 (BSC/ETH)</p>
                        <div className="flex items-center gap-2 bg-black/20 p-2 rounded-lg">
                          <code className="text-sm break-all">{mpcWallet.walletAddress}</code>
                          <button 
                            onClick={() => handleCopy(mpcWallet.walletAddress, 'mpc-addr')}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                          >
                            {copiedId === 'mpc-addr' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                      <h4 className="font-medium text-white">资产明细</h4>
                    </div>
                    <div className="divide-y divide-slate-700">
                      <div className="p-4 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-yellow-500/20 rounded-full flex items-center justify-center text-yellow-500 font-bold">B</div>
                          <div>
                            <p className="text-white font-medium">BNB</p>
                            <p className="text-xs text-slate-400">Binance Coin</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-white font-medium">0.45 BNB</p>
                          <p className="text-xs text-slate-400">$284.20</p>
                        </div>
                      </div>
                      <div className="p-4 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center text-green-500 font-bold">U</div>
                          <div>
                            <p className="text-white font-medium">USDT</p>
                            <p className="text-xs text-slate-400">Tether USD</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-white font-medium">1,250.00 USDT</p>
                          <p className="text-xs text-slate-400">$1,250.00</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                    <h4 className="font-medium text-white mb-4">快速操作</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <button className="flex flex-col items-center gap-2 p-4 bg-slate-700/50 hover:bg-slate-700 rounded-xl transition-colors">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400">
                          <ArrowUpRight className="w-5 h-5" />
                        </div>
                        <span className="text-sm text-white">转账</span>
                      </button>
                      <button className="flex flex-col items-center gap-2 p-4 bg-slate-700/50 hover:bg-slate-700 rounded-xl transition-colors">
                        <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center text-green-400">
                          <ArrowDownLeft className="w-5 h-5" />
                        </div>
                        <span className="text-sm text-white">收款</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                    <h4 className="font-medium text-white mb-2">安全设置</h4>
                    <p className="text-xs text-slate-400 mb-4">您的钱包受 MPC 分片保护，分片存储在 Agentrix 安全 enclave 中。</p>
                    <button className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors">
                      查看安全分片状态
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-12 text-center">
                <div className="max-w-md mx-auto">
                  <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Shield className="w-8 h-8 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">创建您的 MPC 托管钱包</h3>
                  <p className="text-slate-400 mb-6">
                    MPC 钱包让您无需管理复杂的私钥，即可安全地接收和管理加密货币。
                    适合需要高安全性和易用性的商家。
                  </p>
                  <button 
                    onClick={async () => {
                      const password = prompt(t({ zh: '请设置钱包密码', en: 'Please set wallet password' }))
                      if (!password) return
                      setMpcLoading(true)
                      try {
                        await mpcWalletApi.createWallet({ password })
                        await loadMpcWallet()
                      } catch (error) {
                        console.error('创建钱包失败:', error)
                      } finally {
                        setMpcLoading(false)
                      }
                    }}
                    disabled={mpcLoading}
                    className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20"
                  >
                    {mpcLoading ? '正在创建...' : '立即创建'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'off_ramp' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{t({ zh: 'Off-ramp 出金管理', en: 'Off-ramp Management' })}</h3>
                <p className="text-xs text-slate-400">{t({ zh: '将数字货币收入转换为法币并结算至您的银行账户', en: 'Convert crypto revenue to fiat and settle to your bank account' })}</p>
              </div>
              <button 
                onClick={loadSettlement}
                className="p-2 hover:bg-white/10 rounded-lg text-slate-400 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-1">{t({ zh: '待结算金额', en: 'Pending Settlement' })}</p>
                <p className="text-2xl font-bold text-white">{settlement?.pendingSettlement || '¥0.00'}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-1">{t({ zh: '已结算总额', en: 'Total Settled' })}</p>
                <p className="text-2xl font-bold text-emerald-400">{settlement?.settledAmount || '¥0.00'}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-1">{t({ zh: '结算通道状态', en: 'Channel Status' })}</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-sm font-medium text-emerald-400">{t({ zh: '正常 (T+1)', en: 'Normal (T+1)' })}</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-white">{t({ zh: '关于 Off-ramp', en: 'About Off-ramp' })}</h4>
                <p className="text-xs text-slate-300 mt-1">
                  {t({ 
                    zh: 'Agentrix 自动将您的数字货币收入通过合规通道转换为法币。结算通常在 T+1 个工作日内完成。您可以设置自动结算阈值或手动发起结算。', 
                    en: 'Agentrix automatically converts your crypto revenue to fiat via compliant channels. Settlement usually completes within T+1 business days. You can set auto-settlement thresholds or initiate manually.' 
                  })}
                </p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
                <h4 className="text-sm font-semibold text-white">{t({ zh: '出金记录', en: 'Off-ramp Records' })}</h4>
                <button 
                  onClick={() => commissionApi.executeSettlement({ payeeType: 'merchant' }).then(() => loadSettlement())}
                  className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                >
                  {t({ zh: '立即结算', en: 'Settle Now' })}
                </button>
              </div>
              <div className="divide-y divide-white/5">
                {settlementHistory.length === 0 ? (
                  <div className="px-6 py-12 text-center text-slate-500">
                    {t({ zh: '暂无出金记录', en: 'No off-ramp records found' })}
                  </div>
                ) : (
                  settlementHistory.map((record) => (
                    <div key={record.id} className="px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                      <div className="flex items-center space-x-4">
                        <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                          <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{record.amount} {record.currency}</p>
                          <p className="text-xs text-slate-500">{new Date(record.settlementDate || record.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          record.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {record.status}
                        </span>
                        {record.transactionHash && (
                          <p className="text-[10px] text-slate-500 font-mono mt-1">{record.transactionHash.substring(0, 10)}...</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'integration_guide' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{t({ zh: '支付集成向导', en: 'Payment Integration Wizard' })}</h3>
                <p className="text-xs text-slate-400">{t({ zh: '跟随向导，在几分钟内完成支付集成', en: 'Follow the wizard to complete payment integration in minutes' })}</p>
              </div>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((step) => (
                  <div 
                    key={step}
                    className={`w-8 h-1 rounded-full transition-colors ${
                      wizardStep >= step ? 'bg-blue-500' : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Step 1: Select Type */}
            {wizardStep === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-center py-4">
                  <h4 className="text-xl font-bold text-white mb-2">{t({ zh: '选择集成方式', en: 'Choose Integration Type' })}</h4>
                  <p className="text-slate-400">{t({ zh: '根据您的业务场景选择最合适的支付方案', en: 'Select the best payment solution for your business scenario' })}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <button 
                    onClick={() => { setIntegrationType('hosted'); setWizardStep(2); }}
                    className={`p-6 rounded-2xl border-2 transition-all text-left group ${
                      integrationType === 'hosted' ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                      <Globe className="w-6 h-6" />
                    </div>
                    <h4 className="text-lg font-bold text-white mb-2">{t({ zh: '标准收银台 (Hosted)', en: 'Hosted Checkout' })}</h4>
                    <p className="text-sm text-slate-400 mb-4">
                      {t({ 
                        zh: '最简单的集成方式。用户将被重定向到 Agentrix 托管的支付页面。适用于传统电商和 Web 应用。', 
                        en: 'Simplest integration. Users are redirected to Agentrix hosted payment page. Best for traditional e-commerce.' 
                      })}
                    </p>
                    <div className="flex items-center text-blue-400 text-sm font-medium">
                      {t({ zh: '选择此方案', en: 'Select this option' })} <ChevronRight className="w-4 h-4 ml-1" />
                    </div>
                  </button>

                  <button 
                    onClick={() => { setIntegrationType('x402'); setWizardStep(2); }}
                    className={`p-6 rounded-2xl border-2 transition-all text-left group ${
                      integrationType === 'x402' ? 'border-purple-500 bg-purple-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center text-purple-400 mb-4 group-hover:scale-110 transition-transform">
                      <Zap className="w-6 h-6" />
                    </div>
                    <h4 className="text-lg font-bold text-white mb-2">{t({ zh: 'Agent 快捷支付 (X402)', en: 'Agent QuickPay (X402)' })}</h4>
                    <p className="text-sm text-slate-400 mb-4">
                      {t({ 
                        zh: '为 AI Agent 设计的无感支付协议。支持免密支付、自动分账。适用于 AI 助手和自动化流程。', 
                        en: 'Seamless protocol for AI Agents. Supports password-free payments and auto-splitting. Best for AI assistants.' 
                      })}
                    </p>
                    <div className="flex items-center text-purple-400 text-sm font-medium">
                      {t({ zh: '选择此方案', en: 'Select this option' })} <ChevronRight className="w-4 h-4 ml-1" />
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: API Keys */}
            {wizardStep === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-10 h-10 bg-blue-600/20 rounded-full flex items-center justify-center text-blue-400">
                      <Key className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white">{t({ zh: '配置 API 密钥', en: 'Configure API Keys' })}</h4>
                      <p className="text-sm text-slate-400">{t({ zh: '您需要 API 密钥来验证您的请求', en: 'You need API keys to authenticate your requests' })}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 bg-slate-900/50 rounded-xl border border-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Public Key</span>
                        <span className="text-[10px] px-2 py-0.5 bg-green-500/10 text-green-400 rounded-full border border-green-500/20">Active</span>
                      </div>
                      <div className="font-mono text-sm text-white break-all">pk_live_51Nz...8x9a</div>
                    </div>
                    <div className="p-4 bg-slate-900/50 rounded-xl border border-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Secret Key</span>
                        <span className="text-[10px] px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded-full border border-yellow-500/20">Hidden</span>
                      </div>
                      <div className="font-mono text-sm text-slate-500">sk_live_••••••••••••••••••••••••</div>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-between">
                    <button 
                      onClick={() => setWizardStep(1)}
                      className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                    >
                      {t({ zh: '上一步', en: 'Back' })}
                    </button>
                    <button 
                      onClick={() => setWizardStep(3)}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                    >
                      {t({ zh: '我已保存密钥，下一步', en: 'I have saved keys, Next' })}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Webhook */}
            {wizardStep === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-10 h-10 bg-green-600/20 rounded-full flex items-center justify-center text-green-400">
                      <Bell className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white">{t({ zh: '配置 Webhook', en: 'Configure Webhook' })}</h4>
                      <p className="text-sm text-slate-400">{t({ zh: '接收支付成功、退款等实时通知', en: 'Receive real-time notifications for payments, refunds, etc.' })}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">{t({ zh: 'Webhook 接收地址', en: 'Webhook Endpoint URL' })}</label>
                      <input 
                        type="text" 
                        placeholder="https://your-api.com/webhooks/agentrix"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                    <div className="p-4 bg-blue-500/5 rounded-xl border border-blue-500/10">
                      <p className="text-xs text-blue-400 leading-relaxed">
                        {t({ 
                          zh: '提示：我们建议在生产环境中使用 HTTPS。您可以先使用工具（如 ngrok）在本地测试。', 
                          en: 'Tip: We recommend using HTTPS in production. You can use tools like ngrok for local testing.' 
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-between">
                    <button 
                      onClick={() => setWizardStep(2)}
                      className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                    >
                      {t({ zh: '上一步', en: 'Back' })}
                    </button>
                    <button 
                      onClick={() => setWizardStep(4)}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                    >
                      {t({ zh: '保存并下一步', en: 'Save and Next' })}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Implementation */}
            {wizardStep === 4 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-purple-600/20 rounded-full flex items-center justify-center text-purple-400">
                        <Code className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-lg font-bold text-white">{t({ zh: '代码实现', en: 'Implementation' })}</h4>
                        <p className="text-sm text-slate-400">{t({ zh: '将以下代码集成到您的应用中', en: 'Integrate the following code into your app' })}</p>
                      </div>
                    </div>
                    <div className="flex bg-white/5 rounded-lg p-1">
                      <button className="px-3 py-1 text-xs font-medium bg-white/10 text-white rounded-md">Node.js</button>
                      <button className="px-3 py-1 text-xs font-medium text-slate-400 hover:text-white">Python</button>
                      <button className="px-3 py-1 text-xs font-medium text-slate-400 hover:text-white">Go</button>
                    </div>
                  </div>

                  <div className="relative group">
                    <pre className="bg-slate-950 rounded-xl p-5 font-mono text-sm text-blue-300 overflow-x-auto border border-white/5">
                      {integrationType === 'x402' ? (
`import { Agentrix } from '@agentrix/sdk';

const ax = new Agentrix('sk_live_...');

// 为 Agent 发起支付请求
const payment = await ax.payments.create({
  amount: 1000, // $10.00
  currency: 'usd',
  protocol: 'X402',
  metadata: { agent_id: 'agent_007' }
});

console.log('Payment URL:', payment.checkout_url);`
                      ) : (
`import { Agentrix } from '@agentrix/sdk';

const ax = new Agentrix('sk_live_...');

// 创建托管收银台会话
const session = await ax.checkout.sessions.create({
  success_url: 'https://example.com/success',
  cancel_url: 'https://example.com/cancel',
  line_items: [
    { price: 'price_123', quantity: 1 }
  ],
  mode: 'payment',
});

window.location.href = session.url;`
                      )}
                    </pre>
                    <button className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors opacity-0 group-hover:opacity-100">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-6 flex justify-between">
                    <button 
                      onClick={() => setWizardStep(3)}
                      className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                    >
                      {t({ zh: '上一步', en: 'Back' })}
                    </button>
                    <button 
                      onClick={() => setWizardStep(5)}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                    >
                      {t({ zh: '完成集成，去测试', en: 'Done, Go to Test' })}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Test */}
            {wizardStep === 5 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                  <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center text-green-400 mx-auto mb-6">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h4 className="text-2xl font-bold text-white mb-2">{t({ zh: '集成准备就绪！', en: 'Integration Ready!' })}</h4>
                  <p className="text-slate-400 mb-8 max-w-md mx-auto">
                    {t({ 
                      zh: '您已完成所有配置步骤。现在可以发起一笔测试交易来验证您的集成是否成功。', 
                      en: 'You have completed all configuration steps. Now you can initiate a test transaction to verify your integration.' 
                    })}
                  </p>

                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <button 
                      onClick={handleLaunchTestPayment}
                      disabled={isTestingPayment}
                      className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all hover:scale-105 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isTestingPayment ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <Play className="w-5 h-5" />
                      )}
                      {t({ zh: '发起测试支付', en: 'Launch Test Payment' })}
                    </button>
                    <button 
                      onClick={() => setWizardStep(1)}
                      className="px-8 py-3 bg-white/5 text-white border border-white/10 rounded-xl font-bold hover:bg-white/10 transition-all"
                    >
                      {t({ zh: '重新开始', en: 'Restart Wizard' })}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                    <h5 className="text-sm font-bold text-white mb-1">{t({ zh: '查看日志', en: 'View Logs' })}</h5>
                    <p className="text-xs text-slate-500">{t({ zh: '实时监控 API 请求和 Webhook 响应', en: 'Monitor API requests and webhook responses' })}</p>
                  </div>
                  <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                    <h5 className="text-sm font-bold text-white mb-1">{t({ zh: '开发者文档', en: 'Developer Docs' })}</h5>
                    <p className="text-xs text-slate-500">{t({ zh: '深入了解所有 API 参数和高级功能', en: 'Deep dive into API parameters and features' })}</p>
                  </div>
                  <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                    <h5 className="text-sm font-bold text-white mb-1">{t({ zh: '加入社区', en: 'Join Community' })}</h5>
                    <p className="text-xs text-slate-500">{t({ zh: '在 Discord 中获取技术支持', en: 'Get technical support in Discord' })}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 推广中心 */}
        {activeTab === 'promotion' && (
          <PromotionPanel />
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">{t({ zh: '商户设置', en: 'Merchant Settings' })}</h3>
            
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">{t({ zh: '商户名称', en: 'Merchant Name' })}</label>
                  <input 
                    type="text" 
                    defaultValue={user?.nickname || 'Agentrix Merchant'} 
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">{t({ zh: '结算货币', en: 'Settlement Currency' })}</label>
                  <select className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none">
                    <option>USDC</option>
                    <option>USDT</option>
                    <option>CNY</option>
                    <option>USD</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">{t({ zh: '商户描述', en: 'Merchant Description' })}</label>
                <textarea 
                  rows={3}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder={t({ zh: '介绍您的业务...', en: 'Describe your business...' })}
                />
              </div>

              <div className="pt-4 border-t border-white/10 flex justify-end">
                <button className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                  {t({ zh: '保存设置', en: 'Save Settings' })}
                </button>
              </div>
            </div>

            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
              <h4 className="text-red-400 font-bold mb-2">{t({ zh: '危险区域', en: 'Danger Zone' })}</h4>
              <p className="text-sm text-slate-400 mb-4">{t({ zh: '注销商户身份将清除所有商户数据且不可恢复。', en: 'Deactivating merchant status will clear all merchant data and is irreversible.' })}</p>
              <button className="px-4 py-2 border border-red-500/50 text-red-400 rounded-lg text-sm hover:bg-red-500/20 transition-colors">
                {t({ zh: '注销商户', en: 'Deactivate Merchant' })}
              </button>
            </div>
          </div>
        )}
      </div>
      {productModalOpen && (
        <ProductEditorModal
          form={productForm}
          onChange={setProductForm}
          onClose={() => {
            setProductModalOpen(false)
            setEditingProduct(null)
          }}
          onSubmit={handleProductSubmit}
          onImageUpload={handleImageUpload}
          isUploadingImage={isUploadingImage}
          loading={productSubmitting}
          isEditing={Boolean(editingProduct)}
          product={editingProduct}
        />
      )}
      {selectedOrder && (
        <OrderDetailDrawer
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdateStatus={handleOrderStatusUpdate}
          onRefund={handleOrderRefund}
          loading={orderActionLoading}
        />
      )}
      {showAddConnectionModal && (
        <AddConnectionModal
          onClose={() => {
            setShowAddConnectionModal(false)
            setSelectedPlatform(null)
          }}
          onSubmit={handleCreateConnection}
          platform={selectedPlatform}
          setPlatform={setSelectedPlatform}
          formData={connectionFormData}
          setFormData={setConnectionFormData}
        />
      )}
    </div>
  )
}

function AddConnectionModal({
  onClose,
  onSubmit,
  platform,
  setPlatform,
  formData,
  setFormData,
}: {
  onClose: () => void
  onSubmit: () => void
  platform: string | null
  setPlatform: (p: string) => void
  formData: Record<string, string>
  setFormData: React.Dispatch<React.SetStateAction<Record<string, string>>>
}) {
  const { t } = useLocalization()
  
  const platforms = [
    { id: 'shopify', name: 'Shopify', fields: ['apiKey', 'apiSecret', 'storeDomain'] },
    { id: 'woocommerce', name: 'WooCommerce', fields: ['consumerKey', 'consumerSecret', 'storeUrl'] },
    { id: 'magento', name: 'Magento', fields: ['accessToken', 'storeUrl'] },
    { id: 'bigcommerce', name: 'BigCommerce', fields: ['accessToken', 'storeHash', 'clientId'] },
    { id: 'custom', name: 'Custom API', fields: ['apiEndpoint', 'apiKey'] },
  ]

  const selectedPlatformInfo = platforms.find(p => p.id === platform)

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const getFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      apiKey: 'API Key',
      apiSecret: 'API Secret',
      consumerKey: 'Consumer Key',
      consumerSecret: 'Consumer Secret',
      accessToken: 'Access Token',
      storeHash: 'Store Hash',
      clientId: 'Client ID',
      apiEndpoint: 'API Endpoint',
      storeDomain: 'Store Domain (e.g. myshop.myshopify.com)',
      storeUrl: 'Store URL (e.g. https://myshop.com)',
      storeName: t({ zh: '店铺名称', en: 'Store Name' }),
    }
    return labels[field] || field
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-lg font-bold text-white">{t({ zh: '连接电商平台', en: 'Connect Ecommerce Platform' })}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">×</button>
        </div>
        
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {!platform ? (
            <div className="grid grid-cols-2 gap-4">
              {platforms.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl hover:border-blue-500/50 hover:bg-slate-800 transition-all text-center"
                >
                  <div className="text-2xl mb-2">
                    {p.id === 'shopify' ? '🛍️' : p.id === 'woocommerce' ? '🛒' : '⚙️'}
                  </div>
                  <div className="text-sm font-medium text-white">{p.name}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <button 
                onClick={() => setPlatform('')}
                className="text-xs text-blue-400 hover:underline mb-2"
              >
                ← {t({ zh: '重新选择平台', en: 'Back to platforms' })}
              </button>
              
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">{getFieldLabel('storeName')}</label>
                  <input
                    type="text"
                    value={formData.storeName}
                    onChange={(e) => updateField('storeName', e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder={t({ zh: '我的店铺', en: 'My Store' })}
                  />
                </div>
                
                {selectedPlatformInfo?.fields.map(field => (
                  <div key={field} className="space-y-1">
                    <label className="text-xs text-slate-400">{getFieldLabel(field)}</label>
                    <input
                      type={field.toLowerCase().includes('secret') || field.toLowerCase().includes('token') || field.toLowerCase().includes('key') ? 'password' : 'text'}
                      value={formData[field] || ''}
                      onChange={(e) => updateField(field, e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">
            {t({ zh: '取消', en: 'Cancel' })}
          </button>
          <button
            onClick={onSubmit}
            disabled={!platform || !formData.storeName}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
          >
            {t({ zh: '立即连接', en: 'Connect Now' })}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProductEditorModal({
  form,
  onChange,
  onClose,
  onSubmit,
  onImageUpload,
  isUploadingImage,
  loading,
  isEditing,
  product,
}: {
  form: ProductFormState
  onChange: (updater: ProductFormState | ((prev: ProductFormState) => ProductFormState)) => void
  onClose: () => void
  onSubmit: () => void
  onImageUpload: (file: File) => void
  isUploadingImage: boolean
  loading: boolean
  isEditing: boolean
  product?: ProductInfo | null
}) {
  const { t } = useLocalization()
  const [aiCapabilities, setAiCapabilities] = useState<any>(null)
  const [loadingCapabilities, setLoadingCapabilities] = useState(false)
  const [registering, setRegistering] = useState(false)

  const updateField = (field: keyof ProductFormState, value: any) => {
    onChange((prev) => ({ ...prev, [field]: value }))
  }

  const loadCapabilities = useCallback(async () => {
    if (!product?.id) return
    setLoadingCapabilities(true)
    try {
      const result = await aiCapabilityApi.getProductCapabilities(product.id)
      setAiCapabilities(result)
    } catch (error) {
      console.error('获取 AI 能力失败:', error)
    } finally {
      setLoadingCapabilities(false)
    }
  }, [product?.id])

  const handleRegisterCapabilities = useCallback(async () => {
    if (!product?.id) return
    setRegistering(true)
    try {
      // 不指定平台，自动注册所有已注册的平台
      await aiCapabilityApi.registerCapabilities({
        productId: product.id,
        // platforms 不传，后端会自动使用所有已注册的平台
      })
      alert(t({ zh: 'AI 能力注册成功！', en: 'AI capabilities registered successfully!' }))
      await loadCapabilities()
      // 重新加载商品以获取最新的 metadata
      const updatedProduct = await productApi.getProduct(product.id)
      if (updatedProduct) {
        setAiCapabilities({
          productId: updatedProduct.id,
          platform: 'all',
          count: 3,
          functions: [],
        })
      }
    } catch (error) {
      console.error('注册 AI 能力失败:', error)
      alert(t({ zh: '注册失败，请稍后再试', en: 'Registration failed, please try again later' }))
    } finally {
      setRegistering(false)
    }
  }, [product?.id, loadCapabilities, t])

  useEffect(() => {
    if (product?.id && isEditing) {
      loadCapabilities()
    }
  }, [product?.id, isEditing, loadCapabilities])
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-gray-100">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEditing ? t({ zh: '编辑商品', en: 'Edit Product' }) : t({ zh: '创建商品', en: 'Create Product' })}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
            ×
          </button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid md:grid-cols-2 gap-4">
            <label className="text-sm text-gray-600 flex flex-col space-y-1">
              <span className="flex items-center gap-1">
                {t({ zh: '商品名称', en: 'Product name' })}
                <span className="text-red-500">*</span>
              </span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="text-sm text-gray-600 flex flex-col space-y-1">
              <span className="flex items-center gap-1">
                {t({ zh: '分类', en: 'Category' })}
                <span className="text-red-500">*</span>
              </span>
              <input
                type="text"
                value={form.category}
                onChange={(e) => updateField('category', e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="text-sm text-gray-600 flex flex-col space-y-1">
              {t({ zh: '商品类型', en: 'Product Type' })}
              <select
                value={form.productType}
                onChange={(e) => updateField('productType', e.target.value as any)}
                className="rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="physical">{t({ zh: '实物商品', en: 'Physical' })}</option>
                <option value="service">{t({ zh: '服务', en: 'Service' })}</option>
                <option value="nft">{t({ zh: 'NFT', en: 'NFT' })}</option>
                <option value="ft">{t({ zh: '代币', en: 'Token' })}</option>
                <option value="plugin">{t({ zh: '插件', en: 'Plugin' })}</option>
                <option value="subscription">{t({ zh: '订阅', en: 'Subscription' })}</option>
                <option value="game_asset">{t({ zh: '游戏资产', en: 'Game Asset' })}</option>
                <option value="rwa">{t({ zh: '现实资产 (RWA)', en: 'RWA' })}</option>
              </select>
            </label>
            <label className="text-sm text-gray-600 flex flex-col space-y-1">
              {t({ zh: '结算货币', en: 'Currency' })}
              <select
                value={form.currency}
                onChange={(e) => updateField('currency', e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="USD">USD</option>
                <option value="CNY">CNY</option>
                <option value="INR">INR</option>
                <option value="HKD">HKD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="JPY">JPY</option>
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
              </select>
            </label>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <label className="text-sm text-gray-600 flex flex-col space-y-1">
              <span className="flex items-center gap-1">
                {t({ zh: '价格', en: 'Price' })}
                <span className="text-red-500">*</span>
              </span>
              <input
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => updateField('price', Number(e.target.value))}
                className="rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="text-sm text-gray-600 flex flex-col space-y-1">
              <span className="flex items-center gap-1">
                {t({ zh: '库存', en: 'Stock' })}
                <span className="text-red-500">*</span>
              </span>
              <input
                type="number"
                min={0}
                value={form.stock}
                onChange={(e) => updateField('stock', Number(e.target.value))}
                className="rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="text-sm text-gray-600 flex flex-col space-y-1">
              {t({ zh: '佣金比例 %', en: 'Commission %' })}
              <input
                type="number"
                min={0}
                max={100}
                value={form.commissionRate}
                onChange={(e) => updateField('commissionRate', Number(e.target.value))}
                className="rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-gray-600 flex flex-col space-y-1">
              <span className="flex items-center gap-1">
                {t({ zh: '商品图片', en: 'Product Image' })}
                <span className="text-red-500">*</span>
                <span className="text-xs text-gray-400 ml-2">(Max 5MB)</span>
              </span>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={form.image || ''}
                  onChange={(e) => updateField('image', e.target.value)}
                  placeholder="https://..."
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <label className="cursor-pointer px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition-colors flex items-center gap-2 whitespace-nowrap">
                  {isUploadingImage ? (
                    <span className="animate-spin">⌛</span>
                  ) : (
                    <span>📁 {t({ zh: '上传', en: 'Upload' })}</span>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) onImageUpload(file)
                    }}
                    disabled={isUploadingImage}
                  />
                </label>
              </div>
            </label>
            {form.image && (
              <div className="mt-2 relative w-32 h-32 rounded-lg overflow-hidden border border-gray-200 shadow-sm group">
                <img src={form.image} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button 
                    onClick={() => updateField('image', '')}
                    className="text-white bg-red-500 rounded-full p-1 hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
          </div>
          <label className="text-sm text-gray-600 flex flex-col space-y-1">
            {t({ zh: '标签 (逗号分隔)', en: 'Tags (comma separated)' })}
            <input
              type="text"
              value={form.tags.join(', ')}
              onChange={(e) => updateField('tags', e.target.value.split(',').map(t => t.trim()).filter(t => t))}
              className="rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="AI, Agent, Web3"
            />
          </label>
          <label className="text-sm text-gray-600 flex flex-col space-y-1">
            <span className="flex items-center gap-1">
              {t({ zh: '商品描述', en: 'Description' })}
              <span className="text-red-500">*</span>
            </span>
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          
          {/* AI 能力状态（仅编辑模式） */}
          {isEditing && product && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-900">
                  {t({ zh: 'AI 能力状态', en: 'AI Capabilities' })}
                </h4>
                <button
                  onClick={handleRegisterCapabilities}
                  disabled={registering}
                  className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {registering
                    ? t({ zh: '注册中...', en: 'Registering...' })
                    : t({ zh: '重新注册', en: 'Re-register' })}
                </button>
              </div>
              {loadingCapabilities ? (
                <div className="text-xs text-gray-500 py-2">加载中...</div>
              ) : product.metadata?.aiCompatible ? (
                <div className="flex gap-2 text-xs flex-wrap">
                  {Object.keys(product.metadata.aiCompatible).map((platformId) => {
                    const platformNames: Record<string, { name: string; color: string }> = {
                      openai: { name: 'OpenAI', color: 'bg-green-100 text-green-700' },
                      claude: { name: 'Claude', color: 'bg-orange-100 text-orange-700' },
                      gemini: { name: 'Gemini', color: 'bg-blue-100 text-blue-700' },
                    };
                    const platformInfo = platformNames[platformId] || {
                      name: platformId,
                      color: 'bg-purple-100 text-purple-700',
                    };
                    return (
                      <span
                        key={platformId}
                        className={`px-2 py-1 ${platformInfo.color} rounded`}
                        title={platformId}
                      >
                        ✓ {platformInfo.name}
                      </span>
                    );
                  })}
                  {Object.keys(product.metadata.aiCompatible).length === 0 && (
                    <span className="text-gray-500">
                      {t({ zh: '尚未注册 AI 能力', en: 'AI capabilities not registered' })}
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-500">
                  {t({ zh: '商品创建/更新后会自动注册 AI 能力', en: 'AI capabilities will be auto-registered after product creation/update' })}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end space-x-3 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
            {t({ zh: '取消', en: 'Cancel' })}
          </button>
          <button
            onClick={onSubmit}
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            {loading
              ? t({ zh: '保存中...', en: 'Saving...' })
              : isEditing
                ? t({ zh: '保存修改', en: 'Save changes' })
                : t({ zh: '创建商品', en: 'Create product' })}
          </button>
        </div>
      </div>
    </div>
  )
}

function OrderDetailDrawer({
  order,
  onClose,
  onUpdateStatus,
  onRefund,
  loading,
}: {
  order: MerchantOrder
  onClose: () => void
  onUpdateStatus: (status: Order['status']) => void
  onRefund: () => void
  loading: boolean
}) {
  const { t } = useLocalization()
  const statusOptions: Order['status'][] = ['pending', 'paid', 'shipped', 'completed', 'cancelled', 'refunded']

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400">{t({ zh: '订单详情', en: 'Order detail' })}</p>
            <h3 className="text-lg font-semibold">{order.id}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
            ×
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t({ zh: '金额', en: 'Amount' })}</p>
              <p className="text-2xl font-bold text-gray-900">
                {order.amount} {order.currency}
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                order.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-700'
                  : order.status === 'pending'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-700'
              }`}
            >
              {order.status}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
            <div>
              <p className="text-xs text-gray-400">{t({ zh: '创建时间', en: 'Created at' })}</p>
              <p>{new Date(order.createdAt).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">{t({ zh: '支付方式', en: 'Payment method' })}</p>
              <p>{order.paymentMethod || 'Smart Routing'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">{t({ zh: '商户ID', en: 'Merchant ID' })}</p>
              <p>{order.merchantId}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">{t({ zh: '交易哈希', en: 'Tx Hash' })}</p>
              <p className="truncate text-blue-600">{order.transactionHash || '-'}</p>
            </div>
          </div>
          {order.metadata && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 max-h-32 overflow-y-auto">
              <pre className="whitespace-pre-wrap break-all">{JSON.stringify(order.metadata, null, 2)}</pre>
            </div>
          )}
        </div>
        <div className="px-6 pb-6 space-y-3 border-t border-gray-100">
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((status) => (
              <button
                key={status}
                onClick={() => onUpdateStatus(status)}
                disabled={loading || status === order.status}
                className={`px-3 py-1 rounded-full text-xs border ${
                  status === order.status
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
                } disabled:opacity-50`}
              >
                {status}
              </button>
            ))}
          </div>
          <button
            onClick={onRefund}
            disabled={loading || order.status === 'refunded'}
            className="w-full px-5 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {t({ zh: '发起退款', en: 'Initiate refund' })}
          </button>
        </div>
      </div>
    </div>
  )
}
