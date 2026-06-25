import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function PluginsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/unified-marketplace?source=imported');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-slate-600 font-medium">Redirecting to Unified Marketplace...</p>
      </div>
    </div>
  );
}

