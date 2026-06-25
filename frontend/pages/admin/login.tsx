import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123456');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const token = localStorage.getItem('admin_token');
    if (token) {
      router.replace('/admin');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Use Next.js API proxy route (same-origin) — avoids CORS & env issues
      const response = await fetch(`/api/admin/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = 
          data?.message || 
          (response.status === 401 ? 'Invalid username or password' : `Login failed (Status: ${response.status})`);
        setError(message);
        return;
      }

      if (!data.access_token) {
        setError('Login successful but no access token received');
        return;
      }

      // Save token and redirect
      if (typeof window !== 'undefined') {
        localStorage.setItem('admin_token', data.access_token as string);
      }
      
      router.replace('/admin');
    } catch (err: any) {
      console.error('Admin login failed:', err);
      setError(err?.message || 'Connection failed, please check your network or API URL');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Admin Login - Agentrix</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-indigo-50 p-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900">Agentrix Admin</h1>
            <p className="mt-2 text-gray-500 text-sm">Please enter your credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                placeholder="admin"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                placeholder="Enter password"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Logging in...' : 'Login Now'}
            </button>
          </form>

          <div className="mt-6 text-xs text-gray-400 text-center space-y-1">
            <p>Default: admin / admin123456</p>
          </div>

          <div className="mt-6 flex justify-between text-xs text-gray-500">
            <button 
              type="button"
              onClick={() => router.push('/')}
              className="hover:text-indigo-600"
            >
              ← Back to Home
            </button>
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="hover:text-indigo-600"
            >
              Admin Dashboard →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
