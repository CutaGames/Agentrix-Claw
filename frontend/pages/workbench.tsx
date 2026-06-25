import Head from 'next/head';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { WorkbenchLayout } from '../components/layout/WorkbenchLayout';
import { L1Tab } from '../components/layout/L1TopNav';
import { L2SubItem } from '../components/layout/L2LeftSidebar';
import { WorkbenchProvider } from '../contexts/WorkbenchContext';
import { usePayment } from '../contexts/PaymentContext';
import { useAgentMode } from '../contexts/AgentModeContext';
import { useUser } from '../contexts/UserContext';
import { SmartCheckout } from '../components/payment/SmartCheckout';
import { PaymentSuccessModal } from '../components/agent/PaymentSuccessModal';
import { UserModuleV2 } from '../components/agent/workspace/UserModuleV2';
import { MerchantModuleV2 } from '../components/agent/workspace/MerchantModuleV2';
import { DeveloperModuleV2 } from '../components/agent/workspace/DeveloperModuleV2';
import { RegistrationModal } from '../components/auth/RegistrationModal';

const defaultL2: Record<L1Tab, L2SubItem> = {
  dashboard: 'overview',
  agents: 'my-agents',
  earn: 'auto-tasks',
  shop: 'orders',
  pay: 'transactions',
  assets: 'wallets',
  products: 'list',
  orders: 'all-orders',
  finance: 'overview',
  analytics: 'sales',
  build: 'skill-factory',
  publish: 'my-skills', // 开发者默认进入"我的技能"
  revenue: 'earnings',
  docs: 'api-reference',
  settings: 'general',
  skills: 'my-skills', // 保留类型兼容，但普通用户不再有此入口
  security: 'sessions',
  // New account system tabs
  'unified-account': 'balances',
  'agent-accounts': 'my-agents',
  'kyc': 'status',
  'workspaces': 'list',
  'promotion': 'overview',
};

const modeDefaultL1: Record<'personal' | 'merchant' | 'developer', L1Tab> = {
  personal: 'dashboard',
  merchant: 'dashboard',
  developer: 'dashboard',
};

