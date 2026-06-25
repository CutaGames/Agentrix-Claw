import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type SupportedLanguage = 'zh' | 'en'

export type TranslationDescriptor =
  | string
  | {
      zh: string
      en: string
    }

interface LocalizationContextValue {
  language: SupportedLanguage
  availableLanguages: Array<{ code: SupportedLanguage; label: string }>
  setLanguage: (language: SupportedLanguage) => void
  t: (message: TranslationDescriptor, values?: Record<string, string | number>) => string
}

const AVAILABLE_LANGUAGES: Array<{ code: SupportedLanguage; label: string }> = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
]

// 翻译字典 - 支持字符串key格式
const translations: Record<string, { zh: string; en: string }> = {
  // 通用
  'common.loading': { zh: '加载中...', en: 'Loading...' },
  'common.save': { zh: '保存', en: 'Save' },
  'common.cancel': { zh: '取消', en: 'Cancel' },
  'common.confirm': { zh: '确认', en: 'Confirm' },
  'common.delete': { zh: '删除', en: 'Delete' },
  'common.edit': { zh: '编辑', en: 'Edit' },
  'common.create': { zh: '创建', en: 'Create' },
  'common.search': { zh: '搜索', en: 'Search' },
  'common.filter': { zh: '筛选', en: 'Filter' },
  'common.export': { zh: '导出', en: 'Export' },
  'common.import': { zh: '导入', en: 'Import' },
  'common.submit': { zh: '提交', en: 'Submit' },
  'common.back': { zh: '返回', en: 'Back' },
  'common.next': { zh: '下一步', en: 'Next' },
  'common.previous': { zh: '上一步', en: 'Previous' },
  'common.viewAll': { zh: '查看全部', en: 'View All' },
  'common.noData': { zh: '暂无数据', en: 'No Data' },
  
  // 商户导航
  'navigation.merchant.overview': { zh: '商户概览', en: 'Overview' },
  'navigation.merchant.kyc': { zh: 'KYC认证', en: 'KYC Verification' },
  'navigation.merchant.products': { zh: '商品管理', en: 'Products' },
  'navigation.merchant.orders': { zh: '订单管理', en: 'Orders' },
  'navigation.merchant.finance': { zh: '财务管理', en: 'Finance' },
  'navigation.merchant.customers': { zh: '客户管理', en: 'Customers' },
  'navigation.merchant.refunds': { zh: '退款管理', en: 'Refunds' },
  'navigation.merchant.webhooks': { zh: 'Webhook配置', en: 'Webhooks' },
  'navigation.merchant.apiKeys': { zh: 'API密钥', en: 'API Keys' },
  'navigation.merchant.productAnalytics': { zh: '商品分析', en: 'Product Analytics' },
  'navigation.merchantDashboard': { zh: '商户中心', en: 'Merchant Dashboard' },
  
  // 用户导航
  'navigation.user.overview': { zh: '用户概览', en: 'Overview' },
  'navigation.user.agentHub': { zh: 'Agent Hub', en: 'Agent Hub' },
  'navigation.user.profile': { zh: '个人资料', en: 'Profile' },
  'navigation.user.wallets': { zh: '钱包管理', en: 'Wallets' },
  'navigation.user.transactions': { zh: '交易记录', en: 'Transactions' },
  'navigation.user.quickPay': { zh: 'QuickPay', en: 'QuickPay' },
  'navigation.user.budgets': { zh: '预算管理', en: 'Budgets' },
  'navigation.user.security': { zh: '安全设置', en: 'Security' },
  'navigation.user.notifications': { zh: '消息通知', en: 'Notifications' },
  'navigation.userDashboard': { zh: '用户中心', en: 'User Dashboard' },
  'navigation.userCenter': { zh: '用户中心', en: 'User Center' },
  'navigation.user.kyc': { zh: 'KYC认证', en: 'KYC Verification' },
  'navigation.user.grants': { zh: '自动支付授权', en: 'Auto-Pay Grants' },
  'navigation.user.authorizations': { zh: '授权管理', en: 'Authorizations' },
  'navigation.user.subscriptions': { zh: '订阅管理', en: 'Subscriptions' },
  'navigation.user.agentAuthorizations': { zh: 'Agent授权', en: 'Agent Authorizations' },
  'navigation.user.executionHistory': { zh: '执行历史', en: 'Execution History' },
  
  // Agent导航
  'navigation.agent.overview': { zh: 'Agent概览', en: 'Agent Overview' },
  'navigation.agent.kyc': { zh: 'KYC认证', en: 'KYC Verification' },
  'navigation.agent.earnings': { zh: '收益管理', en: 'Earnings' },
  'navigation.agent.products': { zh: '商品推广', en: 'Products' },
  'navigation.agent.grants': { zh: '授权设置', en: 'Grants' },
  'navigation.agent.analytics': { zh: '数据分析', en: 'Analytics' },
  'navigation.agent.apiStats': { zh: 'API统计', en: 'API Stats' },
  'navigation.agent.errorLogs': { zh: '错误日志', en: 'Error Logs' },
  'navigation.agent.sandbox': { zh: '沙盒测试', en: 'Sandbox' },
  
  // 商户仪表板
  'merchantDashboard.pageTitle': { zh: '商户控制台', en: 'Merchant Dashboard' },
  'merchantDashboard.addProduct': { zh: '添加商品', en: 'Add Product' },
  'merchantDashboard.stats.totalSales': { zh: '总销售额', en: 'Total Sales' },
  'merchantDashboard.stats.aiChannelSales': { zh: 'AI渠道销售', en: 'AI Channel Sales' },
  'merchantDashboard.stats.totalOrders': { zh: '总订单数', en: 'Total Orders' },
  'merchantDashboard.stats.aiAgents': { zh: 'AI Agent数', en: 'AI Agents' },
  'merchantDashboard.tabs.overview': { zh: '概览', en: 'Overview' },
  'merchantDashboard.tabs.products': { zh: '商品', en: 'Products' },
  'merchantDashboard.tabs.orders': { zh: '订单', en: 'Orders' },
  'merchantDashboard.tabs.withdrawals': { zh: '提现', en: 'Withdrawals' },
  'merchantDashboard.tabs.profile': { zh: '资料', en: 'Profile' },
  'merchantDashboard.tabs.kyc': { zh: 'KYC', en: 'KYC' },
  'merchantDashboard.tabs.automation': { zh: '自动化', en: 'Automation' },
  'merchantDashboard.charts.salesTrend': { zh: '销售趋势', en: 'Sales Trend' },
  'merchantDashboard.charts.topAIAgents': { zh: 'AI Agent排行', en: 'Top AI Agents' },
  'merchantDashboard.agentConversions': { zh: '次转化', en: 'conversions' },
  'merchantDashboard.commission': { zh: '佣金', en: 'Commission' },
  'merchantDashboard.viewAllAgents': { zh: '查看全部Agent', en: 'View All Agents' },
  'merchantDashboard.recentOrders': { zh: '最近订单', en: 'Recent Orders' },
  'merchantDashboard.table.orderId': { zh: '订单ID', en: 'Order ID' },
  'merchantDashboard.table.customer': { zh: '客户', en: 'Customer' },
  'merchantDashboard.table.amount': { zh: '金额', en: 'Amount' },
  'merchantDashboard.table.status': { zh: '状态', en: 'Status' },
  'merchantDashboard.table.date': { zh: '日期', en: 'Date' },
  'merchantDashboard.table.channel': { zh: '渠道', en: 'Channel' },
  'merchantDashboard.viewAllOrders': { zh: '查看全部订单', en: 'View All Orders' },
  
  // 用户仪表板
  'userDashboard.pageTitle': { zh: '用户中心', en: 'User Dashboard' },
  'userDashboard.welcome': { zh: '欢迎回来', en: 'Welcome Back' },
  'userDashboard.stats.balance': { zh: '账户余额', en: 'Account Balance' },
  'userDashboard.stats.monthlySpend': { zh: '本月支出', en: 'Monthly Spend' },
  'userDashboard.stats.activeAuths': { zh: '活跃授权', en: 'Active Authorizations' },
  'userDashboard.stats.transactions': { zh: '交易次数', en: 'Transactions' },
  
  // 交易记录页面
  'transactions.pageTitle': { zh: '交易记录', en: 'Transaction History' },
  'transactions.title': { zh: '交易记录', en: 'Transaction History' },
  'transactions.description': { zh: '查看您的所有交易和支付记录', en: 'View all your transactions and payment records' },
  'transactions.filters.all': { zh: '全部', en: 'All' },
  'transactions.filters.completed': { zh: '已完成', en: 'Completed' },
  'transactions.filters.pending': { zh: '处理中', en: 'Pending' },
  'transactions.filters.failed': { zh: '失败', en: 'Failed' },
  'transactions.refresh.refresh': { zh: '刷新', en: 'Refresh' },
  'transactions.refresh.syncing': { zh: '同步中...', en: 'Syncing...' },
  'transactions.loading': { zh: '加载中...', en: 'Loading...' },
  'transactions.empty': { zh: '暂无交易记录', en: 'No transactions found' },
  'transactions.order': { zh: '订单', en: 'Order' },
  'transactions.payment': { zh: '支付', en: 'Payment' },
  'transactions.assetType': { zh: '资产类型：', en: 'Asset Type: ' },
  'transactions.status.completed': { zh: '已完成', en: 'Completed' },
  'transactions.status.pending': { zh: '处理中', en: 'Pending' },
  'transactions.status.failed': { zh: '失败', en: 'Failed' },
  'transactions.errors.fetchFailed': { zh: '获取交易记录失败', en: 'Failed to fetch transactions' },
  'transactions.details.paymentMethod': { zh: '支付方式：', en: 'Payment Method: ' },
  'transactions.details.paymentId': { zh: '支付ID：', en: 'Payment ID: ' },
  'transactions.details.unknown': { zh: '未知', en: 'Unknown' },
  'transactions.export': { zh: '导出记录', en: 'Export Records' },
  
  // QuickPay
  'quickPay.title': { zh: 'QuickPay授权管理', en: 'QuickPay Authorization' },
  'quickPay.description': { zh: '管理您的快速支付授权', en: 'Manage your quick pay authorizations' },
  'quickPay.createNew': { zh: '创建授权', en: 'Create Authorization' },
  'quickPay.singleLimit': { zh: '单笔限额', en: 'Single Transaction Limit' },
  'quickPay.dailyLimit': { zh: '每日限额', en: 'Daily Limit' },
  'quickPay.validPeriod': { zh: '有效期', en: 'Valid Period' },
  'quickPay.authAmount': { zh: '授权金额', en: 'Authorization Amount' },
  'quickPay.status.active': { zh: '活跃', en: 'Active' },
  'quickPay.status.revoked': { zh: '已撤销', en: 'Revoked' },
  'quickPay.status.expired': { zh: '已过期', en: 'Expired' },
  
  // 订单状态
  'order.status.pending': { zh: '待处理', en: 'Pending' },
  'order.status.processing': { zh: '处理中', en: 'Processing' },
  'order.status.completed': { zh: '已完成', en: 'Completed' },
  'order.status.cancelled': { zh: '已取消', en: 'Cancelled' },
  'order.status.refunded': { zh: '已退款', en: 'Refunded' },
  
  // 支付方式
  'payment.method.crypto': { zh: '加密货币', en: 'Crypto' },
  'payment.method.fiat': { zh: '法币', en: 'Fiat' },
  'payment.method.x402': { zh: 'X402协议', en: 'X402 Protocol' },
  'payment.method.card': { zh: '银行卡', en: 'Card' },
  
  // Agent相关
  'agent.authorization': { zh: 'Agent授权', en: 'Agent Authorization' },
  'agent.airdrop': { zh: '空投检测', en: 'Airdrop Detection' },
  'agent.autoEarn': { zh: '自动收益', en: 'Auto Earn' },
  'agent.mpcWallet': { zh: 'MPC钱包', en: 'MPC Wallet' },
  
  // 商户订单页面
  'merchantOrders.pageTitle': { zh: '订单管理', en: 'Order Management' },
  'merchantOrders.pageDescription': { zh: '查看和管理您的所有订单', en: 'View and manage all your orders' },
  'merchantOrders.exportOrders': { zh: '导出订单', en: 'Export Orders' },
  'merchantOrders.stats.totalOrders': { zh: '总订单数', en: 'Total Orders' },
  'merchantOrders.stats.todayOrders': { zh: '今日订单', en: 'Today Orders' },
  'merchantOrders.stats.pendingOrders': { zh: '待处理订单', en: 'Pending Orders' },
  'merchantOrders.stats.todaySales': { zh: '今日销售额', en: 'Today Sales' },
  'merchantOrders.filters.all': { zh: '全部', en: 'All' },
  'merchantOrders.filters.pending': { zh: '待处理', en: 'Pending' },
  'merchantOrders.filters.shipped': { zh: '已发货', en: 'Shipped' },
  'merchantOrders.filters.completed': { zh: '已完成', en: 'Completed' },
  'merchantOrders.filters.cancelled': { zh: '已取消', en: 'Cancelled' },
  'merchantOrders.noOrdersFound': { zh: '暂无订单', en: 'No orders found' },
  'merchantOrders.uncategorized': { zh: '未分类', en: 'Uncategorized' },
  'merchantOrders.orderCount': { zh: '个订单', en: 'orders' },
  'merchantOrders.table.orderId': { zh: '订单ID', en: 'Order ID' },
  'merchantOrders.table.customer': { zh: '客户', en: 'Customer' },
  'merchantOrders.table.product': { zh: '商品', en: 'Product' },
  'merchantOrders.table.amount': { zh: '金额', en: 'Amount' },
  'merchantOrders.table.channel': { zh: '渠道', en: 'Channel' },
  'merchantOrders.table.status': { zh: '状态', en: 'Status' },
  'merchantOrders.table.date': { zh: '日期', en: 'Date' },
  'merchantOrders.table.actions': { zh: '操作', en: 'Actions' },
  
  // 商户商品管理页面
  'merchantProducts.pageTitle': { zh: '商品管理', en: 'Product Management' },
  'merchantProducts.pageDescription': { zh: '管理您的商品、价格和库存', en: 'Manage your products, prices and inventory' },
  'merchantProducts.ecommerceSync': { zh: '电商同步', en: 'E-commerce Sync' },
  'merchantProducts.batchImport': { zh: '批量导入', en: 'Batch Import' },
  'merchantProducts.addProduct': { zh: '添加商品', en: 'Add Product' },
  'merchantProducts.addFirstProduct': { zh: '添加第一个商品', en: 'Add Your First Product' },
  'merchantProducts.productList': { zh: '商品列表', en: 'Product List' },
  'merchantProducts.productName': { zh: '商品名称', en: 'Product Name' },
  'merchantProducts.productPrice': { zh: '价格', en: 'Price' },
  'merchantProducts.productStock': { zh: '库存', en: 'Stock' },
  'merchantProducts.productCategory': { zh: '分类', en: 'Category' },
  'merchantProducts.productStatus': { zh: '状态', en: 'Status' },
  'merchantProducts.productType': { zh: '商品类型', en: 'Product Type' },
  'merchantProducts.commissionRate': { zh: '佣金率', en: 'Commission Rate' },
  'merchantProducts.aiSales': { zh: 'AI销售', en: 'AI Sales' },
  'merchantProducts.totalSales': { zh: '总销售', en: 'Total Sales' },
  'merchantProducts.noTotalSales': { zh: '暂无销售', en: 'No sales yet' },
  'merchantProducts.createdAt': { zh: '创建时间', en: 'Created At' },
  'merchantProducts.actions': { zh: '操作', en: 'Actions' },
  'merchantProducts.noProducts': { zh: '暂无商品', en: 'No products' },
  'merchantProducts.uncategorized': { zh: '未分类', en: 'Uncategorized' },
  'merchantProducts.units': { zh: '件', en: 'units' },
  // 商品状态
  'merchantProducts.status.active': { zh: '上架中', en: 'Active' },
  'merchantProducts.status.inactive': { zh: '已下架', en: 'Inactive' },
  'merchantProducts.status.outOfStock': { zh: '缺货', en: 'Out of Stock' },
  // 商品类型
  'merchantProducts.productTypes.physical': { zh: '实物商品', en: 'Physical' },
  'merchantProducts.productTypes.service': { zh: '服务', en: 'Service' },
  'merchantProducts.productTypes.nft': { zh: 'NFT', en: 'NFT' },
  'merchantProducts.productTypes.ft': { zh: '代币', en: 'Token' },
  'merchantProducts.productTypes.gameAsset': { zh: '游戏资产', en: 'Game Asset' },
  'merchantProducts.productTypes.rwa': { zh: '真实资产', en: 'RWA' },
  // 佣金率
  'merchantProducts.commissionRates.physical': { zh: '实物商品 3%', en: 'Physical 3%' },
  'merchantProducts.commissionRates.service': { zh: '服务 5%', en: 'Service 5%' },
  'merchantProducts.commissionRates.digital': { zh: '数字资产 2%', en: 'Digital 2%' },
  'merchantProducts.commissionRates.default': { zh: '默认 3%', en: 'Default 3%' },
  // 表格标题
  'merchantProducts.table.productName': { zh: '商品名称', en: 'Product Name' },
  'merchantProducts.table.category': { zh: '分类', en: 'Category' },
  'merchantProducts.table.price': { zh: '价格', en: 'Price' },
  'merchantProducts.table.stock': { zh: '库存', en: 'Stock' },
  'merchantProducts.table.commissionRate': { zh: '佣金率', en: 'Commission' },
  'merchantProducts.table.aiSales': { zh: 'AI销售', en: 'AI Sales' },
  'merchantProducts.table.status': { zh: '状态', en: 'Status' },
  // 操作按钮
  'merchantProducts.actions.edit': { zh: '编辑', en: 'Edit' },
  'merchantProducts.actions.activate': { zh: '上架', en: 'Activate' },
  'merchantProducts.actions.deactivate': { zh: '下架', en: 'Deactivate' },
  'merchantProducts.actions.pricing': { zh: '定价', en: 'Pricing' },
  // 弹窗
  'merchantProducts.modal.addProduct': { zh: '添加商品', en: 'Add Product' },
  'merchantProducts.modal.editProduct': { zh: '编辑商品', en: 'Edit Product' },
  'merchantProducts.modal.fillInfo': { zh: '填写信息', en: 'Fill Info' },
  'merchantProducts.modal.preview': { zh: '预览', en: 'Preview' },
  // 表单
  'merchantProducts.form.productName': { zh: '商品名称', en: 'Product Name' },
  'merchantProducts.form.description': { zh: '商品描述', en: 'Description' },
  'merchantProducts.form.descriptionPlaceholder': { zh: '请输入商品描述...', en: 'Enter product description...' },
  'merchantProducts.form.price': { zh: '价格', en: 'Price' },
  'merchantProducts.form.priceHint': { zh: '输入商品价格', en: 'Enter product price' },
  'merchantProducts.form.priceNegative': { zh: '价格不能为负数', en: 'Price cannot be negative' },
  'merchantProducts.form.currency': { zh: '货币', en: 'Currency' },
  'merchantProducts.form.currencyOptions.cny': { zh: '人民币 (CNY)', en: 'Chinese Yuan (CNY)' },
  'merchantProducts.form.currencyOptions.usd': { zh: '美元 (USD)', en: 'US Dollar (USD)' },
  'merchantProducts.form.currencyOptions.usdt': { zh: 'USDT', en: 'USDT' },
  'merchantProducts.form.currencyOptions.eur': { zh: '欧元 (EUR)', en: 'Euro (EUR)' },
  'merchantProducts.form.currencyOptions.gbp': { zh: '英镑 (GBP)', en: 'British Pound (GBP)' },
  'merchantProducts.form.currencyOptions.hkd': { zh: '港币 (HKD)', en: 'Hong Kong Dollar (HKD)' },
  'merchantProducts.form.currencyOptions.jpy': { zh: '日元 (JPY)', en: 'Japanese Yen (JPY)' },
  'merchantProducts.form.stock': { zh: '库存', en: 'Stock' },
  'merchantProducts.form.stockHintService': { zh: '（服务类商品无需库存）', en: '(No stock needed for services)' },
  'merchantProducts.form.stockHintUnlimited': { zh: '服务类商品会自动设置为无限库存', en: 'Services are automatically set to unlimited stock' },
  'merchantProducts.form.imageUrl': { zh: '商品图片URL', en: 'Product Image URL' },
  'merchantProducts.form.category': { zh: '商品分类', en: 'Category' },
  'merchantProducts.form.productType': { zh: '产品类型', en: 'Product Type' },
  'merchantProducts.form.productTypeOptions.physical': { zh: '实体商品（佣金3%）', en: 'Physical (3% Commission)' },
  'merchantProducts.form.productTypeOptions.service': { zh: '服务类（佣金5%）', en: 'Service (5% Commission)' },
  'merchantProducts.form.productTypeOptions.nft': { zh: 'NFT（佣金2.5%）', en: 'NFT (2.5% Commission)' },
  'merchantProducts.form.productTypeOptions.ft': { zh: 'FT代币（佣金2.5%）', en: 'FT Token (2.5% Commission)' },
  'merchantProducts.form.productTypeOptions.gameAsset': { zh: '游戏资产（佣金2.5%）', en: 'Game Asset (2.5% Commission)' },
  'merchantProducts.form.productTypeOptions.rwa': { zh: 'RWA（佣金2.5%）', en: 'RWA (2.5% Commission)' },
  'merchantProducts.form.productTypeOptions.plugin': { zh: '插件（佣金5%）', en: 'Plugin (5% Commission)' },
  'merchantProducts.form.productTypeOptions.subscription': { zh: '订阅服务（佣金5%）', en: 'Subscription (5% Commission)' },
  'merchantProducts.form.fixedCommissionRate': { zh: '固定佣金率：{rate}%（根据产品类型自动设置，符合统一数据标准）', en: 'Fixed Commission: {rate}% (Auto-set by type, follows unified standard)' },
  'merchantProducts.form.allowCommissionAdjustment': { zh: '允许调整佣金率', en: 'Allow Commission Adjustment' },
  'merchantProducts.form.allowCommissionAdjustmentHint': { zh: '开启后可以为该商品设置自定义佣金率', en: 'Enable to set custom commission rate for this product' },
  'merchantProducts.form.customCommissionRate': { zh: '自定义佣金率 (%)', en: 'Custom Commission Rate (%)' },
  'merchantProducts.form.defaultCommissionRate': { zh: '默认佣金率: {rate}%', en: 'Default Rate: {rate}%' },
  'merchantProducts.form.confirmEdit': { zh: '确认修改', en: 'Confirm Edit' },
  'merchantProducts.form.addProduct': { zh: '添加商品', en: 'Add Product' },
  'merchantProducts.modal.backToEdit': { zh: '返回编辑', en: 'Back to Edit' },
  'merchantProducts.modal.confirmAdd': { zh: '确认添加', en: 'Confirm Add' },
  'merchantProducts.modal.confirmEdit': { zh: '确认修改', en: 'Confirm Edit' },
  
  // 用户订阅管理页面
  'subscriptions.pageTitle': { zh: '订阅管理', en: 'Subscription Management' },
  'subscriptions.title': { zh: '订阅管理', en: 'Subscription Management' },
  'subscriptions.description': { zh: '管理您的订阅和自动续费设置', en: 'Manage your subscriptions and auto-renewal settings' },
  'subscriptions.activeSubscriptions': { zh: '活跃订阅', en: 'Active Subscriptions' },
  'subscriptions.expiredSubscriptions': { zh: '已过期订阅', en: 'Expired Subscriptions' },
  'subscriptions.noSubscriptions': { zh: '暂无订阅', en: 'No subscriptions' },
  'subscriptions.subscribedAt': { zh: '订阅时间', en: 'Subscribed At' },
  'subscriptions.expiresAt': { zh: '到期时间', en: 'Expires At' },
  'subscriptions.autoRenewal': { zh: '自动续费', en: 'Auto Renewal' },
  'subscriptions.cancelSubscription': { zh: '取消订阅', en: 'Cancel Subscription' },
  'subscriptions.renewSubscription': { zh: '续费订阅', en: 'Renew Subscription' },
  'subscriptions.empty': { zh: '暂无订阅记录', en: 'No subscriptions found' },
  'subscriptions.status.active': { zh: '活跃', en: 'Active' },
  'subscriptions.status.paused': { zh: '已暂停', en: 'Paused' },
  'subscriptions.status.cancelled': { zh: '已取消', en: 'Cancelled' },
  'subscriptions.intervals.daily': { zh: '每日', en: 'Daily' },
  'subscriptions.intervals.weekly': { zh: '每周', en: 'Weekly' },
  'subscriptions.intervals.monthly': { zh: '每月', en: 'Monthly' },
  'subscriptions.intervals.yearly': { zh: '每年', en: 'Yearly' },
  'subscriptions.labels.price': { zh: '价格', en: 'Price' },
  'subscriptions.labels.nextBilling': { zh: '下次扣费', en: 'Next Billing' },
  'subscriptions.labels.merchantId': { zh: '商户ID', en: 'Merchant ID' },
  'subscriptions.actions.cancel': { zh: '取消订阅', en: 'Cancel Subscription' },
  'subscriptions.errors.loadFailed': { zh: '加载订阅失败', en: 'Failed to load subscriptions' },
  'subscriptions.errors.cancelFailed': { zh: '取消订阅失败', en: 'Failed to cancel subscription' },
  'subscriptions.success.cancelled': { zh: '订阅已取消', en: 'Subscription cancelled' },
  'subscriptions.confirm.cancel': { zh: '确定要取消此订阅吗？', en: 'Are you sure you want to cancel this subscription?' },
  
  // 用户授权管理页面
  'grants.pageTitle': { zh: '授权管理', en: 'Authorization Management' },
  'grants.title': { zh: '授权管理', en: 'Authorization Management' },
  'grants.description': { zh: '管理您的支付授权和Agent权限', en: 'Manage your payment authorizations and agent permissions' },
  'grants.activeGrants': { zh: '活跃授权', en: 'Active Authorizations' },
  'grants.revokedGrants': { zh: '已撤销授权', en: 'Revoked Authorizations' },
  'grants.noGrants': { zh: '暂无授权', en: 'No authorizations' },
  'grants.grantedAt': { zh: '授权时间', en: 'Granted At' },
  'grants.expiresAt': { zh: '到期时间', en: 'Expires At' },
  'grants.singleLimit': { zh: '单笔限额', en: 'Single Transaction Limit' },
  'grants.dailyLimit': { zh: '每日限额', en: 'Daily Limit' },
  'grants.usedToday': { zh: '今日已用', en: 'Used Today' },
  'grants.revokeGrant': { zh: '撤销授权', en: 'Revoke Authorization' },
  'grants.createGrant': { zh: '创建授权', en: 'Create Authorization' },
  // grants 页面完整翻译
  'grants.active.title': { zh: '当前授权', en: 'Active Authorizations' },
  'grants.active.empty': { zh: '暂无活跃授权', en: 'No active authorizations' },
  'grants.active.createdAt': { zh: '创建时间:', en: 'Created At:' },
  'grants.active.revoke': { zh: '撤销授权', en: 'Revoke' },
  'grants.active.singleLimit': { zh: '单笔限额:', en: 'Single Limit:' },
  'grants.active.dailyLimit': { zh: '每日限额:', en: 'Daily Limit:' },
  'grants.active.usedToday': { zh: '今日已用:', en: 'Used Today:' },
  'grants.active.expiresAt': { zh: '过期时间:', en: 'Expires At:' },
  'grants.new.title': { zh: '新建授权', en: 'Create New Authorization' },
  'grants.new.selectAgent': { zh: '选择代理', en: 'Select Agent' },
  'grants.new.selectAgentPlaceholder': { zh: '-- 选择要授权的代理 --', en: '-- Select an agent to authorize --' },
  'grants.new.selectAgentError': { zh: '请选择一个代理', en: 'Please select an agent' },
  'grants.new.singleLimit': { zh: '单笔限额', en: 'Single Transaction Limit' },
  'grants.new.dailyLimit': { zh: '每日限额', en: 'Daily Limit' },
  'grants.new.duration': { zh: '有效期', en: 'Duration' },
  'grants.new.days': { zh: '天', en: 'days' },
  'grants.new.submit': { zh: '创建授权', en: 'Create Authorization' },
  'grants.new.create': { zh: '创建授权', en: 'Create Authorization' },
  'grants.errors.loadFailed': { zh: '加载授权失败', en: 'Failed to load authorizations' },
  'grants.errors.revokeFailed': { zh: '撤销授权失败', en: 'Failed to revoke authorization' },
  'grants.errors.createFailed': { zh: '创建授权失败', en: 'Failed to create authorization' },

  // 用户资料页面 (Profile)
  'profile.basicInfo.title': { zh: '基本信息', en: 'Basic Information' },
  'profile.basicInfo.email': { zh: '电子邮箱', en: 'Email Address' },
  'profile.basicInfo.emailNotBound': { zh: '未绑定邮箱', en: 'Email not bound' },
  'profile.basicInfo.createdAt': { zh: '注册时间', en: 'Joined At' },
  'profile.wallets.title': { zh: '钱包管理', en: 'Wallet Management' },
  'profile.wallets.bindNew': { zh: '绑定新钱包', en: 'Bind New Wallet' },
  'profile.social.title': { zh: '社交账号', en: 'Social Accounts' },
  'profile.social.description': { zh: '绑定社交账号，享受更便捷的登录体验', en: 'Bind social accounts for a better login experience' },
  'profile.errors.loadWalletsFailed': { zh: '加载钱包列表失败', en: 'Failed to load wallets' },
  'profile.success.updateProfile': { zh: '个人资料已更新', en: 'Profile updated successfully' },
  'profile.errors.updateFailed': { zh: '更新失败', en: 'Update failed' },
  'profile.errors.emailExists': { zh: '该邮箱已被占用', en: 'Email already in use' },
  'profile.errors.emailRegistered': { zh: '该邮箱已注册', en: 'Email already registered' },
  'profile.confirm.unbindWallet': { zh: '确定要解绑这个钱包吗？', en: 'Are you sure you want to unbind this wallet?' },
  'profile.success.walletUnbound': { zh: '钱包已解绑', en: 'Wallet unbound successfully' },
  'profile.errors.unbindFailed': { zh: '解绑失败', en: 'Unbind failed' },
  'profile.success.setDefaultWallet': { zh: '已设为默认钱包', en: 'Set as default wallet' },
  'profile.errors.setDefaultFailed': { zh: '设置默认钱包失败', en: 'Failed to set default wallet' },
}

