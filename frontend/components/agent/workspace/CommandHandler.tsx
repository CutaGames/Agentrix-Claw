import { WorkspaceView } from './UnifiedWorkspace'

interface CommandResult {
  success: boolean
  message?: string
  view?: WorkspaceView
  action?: string
  data?: any
}

/**
 * 对话式命令处理系统
 * 解析用户命令并执行相应操作
 */
export class CommandHandler {
  constructor(
    private userRoles: {
      isUser: boolean
      isMerchant: boolean
      isDeveloper: boolean
    },
    private currentMode: 'personal' | 'merchant' | 'developer'
  ) {}

  processCommand(command: string, data?: any): CommandResult {
    const lowerCommand = command.toLowerCase().trim()

    // 支付相关命令
    if (this.matchCommand(lowerCommand, ['支付', '付款', 'payment', 'pay'])) {
      return this.handlePaymentCommand(lowerCommand, data)
    }

    // 订单相关命令
    if (this.matchCommand(lowerCommand, ['订单', 'order', '购买', 'buy'])) {
      return this.handleOrderCommand(lowerCommand, data)
    }

    // 商品相关命令（商户）
    if (this.matchCommand(lowerCommand, ['商品', 'product', '添加商品', 'add product'])) {
      return this.handleProductCommand(lowerCommand, data)
    }

    // 钱包相关命令
    if (this.matchCommand(lowerCommand, ['钱包', 'wallet', '余额', 'balance'])) {
      return this.handleWalletCommand(lowerCommand, data)
    }

    // 结算相关命令（商户）
    if (this.matchCommand(lowerCommand, ['结算', 'settlement', '提现', 'withdraw'])) {
      return this.handleSettlementCommand(lowerCommand, data)
    }

    // API相关命令（开发者）
    if (this.matchCommand(lowerCommand, ['api', '统计', 'statistics', '调用', 'call'])) {
      return this.handleApiCommand(lowerCommand, data)
    }

    // 数据相关命令
    if (this.matchCommand(lowerCommand, ['数据', 'data', '统计', 'statistics', '分析', 'analytics'])) {
      return this.handleDataCommand(lowerCommand, data)
    }

    // KYC相关命令
    if (this.matchCommand(lowerCommand, ['kyc', '认证', 'verify', '验证'])) {
      return this.handleKYCCommand(lowerCommand, data)
    }

    // 引导与清单相关命令
    if (this.matchCommand(lowerCommand, ['清单', '进度', '引导', 'checklist', 'guide', 'status', 'workflow'])) {
      return this.handleGuideCommand(lowerCommand, data)
    }

    // 市场相关命令
    if (this.matchCommand(lowerCommand, ['市场', 'marketplace', '商店', 'shop', '技能库', 'skills'])) {
      return {
        success: true,
        message: '正在打开商品与技能市场...',
        view: 'marketplace',
        action: 'view_marketplace',
      }
    }

    // 自动收益/空投相关命令
    if (this.matchCommand(lowerCommand, ['收益', 'earn', '空投', 'airdrop', 'autoearn'])) {
      return {
        success: true,
        message: '正在打开收益与空投面板...',
        view: 'autoEarn',
        action: 'view_auto_earn',
      }
    }

    // 默认：返回对话视图


    return {
      success: true,
      message: '请告诉我您需要什么帮助',
      view: 'chat',
    }
  }

  private matchCommand(command: string, keywords: string[]): boolean {
    return keywords.some(keyword => command.includes(keyword.toLowerCase()))
  }

  private handlePaymentCommand(command: string, data?: any): CommandResult {
    if (this.currentMode === 'personal' || this.userRoles.isUser) {
      if (this.matchCommand(command, ['历史', 'history', '记录', 'record'])) {
        return {
          success: true,
          message: '正在加载支付历史...',
          view: 'user',
          action: 'view_payment_history',
        }
      }
    }
    return { success: false, message: '无法处理支付命令' }
  }

  private handleOrderCommand(command: string, data?: any): CommandResult {
    if (this.matchCommand(command, ['查看', 'view', '列表', 'list'])) {
      return {
        success: true,
        message: '正在加载订单列表...',
        view: this.currentMode === 'merchant' ? 'merchant' : 'orders',
        action: 'view_orders',
      }
    }
    return { success: false, message: '无法处理订单命令' }
  }

  private handleProductCommand(command: string, data?: any): CommandResult {
    if (this.currentMode === 'merchant' && this.userRoles.isMerchant) {
      if (this.matchCommand(command, ['添加', 'add', '创建', 'create', '新增'])) {
        return {
          success: true,
          message: '正在打开商品添加界面...',
          view: 'merchant',
          action: 'add_product',
        }
      }
      return {
        success: true,
        message: '正在加载商品列表...',
        view: 'merchant',
        action: 'view_products',
      }
    }
    return { success: false, message: '您没有商户权限' }
  }

  private handleWalletCommand(command: string, data?: any): CommandResult {
    if (this.currentMode === 'personal' || this.userRoles.isUser) {
      return {
        success: true,
        message: '正在加载钱包信息...',
        view: 'user',
        action: 'view_wallets',
      }
    }
    return { success: false, message: '无法处理钱包命令' }
  }

  private handleSettlementCommand(command: string, data?: any): CommandResult {
    if (this.currentMode === 'merchant' && this.userRoles.isMerchant) {
      return {
        success: true,
        message: '正在加载结算信息...',
        view: 'merchant',
        action: 'view_settlement',
      }
    }
    return { success: false, message: '您没有商户权限' }
  }

  private handleApiCommand(command: string, data?: any): CommandResult {
    if (this.currentMode === 'developer' && this.userRoles.isDeveloper) {
      return {
        success: true,
        message: '正在加载API统计...',
        view: 'developer',
        action: 'view_api_stats',
      }
    }
    return { success: false, message: '您没有开发者权限' }
  }

  private handleDataCommand(command: string, data?: any): CommandResult {
    if (this.currentMode === 'merchant' && this.userRoles.isMerchant) {
      return {
        success: true,
        message: '正在加载数据分析...',
        view: 'merchant',
        action: 'view_analytics',
      }
    }
    return { success: false, message: '无法处理数据命令' }
  }

  private handleKYCCommand(command: string, data?: any): CommandResult {
    if (this.currentMode === 'personal' || this.userRoles.isUser) {
      return {
        success: true,
        message: '正在打开KYC认证界面...',
        view: 'user',
        action: 'start_kyc',
      }
    }
    return { success: false, message: '无法处理KYC命令' }
  }

  private handleGuideCommand(command: string, data?: any): CommandResult {
    if (this.currentMode === 'merchant') {
      return {
        success: true,
        message: '正在打开商户上线清单...',
        view: 'merchant',
        action: 'view_checklist',
      }
    } else if (this.currentMode === 'developer') {
      return {
        success: true,
        message: '正在打开技能开发进度...',
        view: 'developer',
        action: 'view_lifecycle',
      }
    } else {
      return {
        success: true,
        message: '正在打开授权向导...',
        view: 'user',
        action: 'view_auth_guide',
      }
    }
  }
}