function WorkbenchContent() {
  const router = useRouter();
  const { currentPayment, cancelPayment } = usePayment();
  const { mode: agentMode, setMode: setAgentMode, trySetMode, accessDenied, clearAccessDenied } = useAgentMode();
  const { user } = useUser();

  const [activeL1, setActiveL1] = useState<L1Tab>(modeDefaultL1[agentMode]);
  const [activeL2, setActiveL2] = useState<L2SubItem>(defaultL2[modeDefaultL1[agentMode]]);
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [paymentSuccessData, setPaymentSuccessData] = useState<{ orderId?: string; amount?: number; currency?: string } | null>(null);

  // Handle URL query params for mode switching (e.g., ?mode=merchant)
  useEffect(() => {
    const { mode, action, skillId, l1, l2 } = router.query;
    if (mode && typeof mode === 'string') {
      const targetMode = mode as 'personal' | 'merchant' | 'developer';
      if (['personal', 'merchant', 'developer'].includes(targetMode)) {
        trySetMode(targetMode, user?.roles);
      }
    }
    // Handle l1/l2 navigation params (e.g., ?l1=assets&l2=wallets)
    if (l1 && typeof l1 === 'string') {
      setActiveL1(l1 as L1Tab);
      if (l2 && typeof l2 === 'string') {
        setActiveL2(l2 as L2SubItem);
      } else {
        setActiveL2(defaultL2[l1 as L1Tab] || 'overview');
      }
    }
    // Handle install action from marketplace
    if (action === 'install' && skillId) {
      // Navigate to skills section after mode is set
      setActiveL1('skills' as L1Tab);
      setActiveL2('my-skills' as L2SubItem);
    }
  }, [router.query, trySetMode, user?.roles]);

  // keep L1/L2 in sync when switching roles
  useEffect(() => {
    const nextL1 = modeDefaultL1[agentMode] || 'dashboard';
    setActiveL1(nextL1);
    setActiveL2(defaultL2[nextL1] || 'overview');
  }, [agentMode]);

  const handleL1Change = useCallback((tab: L1Tab) => {
    setActiveL1(tab);
    setActiveL2(defaultL2[tab] || 'overview');
  }, []);

  const handleL2Change = useCallback((item: L2SubItem) => {
    setActiveL2(item);
  }, []);

  const handleCommand = useCallback((command: string, data?: any) => {
    if (command === 'navigate') {
      if (data?.l1) {
        handleL1Change(data.l1 as L1Tab);
      }
      if (data?.l2) {
        handleL2Change(data.l2 as L2SubItem);
      }
      return { success: true };
    }
    if (command === 'switch_mode' && data?.mode) {
      setAgentMode(data.mode);
      return { success: true };
    }
    return { success: false };
  }, [handleL1Change, handleL2Change, setAgentMode]);

  const handleConfigItemClick = useCallback((section: string, item: string) => {
    const key = `${section}:${item}`;
    const routes: Record<string, { mode?: 'personal' | 'merchant' | 'developer'; l1: L1Tab; l2: L2SubItem }> = {
      'agent-skills:my-agents': { mode: 'personal', l1: 'dashboard', l2: 'overview' },
      'agent-skills:skill-library': { mode: 'developer', l1: 'build', l2: 'skills-registry' },
      'agent-skills:mandates': { mode: 'personal', l1: 'pay', l2: 'transactions' },
      'security:permissions': { mode: 'merchant', l1: 'finance', l2: 'overview' },
      'security:sessions': { mode: 'personal', l1: 'pay', l2: 'transactions' },
      'security:policies': { mode: 'personal', l1: 'pay', l2: 'subscriptions' },
      'security:audit-trail': { mode: 'developer', l1: 'docs', l2: 'changelog' },
      'account:profile': { mode: 'personal', l1: 'dashboard', l2: 'overview' },
      'account:preferences': { mode: 'personal', l1: 'assets', l2: 'wallets' },
      'account:help': { mode: 'personal', l1: 'dashboard', l2: 'recommendations' },
      'ai-integration:skill-converter': { mode: 'merchant', l1: 'products', l2: 'as-skills' },
      'ai-integration:multi-platform': { mode: 'merchant', l1: 'products', l2: 'ecommerce-sync' },
      'ai-integration:agent-whitelist': { mode: 'merchant', l1: 'analytics', l2: 'sales' },
      'integrations:api-keys': { mode: 'developer', l1: 'docs', l2: 'api-reference' },
      'integrations:webhooks': { mode: 'developer', l1: 'publish', l2: 'distribution' },
      'integrations:mpc-wallet': { mode: 'personal', l1: 'assets', l2: 'wallets' },
      'integrations:payment-gateway': { mode: 'merchant', l1: 'finance', l2: 'transactions' },
      'compliance:audit-logs': { mode: 'merchant', l1: 'analytics', l2: 'sales' },
      'compliance:tax-settings': { mode: 'merchant', l1: 'finance', l2: 'invoices' },
      'compliance:legal-docs': { mode: 'merchant', l1: 'finance', l2: 'overview' },
      'settings:store-info': { mode: 'merchant', l1: 'dashboard', l2: 'overview' },
      'settings:notification': { mode: 'merchant', l1: 'dashboard', l2: 'overview' },
      'settings:team': { mode: 'merchant', l1: 'dashboard', l2: 'overview' },
      'integration:api-keys': { mode: 'developer', l1: 'docs', l2: 'api-reference' },
      'integration:mcp-config': { mode: 'developer', l1: 'publish', l2: 'multi-platform' },
      'integration:oauth-apps': { mode: 'developer', l1: 'publish', l2: 'distribution' },
      'integration:webhooks': { mode: 'developer', l1: 'publish', l2: 'distribution' },
      'agent-testing:test-agents': { mode: 'developer', l1: 'build', l2: 'test-sandbox' },
      'agent-testing:debug-console': { mode: 'developer', l1: 'build', l2: 'test-sandbox' },
      'agent-testing:mock-scenarios': { mode: 'developer', l1: 'build', l2: 'test-sandbox' },
      'monitoring:logs': { mode: 'developer', l1: 'docs', l2: 'changelog' },
      'monitoring:errors': { mode: 'developer', l1: 'docs', l2: 'examples' },
      'monitoring:performance': { mode: 'developer', l1: 'dashboard', l2: 'performance' },
      'monitoring:alerts': { mode: 'developer', l1: 'dashboard', l2: 'overview' },
      'security:rate-limits': { mode: 'developer', l1: 'docs', l2: 'api-reference' },
      'security:ip-whitelist': { mode: 'developer', l1: 'publish', l2: 'distribution' },
      'settings:developer-profile': { mode: 'developer', l1: 'dashboard', l2: 'overview' },
      'settings:team-members': { mode: 'developer', l1: 'dashboard', l2: 'overview' },
      'settings:billing': { mode: 'developer', l1: 'revenue', l2: 'transactions' },
    };

    const target = routes[key];
    if (target?.mode) {
      setAgentMode(target.mode);
    }
    if (target) {
      handleL1Change(target.l1);
      handleL2Change(target.l2);
    }
  }, [handleL1Change, handleL2Change, setAgentMode]);

  const renderContent = useCallback(() => {
    if (agentMode === 'personal') {
      const userNavMap: Record<string, { main: any; sub: string }> = {
        'dashboard:overview': { main: 'dashboard', sub: 'overview' },
        'dashboard:recent': { main: 'dashboard', sub: 'overview' },
        'dashboard:recommendations': { main: 'dashboard', sub: 'overview' },
        'agents:my-agents': { main: 'agents', sub: 'my-agents' },
        'agents:presence': { main: 'agents', sub: 'presence' },
        'agents:devices': { main: 'agents', sub: 'devices' },
        'agents:authorizations': { main: 'agents', sub: 'authorizations' },
        'earn:auto-tasks': { main: 'autoEarn', sub: 'tasks' },
        'earn:airdrops': { main: 'autoEarn', sub: 'airdrops' },
        'earn:strategies': { main: 'autoEarn', sub: 'tasks' },
        'earn:history': { main: 'autoEarn', sub: 'tasks' },
        'shop:orders': { main: 'shopping', sub: 'orders' },
        'shop:cart': { main: 'shopping', sub: 'cart' },
        'shop:wishlist': { main: 'shopping', sub: 'wishlist' },
        'shop:promotions': { main: 'shopping', sub: 'promotions' },
        'pay:transactions': { main: 'payments', sub: 'history' },
        'pay:subscriptions': { main: 'payments', sub: 'subscriptions' },
        'pay:invoices': { main: 'payments', sub: 'invoices' },
        'pay:referrals': { main: 'payments', sub: 'referrals' },
        'assets:wallets': { main: 'assets', sub: 'wallets' },
        'assets:balances': { main: 'assets', sub: 'balances' },
        'assets:kyc': { main: 'assets', sub: 'kyc' },
        'skills:my-skills': { main: 'skills', sub: 'my-skills' },
        'skills:configure': { main: 'skills', sub: 'configure' },
        'security:sessions': { main: 'security', sub: 'sessions' },
        'security:details': { main: 'security', sub: 'details' },
        'security:policies': { main: 'security', sub: 'policies' },
        // New account system mappings
        'unified-account:balances': { main: 'unified-account', sub: 'balances' },
        'unified-account:transactions': { main: 'unified-account', sub: 'transactions' },
        'unified-account:deposit': { main: 'unified-account', sub: 'deposit' },
        'unified-account:withdraw': { main: 'unified-account', sub: 'withdraw' },
        'unified-account:payout-settings': { main: 'unified-account', sub: 'payout-settings' },
        'agent-accounts:my-agents': { main: 'agent-accounts', sub: 'my-agents' },
        'agent-accounts:authorizations': { main: 'agent-accounts', sub: 'authorizations' },
        'agent-accounts:auto-pay': { main: 'agent-accounts', sub: 'auto-pay' },
        'kyc:status': { main: 'kyc', sub: 'status' },
        'kyc:upgrade': { main: 'kyc', sub: 'upgrade' },
        'kyc:documents': { main: 'kyc', sub: 'documents' },
        // Promotion center (top-level tab)
        'promotion:overview': { main: 'promotion', sub: 'overview' },
        'promotion:my-links': { main: 'promotion', sub: 'my-links' },
        'promotion:materials': { main: 'promotion', sub: 'materials' },
        // Dashboard KYC sub-item
        'dashboard:kyc': { main: 'kyc', sub: 'status' },
        // Workspaces mappings
        'workspaces:list': { main: 'workspaces', sub: 'list' },
        'workspaces:create': { main: 'workspaces', sub: 'create' },
        'workspaces:invitations': { main: 'workspaces', sub: 'invitations' },
      };

      const key = `${activeL1}:${activeL2}`;
      const forced = userNavMap[key] || userNavMap[`${activeL1}:overview`] || { main: 'dashboard', sub: 'overview' };
      return <UserModuleV2 forcedMainTab={forced.main} forcedSubTab={forced.sub} hideNavigation onCommand={handleCommand} />;
    }

    if (agentMode === 'merchant') {
      type MerchantL1 = Extract<L1Tab, 'dashboard' | 'products' | 'orders' | 'finance' | 'analytics' | 'settings'>;
      const merchantTabs: MerchantL1[] = ['dashboard', 'products', 'orders', 'finance', 'analytics', 'settings'];
      const safeL1 = merchantTabs.includes(activeL1 as MerchantL1) ? (activeL1 as MerchantL1) : 'dashboard';
      return <MerchantModuleV2 activeL1={safeL1} activeL2={activeL2} onCommand={handleCommand} />;
    }

    if (agentMode === 'developer') {
      type DeveloperL1 = Extract<L1Tab, 'dashboard' | 'build' | 'publish' | 'revenue' | 'docs' | 'settings'>;
      const developerTabs: DeveloperL1[] = ['dashboard', 'build', 'publish', 'revenue', 'docs', 'settings'];
      const safeL1 = developerTabs.includes(activeL1 as DeveloperL1) ? (activeL1 as DeveloperL1) : 'dashboard';
      return <DeveloperModuleV2 activeL1={safeL1} activeL2={activeL2} onCommand={handleCommand} />;
    }

    return null;
  }, [agentMode, activeL1, activeL2, handleCommand]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      <Head>
        <title>Agentrix Workbench | AI Business Intelligence</title>
        <meta name="description" content="Agentrix Workbench - 统一工作台" />
      </Head>

      <WorkbenchLayout
        activeL1={activeL1}
        activeL2={activeL2}
        onL1Change={handleL1Change}
        onL2Change={handleL2Change}
        onConfigItemClick={handleConfigItemClick}
        onCommand={handleCommand}
      >
        {renderContent()}
      </WorkbenchLayout>

      {currentPayment && (
        <SmartCheckout
          order={{
            id: currentPayment.id,
            amount: parseFloat(currentPayment.amount.replace(/[^0-9.]/g, '')),
            currency: currentPayment.currency,
            description: currentPayment.description,
            merchantId: currentPayment.merchant,
            metadata: {
              ...currentPayment.metadata,
              agentId: currentPayment.agent,
            },
          }}
          onCancel={cancelPayment}
          onSuccess={(data) => {
            setPaymentSuccessData(data);
            setShowPaymentSuccess(true);
          }}
        />
      )}

      {showPaymentSuccess && (
        <PaymentSuccessModal
          isOpen={showPaymentSuccess}
          onClose={() => setShowPaymentSuccess(false)}
          orderId={paymentSuccessData?.orderId}
          amount={paymentSuccessData?.amount}
          currency={paymentSuccessData?.currency}
        />
      )}

      {accessDenied && (accessDenied.mode === 'merchant' || accessDenied.mode === 'developer') && (
        <RegistrationModal
          isOpen={!!accessDenied}
          type={accessDenied.mode}
          onClose={clearAccessDenied}
          onSuccess={() => {
            setAgentMode(accessDenied.mode);
            clearAccessDenied();
          }}
        />
      )}
    </div>
  );
}

export default function WorkbenchPage() {
  return (
    <WorkbenchProvider>
      <WorkbenchContent />
    </WorkbenchProvider>
  );
}
