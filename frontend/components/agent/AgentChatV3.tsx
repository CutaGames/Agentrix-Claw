import { useState, useRef, useEffect } from 'react';
import { useUser } from '../../contexts/UserContext';
import { usePayment } from '../../contexts/PaymentContext';
import { agentApi, ProductSearchResult, ServiceProduct, OnChainAsset } from '../../lib/api/agent.api';
import { GlassCard } from '../ui/GlassCard';
import { AIButton } from '../ui/AIButton';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    type?: 'product' | 'product_search' | 'price_comparison' | 'service' | 'onchain_asset' | 'order' | 'code' | 'guide' | 'faq' | 'refund' | 'logistics' | 'workflow' | 'view_cart' | 'add_to_cart' | 'checkout' | 'payment' | 'pay_order' | 'error' | 'unknown';
    data?: any;
    searchResults?: ProductSearchResult[] | ServiceProduct[] | OnChainAsset[];
    comparison?: any;
  };
}

interface AgentChatProps {
  onProductSelect?: (productId: string) => void;
  onOrderQuery?: (orderId: string) => void;
  onCodeGenerate?: (prompt: string) => void;
}

/**
 * Agentrix Agent V3.0 聊天组件（优化UI）
 * 应用Figma设计规范：未来感、科技感、AI蓝光效果
 */
