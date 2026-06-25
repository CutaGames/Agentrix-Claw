import type { GetServerSideProps, NextPage } from 'next';
import Head from 'next/head';
import { useEffect, useState } from 'react';

/**
 * Sparkpage — single-URL aggregated output of one agent task.
 *
 * Renders the chat transcript + generated images + slides + video for
 * one task in a public, shareable layout. The page is read-only and
 * pulls data from `GET /agent-tasks/:id` + `GET /agent-tasks/:id/log`.
 */

interface TaskShape {
  id: string;
  title: string;
  status: string;
  costUsd: number;
  tier?: string | null;
  resultSummary?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

interface LogShape {
  id: string;
  kind: string;
  message: string;
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

interface Props {
  taskId: string;
  apiBase: string;
}

const SparkpagePage: NextPage<Props> = ({ taskId, apiBase }) => {
  const [task, setTask] = useState<TaskShape | null>(null);
  const [logs, setLogs] = useState<LogShape[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [tRes, lRes] = await Promise.all([
          fetch(`${apiBase}/agent-tasks/${taskId}`),
          fetch(`${apiBase}/agent-tasks/${taskId}/log`),
        ]);
        if (!tRes.ok) throw new Error(`task ${tRes.status}`);
        const t = (await tRes.json()) as TaskShape | null;
        const l = lRes.ok ? ((await lRes.json()) as LogShape[]) : [];
        if (!cancelled) {
          setTask(t);
          setLogs(l);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [apiBase, taskId]);

  // Bucket logs by kind for the gallery sections.
  const images = logs.filter((l) => l.kind === 'output' && (l.payload?.kind === 'image'));
  const slides = logs.filter((l) => l.kind === 'output' && (l.payload?.kind === 'slides'));
  const videos = logs.filter((l) => l.kind === 'output' && (l.payload?.kind === 'video'));
  const transcript = logs.filter((l) => l.kind === 'tool_call' || l.kind === 'tool_result' || l.kind === 'info');

  return (
    <>
      <Head>
        <title>{task ? `${task.title} — Agentrix Sparkpage` : 'Agentrix Sparkpage'}</title>
        <meta name="description" content="Agentrix agent task output page" />
      </Head>
      <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {error && (
            <div className="mb-6 p-4 bg-red-900/40 border border-red-700 rounded-lg text-red-200">
              Failed to load task: {error}
            </div>
          )}
          {!task && !error && <div className="text-slate-400">Loading…</div>}
          {task && (
            <>
              <header className="mb-8">
                <div className="text-xs uppercase tracking-wider text-purple-400 mb-2">
                  Agentrix Sparkpage
                </div>
                <h1 className="text-3xl font-bold mb-3">{task.title}</h1>
                <div className="flex flex-wrap gap-3 text-sm text-slate-400">
                  <span className="px-2 py-1 bg-slate-800 rounded">status: {task.status}</span>
                  {task.tier && (
                    <span className="px-2 py-1 bg-slate-800 rounded">tier: {task.tier}</span>
                  )}
                  <span className="px-2 py-1 bg-slate-800 rounded">
                    cost: ${task.costUsd.toFixed(4)}
                  </span>
                  <span className="px-2 py-1 bg-slate-800 rounded">
                    {new Date(task.createdAt).toLocaleString()}
                  </span>
                </div>
              </header>

              {task.resultSummary && (
                <section className="mb-8 p-5 bg-slate-800/60 border border-slate-700 rounded-xl">
                  <h2 className="text-lg font-semibold mb-2">Summary</h2>
                  <p className="text-slate-200 whitespace-pre-wrap">{task.resultSummary}</p>
                </section>
              )}

              {videos.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-lg font-semibold mb-3">Video</h2>
                  <div className="space-y-3">
                    {videos.map((v) => {
                      const url = (v.payload?.url as string | undefined) || '';
                      return url ? (
                        <video key={v.id} src={url} controls className="w-full rounded-lg" />
                      ) : null;
                    })}
                  </div>
                </section>
              )}

              {slides.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-lg font-semibold mb-3">Slides</h2>
                  <div className="space-y-3">
                    {slides.map((s) => {
                      const url = (s.payload?.url as string | undefined) || '';
                      return url ? (
                        <iframe
                          key={s.id}
                          src={url}
                          className="w-full h-96 rounded-lg border border-slate-700 bg-white"
                          title={s.message}
                        />
                      ) : null;
                    })}
                  </div>
                </section>
              )}

              {images.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-lg font-semibold mb-3">Images</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {images.map((i) => {
                      const url = (i.payload?.url as string | undefined) || '';
                      return url ? (
                        <img
                          key={i.id}
                          src={url}
                          alt={i.message}
                          className="w-full rounded-lg border border-slate-700"
                        />
                      ) : null;
                    })}
                  </div>
                </section>
              )}

              {transcript.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-lg font-semibold mb-3">Work Log</h2>
                  <div className="space-y-2 text-sm">
                    {transcript.map((t) => (
                      <div
                        key={t.id}
                        className="p-3 bg-slate-800/40 border border-slate-700 rounded"
                      >
                        <div className="text-xs text-slate-500 mb-1">
                          {new Date(t.createdAt).toLocaleTimeString()} · {t.kind}
                        </div>
                        <div className="text-slate-200 whitespace-pre-wrap break-words">
                          {t.message}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <footer className="mt-12 pt-6 border-t border-slate-800 text-center text-xs text-slate-500">
                Generated by{' '}
                <a href="https://agentrix.top" className="text-purple-400 hover:underline">
                  Agentrix
                </a>{' '}
                · The AI Agent Economy Platform
              </footer>
            </>
          )}
        </div>
      </main>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const taskId = String(ctx.params?.id ?? '');
  const apiBase =
    process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || 'https://api.agentrix.top';
  return { props: { taskId, apiBase } };
};

export default SparkpagePage;
