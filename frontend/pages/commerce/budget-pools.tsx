/**
 * Budget Pool Management Page - REDIRECT SHIM
 * 
 * This standalone page is deprecated. Budget Pools are now managed
 * within the Workbench → Merchant/Developer Module → Commerce tab.
 * This page redirects to /workbench with the appropriate view.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function BudgetPoolsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/workbench?view=merchant&tab=budget-pools');
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-slate-400 text-sm">Redirecting to Workbench...</p>
      </div>
    </div>
  );
}