export function AgentChatV3({ onProductSelect, onOrderQuery, onCodeGenerate }: AgentChatProps) {
  const { user } = useUser();
  const { startPayment } = usePayment();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: '👋 欢迎，我是 Agentrix Agent，您的智能商业与支付助手。\n\n我可以帮您：\n• 浏览和购买商品、服务、链上资产\n• 查询订单状态\n• 接入 API/SDK（生成示例代码）\n• 解答常见问题\n\n请告诉我您需要什么帮助？',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await generateResponse(input, userMessage);
      setMessages((prev) => [...prev, response]);
    } catch (error) {
      console.error('获取响应失败:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '抱歉，处理您的请求时出现错误。请稍后重试。',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const generateResponse = async (userInput: string, userMessage: ChatMessage): Promise<ChatMessage> => {
    try {
      const response = await agentApi.chat({ message: userInput });
      if (!response) {
        throw new Error('Agent响应为空');
      }
      
      let searchResults: any = null;
      let comparison: any = null;

      if (response.type === 'product' && response.data?.action === 'search') {
        try {
          const searchResponse = await agentApi.searchProducts(userInput);
          if (searchResponse) {
            searchResults = searchResponse.products;
            comparison = searchResponse.comparison;
          }
        } catch (error) {
          console.error('商品搜索失败:', error);
        }
      } else if (response.type === 'service' && response.data?.action === 'search') {
        try {
          searchResults = await agentApi.searchServices(userInput);
        } catch (error) {
          console.error('服务搜索失败:', error);
        }
      } else if (response.type === 'onchain_asset' && response.data?.action === 'search') {
        try {
          searchResults = await agentApi.searchOnChainAssets(userInput);
        } catch (error) {
          console.error('链上资产搜索失败:', error);
        }
      } else if (response.type === 'order' && response.data?.action === 'query') {
        try {
          const ordersResponse = await agentApi.queryOrders();
          if (ordersResponse) {
            searchResults = ordersResponse.orders;
          }
        } catch (error) {
          console.error('订单查询失败:', error);
        }
      }
      
      return {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
        metadata: {
          type: response.type,
          data: response.data,
          searchResults,
          comparison,
        },
      };
    } catch (error) {
      console.error('获取响应失败:', error);
      return {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '我理解您的需求。让我为您提供帮助...',
        timestamp: new Date(),
      };
    }
  };

  return (
    <div className="flex h-full bg-neutral-900 grid-background">
      {/* 左侧：对话区 */}
      <div className="flex-1 flex flex-col">
        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="w-10 h-10 rounded-full bg-ai-gradient flex items-center justify-center mr-3 flex-shrink-0 ai-glow">
                  <span className="text-white text-lg">AI</span>
                </div>
              )}
              
              <div className={`max-w-[70%] ${message.role === 'user' ? 'order-2' : ''}`}>
                {/* AI气泡 - 蓝色光晕效果 */}
                {message.role === 'assistant' ? (
                  <GlassCard glow className="ai-glow">
                    <div className="text-neutral-100 whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </div>
                    
                    {/* 商品推荐卡片（横向滑动） */}
                    {message.metadata?.type === 'product' && message.metadata?.searchResults && (
                      <div className="mt-4">
                        {message.metadata.comparison && (
                          <div className="mb-3 p-3 glass rounded-lg">
                            <div className="text-xs text-primary-neon mb-1">💰 比价结果</div>
                            <div className="text-sm text-neutral-100">
                              最便宜: <span className="text-accent-green">{message.metadata.comparison.cheapest?.name}</span> - {message.metadata.comparison.cheapest?.price} {message.metadata.comparison.cheapest?.currency}
                            </div>
                            <div className="text-xs text-neutral-400 mt-1">
                              平均价格: {message.metadata.comparison.averagePrice?.toFixed(2)} {message.metadata.comparison.cheapest?.currency}
                            </div>
                          </div>
                        )}
                        
                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                          {(message.metadata.searchResults as ProductSearchResult[]).slice(0, 5).map((product) => (
                            <GlassCard
                              key={product.id}
                              className="min-w-[200px] cursor-pointer hover:scale-105 transition-transform"
                              hover
                            >
                              <div className="text-sm font-semibold text-neutral-100 mb-1">{product.name}</div>
                              <div className="text-primary-neon text-lg font-bold mb-2">
                                {product.price} {product.currency}
                              </div>
                              <AIButton
                                variant="outline"
                                className="w-full text-xs py-1.5"
                                onClick={() => onProductSelect?.(product.id)}
                              >
                                查看详情
                              </AIButton>
                            </GlassCard>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 服务推荐 */}
                    {message.metadata?.type === 'service' && message.metadata?.searchResults && (
                      <div className="mt-4 flex gap-3 overflow-x-auto">
                        {(message.metadata.searchResults as ServiceProduct[]).slice(0, 5).map((service) => (
                          <GlassCard key={service.id} className="min-w-[180px]" hover>
                            <div className="text-sm font-semibold text-neutral-100">{service.name}</div>
                            <div className="text-primary-neon text-lg font-bold mt-2">
                              {service.price} {service.currency}
                            </div>
                            <div className="text-xs text-neutral-400 mt-1">{service.type}</div>
                          </GlassCard>
                        ))}
                      </div>
                    )}

                    {/* 链上资产 */}
                    {message.metadata?.type === 'onchain_asset' && message.metadata?.searchResults && (
                      <div className="mt-4 flex gap-3 overflow-x-auto">
                        {(message.metadata.searchResults as OnChainAsset[]).slice(0, 5).map((asset) => (
                          <GlassCard key={asset.id} className="min-w-[200px] bg-chain-gradient/20" hover>
                            <div className="text-xs text-primary-neon mb-1">🔗 {asset.chain.toUpperCase()}</div>
                            <div className="text-sm font-semibold text-neutral-100">{asset.name}</div>
                            <div className="text-primary-neon text-lg font-bold mt-2">
                              {asset.price} {asset.currency}
                            </div>
                            <div className="text-xs text-neutral-400 mt-1">{asset.type}</div>
                          </GlassCard>
                        ))}
                      </div>
                    )}
                  </GlassCard>
                ) : (
                  /* 用户气泡 - 浅灰 */
                  <div className="glass rounded-2xl px-4 py-3 bg-neutral-700/50">
                    <div className="text-neutral-100 whitespace-pre-wrap">{message.content}</div>
                  </div>
                )}
              </div>

              {message.role === 'user' && (
                <div className="w-10 h-10 rounded-full bg-neutral-700 flex items-center justify-center ml-3 flex-shrink-0">
                  <span className="text-neutral-300 text-sm">你</span>
                </div>
              )}
            </div>
          ))}
          
          {/* 思考中动画 */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="w-10 h-10 rounded-full bg-ai-gradient flex items-center justify-center mr-3 flex-shrink-0 ai-glow animate-pulse-glow">
                <span className="text-white text-lg">AI</span>
              </div>
              <GlassCard>
                <div className="thinking-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </GlassCard>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* 输入框 - 带工具栏 */}
        <div className="border-t border-neutral-700/50 p-4 glass-strong">
          <div className="flex items-end gap-2">
            {/* 工具栏 */}
            <div className="flex gap-2 mb-2">
              <button className="p-2 glass rounded-lg hover:bg-white/10 transition-colors" title="语音输入">
                <svg className="w-5 h-5 text-primary-neon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
              <button className="p-2 glass rounded-lg hover:bg-white/10 transition-colors" title="附件">
                <svg className="w-5 h-5 text-primary-neon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 flex flex-col gap-2">
              {/* 快捷指令提示 */}
              <div className="flex gap-2 text-xs text-neutral-400">
                <span className="px-2 py-1 glass rounded">/checkout</span>
                <span className="px-2 py-1 glass rounded">/recommend</span>
                <span className="px-2 py-1 glass rounded">/integrate</span>
              </div>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="输入消息..."
                  className="flex-1 px-4 py-3 glass rounded-lg text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-neon focus:ai-glow bg-neutral-800/50"
                  disabled={isLoading}
                  autoFocus
                />
                <AIButton
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="px-6"
                >
                  发送
                </AIButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧：推荐/代码生成/支付进度 */}
      <div className="w-80 border-l border-neutral-700/50 p-4 overflow-y-auto">
        <div className="space-y-4">
          {/* 商品推荐区 */}
          {messages.some(m => m.metadata?.type === 'product' && m.metadata?.searchResults) && (
            <GlassCard>
              <div className="text-sm font-semibold text-neutral-100 mb-3">🎯 智能推荐</div>
              <div className="space-y-2">
                {(messages
                  .find(m => m.metadata?.type === 'product' && m.metadata?.searchResults)
                  ?.metadata?.searchResults as ProductSearchResult[])?.slice(0, 3)
                  .map((product) => (
                    <div key={product.id} className="p-2 glass rounded cursor-pointer hover:bg-white/5">
                      <div className="text-xs text-neutral-100">{product.name}</div>
                      <div className="text-primary-neon text-sm font-bold">{product.price} {product.currency}</div>
                    </div>
                  ))}
              </div>
            </GlassCard>
          )}

          {/* 支付进度条 */}
          {messages.some(m => m.metadata?.type === 'order') && (
            <GlassCard>
              <div className="text-sm font-semibold text-neutral-100 mb-3">💳 支付进度</div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full bg-accent-green"></div>
                  <span className="text-neutral-300">推荐完成</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full bg-primary-neon animate-pulse"></div>
                  <span className="text-neutral-300">创建订单中...</span>
                </div>
              </div>
            </GlassCard>
          )}

          {/* SDK代码生成卡片 */}
          {messages.some(m => m.metadata?.type === 'code') && (
            <GlassCard>
              <div className="text-sm font-semibold text-neutral-100 mb-3">💻 代码示例</div>
              <div className="p-3 glass rounded bg-neutral-800/50">
                <pre className="text-xs text-neutral-300 overflow-x-auto">
                  <code>{`const payment = await agentrix.payments.create({
  amount: 100,
  currency: 'CNY'
});`}</code>
                </pre>
              </div>
              <AIButton
                variant="outline"
                className="w-full mt-3 text-xs py-2"
                onClick={() => onCodeGenerate?.('')}
              >
                复制代码
              </AIButton>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}

