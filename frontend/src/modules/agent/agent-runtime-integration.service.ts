import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { AgentRuntime } from './runtime/agent-runtime.service';
import { MemoryType } from '../../entities/agent-memory.entity';

/**
 * Agent Runtime 集成服务
 * 在 AgentService 中使用 Runtime 处理消息
 */
@Injectable()
export class AgentRuntimeIntegrationService {
  private readonly logger = new Logger(AgentRuntimeIntegrationService.name);

  constructor(
    @Inject(forwardRef(() => AgentRuntime))
    private runtime: AgentRuntime,
  ) {}

  /**
   * 使用 Runtime 处理消息
   */
  async processMessageWithRuntime(
    message: string,
    sessionId: string,
    userId?: string,
    mode: 'user' | 'merchant' | 'developer' = 'user',
  ): Promise<{
    response: string;
    type?: string;
    data?: any;
    intent?: string;
    shouldUseWorkflow?: boolean;
  }> {
    try {
      // 1. 从 Memory 获取上下文
      const recentMemories = await this.runtime.memory.getRecentMemories(sessionId, 5);
      const context = this.buildContextFromMemories(recentMemories);

      // 2. 识别意图（简单版本，后续可以用模型）
      const intent = this.identifyIntent(message, context);

      // 3. 检查是否有进行中的 Workflow
      const activeWorkflow = await this.runtime.workflow.getWorkflowState(sessionId);

      if (activeWorkflow && activeWorkflow.status === 'active') {
        // 如果当前意图是新的搜索查询，应该重置 workflow 而不是继续执行
        if (intent === 'product_search' && activeWorkflow.workflowId === 'ecommerce') {
          // 检查是否是新的搜索查询（与之前的查询不同）
          const lastSearch = await this.runtime.memory.getMemory(
            sessionId,
            'last_search_products',
          );
          const newQuery = this.extractParams(message, intent, context).query;
          const oldQuery = lastSearch?.value?.query;
          
          // 如果是新的搜索查询，取消旧 workflow 并重新启动
          if (newQuery && newQuery !== oldQuery) {
            this.logger.log(`New search query detected, cancelling old workflow and starting new one`);
            await this.runtime.workflow.cancelWorkflow(activeWorkflow.id);
            // 继续执行下面的逻辑，启动新的 workflow
          } else {
            // 继续执行 Workflow（可能是选择商品等操作）
            this.logger.log(`Resuming workflow ${activeWorkflow.workflowId} for session ${sessionId}`);
            
            const params = this.extractParams(message, intent, context);
            
            // 执行下一步
            const result = await this.runtime.workflow.executeNextStep(activeWorkflow.id, params);
            
            if (result.success) {
              return {
                response: this.formatWorkflowResponse(result, activeWorkflow),
                type: 'workflow',
                data: result.output,
                intent,
                shouldUseWorkflow: true,
              };
            } else {
              return {
                response: `流程执行失败：${result.error}`,
                type: 'error',
                intent,
                shouldUseWorkflow: true,
              };
            }
          }
        } else {
          // 非搜索意图，继续执行 Workflow
          this.logger.log(`Resuming workflow ${activeWorkflow.workflowId} for session ${sessionId}`);
          
          const params = this.extractParams(message, intent, context);
          
          // 执行下一步
          const result = await this.runtime.workflow.executeNextStep(activeWorkflow.id, params);
          
          if (result.success) {
            return {
              response: this.formatWorkflowResponse(result, activeWorkflow),
              type: 'workflow',
              data: result.output,
              intent,
              shouldUseWorkflow: true,
            };
          } else {
            return {
              response: `流程执行失败：${result.error}`,
              type: 'error',
              intent,
              shouldUseWorkflow: true,
            };
          }
        }
      }

      // 4. 检查是否有匹配的 Workflow
      const workflow = this.runtime.workflow.getWorkflowByIntent(intent);
      if (workflow) {
        // 启动 Workflow
        this.logger.log(`Starting workflow ${workflow.id} for session ${sessionId}`);
        
        const params = this.extractParams(message, intent, context);
        
        // 确保 query 参数正确传递
        if (intent === 'product_search' && !params.query) {
          // 如果参数提取失败，使用原始消息作为查询
          params.query = message.replace(/^(我要|我想|帮我|幫我|请|請|幫|帮)/, '').trim();
        }
        
        const result = await this.runtime.workflow.startWorkflow(sessionId, workflow.id, {
          userQuery: message,
          ...params,
        });

        if (result.success) {
          return {
            response: this.formatWorkflowResponse(result, result.workflowState),
            type: 'workflow',
            data: result.output,
            intent,
            shouldUseWorkflow: true,
          };
        } else {
          const errorMessage = result.error || result.workflowState?.error?.message || '未知错误';
          this.logger.error(`Workflow ${workflow.id} failed: ${errorMessage}`, result.workflowState?.error);
          return {
            response: `流程启动失败：${errorMessage}`,
            type: 'error',
            data: result.workflowState?.error,
            intent,
            shouldUseWorkflow: true,
          };
        }
      }

      // 5. 处理价格查询（从最近的搜索结果中获取价格）
      if (intent === 'price_query') {
        const lastSearch = await this.runtime.memory.getMemory(
          sessionId,
          'last_search_products',
        );

        if (lastSearch && lastSearch.value?.products && lastSearch.value.products.length > 0) {
          const products = lastSearch.value.products;
          // 返回所有商品的价格信息
          const priceInfo = products.map((p: any, idx: number) => {
            const priceStr = `${p.currency === 'CNY' ? '¥' : p.currency === 'USD' ? '$' : ''}${p.price.toFixed(2)}`;
            return `${idx + 1}. ${p.name}：${priceStr} ${p.currency || 'CNY'}`;
          }).join('\n');

          return {
            response: `以下是搜索结果中的商品价格：\n\n${priceInfo}\n\n您可以说"第一个"、"第二个"等来选择商品加入购物车。`,
            type: 'product_search',
            data: {
              products,
              query: lastSearch.value.query,
              count: products.length,
            },
            intent,
            shouldUseWorkflow: false,
          };
        } else {
          return {
            response: '抱歉，没有找到之前的搜索结果。请先搜索商品，例如："我要买耳机"。',
            type: 'error',
            intent,
            shouldUseWorkflow: false,
          };
        }
      }

      // 6. 尝试使用单个 Skill
      const skill = this.runtime.skills.getSkillByIntent(intent);
      if (skill) {
        this.logger.log(`Executing skill ${skill.id} for session ${sessionId}, intent=${intent}`);
        
        const params = this.extractParams(message, intent, context);
        this.logger.debug(`Extracted params for skill ${skill.id}:`, params);
        
        const result = await this.runtime.skills.executeSkill(
          skill.id,
          params,
          {
            sessionId,
            userId,
            mode,
            memory: this.runtime.memory,
            workflow: this.runtime.workflow,
          },
        );

        this.logger.debug(`Skill ${skill.id} result:`, {
          success: result.success,
          hasData: !!result.data,
          dataKeys: result.data ? Object.keys(result.data) : [],
          productsCount: result.data?.products?.length || 0,
        });

        if (result.success) {
          // 对于商品搜索，确保返回正确的类型和数据格式
          const responseType = skill.id === 'product_search' ? 'product_search' : skill.id;
          return {
            response: result.message || '操作成功',
            type: responseType,
            data: result.data || {},
            intent,
            shouldUseWorkflow: false,
          };
        } else {
          return {
            response: result.message || result.error || '操作失败',
            type: 'error',
            intent,
            shouldUseWorkflow: false,
          };
        }
      }

      // 7. 默认响应
      return {
        response: '我理解您的需求，但暂时无法处理。请尝试更具体的描述。',
        intent,
        shouldUseWorkflow: false,
      };
    } catch (error: any) {
      this.logger.error(`Error processing message with runtime: ${error.message}`, error.stack);
      return {
        response: `处理消息时出现错误：${error.message}`,
        type: 'error',
        shouldUseWorkflow: false,
      };
    }
  }

