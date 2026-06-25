import { Injectable, Logger } from '@nestjs/common';

/**
 * P1: AI 平台结构化数据渲染服务
 * 
 * 为不同 AI 平台（ChatGPT, Claude, Gemini, Grok）优化响应格式：
 * 1. ChatGPT: 支持 Card 卡片渲染、Action 按钮
 * 2. Claude: 支持 Artifacts 和 Markdown 表格
 * 3. Gemini: 支持结构化 JSON 响应
 * 4. Grok: 支持 Markdown 和链接预览
 */

export type AIPlatform = 'chatgpt' | 'claude' | 'gemini' | 'grok' | 'generic';

export interface ProductCard {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  imageUrl?: string;
  merchantName?: string;
  rating?: number;
  reviewCount?: number;
  tags?: string[];
  actionUrl?: string;
}

export interface PaymentCard {
  paymentId: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
  amount: number;
  currency: string;
  description?: string;
  merchantName?: string;
  paymentUrl?: string;
  qrCodeUrl?: string;
  expiresAt?: Date;
}

export interface WalletInfo {
  address: string;
  balance: number;
  currency: string;
  network?: string;
  status?: string;
}

export interface ActionButton {
  label: string;
  url: string;
  type?: 'primary' | 'secondary' | 'danger';
  icon?: string;
}

export interface StructuredResponse {
  /** 响应类型 */
  type: 'text' | 'card' | 'list' | 'table' | 'payment' | 'wallet' | 'action';
  /** 平台 */
  platform: AIPlatform;
  /** 内容 */
  content: any;
  /** Markdown 格式（通用降级） */
  markdown?: string;
  /** JSON 格式（API 响应） */
  json?: any;
  /** 操作按钮 */
  actions?: ActionButton[];
}

@Injectable()
export class StructuredResponseService {
  private readonly logger = new Logger(StructuredResponseService.name);

  /**
   * 渲染产品列表
   */
  renderProductList(
    products: ProductCard[],
    platform: AIPlatform = 'generic',
    options?: {
      title?: string;
      showActions?: boolean;
    },
  ): StructuredResponse {
    const title = options?.title || '商品列表';
    const showActions = options?.showActions !== false;

    switch (platform) {
      case 'chatgpt':
        return this.renderChatGPTProductList(products, title, showActions);
      case 'claude':
        return this.renderClaudeProductList(products, title);
      case 'gemini':
        return this.renderGeminiProductList(products, title);
      default:
        return this.renderGenericProductList(products, title, showActions);
    }
  }

  /**
   * 渲染支付卡片
   */
  renderPaymentCard(
    payment: PaymentCard,
    platform: AIPlatform = 'generic',
  ): StructuredResponse {
    switch (platform) {
      case 'chatgpt':
        return this.renderChatGPTPaymentCard(payment);
      case 'claude':
        return this.renderClaudePaymentCard(payment);
      default:
        return this.renderGenericPaymentCard(payment);
    }
  }

  /**
   * 渲染钱包信息
   */
  renderWalletInfo(
    wallet: WalletInfo,
    platform: AIPlatform = 'generic',
  ): StructuredResponse {
    switch (platform) {
      case 'chatgpt':
        return this.renderChatGPTWalletInfo(wallet);
      default:
        return this.renderGenericWalletInfo(wallet);
    }
  }

  /**
   * 渲染操作按钮
   */
  renderActions(
    actions: ActionButton[],
    platform: AIPlatform = 'generic',
    title?: string,
  ): StructuredResponse {
    switch (platform) {
      case 'chatgpt':
        return this.renderChatGPTActions(actions, title);
      default:
        return this.renderGenericActions(actions, title);
    }
  }

  /**
   * 渲染表格数据
   */
  renderTable(
    headers: string[],
    rows: (string | number)[][],
    platform: AIPlatform = 'generic',
    title?: string,
  ): StructuredResponse {
    const markdown = this.createMarkdownTable(headers, rows, title);

    return {
      type: 'table',
      platform,
      content: { headers, rows, title },
      markdown,
      json: { headers, rows },
    };
  }

  // ========== ChatGPT 特定渲染 ==========

