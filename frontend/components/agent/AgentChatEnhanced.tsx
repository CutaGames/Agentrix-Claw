import { useState, useRef, useEffect } from 'react';
import { useUser } from '../../contexts/UserContext';
import { usePayment } from '../../contexts/PaymentContext';
import { agentApi, ProductSearchResult } from '../../lib/api/agent.api';
import { tokenApi, TokenLaunchRequest } from '../../lib/api/token.api';
import { nftApi, NFTCollectionRequest, NFTMintRequest } from '../../lib/api/nft.api';
import { StructuredMessageCard } from './StructuredMessageCard';
import { AgentWorkflowHistory } from './AgentWorkflowHistory';
import { FileUpload } from './FileUpload';
import { TokenLaunchGuide } from './TokenLaunchGuide';
import { NFTLaunchGuide } from './NFTLaunchGuide';
import { ProductInfo } from '../../lib/api/product.api';

export interface EnhancedChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  structuredData?: {
    type: 'product' | 'product_search' | 'price_comparison' | 'order' | 'payment' | 'code' | 'comparison' | 'recommendation' | 'token' | 'nft' | 'presale';
    data: any;
  };
  workflow?: Array<{
    id: string;
    type: 'intent' | 'action' | 'decision' | 'api_call' | 'result';
    title: string;
    description: string;
    timestamp: Date;
    data?: any;
  }>;
}

interface AgentChatEnhancedProps {
  onProductSelect?: (productId: string) => void;
  onOrderQuery?: (orderId: string) => void;
  onCodeGenerate?: (prompt: string) => void;
  onAction?: (action: string, data?: any) => void;
}

/**
 * Agentrix Agent V3.0 增强版聊天组件
 * 支持结构化消息、工作流记录、自动比价、自动推荐等
 */