const LocalizationContext = createContext<LocalizationContextValue>({
  language: 'zh',
  availableLanguages: AVAILABLE_LANGUAGES,
  setLanguage: () => undefined,
  t: (message) => (typeof message === 'string' ? message : message.zh),
})

const STORAGE_KEY = 'agentrix_language'

const formatTemplate = (template: string, values?: Record<string, string | number>) => {
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = values[key]
    if (value === undefined || value === null) return ''
    return String(value)
  })
}

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>('zh')

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const stored = window.localStorage.getItem(STORAGE_KEY) as SupportedLanguage | null
    if (stored) {
      setLanguageState(stored)
      return
    }
    const browserLang = navigator.language?.toLowerCase() || 'zh'
    if (browserLang.startsWith('en')) {
      setLanguageState('en')
    }
  }, [])

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    setLanguageState(lang)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, lang)
    }
  }, [])

  const t = useCallback(
    (message: TranslationDescriptor, values?: Record<string, string | number>) => {
      // 如果是字符串，先查找翻译字典
      if (typeof message === 'string') {
        const translation = translations[message]
        if (translation) {
          const template = translation[language] ?? translation.zh ?? translation.en ?? message
          return formatTemplate(template, values)
        }
        // 如果在字典中找不到，直接返回原字符串
        return formatTemplate(message, values)
      }
      // 对象格式 { zh: '', en: '' }
      const template = message[language] ?? message.zh ?? message.en ?? ''
      return formatTemplate(template, values)
    },
    [language],
  )

  const value = useMemo<LocalizationContextValue>(
    () => ({
      language,
      availableLanguages: AVAILABLE_LANGUAGES,
      setLanguage,
      t,
    }),
    [language, setLanguage, t],
  )

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>
}

export function useLocalization(): LocalizationContextValue {
  return useContext(LocalizationContext)
}