  /**
   * 从 Memory 构建上下文
   */
  private buildContextFromMemories(memories: any[]): Record<string, any> {
    const context: Record<string, any> = {};

    for (const memory of memories) {
      if (memory.key === 'last_search_products') {
        context.lastSearch = memory.value;
      } else if (memory.key === 'current_cart') {
        context.cart = memory.value;
      } else if (memory.key === 'current_order') {
        context.order = memory.value;
      }
    }

    return context;
  }

  /**
   * 识别意图（简单版本）
   */
  private identifyIntent(message: string, context: Record<string, any>): string {
    const lowerMessage = message.toLowerCase();
    
    // 统一处理繁简体（将繁体转换为简体进行匹配）
    const normalizedMessage = lowerMessage
      .replace(/買/g, '买')
      .replace(/購/g, '购')
      .replace(/尋/g, '寻')
      .replace(/檢/g, '检');
    
    this.logger.debug(`识别意图: message="${message}", normalized="${normalizedMessage}"`);

    // ========== 高优先级：简短明确的命令 ==========
    // 优先匹配"第一个"、"第二个"等简短命令（这些通常是在商品展示后的操作）
    // 这些命令应该优先于商品搜索，避免被误识别
    if (
      lowerMessage === '第一个' ||
      lowerMessage === '第1个' ||
      lowerMessage === '第二个' ||
      lowerMessage === '第2个' ||
      lowerMessage === '第三个' ||
      lowerMessage === '第3个' ||
      lowerMessage === '第四个' ||
      lowerMessage === '第4个' ||
      lowerMessage === '第五个' ||
      lowerMessage === '第5个' ||
      lowerMessage === '1号' ||
      lowerMessage === '2号' ||
      lowerMessage === '3号' ||
      lowerMessage === '4号' ||
      lowerMessage === '5号' ||
      // 匹配"第一个"、"第二个"等（即使包含其他字符，只要核心匹配就识别）
      /^第?[一二三四五六七八九十\d]+[个件项号]?$/.test(lowerMessage.trim())
    ) {
      // 如果有上下文中的商品搜索结果，直接识别为加入购物车
      if (context?.lastSearch?.products && context.lastSearch.products.length > 0) {
        return 'add_to_cart';
      }
      // 如果消息很短（3个字符以内），也认为是加入购物车
      if (message.trim().length <= 3) {
        return 'add_to_cart';
      }
    }

    // 查看购物车（提高优先级，放在加入购物车之前，避免误识别）
    // 更精确的匹配，避免"加入购物车"被识别为"查看购物车"
    if (
      (lowerMessage.includes('查看购物车') && !lowerMessage.includes('加入')) ||
      (lowerMessage.includes('购物车') && !lowerMessage.includes('加入') && !lowerMessage.includes('加')) ||
      lowerMessage.includes('我的购物车') ||
      lowerMessage === '购物车' ||
      lowerMessage === 'cart' ||
      lowerMessage === 'shopping cart' ||
      lowerMessage.includes('查看cart') ||
      lowerMessage.includes('看购物车')
    ) {
      return 'view_cart';
    }

    // 加入购物车（支持多种表达方式，提高识别率）
    // 优先匹配明确的"加入"、"加购"等表达
    if (
      lowerMessage.includes('加入购物车') ||
      lowerMessage.includes('加购') ||
      lowerMessage.includes('添加到购物车') ||
      lowerMessage.includes('add to cart') ||
      lowerMessage.includes('add cart')
    ) {
      return 'add_to_cart';
    }
    
    // 匹配"第一个"、"第二个"等（这些通常是在商品展示后的操作）
    // 如果上下文中有商品搜索结果，这些更可能是"加入购物车"意图
    if (
      lowerMessage.includes('第一个') ||
      lowerMessage.includes('第二个') ||
      lowerMessage.includes('第三个') ||
      lowerMessage.includes('第四个') ||
      lowerMessage.includes('第五个') ||
      lowerMessage.includes('第1个') ||
      lowerMessage.includes('第2个') ||
      lowerMessage.includes('第3个') ||
      lowerMessage.includes('第4个') ||
      lowerMessage.includes('第5个') ||
      lowerMessage.includes('1号') ||
      lowerMessage.includes('2号') ||
      lowerMessage.includes('3号') ||
      lowerMessage.includes('buy this') ||
      lowerMessage.includes('我要这个') ||
      lowerMessage.includes('我要它') ||
      lowerMessage.includes('买这个') ||
      lowerMessage.includes('買這個') ||
      lowerMessage.includes('選這個') ||
      lowerMessage.includes('选这个')
    ) {
      // 检查上下文，如果有商品搜索结果，更可能是加入购物车
      if (context?.lastSearch?.products && context.lastSearch.products.length > 0) {
        return 'add_to_cart';
      }
      // 否则，如果消息很短（如"第一个"），也认为是加入购物车
      if (message.trim().length <= 10) {
        return 'add_to_cart';
      }
    }

    // ========== 商品搜索（支持繁简体）==========
    // 包括：搜索、找、买、购买、查找、服务、咨询、设计、订阅等
    // 以及：我要、我想要、帮我找、帮我买等表达
    // 注意：这个要放在"第一个"、"第二个"等匹配之后，避免误识别
    if (
      normalizedMessage.includes('搜索') ||
      normalizedMessage.includes('找') ||
      normalizedMessage.includes('买') ||
      normalizedMessage.includes('购买') ||
      normalizedMessage.includes('查找') ||
      normalizedMessage.includes('尋') ||
      normalizedMessage.includes('買') ||
      normalizedMessage.includes('我要') ||
      normalizedMessage.includes('我想要') ||
      normalizedMessage.includes('帮我找') ||
      normalizedMessage.includes('幫我找') ||
      normalizedMessage.includes('帮我买') ||
      normalizedMessage.includes('幫我買') ||
      normalizedMessage.includes('服务') ||
      normalizedMessage.includes('服務') ||
      normalizedMessage.includes('咨询') ||
      normalizedMessage.includes('諮詢') ||
      normalizedMessage.includes('设计') ||
      normalizedMessage.includes('設計') ||
      normalizedMessage.includes('订阅') ||
      normalizedMessage.includes('訂閱') ||
      lowerMessage.includes('search') ||
      lowerMessage.includes('find') ||
      lowerMessage.includes('want') ||
      lowerMessage.includes('need') ||
      lowerMessage.includes('service') ||
      lowerMessage.includes('consultation')
    ) {
      return 'product_search';
    }
    
    // 最后匹配"加入"、"加"等（但排除"查看"相关）
    if (
      (lowerMessage.includes('加入') || lowerMessage.includes('加')) &&
      !lowerMessage.includes('查看') &&
      !lowerMessage.includes('看')
    ) {
      return 'add_to_cart';
    }

    // 结算
    if (
      lowerMessage.includes('结算') ||
      lowerMessage.includes('下单') ||
      lowerMessage.includes('创建订单') ||
      lowerMessage.includes('下单')
    ) {
      return 'checkout';
    }

    // 支付
    if (
      lowerMessage.includes('支付') ||
      lowerMessage.includes('付款') ||
      lowerMessage.includes('pay')
    ) {
      return 'payment';
    }

    // 更新购物车商品数量（提高优先级）
    if (
      lowerMessage.includes('更新购物车') ||
      lowerMessage.includes('更新数量') ||
      lowerMessage.includes('修改数量') ||
      lowerMessage.includes('更改数量') ||
      (lowerMessage.includes('更新') && lowerMessage.includes('数量')) ||
      (lowerMessage.includes('修改') && lowerMessage.includes('数量'))
    ) {
      return 'update_cart_item';
    }

    // 从购物车移除商品（提高优先级）
    if (
      lowerMessage.includes('从购物车移除') ||
      lowerMessage.includes('从购物车删除') ||
      lowerMessage.includes('移除商品') ||
      lowerMessage.includes('删除商品') ||
      (lowerMessage.includes('移除') && lowerMessage.includes('购物车')) ||
      (lowerMessage.includes('删除') && lowerMessage.includes('购物车'))
    ) {
      return 'remove_from_cart';
    }

    // 取消订单（提高优先级，放在价格查询之前）
    if (
      lowerMessage.includes('取消订单') ||
      lowerMessage.includes('取消微支付订单') ||
      (lowerMessage.includes('取消') && (lowerMessage.includes('订单') || lowerMessage.includes('order'))) ||
      lowerMessage.includes('cancel order')
    ) {
      return 'cancel_order';
    }

    // 价格查询（应该返回搜索结果中的价格，而不是触发其他流程）
    if (
      lowerMessage.includes('价格') ||
      lowerMessage.includes('多少钱') ||
      lowerMessage.includes('多少錢') ||
      lowerMessage.includes('price') ||
      lowerMessage.includes('cost')
    ) {
      // 如果有搜索结果，返回价格信息；否则返回 unknown 让系统处理
      return 'price_query';
    }

    return 'unknown';
  }