export function AgentChatEnhanced({
  onProductSelect,
  onOrderQuery,
  onCodeGenerate,
  onAction,
}: AgentChatEnhancedProps) {
  const { user } = useUser();
  const { startPayment } = usePayment();
  const [messages, setMessages] = useState<EnhancedChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: `## 👋 欢迎使用 **Agentrix Agent**

您的 **AI 商业智能体**，可自动执行从搜索、比价、下单到支付的一体化操作。

### 我可以帮助你：

#### 🔍 搜索 & 推荐
* 商品、服务、链上资产
* 自动比价 / 评价分析

#### 🛍️ 交易执行
* 自动创建订单
* 智能支付方式选择（卡、法币、USDT、链上钱包）
* 自动路由最优成本
* 支持法币 ⇄ 数字资产混合支付

#### 📦 订单 & 履约
* 查询物流状态
* 数字资产自动接收
* 售后与退款

#### 🧪 开发辅助
* 自动生成 API / SDK 调用代码
* 沙箱环境可直接调试
* 帮商户生成支付链接 / SKU

👀 你现在可以直接告诉我你想做什么，例如：

* "帮我找一款1000元以内的电纸书并下单"
* "生成一个支付 USDT 的 API demo"
* "创建一个商品 SKU 给我放在店里卖"`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTokenGuide, setShowTokenGuide] = useState(false);
  const [showNFTGuide, setShowNFTGuide] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: EnhancedChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);

    try {
      const response = await generateEnhancedResponse(currentInput, userMessage);
      setMessages((prev) => [...prev, response]);
    } catch (error) {
      console.error('获取响应失败:', error);
      const errorMessage: EnhancedChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '抱歉，处理您的请求时出现错误。请稍后重试。',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const generateEnhancedResponse = async (
    userInput: string,
    userMessage: EnhancedChatMessage,
  ): Promise<EnhancedChatMessage> => {
    const workflow: EnhancedChatMessage['workflow'] = [];
    const startTime = new Date();

    // 1. 意图识别
    workflow.push({
      id: '1',
      type: 'intent',
      title: '意图识别',
      description: `分析用户输入: "${userInput}"`,
      timestamp: new Date(),
    });

    try {
      const response = await agentApi.chat({ message: userInput });
      if (!response) {
        throw new Error('Agent响应为空');
      }

      // 2. 执行动作
      workflow.push({
        id: '2',
        type: 'action',
        title: '执行动作',
        description: `类型: ${response.type}, 动作: ${response.data?.action || 'N/A'}`,
        timestamp: new Date(),
      });

      let structuredData: EnhancedChatMessage['structuredData'] = undefined;
      let content = response.response || '';

      // 处理商品搜索和比价
      // 检查是否是商品搜索响应（支持多种响应类型）
      // 后端可能返回 type: 'product_search' 或 type: 'product' 且 data.action === 'search'
      if (response.type === 'product_search' || (response.type === 'product' && (response.data?.action === 'search' || response.data?.products))) {
        // 如果响应中已经包含商品数据，直接使用
        if (response.data?.products && response.data.products.length > 0) {
          structuredData = {
            type: 'product_search',
            data: {
              products: response.data.products,
              query: response.data.query || userInput,
              total: response.data.total || response.data.products.length,
            },
          };
        } else {
          // 否则调用搜索API
          try {
            const searchResponse = await agentApi.searchProducts(userInput);
            if (!searchResponse) {
              throw new Error('搜索响应为空');
            }
            const products = searchResponse.products as ProductSearchResult[];

            if (products && products.length > 0) {
              structuredData = {
                type: 'product_search',
                data: {
                  products: products,
                  query: userInput,
                  total: products.length,
                },
              };
            }
          } catch (error) {
            console.error('商品搜索失败:', error);
          }
        }
      }

      // 处理订单查询
      if (response.type === 'order') {
        structuredData = {
          type: 'order',
          data: {
            orderId: response.data?.orderId,
            step: response.data?.step || 1,
          },
        };
      }

      // 处理代码生成
      if (response.type === 'code') {
        structuredData = {
          type: 'code',
          data: {
            code: response.data?.code || '',
            language: response.data?.language || 'TypeScript',
            framework: response.data?.framework,
          },
        };
      }

      // 处理代币发行意图
      const lowerInput = userInput.toLowerCase();
      if (lowerInput.includes('发行代币') || lowerInput.includes('发币') || lowerInput.includes('token launch') || 
          lowerInput.includes('create token') || lowerInput.includes('launch token')) {
        workflow.push({
          id: 'token-intent',
          type: 'intent',
          title: '识别代币发行意图',
          description: '用户想要发行代币',
          timestamp: new Date(),
        });
        
        structuredData = {
          type: 'token',
          data: {
            intent: 'launch',
            step: 1,
            guide: true,
            showGuide: true, // 标记显示引导组件
          },
        };
        
        content = `好的，我来帮您发行代币。我已经为您准备好了代币发行向导，请按照步骤填写信息。`;
      }

      // 处理 NFT 发行意图
      if (lowerInput.includes('发行nft') || lowerInput.includes('发nft') || lowerInput.includes('create nft') || 
          lowerInput.includes('mint nft') || lowerInput.includes('创建nft') || lowerInput.includes('铸造nft')) {
        workflow.push({
          id: 'nft-intent',
          type: 'intent',
          title: '识别 NFT 发行意图',
          description: '用户想要发行 NFT',
          timestamp: new Date(),
        });
        
        structuredData = {
          type: 'nft',
          data: {
            intent: 'create',
            step: 1,
            guide: true,
            showGuide: true, // 标记显示引导组件
          },
        };
        
        content = `好的，我来帮您发行 NFT。我已经为您准备好了 NFT 发行向导，请按照步骤填写信息。`;
      }

      // 3. 决策记录
      if (structuredData) {
        workflow.push({
          id: '3',
          type: 'decision',
          title: '生成结构化响应',
          description: `类型: ${structuredData.type}`,
          timestamp: new Date(),
        });
      }

      // 4. API调用记录
      workflow.push({
        id: '4',
        type: 'api_call',
        title: 'API调用完成',
        description: `调用: agentApi.chat, 耗时: ${Date.now() - startTime.getTime()}ms`,
        timestamp: new Date(),
      });

      // 5. 结果
      workflow.push({
        id: '5',
        type: 'result',
        title: '响应生成完成',
        description: '已生成用户响应',
        timestamp: new Date(),
      });

      return {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content,
        timestamp: new Date(),
        structuredData,
        workflow,
      };
    } catch (error) {
      console.error('生成响应失败:', error);
      throw error;
    }
  };

  const handleAction = (action: string, data?: any) => {
    switch (action) {
      case 'add_to_cart':
        onProductSelect?.(data.id);
        break;
      case 'buy_now':
        if (data) {
          startPayment({
            id: `payment_${Date.now()}`,
            amount: data.price.toString(),
            currency: data.currency,
            description: data.name,
            merchant: data.merchantId,
            metadata: {
              productId: data.id,
              orderType: data.category === 'nft' ? 'nft' : 'product',
            },
            createdAt: new Date().toISOString(),
          });
        }
        break;
      case 'view_order':
        onOrderQuery?.(data.orderId);
        break;
      case 'code_copied':
        // 显示复制成功提示
        break;
      default:
        onAction?.(action, data);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'assistant' && (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mr-3 flex-shrink-0">
                <span className="text-white text-xl">🤖</span>
              </div>
            )}

            <div className={`max-w-2xl ${message.role === 'user' ? 'order-2' : ''}`}>
              {message.role === 'assistant' ? (
                <div className="bg-gray-50 text-gray-900 px-4 py-3 rounded-2xl rounded-tl-none border border-gray-200">
                  <div className="whitespace-pre-wrap text-gray-900 prose prose-sm max-w-none">
                    {message.content.split('\n').map((line, i) => {
                      if (line.startsWith('## ')) {
                        return <h2 key={i} className="text-lg font-bold mt-4 mb-2">{line.replace('## ', '')}</h2>;
                      }
                      if (line.startsWith('### ')) {
                        return <h3 key={i} className="text-base font-semibold mt-3 mb-1">{line.replace('### ', '')}</h3>;
                      }
                      if (line.startsWith('* ')) {
                        return <li key={i} className="ml-4 list-disc">{line.replace('* ', '')}</li>;
                      }
                      return <p key={i} className="mb-1">{line || '\u00A0'}</p>;
                    })}
                  </div>

                  {/* 结构化消息卡片 */}
                  {message.structuredData && !message.structuredData.data?.showGuide && (
                    <StructuredMessageCard
                      type={message.structuredData.type}
                      data={message.structuredData.data}
                      onAction={handleAction}
                    />
                  )}

                  {/* 代币发行引导 */}
                  {message.structuredData?.type === 'token' && message.structuredData.data?.showGuide && (
                    <TokenLaunchGuide
                      onComplete={async (data) => {
                        try {
                          const response = await tokenApi.launch(data);
                          const successMessage: EnhancedChatMessage = {
                            id: (Date.now() + 1).toString(),
                            role: 'assistant',
                            content: `✅ 代币发行请求已提交！

**代币信息：**
- 名称: ${data.name}
- 符号: ${data.symbol}
- 总供应量: ${data.totalSupply}
- 区块链: ${data.chain}

**状态：** ${response.status === 'deploying' ? '部署中' : '已部署'}

${response.contractAddress ? `**合约地址：** ${response.contractAddress}` : ''}
${response.transactionHash ? `**交易哈希：** ${response.transactionHash}` : ''}

代币正在部署中，请稍候...`,
                            timestamp: new Date(),
                            structuredData: {
                              type: 'token',
                              data: {
                                ...response,
                                name: data.name,
                                symbol: data.symbol,
                                totalSupply: data.totalSupply,
                                chain: data.chain,
                                status: response.status,
                              },
                            },
                          };
                          setMessages((prev) => [...prev, successMessage]);
                          setShowTokenGuide(false);
                        } catch (error: any) {
                          const errorMessage: EnhancedChatMessage = {
                            id: (Date.now() + 1).toString(),
                            role: 'assistant',
                            content: `❌ 代币发行失败：${error.message || '未知错误'}`,
                            timestamp: new Date(),
                          };
                          setMessages((prev) => [...prev, errorMessage]);
                        }
                      }}
                      onCancel={() => {
                        setShowTokenGuide(false);
                        const cancelMessage: EnhancedChatMessage = {
                          id: (Date.now() + 1).toString(),
                          role: 'assistant',
                          content: '已取消代币发行。如需帮助，请随时告诉我。',
                          timestamp: new Date(),
                        };
                        setMessages((prev) => [...prev, cancelMessage]);
                      }}
                    />
                  )}

                  {/* NFT 发行引导 */}
                  {message.structuredData?.type === 'nft' && message.structuredData.data?.showGuide && (
                    <NFTLaunchGuide
                      onComplete={async (collectionData, mintData) => {
                        try {
                          // 先创建集合
                          const collectionResponse = await nftApi.createCollection(collectionData);
                          
                          // 如果有 mint 数据，进行批量 mint
                          let mintResponse = null;
                          if (mintData && collectionResponse.collectionId) {
                            mintResponse = await nftApi.mint(collectionResponse.collectionId, mintData);
                          }

                          const successMessage: EnhancedChatMessage = {
                            id: (Date.now() + 1).toString(),
                            role: 'assistant',
                            content: `✅ NFT 集合创建成功！

**集合信息：**
- 名称: ${collectionData.name}
- 区块链: ${collectionData.chain}
- 标准: ${collectionData.standard}
- 版税: ${(collectionData.royalty || 0) * 100}%

**状态：** ${collectionResponse.status === 'deploying' ? '部署中' : '已部署'}

${collectionResponse.contractAddress ? `**合约地址：** ${collectionResponse.contractAddress}` : ''}
${collectionResponse.transactionHash ? `**交易哈希：** ${collectionResponse.transactionHash}` : ''}

${mintResponse ? `\n**Mint 结果：**\n- 成功: ${mintResponse.minted}\n- 失败: ${mintResponse.failed}` : ''}

NFT 集合正在部署中，请稍候...`,
                            timestamp: new Date(),
                            structuredData: {
                              type: 'nft',
                              data: {
                                ...collectionResponse,
                                name: collectionData.name,
                                chain: collectionData.chain,
                                standard: collectionData.standard,
                                status: collectionResponse.status,
                              },
                            },
                          };
                          setMessages((prev) => [...prev, successMessage]);
                          setShowNFTGuide(false);
                        } catch (error: any) {
                          const errorMessage: EnhancedChatMessage = {
                            id: (Date.now() + 1).toString(),
                            role: 'assistant',
                            content: `❌ NFT 发行失败：${error.message || '未知错误'}`,
                            timestamp: new Date(),
                          };
                          setMessages((prev) => [...prev, errorMessage]);
                        }
                      }}
                      onCancel={() => {
                        setShowNFTGuide(false);
                        const cancelMessage: EnhancedChatMessage = {
                          id: (Date.now() + 1).toString(),
                          role: 'assistant',
                          content: '已取消 NFT 发行。如需帮助，请随时告诉我。',
                          timestamp: new Date(),
                        };
                        setMessages((prev) => [...prev, cancelMessage]);
                      }}
                    />
                  )}

                  {/* 工作流历史 */}
                  {message.workflow && message.workflow.length > 0 && (
                    <AgentWorkflowHistory workflow={message.workflow} />
                  )}
                </div>
              ) : (
                <div className="bg-blue-600 text-white px-4 py-3 rounded-2xl rounded-tr-none">
                  {message.content}
                </div>
              )}
            </div>

            {message.role === 'user' && (
              <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center ml-3 flex-shrink-0">
                <span className="text-gray-600 text-xl">👤</span>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mr-3">
              <span className="text-white text-xl">🤖</span>
            </div>
            <div className="bg-gray-50 px-4 py-3 rounded-2xl rounded-tl-none border border-gray-200">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="border-t border-gray-200 p-4 bg-white">
        <div className="flex space-x-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="告诉我你想做什么..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            发送
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => {
              const example = '帮我找一款1000元以内的电纸书并下单'
              setInput(example)
              // 自动发送示例消息
              setTimeout(() => {
                const userMessage: EnhancedChatMessage = {
                  id: Date.now().toString(),
                  role: 'user',
                  content: example,
                  timestamp: new Date(),
                }
                setMessages((prev) => [...prev, userMessage])
                setIsLoading(true)
                generateEnhancedResponse(example, userMessage)
                  .then((response) => {
                    setMessages((prev) => [...prev, response])
                  })
                  .catch((error) => {
                    console.error('获取响应失败:', error)
                    const errorMessage: EnhancedChatMessage = {
                      id: (Date.now() + 1).toString(),
                      role: 'assistant',
                      content: '抱歉，处理您的请求时出现错误。请稍后重试。',
                      timestamp: new Date(),
                    }
                    setMessages((prev) => [...prev, errorMessage])
                  })
                  .finally(() => {
                    setIsLoading(false)
                    setInput('')
                  })
              }, 100)
            }}
            className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
          >
            💡 示例1
          </button>
          <button
            onClick={() => {
              const example = '生成一个支付 USDT 的 API demo'
              setInput(example)
              setTimeout(() => {
                const userMessage: EnhancedChatMessage = {
                  id: Date.now().toString(),
                  role: 'user',
                  content: example,
                  timestamp: new Date(),
                }
                setMessages((prev) => [...prev, userMessage])
                setIsLoading(true)
                generateEnhancedResponse(example, userMessage)
                  .then((response) => {
                    setMessages((prev) => [...prev, response])
                  })
                  .catch((error) => {
                    console.error('获取响应失败:', error)
                    const errorMessage: EnhancedChatMessage = {
                      id: (Date.now() + 1).toString(),
                      role: 'assistant',
                      content: '抱歉，处理您的请求时出现错误。请稍后重试。',
                      timestamp: new Date(),
                    }
                    setMessages((prev) => [...prev, errorMessage])
                  })
                  .finally(() => {
                    setIsLoading(false)
                    setInput('')
                  })
              }, 100)
            }}
            className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
          >
            💡 示例2
          </button>
          <button
            onClick={() => {
              const example = '创建一个商品 SKU 给我放在店里卖'
              setInput(example)
              setTimeout(() => {
                const userMessage: EnhancedChatMessage = {
                  id: Date.now().toString(),
                  role: 'user',
                  content: example,
                  timestamp: new Date(),
                }
                setMessages((prev) => [...prev, userMessage])
                setIsLoading(true)
                generateEnhancedResponse(example, userMessage)
                  .then((response) => {
                    setMessages((prev) => [...prev, response])
                  })
                  .catch((error) => {
                    console.error('获取响应失败:', error)
                    const errorMessage: EnhancedChatMessage = {
                      id: (Date.now() + 1).toString(),
                      role: 'assistant',
                      content: '抱歉，处理您的请求时出现错误。请稍后重试。',
                      timestamp: new Date(),
                    }
                    setMessages((prev) => [...prev, errorMessage])
                  })
                  .finally(() => {
                    setIsLoading(false)
                    setInput('')
                  })
              }, 100)
            }}
            className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
          >
            💡 示例3
          </button>
        </div>
      </div>
    </div>
  );
}