  private renderChatGPTProductList(
    products: ProductCard[],
    title: string,
    showActions: boolean,
  ): StructuredResponse {
    // ChatGPT 支持 Markdown 卡片格式
    const cards = products.map((p, i) => {
      const lines = [
        `### ${i + 1}. ${p.name}`,
        p.description ? `> ${p.description}` : '',
        '',
        `**价格:** ${this.formatPrice(p.price, p.currency)}`,
        p.merchantName ? `**商家:** ${p.merchantName}` : '',
        p.rating ? `**评分:** ${'⭐'.repeat(Math.round(p.rating))} (${p.reviewCount || 0} 评价)` : '',
        p.tags?.length ? `**标签:** ${p.tags.join(', ')}` : '',
        showActions && p.actionUrl ? `\n[立即购买](${p.actionUrl})` : '',
      ].filter(Boolean);
      return lines.join('\n');
    });

    const markdown = `## ${title}\n\n${cards.join('\n\n---\n\n')}`;

    // ChatGPT 的结构化 JSON（用于 Function Calling 响应）
    const json = {
      title,
      products: products.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        currency: p.currency,
        formattedPrice: this.formatPrice(p.price, p.currency),
        description: p.description,
        merchantName: p.merchantName,
        rating: p.rating,
        actionUrl: p.actionUrl,
      })),
      actions: showActions ? products.map(p => ({
        label: `购买 ${p.name}`,
        url: p.actionUrl,
        productId: p.id,
      })) : [],
    };

    return {
      type: 'list',
      platform: 'chatgpt',
      content: json,
      markdown,
      json,
      actions: showActions ? products.slice(0, 3).map(p => ({
        label: `购买 ${p.name}`,
        url: p.actionUrl || '',
        type: 'primary',
      })) : [],
    };
  }

  private renderChatGPTPaymentCard(payment: PaymentCard): StructuredResponse {
    const statusEmoji = {
      pending: '⏳',
      processing: '🔄',
      succeeded: '✅',
      failed: '❌',
      cancelled: '🚫',
    };

    const statusText = {
      pending: '待支付',
      processing: '处理中',
      succeeded: '支付成功',
      failed: '支付失败',
      cancelled: '已取消',
    };

    const lines = [
      `## 💳 支付信息`,
      '',
      `**状态:** ${statusEmoji[payment.status]} ${statusText[payment.status]}`,
      `**金额:** ${this.formatPrice(payment.amount, payment.currency)}`,
      payment.description ? `**描述:** ${payment.description}` : '',
      payment.merchantName ? `**商家:** ${payment.merchantName}` : '',
      payment.expiresAt ? `**有效期至:** ${new Date(payment.expiresAt).toLocaleString()}` : '',
      '',
      payment.paymentUrl && payment.status === 'pending' ? `[点击支付](${payment.paymentUrl})` : '',
    ].filter(Boolean);

    const markdown = lines.join('\n');

    const json = {
      paymentId: payment.paymentId,
      status: payment.status,
      statusText: statusText[payment.status],
      amount: payment.amount,
      currency: payment.currency,
      formattedAmount: this.formatPrice(payment.amount, payment.currency),
      description: payment.description,
      merchantName: payment.merchantName,
      paymentUrl: payment.paymentUrl,
      qrCodeUrl: payment.qrCodeUrl,
    };

    const actions: ActionButton[] = [];
    if (payment.status === 'pending' && payment.paymentUrl) {
      actions.push({
        label: '立即支付',
        url: payment.paymentUrl,
        type: 'primary',
      });
    }

    return {
      type: 'payment',
      platform: 'chatgpt',
      content: json,
      markdown,
      json,
      actions,
    };
  }

  private renderChatGPTWalletInfo(wallet: WalletInfo): StructuredResponse {
    const markdown = [
      `## 💼 钱包信息`,
      '',
      `**地址:** \`${wallet.address}\``,
      `**余额:** ${this.formatPrice(wallet.balance, wallet.currency)}`,
      wallet.network ? `**网络:** ${wallet.network}` : '',
      wallet.status ? `**状态:** ${wallet.status}` : '',
    ].filter(Boolean).join('\n');

    return {
      type: 'wallet',
      platform: 'chatgpt',
      content: wallet,
      markdown,
      json: wallet,
    };
  }

  private renderChatGPTActions(actions: ActionButton[], title?: string): StructuredResponse {
    const lines = [
      title ? `## ${title}` : '',
      '',
      ...actions.map((a, i) => `${i + 1}. [${a.label}](${a.url})`),
    ].filter(Boolean);

    return {
      type: 'action',
      platform: 'chatgpt',
      content: actions,
      markdown: lines.join('\n'),
      json: { actions },
      actions,
    };
  }

  // ========== Claude 特定渲染 ==========

  private renderClaudeProductList(products: ProductCard[], title: string): StructuredResponse {
    // Claude 支持更丰富的 Markdown 和表格
    const headers = ['商品', '价格', '商家', '评分'];
    const rows = products.map(p => [
      p.name,
      this.formatPrice(p.price, p.currency),
      p.merchantName || '-',
      p.rating != null ? `${Number(p.rating).toFixed(1)}/5` : '-',
    ]);

    const markdown = this.createMarkdownTable(headers, rows, title);

    return {
      type: 'list',
      platform: 'claude',
      content: { products, title },
      markdown,
      json: { title, products },
    };
  }

  private renderClaudePaymentCard(payment: PaymentCard): StructuredResponse {
    // Claude 使用简洁的信息块
    const markdown = [
      '```payment',
      `ID: ${payment.paymentId}`,
      `状态: ${payment.status}`,
      `金额: ${this.formatPrice(payment.amount, payment.currency)}`,
      payment.description ? `描述: ${payment.description}` : '',
      payment.paymentUrl ? `支付链接: ${payment.paymentUrl}` : '',
      '```',
    ].filter(Boolean).join('\n');

    return {
      type: 'payment',
      platform: 'claude',
      content: payment,
      markdown,
      json: payment,
    };
  }

  // ========== Gemini 特定渲染 ==========

  private renderGeminiProductList(products: ProductCard[], title: string): StructuredResponse {
    // Gemini 偏好结构化 JSON
    const json = {
      type: 'product_list',
      title,
      count: products.length,
      items: products.map(p => ({
        id: p.id,
        name: p.name,
        price: { value: p.price, currency: p.currency },
        merchant: p.merchantName,
        rating: p.rating,
        url: p.actionUrl,
      })),
    };

    // 同时提供 Markdown 降级
    const markdown = this.renderGenericProductList(products, title, true).markdown;

    return {
      type: 'list',
      platform: 'gemini',
      content: json,
      markdown,
      json,
    };
  }

  // ========== 通用渲染 ==========

  private renderGenericProductList(
    products: ProductCard[],
    title: string,
    showActions: boolean,
  ): StructuredResponse {
    const items = products.map((p, i) => {
      const lines = [
        `${i + 1}. **${p.name}** - ${this.formatPrice(p.price, p.currency)}`,
        p.description ? `   ${p.description}` : '',
        p.merchantName ? `   商家: ${p.merchantName}` : '',
        showActions && p.actionUrl ? `   [购买](${p.actionUrl})` : '',
      ].filter(Boolean);
      return lines.join('\n');
    });

    const markdown = `## ${title}\n\n${items.join('\n\n')}`;

    return {
      type: 'list',
      platform: 'generic',
      content: { products, title },
      markdown,
      json: { title, products },
    };
  }

  private renderGenericPaymentCard(payment: PaymentCard): StructuredResponse {
    const statusText: Record<string, string> = {
      pending: '待支付',
      processing: '处理中',
      succeeded: '支付成功',
      failed: '支付失败',
      cancelled: '已取消',
    };

    const markdown = [
      `**支付 ${payment.paymentId}**`,
      `- 状态: ${statusText[payment.status]}`,
      `- 金额: ${this.formatPrice(payment.amount, payment.currency)}`,
      payment.description ? `- 描述: ${payment.description}` : '',
      payment.paymentUrl ? `- [支付链接](${payment.paymentUrl})` : '',
    ].filter(Boolean).join('\n');

    return {
      type: 'payment',
      platform: 'generic',
      content: payment,
      markdown,
      json: payment,
    };
  }

  private renderGenericWalletInfo(wallet: WalletInfo): StructuredResponse {
    const markdown = [
      `**钱包信息**`,
      `- 地址: \`${wallet.address}\``,
      `- 余额: ${this.formatPrice(wallet.balance, wallet.currency)}`,
      wallet.network ? `- 网络: ${wallet.network}` : '',
    ].filter(Boolean).join('\n');

    return {
      type: 'wallet',
      platform: 'generic',
      content: wallet,
      markdown,
      json: wallet,
    };
  }

  private renderGenericActions(actions: ActionButton[], title?: string): StructuredResponse {
    const lines = actions.map(a => `- [${a.label}](${a.url})`);
    const markdown = (title ? `**${title}**\n\n` : '') + lines.join('\n');

    return {
      type: 'action',
      platform: 'generic',
      content: actions,
      markdown,
      json: { actions },
      actions,
    };
  }

  // ========== 辅助方法 ==========

  private formatPrice(amount: number, currency: string): string {
    const symbols: Record<string, string> = {
      USD: '$',
      EUR: '€',
      CNY: '¥',
      GBP: '£',
      JPY: '¥',
      USDC: 'USDC ',
      USDT: 'USDT ',
      ETH: 'Ξ',
      BTC: '₿',
    };

    const symbol = symbols[currency] || `${currency} `;
    return `${symbol}${amount.toFixed(2)}`;
  }

  private createMarkdownTable(
    headers: string[],
    rows: (string | number)[][],
    title?: string,
  ): string {
    const headerRow = `| ${headers.join(' | ')} |`;
    const separator = `| ${headers.map(() => '---').join(' | ')} |`;
    const dataRows = rows.map(row => `| ${row.join(' | ')} |`);

    const lines = [
      title ? `## ${title}` : '',
      '',
      headerRow,
      separator,
      ...dataRows,
    ].filter(Boolean);

    return lines.join('\n');
  }

  /**
   * 检测请求来源的 AI 平台
   */
  detectPlatform(userAgent?: string, referer?: string): AIPlatform {
    const ua = (userAgent || '').toLowerCase();
    const ref = (referer || '').toLowerCase();

    if (ua.includes('chatgpt') || ref.includes('chat.openai.com')) {
      return 'chatgpt';
    }
    if (ua.includes('claude') || ref.includes('claude.ai')) {
      return 'claude';
    }
    if (ua.includes('gemini') || ref.includes('gemini.google.com')) {
      return 'gemini';
    }
    if (ua.includes('grok') || ref.includes('x.com')) {
      return 'grok';
    }

    return 'generic';
  }
}
