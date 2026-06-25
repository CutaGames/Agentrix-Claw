import { useState, useEffect } from 'react';
import { NextPage } from 'next';
import Head from 'next/head';
import { 
  Search, 
  ShoppingCart, 
  CreditCard, 
  Package, 
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

const GPTsTestPage: NextPage = () => {
  const [apiEndpoint, setApiEndpoint] = useState('https://api.agentrix.top/api');
  const [apiKey, setApiKey] = useState('');
  const [searchQuery, setSearchQuery] = useState('耳机');
  const [assetType, setAssetType] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showSchema, setShowSchema] = useState(false);

  // OpenAPI Schema for GPTs
  const openAPISchema = {
    openapi: "3.1.0",
    info: {
      title: "Agentrix Marketplace API",
      version: "2.0.0",
      description: "Agentrix Marketplace API for ChatGPT/GPTs"
    },
    servers: [{ url: apiEndpoint }],
    paths: {
      "/marketplace/search": {
        get: {
          summary: "Search products",
          operationId: "searchProducts",
          parameters: [
            { name: "query", in: "query", required: true, schema: { type: "string" } },
            { name: "assetType", in: "query", schema: { type: "string", enum: ["physical", "service", "nft", "ft", "game_asset", "rwa"] } },
            { name: "limit", in: "query", schema: { type: "integer", default: 10 } }
          ]
        }
      },
      "/marketplace/products/{id}": {
        get: {
          summary: "Get product details",
          operationId: "getProduct",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }]
        }
      },
      "/marketplace/orders": {
        post: {
          summary: "Create order",
          operationId: "createOrder",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["productId"],
                  properties: {
                    productId: { type: "string" },
                    quantity: { type: "integer" },
                    walletAddress: { type: "string" }
                  }
                }
              }
            }
          }
        }
      },
      "/marketplace/payments": {
        post: {
          summary: "Initiate payment",
          operationId: "initiatePayment",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["orderId"],
                  properties: {
                    orderId: { type: "string" },
                    method: { type: "string" }
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  const assetTypes = [
    { value: '', label: '全部类型' },
    { value: 'physical', label: '📦 实物商品' },
    { value: 'service', label: '🔧 服务' },
    { value: 'nft', label: '🎨 NFT' },
    { value: 'ft', label: '💰 代币' },
    { value: 'game_asset', label: '🎮 游戏资产' },
    { value: 'rwa', label: '🏠 真实资产' },
  ];

  const handleSearch = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ query: searchQuery });
      if (assetType) params.append('assetType', assetType);
      params.append('limit', '10');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['X-API-Key'] = apiKey;
      }

      const response = await fetch(`${apiEndpoint}/marketplace/search?${params}`, { headers });
      const data = await response.json();
      
      if (data.success) {
        setSearchResults(data);
      } else {
        setError(data.message || '搜索失败');
      }
    } catch (err: any) {
      setError(err.message || '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const handleGetProduct = async (productId: string) => {
    setLoading(true);
    setError('');
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['X-API-Key'] = apiKey;
      }

      const response = await fetch(`${apiEndpoint}/marketplace/products/${productId}`, { headers });
      const data = await response.json();
      
      if (data.success) {
        setSelectedProduct(data.data);
      } else {
        setError(data.message || '获取商品详情失败');
      }
    } catch (err: any) {
      setError(err.message || '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const copySchema = () => {
    navigator.clipboard.writeText(JSON.stringify(openAPISchema, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getAssetTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      physical: '📦',
      service: '🔧',
      nft: '🎨',
      ft: '💰',
      game_asset: '🎮',
      rwa: '🏠',
    };
    return icons[type] || '📦';
  };

  return (
    <>
      <Head>
        <title>ChatGPT GPTs API 测试 - Agentrix</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Sparkles className="w-8 h-8 text-purple-400" />
              <h1 className="text-3xl font-bold text-white">ChatGPT GPTs API 测试</h1>
            </div>
            <p className="text-gray-400">
              测试 Agentrix Marketplace API，为 ChatGPT Custom GPTs 提供商品搜索和购买能力
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左侧：API 测试 */}
            <div className="space-y-6">
              {/* API 配置 */}
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  API 配置
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">API Endpoint</label>
                    <input
                      type="text"
                      value={apiEndpoint}
                      onChange={(e) => setApiEndpoint(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">API Key (可选)</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="用于创建订单和支付"
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* 搜索测试 */}
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  商品搜索
                </h2>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索关键词"
                      className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white"
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <select
                      value={assetType}
                      onChange={(e) => setAssetType(e.target.value)}
                      className="bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white"
                    >
                      {assetTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={loading}
                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                  >
                    {loading ? '搜索中...' : '搜索商品'}
                  </button>
                </div>

                {error && (
                  <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
                    {error}
                  </div>
                )}

                {/* 搜索结果 */}
                {searchResults?.data?.items && (
                  <div className="mt-4 space-y-3">
                    <div className="text-sm text-gray-400">
                      找到 {searchResults.data.total} 个商品
                    </div>
                    {searchResults.data.items.map((product: any) => (
                      <div
                        key={product.id}
                        onClick={() => handleGetProduct(product.id)}
                        className="bg-slate-900 rounded-lg p-4 cursor-pointer hover:bg-slate-800 transition-colors border border-slate-700"
                      >
                        <div className="flex items-start gap-3">
                          <div className="text-2xl">
                            {getAssetTypeIcon(product.productType)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-white truncate">{product.title}</h3>
                            <p className="text-sm text-gray-400 truncate">{product.description}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-green-400 font-semibold">{product.priceDisplay}</span>
                              <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-gray-300">
                                {product.productType}
                              </span>
                              {product.blockchainBadge && (
                                <span className="text-xs bg-purple-500/30 px-2 py-0.5 rounded text-purple-300">
                                  {product.blockchainBadge}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 右侧：商品详情 & Schema */}
            <div className="space-y-6">
              {/* 商品详情 */}
              {selectedProduct && (
                <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                  <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    商品详情
                  </h2>
                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="text-4xl">
                        {getAssetTypeIcon(selectedProduct.productType)}
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-white">{selectedProduct.title}</h3>
                        <p className="text-gray-400">{selectedProduct.description}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-slate-900 rounded-lg p-3">
                        <div className="text-gray-500">价格</div>
                        <div className="text-green-400 font-semibold text-lg">{selectedProduct.priceDisplay}</div>
                      </div>
                      <div className="bg-slate-900 rounded-lg p-3">
                        <div className="text-gray-500">类型</div>
                        <div className="text-white">{selectedProduct.productType}</div>
                      </div>
                      <div className="bg-slate-900 rounded-lg p-3">
                        <div className="text-gray-500">库存</div>
                        <div className={selectedProduct.inStock ? 'text-green-400' : 'text-red-400'}>
                          {selectedProduct.inStock ? `有货 (${selectedProduct.stock})` : '缺货'}
                        </div>
                      </div>
                      <div className="bg-slate-900 rounded-lg p-3">
                        <div className="text-gray-500">ID</div>
                        <div className="text-white text-xs truncate">{selectedProduct.id}</div>
                      </div>
                    </div>

                    {/* NFT 信息 */}
                    {selectedProduct.nftInfo && (
                      <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                        <div className="text-purple-300 font-medium mb-2">🎨 NFT 信息</div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-gray-500">链：</span>
                            <span className="text-white">{selectedProduct.nftInfo.chainName}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">标准：</span>
                            <span className="text-white">{selectedProduct.nftInfo.standard}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Token ID：</span>
                            <span className="text-white">{selectedProduct.nftInfo.tokenId}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">稀有度：</span>
                            <span className="text-white">{selectedProduct.nftInfo.rarity}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Token 信息 */}
                    {selectedProduct.tokenInfo && (
                      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                        <div className="text-yellow-300 font-medium mb-2">💰 代币信息</div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-gray-500">符号：</span>
                            <span className="text-white">{selectedProduct.tokenInfo.symbol}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">数量：</span>
                            <span className="text-white">{selectedProduct.tokenInfo.amount}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">链：</span>
                            <span className="text-white">{selectedProduct.tokenInfo.chainName}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 游戏资产信息 */}
                    {selectedProduct.gameInfo && (
                      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                        <div className="text-green-300 font-medium mb-2">🎮 游戏资产信息</div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-gray-500">游戏：</span>
                            <span className="text-white">{selectedProduct.gameInfo.gameName}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">类型：</span>
                            <span className="text-white">{selectedProduct.gameInfo.itemType}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">稀有度：</span>
                            <span className="text-white uppercase">{selectedProduct.gameInfo.rarity}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* OpenAPI Schema */}
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <div 
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setShowSchema(!showSchema)}
                >
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    GPTs OpenAPI Schema
                  </h2>
                  {showSchema ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                </div>
                
                {showSchema && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-400">复制此 Schema 到 ChatGPT Actions</span>
                      <button
                        onClick={copySchema}
                        className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300"
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copied ? '已复制' : '复制'}
                      </button>
                    </div>
                    <pre className="bg-slate-900 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto max-h-96">
                      {JSON.stringify(openAPISchema, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* 快速链接 */}
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <h2 className="text-lg font-semibold text-white mb-4">📚 相关链接</h2>
                <div className="space-y-2">
                  <a
                    href="https://chat.openai.com/gpts/editor"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-purple-400 hover:text-purple-300"
                  >
                    <ExternalLink className="w-4 h-4" />
                    创建 Custom GPT
                  </a>
                  <a
                    href="/api/openai/schema"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-purple-400 hover:text-purple-300"
                  >
                    <ExternalLink className="w-4 h-4" />
                    完整 OpenAPI Schema
                  </a>
                  <a
                    href="/docs/ChatGPT-GPTs配置指南"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-purple-400 hover:text-purple-300"
                  >
                    <ExternalLink className="w-4 h-4" />
                    配置指南
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default GPTsTestPage;
