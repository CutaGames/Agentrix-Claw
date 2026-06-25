/**
 * 传统后台重定向页面
 * 
 * 所有 /app/* 路径现在都重定向到新版工作台 /workbench
 * 这个 catch-all 路由会捕获所有旧的后台页面请求
 */
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

// 旧路径到新工作台路径的映射
const pathMapping: Record<string, string> = {
  // 用户模块
  '/app/user': '/workbench?persona=user',
  '/app/user/wallets': '/workbench?persona=user&tab=assets-wallets',
  '/app/user/kyc': '/workbench?persona=user&tab=kyc',
  '/app/user/profile': '/workbench?persona=user&tab=profile-info',
  '/app/user/transactions': '/workbench?persona=user&tab=unified-account',
  '/app/user/payment-history': '/workbench?persona=user&tab=payments-history',
  '/app/user/subscriptions': '/workbench?persona=user&tab=payments-subscriptions',
  '/app/user/authorizations': '/workbench?persona=user&tab=agent-accounts',
  '/app/user/agent-authorizations': '/workbench?persona=user&tab=agent-accounts',
  '/app/user/skills': '/workbench?persona=user&tab=skills-browse',
  '/app/user/shopping': '/workbench?persona=user&tab=shopping-browse',
  '/app/user/security': '/workbench?persona=user&tab=security-sessions',
  
  // 商户模块
  '/app/merchant': '/workbench?persona=merchant',
  '/app/merchant/products': '/workbench?persona=merchant&tab=product-list',
  '/app/merchant/orders': '/workbench?persona=merchant&tab=all-orders',
  '/app/merchant/finance': '/workbench?persona=user&tab=unified-account',
  '/app/merchant/settlements': '/workbench?persona=user&tab=payout-settings',
  '/app/merchant/withdrawals': '/workbench?persona=user&tab=unified-account',
  '/app/merchant/kyc': '/workbench?persona=user&tab=kyc',
  '/app/merchant/profile': '/workbench?persona=merchant&tab=store-settings',
  '/app/merchant/api-keys': '/workbench?persona=developer&tab=api-keys',
  '/app/merchant/webhooks': '/workbench?persona=developer&tab=webhooks',
  '/app/merchant/stripe-connect': '/workbench?persona=user&tab=payout-settings',
  '/app/merchant/mpc-wallet': '/workbench?persona=user&tab=assets-wallets',
  
  // Agent模块
  '/app/agent': '/workbench?persona=developer',
  '/app/agent/config': '/workbench?persona=developer&tab=skill-factory',
  '/app/agent/products': '/workbench?persona=developer&tab=marketplace',
  '/app/agent/earnings': '/workbench?persona=developer&tab=earnings',
  '/app/agent/analytics': '/workbench?persona=developer&tab=api-calls',
  '/app/agent/kyc': '/workbench?persona=user&tab=kyc',
  '/app/agent/sandbox': '/workbench?persona=developer&tab=test-bench',
  '/app/agent/docs': '/workbench?persona=developer&tab=api-reference',
  
  // 购物车等通用页面
  '/app/cart': '/workbench?persona=user&tab=shopping-cart',
  '/app/dashboard': '/workbench',
};

export default function LegacyAppRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    if (!router.isReady) return;
    
    const currentPath = router.asPath.split('?')[0];
    
    // 查找映射的新路径
    let targetPath = pathMapping[currentPath];
    
    // 如果没有精确匹配，尝试前缀匹配
    if (!targetPath) {
      for (const [oldPath, newPath] of Object.entries(pathMapping)) {
        if (currentPath.startsWith(oldPath)) {
          targetPath = newPath;
          break;
        }
      }
    }
    
    // 默认重定向到工作台首页
    if (!targetPath) {
      targetPath = '/workbench';
    }
    
    // 执行重定向
    router.replace(targetPath);
  }, [router.isReady, router.asPath, router]);
  
  return (
    <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">页面已迁移</h2>
        <p className="text-slate-400 text-sm">正在跳转到新版工作台...</p>
        <p className="text-slate-500 text-xs mt-4">
          如果没有自动跳转，请点击
          <Link href="/workbench" className="text-blue-400 hover:underline ml-1">这里</Link>
        </p>
      </div>
    </div>
  );
}
