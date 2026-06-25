import { useState, useRef, useEffect } from 'react';
import { useUser } from '../../contexts/UserContext';
import { usePayment } from '../../contexts/PaymentContext';
import { agentApi, ProductSearchResult, ServiceProduct, OnChainAsset } from '../../lib/api/agent.api';

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

export function AgentChat({ onProductSelect, onOrderQuery, onCodeGenerate }: AgentChatProps) {
  const { user } = useUser();
  const { startPayment } = usePayment();
  
  // 输入框引用 - 确保可以正常使用
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: '👋 您好！我是 Agentrix Agent，您的智能商业与支付助手。\n\n我可以帮您：\n• 浏览和购买商品、服务、链上资产\n• 查询订单状态\n• 接入 API/SDK（生成示例代码）\n• 解答常见问题\n\n请告诉我您需要什么帮助？',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 确保输入框在组件挂载后可以聚焦
  useEffect(() => {
    // 延迟聚焦，确保DOM已渲染
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);

    // 调用后端API获取响应
    try {
      const response = await generateResponse(currentInput, userMessage);
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
      // 重新聚焦输入框
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  };

  const generateResponse = async (userInput: string, userMessage: ChatMessage): Promise<ChatMessage> => {
    try {
      // 如果是商品搜索，先调用商品搜索API
      const lowerInput = userInput.toLowerCase();
      if (lowerInput.includes('商品') || lowerInput.includes('购买') || lowerInput.includes('搜索') || 
          lowerInput.includes('比价') || lowerInput.includes('找') || lowerInput.includes('推荐') ||
          lowerInput.includes('剑') || lowerInput.includes('游戏') || lowerInput.includes('装备') ||
          lowerInput.includes('笔记本') || lowerInput.includes('耳机') || lowerInput.includes('手表')) {
        try {
          const searchResponse = await agentApi.searchProducts(userInput);
          if (!searchResponse) {
            throw new Error('搜索响应为空');
          }
          return {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `我为您找到了 ${searchResponse.products.length} 个相关商品：`,
            timestamp: new Date(),
            metadata: {
              type: 'product',
              searchResults: searchResponse.products,
              comparison: searchResponse.comparison,
            },
          };
        } catch (searchError: any) {
          console.error('商品搜索失败:', searchError);
          // 如果搜索失败，继续使用普通对话API
        }
      }

      // 调用Agent对话API
      const response = await agentApi.chat({ message: userInput });
      if (!response) {
        throw new Error('Agent响应为空');
      }
      
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.response || '我理解您的需求，正在为您处理...',
        timestamp: new Date(),
        metadata: {
          type: response.type,
          data: response.data,
        },
      };

      // 如果响应类型是商品，但还没有搜索结果，尝试搜索
      if (response.type === 'product' && !response.data?.searchResults) {
        try {
          const searchResponse = await agentApi.searchProducts(userInput);
          if (searchResponse) {
            assistantMessage.metadata = {
              ...assistantMessage.metadata,
              searchResults: searchResponse.products,
              comparison: searchResponse.comparison,
            };
          }
        } catch (searchError: any) {
          console.error('商品搜索失败:', searchError);
        }
      }

      // 处理不同类型的响应
      if (response.type === 'product' && assistantMessage.metadata?.searchResults) {
        if (onProductSelect) {
          // 可以触发商品选择回调
        }
      }

      if (response.type === 'code' && onCodeGenerate) {
        onCodeGenerate(userInput);
      }

      return assistantMessage;
    } catch (error: any) {
      console.error('生成响应失败:', error);
      // 返回友好的错误消息，而不是抛出错误
      return {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `抱歉，处理您的请求时出现错误：${error.message || '未知错误'}。\n\n可能的原因：\n1. 网络连接问题\n2. 服务暂时不可用\n3. 需要登录认证\n\n请稍后重试或检查网络连接。`,
        timestamp: new Date(),
      };
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'assistant' && (
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center mr-3 flex-shrink-0">
                <span className="text-white text-xl">🤖</span>
              </div>
            )}

            <div className={`max-w-xs lg:max-w-md ${message.role === 'user' ? 'order-2' : ''}`}>
              {message.role === 'assistant' ? (
                <div className="bg-gray-100 text-gray-900 px-4 py-2 rounded-2xl rounded-tl-none">
                  <div className="whitespace-pre-wrap text-gray-900">{message.content}</div>
                  
                  {/* 商品推荐 */}
                  {message.metadata?.type === 'product' && message.metadata?.searchResults && (
                    <div className="mt-4 space-y-2">
                      {(message.metadata.searchResults as ProductSearchResult[]).slice(0, 5).map((product) => (
                        <div
                          key={product.id}
                          className="bg-white p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50"
                          onClick={() => onProductSelect?.(product.id)}
                        >
                          <div className="font-semibold text-sm">{product.name}</div>
                          <div className="text-blue-600 text-lg font-bold">
                            {product.price} {product.currency}
                          </div>
                          <div className="text-xs text-gray-500">{product.category}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 服务推荐 */}
                  {message.metadata?.type === 'service' && message.metadata?.searchResults && (
                    <div className="mt-4 space-y-2">
                      {(message.metadata.searchResults as ServiceProduct[]).slice(0, 5).map((service) => (
                        <div
                          key={service.id}
                          className="bg-white p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50"
                        >
                          <div className="font-semibold text-sm">{service.name}</div>
                          <div className="text-blue-600 text-lg font-bold">
                            {service.price} {service.currency}
                          </div>
                          <div className="text-xs text-gray-500">{service.type}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 链上资产 */}
                  {message.metadata?.type === 'onchain_asset' && message.metadata?.searchResults && (
                    <div className="mt-4 space-y-2">
                      {(message.metadata.searchResults as OnChainAsset[]).slice(0, 5).map((asset) => (
                        <div
                          key={asset.id}
                          className="bg-white p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50"
                        >
                          <div className="text-xs text-blue-600 mb-1">🔗 {asset.chain.toUpperCase()}</div>
                          <div className="font-semibold text-sm">{asset.name}</div>
                          <div className="text-blue-600 text-lg font-bold">
                            {asset.price} {asset.currency}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 代码生成 */}
                  {message.metadata?.type === 'code' && message.metadata?.data && (
                    <div className="mt-4 bg-gray-800 text-green-400 p-3 rounded-lg font-mono text-xs overflow-x-auto">
                      <pre>{JSON.stringify(message.metadata.data, null, 2)}</pre>
                    </div>
                  )}

                  {/* 订单信息 */}
                  {message.metadata?.type === 'order' && message.metadata?.data && (
                    <div className="mt-4 bg-blue-50 p-3 rounded-lg">
                      <div className="font-semibold text-sm text-blue-900">订单信息</div>
                      <div className="text-xs text-blue-700 mt-1">
                        {JSON.stringify(message.metadata.data, null, 2)}
                      </div>
                    </div>
                  )}

                  {/* 支付链接 */}
                  {message.metadata?.type === 'order' && message.metadata?.data?.payUrl && (
                    <div className="mt-4">
                      <button
                        onClick={() => {
                          if (message.metadata?.data?.payUrl) {
                            window.location.href = message.metadata.data.payUrl;
                          }
                        }}
                        className="w-full bg-green-500 text-white py-2 px-4 rounded-lg font-semibold hover:bg-green-600"
                      >
                        前往支付
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-blue-500 text-white px-4 py-2 rounded-2xl rounded-tr-none">
                  <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
              )}
            </div>

            {message.role === 'user' && (
              <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center ml-3 flex-shrink-0">
                <span className="text-gray-600 text-sm">你</span>
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-900 px-4 py-2 rounded-2xl rounded-tl-none">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 - 确保可以正常输入 */}
      <div className="border-t border-gray-200 p-4 bg-white text-gray-900">
        <div className="flex space-x-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="输入消息..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
            disabled={isLoading}
            autoFocus
            autoComplete="off"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