  /**
   * 提取参数
   */
  private extractParams(
    message: string,
    intent: string,
    context: Record<string, any>,
  ): Record<string, any> {
    const params: Record<string, any> = {};

    // 商品搜索参数
    if (intent === 'product_search') {
      // 提取查询词（支持繁简体）
      // 先去除常见的前缀和动词
      let query = message
        .replace(/^(我要|我想|我想要|帮我|幫我|帮我找|幫我找|帮我买|幫我買|请|請|幫|帮|搜索|找|买|购买|查找)/, '')
        .replace(/^(search|find|buy|purchase|want|need|i\s+want|i\s+need)\s+/i, '')
        .trim();
      
      // 处理 iPhone 等特殊格式（去除大小写差异）
      query = query.replace(/iphone/gi, 'iPhone');
      
      // 如果提取后为空，使用整个消息（去除标点）
      if (!query || query.length === 0) {
        query = message.replace(/[，。！？,\.!?]/g, '').trim();
      }
      
      // 确保查询不为空
      if (!query || query.length === 0) {
        query = message; // 最后回退到原始消息
      }
      
      params.query = query;
      this.logger.debug(`提取的搜索查询: "${query}" from "${message}"`);
    }

    // 更新购物车商品参数
    if (intent === 'update_cart_item') {
      params.message = message;
    }

    // 移除购物车商品参数
    if (intent === 'remove_from_cart') {
      params.message = message;
    }

    // 取消订单参数
    if (intent === 'cancel_order') {
      params.message = message;
      // 尝试从消息中提取订单ID
      const idMatch = message.match(/(?:订单|order)[\s:：]?([a-f0-9-]{8,}|[a-f0-9]{8})/i);
      if (idMatch) {
        params.orderId = idMatch[1];
      } else {
        // 尝试匹配纯ID（8位以上）
        const pureIdMatch = message.match(/([a-f0-9-]{8,})/i);
        if (pureIdMatch) {
          params.orderId = pureIdMatch[1];
        }
      }
    }

    // 加入购物车参数
    if (intent === 'add_to_cart') {
      // 提取商品索引（支持多种表达方式）
      // 匹配："第一个"、"第1个"、"1号"、"第一个商品"、"把第一个加入购物车"等
      const indexPatterns = [
        /(把)?(第)?([一二三四五六七八九十\d]+)(个|件|项|号)(加入购物车|加入|加到购物车)?/,  // 把第一个加入购物车、第一个、第1个、1号
        /([一二三四五六七八九十\d]+)号/,  // 1号、2号
        /第([一二三四五六七八九十\d]+)/,  // 第一、第二
        /(把)?(第)?([一二三四五六七八九十\d]+)(个|件|项)/,  // 把第一个、第一个
      ];
      
      for (const pattern of indexPatterns) {
        const match = message.match(pattern);
        if (match) {
          // 尝试从不同的捕获组中提取数字
          const indexStr = match[3] || match[2] || match[1];
          if (indexStr) {
            // 中文数字转换
            const chineseNumbers: Record<string, number> = {
              '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
              '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
            };
            
            if (chineseNumbers[indexStr]) {
              params.productIndex = chineseNumbers[indexStr];
            } else {
              params.productIndex = parseInt(indexStr) || 1;
            }
            break;
          }
        }
      }
      
      // 如果没有找到索引，但消息包含"第一个"、"第二个"等表达，尝试提取
      if (!params.productIndex) {
        // 更宽松的匹配：只要包含"第一个"、"第1个"等关键词
        const looseMatch = message.match(/(第)?([一二三四五六七八九十\d]+)(个|件|项|号)/);
        if (looseMatch) {
          const indexStr = looseMatch[2] || looseMatch[1];
          const chineseNumbers: Record<string, number> = {
            '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
            '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
          };
          if (chineseNumbers[indexStr]) {
            params.productIndex = chineseNumbers[indexStr];
          } else {
            params.productIndex = parseInt(indexStr) || 1;
          }
        } else if (message.includes('第一个') || message.includes('第1个') || message === '第一个' || message === '第1个') {
          params.productIndex = 1;
        }
      }

      // 提取数量（"2个"、"3件"等）
      const quantityMatch = message.match(/(\d+)(个|件|项)/);
      if (quantityMatch) {
        params.quantity = parseInt(quantityMatch[1]);
      }
    }

    return params;
  }

