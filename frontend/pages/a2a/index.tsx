/**
 * A2A (Agent-to-Agent) Task Management Page
 * 
 * Standalone page for managing agent-to-agent task delegation,
 * viewing task lifecycle, and checking agent reputation.
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useUser } from '../../contexts/UserContext';
import { A2ATaskDashboard } from '../../components/a2a/A2ATaskDashboard';

export default function A2APage() {
  const router = useRouter();
  const { user } = useUser();
  const { agentId, role } = router.query;

  return (
    <>
      <Head>
        <title>A2A 任务管理 | Agentrix</title>
        <meta name="description" content="Agent-to-Agent task delegation and collaboration" />
      </Head>
      <div className="min-h-screen bg-gray-950 text-white">
        {/* Top Bar */}
        <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/workbench')}
                className="text-gray-400 hover:text-white text-sm transition"
              >
                ← 工作台
              </button>
              <span className="text-gray-600">|</span>
              <h1 className="text-sm font-semibold">A2A 任务管理</h1>
            </div>
            {user && (
              <span className="text-xs text-gray-500">
                {user.email || user.nickname}
              </span>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-6 py-6">
          <A2ATaskDashboard
            agentId={typeof agentId === 'string' ? agentId : undefined}
            defaultRole={(typeof role === 'string' && (role === 'requester' || role === 'target')) ? role : 'requester'}
          />
        </main>
      </div>
    </>
  );
}
