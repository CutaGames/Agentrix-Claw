import Head from 'next/head';
import { useState } from 'react';
import { Navigation } from '../components/ui/Navigation';
import { Footer } from '../components/layout/Footer';
import { useLocalization } from '../contexts/LocalizationContext';
import { useRouter } from 'next/router';
import Link from 'next/link';

interface TestCase {
  id: string;
  title: string;
  description: string;
  url: string;
  category: 'builder' | 'plugin' | 'deployment' | 'rule';
  status?: 'pending' | 'testing' | 'passed' | 'failed';
}

export default function AgentBuilderTestPage() {
  const { t } = useLocalization();
  const router = useRouter();
  const [testResults, setTestResults] = useState<Record<string, 'pending' | 'testing' | 'passed' | 'failed'>>({});

  const testCases: TestCase[] = [
    // Agent Builder 基础功能
    {
      id: 'tc-001',
      title: t({ zh: '模板库浏览和选择', en: 'Template Library Browse & Select' }),
      description: t({
        zh: '测试模板库的浏览、搜索、分类筛选和模板选择功能',
        en: 'Test template library browsing, search, category filtering and template selection',
      }),
      url: '/agent-builder',
      category: 'builder',
    },
    {
      id: 'tc-002',
      title: t({ zh: '表单式能力装配', en: 'Form-based Capability Assembly' }),
      description: t({
        zh: '测试表单模式下的能力装配功能（Core/Advanced/Custom）',
        en: 'Test capability assembly in form mode (Core/Advanced/Custom)',
      }),
      url: '/agent-builder',
      category: 'builder',
    },
    {
      id: 'tc-003',
      title: t({ zh: '高级工作流编辑器', en: 'Advanced Workflow Editor' }),
      description: t({
        zh: '测试高级模式下的工作流编辑器、验证、预览和导入功能',
        en: 'Test workflow editor, validation, preview and import in advanced mode',
      }),
      url: '/agent-builder',
      category: 'builder',
    },
    {
      id: 'tc-004',
      title: t({ zh: '规则模板系统', en: 'Rule Template System' }),
      description: t({
        zh: '测试规则模板浏览、自然语言规则创建、规则验证和测试',
        en: 'Test rule template browsing, natural language rule creation, validation and testing',
      }),
      url: '/agent-builder',
      category: 'rule',
    },
    {
      id: 'tc-005',
      title: t({ zh: 'SaaS 托管部署', en: 'SaaS Hosted Deployment' }),
      description: t({
        zh: '测试 Agent 的 SaaS 托管部署功能',
        en: 'Test SaaS hosted deployment for Agents',
      }),
      url: '/agent-builder',
      category: 'deployment',
    },
    {
      id: 'tc-006',
      title: t({ zh: 'Docker 导出', en: 'Docker Export' }),
      description: t({
        zh: '测试 Docker 导出包的生成和下载',
        en: 'Test Docker export package generation and download',
      }),
      url: '/agent-builder',
      category: 'deployment',
    },
    // 插件市场功能
    {
      id: 'tc-007',
      title: t({ zh: '插件市场浏览', en: 'Plugin Marketplace Browse' }),
      description: t({
        zh: '测试插件市场的浏览、搜索、筛选和排序功能',
        en: 'Test plugin marketplace browsing, search, filtering and sorting',
      }),
      url: '/plugins',
      category: 'plugin',
    },
    {
      id: 'tc-008',
      title: t({ zh: '免费插件安装', en: 'Free Plugin Installation' }),
      description: t({
        zh: '测试免费插件的安装和卸载功能',
        en: 'Test free plugin installation and uninstallation',
      }),
      url: '/plugins',
      category: 'plugin',
    },
    {
      id: 'tc-009',
      title: t({ zh: '付费插件购买', en: 'Paid Plugin Purchase' }),
      description: t({
        zh: '测试付费插件的购买和安装流程',
        en: 'Test paid plugin purchase and installation flow',
      }),
      url: '/plugins',
      category: 'plugin',
    },
    {
      id: 'tc-010',
      title: t({ zh: '插件版本管理', en: 'Plugin Version Management' }),
      description: t({
        zh: '测试插件的版本更新功能',
        en: 'Test plugin version update functionality',
      }),
      url: '/plugins',
      category: 'plugin',
    },
    {
      id: 'tc-011',
      title: t({ zh: '插件依赖管理', en: 'Plugin Dependency Management' }),
      description: t({
        zh: '测试插件的依赖检查和安装',
        en: 'Test plugin dependency checking and installation',
      }),
      url: '/plugins',
      category: 'plugin',
    },
    // 模板市场功能
    {
      id: 'tc-012',
      title: t({ zh: '模板评分和评论', en: 'Template Rating & Reviews' }),
      description: t({
        zh: '测试模板的评分、评论创建、更新和删除',
        en: 'Test template rating, review creation, update and deletion',
      }),
      url: '/agent-builder',
      category: 'builder',
    },
    {
      id: 'tc-013',
      title: t({ zh: '模板付费订阅', en: 'Template Paid Subscription' }),
      description: t({
        zh: '测试付费模板的订阅购买和使用',
        en: 'Test paid template subscription purchase and usage',
      }),
      url: '/agent-builder',
      category: 'builder',
    },
    // 集成测试
    {
      id: 'tc-014',
      title: t({ zh: '完整 Agent 生成流程', en: 'Complete Agent Generation Flow' }),
      description: t({
        zh: '测试从模板选择到部署的完整流程',
        en: 'Test complete flow from template selection to deployment',
      }),
      url: '/agent-builder',
      category: 'builder',
    },
    {
      id: 'tc-015',
      title: t({ zh: '插件增强 Agent 功能', en: 'Plugin Enhanced Agent Features' }),
      description: t({
        zh: '测试插件安装后对 Agent 功能的增强',
        en: 'Test plugin enhancement of Agent features after installation',
      }),
      url: '/plugins',
      category: 'plugin',
    },
  ];

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'builder':
        return 'bg-blue-100 text-blue-800';
      case 'plugin':
        return 'bg-purple-100 text-purple-800';
      case 'deployment':
        return 'bg-green-100 text-green-800';
      case 'rule':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'passed':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'testing':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const handleTest = (testCase: TestCase) => {
    setTestResults((prev) => ({ ...prev, [testCase.id]: 'testing' }));
    router.push(testCase.url);
  };

  const groupedTests = testCases.reduce((acc, test) => {
    if (!acc[test.category]) {
      acc[test.category] = [];
    }
    acc[test.category].push(test);
    return acc;
  }, {} as Record<string, TestCase[]>);

  return (
    <>
      <Head>
        <title>{t({ zh: 'Agent Builder 测试中心', en: 'Agent Builder Test Center' })}</title>
      </Head>
      <Navigation />
      <main className="bg-gradient-to-b from-gray-50 to-white min-h-screen">
        <section className="container mx-auto px-6 py-12 lg:py-16">
          {/* 页面头部 */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              {t({ zh: 'Agent Builder 测试中心', en: 'Agent Builder Test Center' })}
            </h1>
            <p className="text-lg text-gray-600 mb-6">
              {t({
                zh: '这里是所有 Agent Builder 和插件市场功能的测试入口。点击测试用例可直接跳转到对应功能页面进行测试。',
                en: 'This is the test entry point for all Agent Builder and plugin marketplace features. Click test cases to jump directly to corresponding feature pages for testing.',
              })}
            </p>
          </div>

          {/* 快速入口 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Link
              href="/agent-builder"
              className="p-6 bg-white rounded-xl border-2 border-blue-200 hover:border-blue-400 transition-colors"
            >
              <div className="text-3xl mb-2">🧩</div>
              <div className="font-semibold text-gray-900 mb-1">
                {t({ zh: 'Agent Builder', en: 'Agent Builder' })}
              </div>
              <div className="text-sm text-gray-600">
                {t({ zh: '创建和配置 Agent', en: 'Create and configure Agents' })}
              </div>
            </Link>
            <Link
              href="/plugins"
              className="p-6 bg-white rounded-xl border-2 border-purple-200 hover:border-purple-400 transition-colors"
            >
              <div className="text-3xl mb-2">🔌</div>
              <div className="font-semibold text-gray-900 mb-1">
                {t({ zh: '插件市场', en: 'Plugin Marketplace' })}
              </div>
              <div className="text-sm text-gray-600">
                {t({ zh: '浏览和安装插件', en: 'Browse and install plugins' })}
              </div>
            </Link>
            <Link
              href="/agent-enhanced"
              className="p-6 bg-white rounded-xl border-2 border-green-200 hover:border-green-400 transition-colors"
            >
              <div className="text-3xl mb-2">🤖</div>
              <div className="font-semibold text-gray-900 mb-1">
                {t({ zh: 'Agent 工作台', en: 'Agent Workspace' })}
              </div>
              <div className="text-sm text-gray-600">
                {t({ zh: '使用 Agent 功能', en: 'Use Agent features' })}
              </div>
            </Link>
            <Link
              href="/agent-standalone/[agentId]"
              className="p-6 bg-white rounded-xl border-2 border-orange-200 hover:border-orange-400 transition-colors"
            >
              <div className="text-3xl mb-2">🌐</div>
              <div className="font-semibold text-gray-900 mb-1">
                {t({ zh: '独立 Agent', en: 'Standalone Agent' })}
              </div>
              <div className="text-sm text-gray-600">
                {t({ zh: '查看独立运行界面', en: 'View standalone interface' })}
              </div>
            </Link>
          </div>

          {/* 测试用例列表 */}
          <div className="space-y-8">
            {Object.entries(groupedTests).map(([category, tests]) => (
              <div key={category} className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  {category === 'builder'
                    ? t({ zh: 'Agent Builder 功能测试', en: 'Agent Builder Tests' })
                    : category === 'plugin'
                    ? t({ zh: '插件市场功能测试', en: 'Plugin Marketplace Tests' })
                    : category === 'deployment'
                    ? t({ zh: '部署功能测试', en: 'Deployment Tests' })
                    : t({ zh: '规则系统测试', en: 'Rule System Tests' })}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tests.map((testCase) => {
                    const status = testResults[testCase.id] || testCase.status || 'pending';
                    return (
                      <div
                        key={testCase.id}
                        className={`p-4 rounded-lg border-2 ${getStatusColor(status)} transition-all hover:shadow-md`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded ${getCategoryColor(testCase.category)}">
                                {testCase.id.toUpperCase()}
                              </span>
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded ${getCategoryColor(testCase.category)}`}
                              >
                                {testCase.category}
                              </span>
                            </div>
                            <h3 className="font-semibold text-gray-900 mb-1">{testCase.title}</h3>
                            <p className="text-sm text-gray-600 mb-3">{testCase.description}</p>
                          </div>
                          <div
                            className={`text-xs font-semibold px-2 py-1 rounded ${getStatusColor(status)}`}
                          >
                            {status === 'pending'
                              ? t({ zh: '待测试', en: 'Pending' })
                              : status === 'testing'
                              ? t({ zh: '测试中', en: 'Testing' })
                              : status === 'passed'
                              ? t({ zh: '通过', en: 'Passed' })
                              : t({ zh: '失败', en: 'Failed' })}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={testCase.url}
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium text-center"
                          >
                            {t({ zh: '开始测试', en: 'Start Test' })}
                          </Link>
                          <button
                            onClick={() => handleTest(testCase)}
                            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
                          >
                            {t({ zh: '标记', en: 'Mark' })}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* 测试统计 */}
          <div className="mt-8 bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {t({ zh: '测试统计', en: 'Test Statistics' })}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">{testCases.length}</div>
                <div className="text-sm text-gray-600">{t({ zh: '总测试用例', en: 'Total Tests' })}</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">
                  {Object.values(testResults).filter((s) => s === 'passed').length}
                </div>
                <div className="text-sm text-gray-600">{t({ zh: '已通过', en: 'Passed' })}</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">
                  {Object.values(testResults).filter((s) => s === 'failed').length}
                </div>
                <div className="text-sm text-gray-600">{t({ zh: '已失败', en: 'Failed' })}</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">
                  {Object.values(testResults).filter((s) => s === 'testing').length}
                </div>
                <div className="text-sm text-gray-600">{t({ zh: '测试中', en: 'Testing' })}</div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
