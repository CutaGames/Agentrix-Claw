import { useState, useEffect } from 'react';
import { agentApi } from '../../lib/api/agent.api';

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

export function FAQ() {
  const [searchQuery, setSearchQuery] = useState('');
  const [faqItems, setFaqItems] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = [
    { id: 'all', name: '全部' },
    { id: 'registration', name: '注册登录' },
    { id: 'payment', name: '支付相关' },
    { id: 'api', name: 'API接入' },
    { id: 'agent', name: 'Agent使用' },
    { id: 'merchant', name: '商户相关' },
  ];

  const defaultFAQs: FAQItem[] = [
    {
      question: '如何注册账户？',
      answer: '您可以通过点击右上角的"登录"按钮，选择"注册新账户"，填写邮箱和密码完成注册。',
      category: 'registration',
    },
    {
      question: '支持哪些支付方式？',
      answer: 'Agentrix支持多种支付方式：Stripe、钱包支付（MetaMask、WalletConnect）、X402协议、多签支付等。',
      category: 'payment',
    },
    {
      question: '如何接入API？',
      answer: '首先注册并获取API Key，然后安装SDK（npm install @agentrix/sdk），初始化客户端后即可调用API方法。',
      category: 'api',
    },
    {
      question: 'Agent如何获得分润？',
      answer: 'Agent通过推荐商品获得分润，分润率由商户在创建商品时设置。分润会在订单完成后自动计算并记录。',
      category: 'agent',
    },
    {
      question: '商户如何上架商品？',
      answer: '商户登录后，进入商户后台，点击"商品管理"，然后"添加商品"，填写商品信息并设置分润率即可上架。',
      category: 'merchant',
    },
    {
      question: '如何查询订单状态？',
      answer: '您可以在用户后台的"交易记录"页面查看所有订单，或通过Agent对话输入"查询订单"来查看。',
      category: 'payment',
    },
  ];

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setFaqItems(defaultFAQs);
      return;
    }

    setLoading(true);
    try {
      const response = await agentApi.getFaq(searchQuery);
      setFaqItems([
        {
          question: searchQuery,
          answer: response?.answer || '未找到相关答案',
          category: 'search',
        },
      ]);
    } catch (error) {
      console.error('搜索FAQ失败:', error);
      // 使用本地匹配
      const matched = defaultFAQs.filter(
        (item) =>
          item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.answer.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFaqItems(matched.length > 0 ? matched : defaultFAQs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setFaqItems(defaultFAQs);
  }, []);

  const filteredFAQs =
    selectedCategory === 'all'
      ? faqItems
      : faqItems.filter((item) => item.category === selectedCategory);

  return (
    <div className="space-y-4">
      {/* 搜索框 */}
      <div className="flex space-x-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="搜索常见问题..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300"
        >
          {loading ? '搜索中...' : '搜索'}
        </button>
      </div>

      {/* 分类筛选 */}
      <div className="flex space-x-2 overflow-x-auto pb-2">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => setSelectedCategory(category.id)}
            className={`px-4 py-2 rounded-lg whitespace-nowrap ${
              selectedCategory === category.id
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>

      {/* FAQ列表 */}
      <div className="space-y-3">
        {filteredFAQs.map((item, index) => (
          <div
            key={index}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow"
          >
            <h3 className="font-semibold text-gray-900 mb-2 flex items-start">
              <span className="text-blue-500 mr-2">Q:</span>
              {item.question}
            </h3>
            <p className="text-gray-700 ml-6">
              <span className="text-green-500 mr-2">A:</span>
              {item.answer}
            </p>
          </div>
        ))}
      </div>

      {filteredFAQs.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl mb-2">❓</div>
          <div>未找到相关问题</div>
        </div>
      )}
    </div>
  );
}