  /**
   * 格式化 Workflow 响应
   */
  private formatWorkflowResponse(result: any, workflowState: any): string {
    if (result.output) {
      // 根据输出类型格式化响应
      if (result.output.products && Array.isArray(result.output.products)) {
        const products = result.output.products;
        if (products.length === 0) {
          return `抱歉，没有找到相关商品。请尝试其他关键词。`;
        }
        // 返回商品列表摘要（包含价格，使用 priceDisplay 如果存在）
        const productSummary = products
          .slice(0, 5)
          .map((p: any, idx: number) => {
            const priceStr = p.priceDisplay || `${p.currency === 'CNY' ? '¥' : p.currency === 'USD' ? '$' : ''}${p.price?.toFixed(2) || '0.00'}`;
            return `${idx + 1}. ${p.name} - ${priceStr}`;
          })
          .join('\n');
        const moreText = products.length > 5 ? `\n\n还有 ${products.length - 5} 个商品...` : '';
        return `找到 ${products.length} 个相关商品：\n\n${productSummary}${moreText}\n\n请选择要购买的商品（可以说"第一个"、"第二个"等）。`;
      }
      if (result.output.order) {
        return `订单创建成功！订单号：${result.output.order.id}`;
      }
      if (result.output.payment) {
        return `支付创建成功！支付号：${result.output.payment.id}`;
      }
    }

    // 检查 workflowState 的 context 中是否有商品信息
    if (workflowState?.context?.products) {
      const products = workflowState.context.products;
      if (Array.isArray(products) && products.length > 0) {
        const productNames = products.slice(0, 3).map((p: any) => p.name).join('、');
        const moreText = products.length > 3 ? `等${products.length}个` : '';
        return `找到 ${products.length} 个相关商品${moreText}：${productNames}。请选择要购买的商品（可以说"第一个"、"第二个"等）。`;
      }
    }

    return result.success ? '操作成功' : `操作失败：${result.error}`;
  }
}

