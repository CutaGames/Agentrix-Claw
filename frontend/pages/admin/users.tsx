import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { 
  Users, 
  Search, 
  Filter, 
  MoreVertical, 
  Mail, 
  ArrowLeft,
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  Shield,
  UserCheck
} from 'lucide-react';
import { API_BASE_URL } from '../../utils/api-config';

interface User {
  id: string;
  agentrixId?: string;
  email?: string;
  name?: string;
  nickname?: string;
  walletAddress?: string;
  status: string;
  kycStatus?: string;
  roles?: string[];
  createdAt: string;
}

interface NewUserForm {
  email: string;
  nickname: string;
  password: string;
  roles: string[];
}

export default function UsersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [newUser, setNewUser] = useState<NewUserForm>({
    email: '',
    nickname: '',
    password: '',
    roles: ['user']
  });

  const fetchUsers = useCallback(async (token: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(searchTerm && { search: searchTerm })
      });
      
      const response = await fetch(`${API_BASE_URL}/api/admin/users?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.status === 401) {
        localStorage.removeItem('admin_token');
        router.replace('/admin/login');
        return;
      }
      
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data.data || data.users || data.items || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, searchTerm, router]);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      router.replace('/admin/login');
      return;
    }
    fetchUsers(token);
  }, [router, page, statusFilter, fetchUsers]);

  const handleSearch = () => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      setPage(1);
      fetchUsers(token);
    }
  };

  const handleStatusChange = async (userId: string, newStatus: string) => {
    const token = localStorage.getItem('admin_token');
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        fetchUsers(token);
      }
    } catch (err) {
      console.error('Failed to update user status:', err);
    }
  };

  const handleAddUser = async () => {
    const token = localStorage.getItem('admin_token');
    if (!token) return;

    if (!newUser.email || !newUser.password) {
      setError('请填写邮箱和密码');
      return;
    }

    try {
      setAddingUser(true);
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: newUser.email,
          password: newUser.password,
          nickname: newUser.nickname || newUser.email.split('@')[0],
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || '创建用户失败');
      }

      setShowAddModal(false);
      setNewUser({ email: '', nickname: '', password: '', roles: ['user'] });
      fetchUsers(token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddingUser(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>用户管理 - Agentrix Admin</title>
      </Head>

      <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/admin')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h2 className="text-xl font-semibold text-gray-800">用户管理</h2>
          <span className="text-sm text-gray-500">共 {total} 个用户</span>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          添加用户
        </button>
      </header>

      <main className="p-8 max-w-7xl mx-auto">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="mb-6 flex flex-col md:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="搜索用户名、邮箱或钱包地址..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="flex gap-2">
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 bg-white"
            >
              <option value="all">全部状态</option>
              <option value="active">活跃</option>
              <option value="inactive">未激活</option>
              <option value="suspended">已冻结</option>
            </select>
            <button 
              onClick={() => fetchUsers(localStorage.getItem('admin_token') || '')}
              className="p-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-white transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-left min-w-[1000px]">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-4 font-medium">用户</th>
                <th className="px-4 py-4 font-medium">AX ID</th>
                <th className="px-4 py-4 font-medium">钱包地址</th>
                <th className="px-4 py-4 font-medium">状态</th>
                <th className="px-4 py-4 font-medium">角色</th>
                <th className="px-4 py-4 font-medium">注册时间</th>
                <th className="px-4 py-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mx-auto mb-2" />
                    <p className="text-gray-400">加载中...</p>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                    暂无用户数据
                  </td>
                </tr>
              ) : users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold shrink-0">
                        {(user.nickname || user.email || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{user.nickname || user.name || '未命名'}</div>
                        <div className="text-xs text-gray-500">
                          {user.email || <span className="text-gray-400">无邮箱</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {user.agentrixId ? (
                      <span className="font-mono text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                        {user.agentrixId}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {user.walletAddress ? (
                      <span className="font-mono text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded">
                        {user.walletAddress.slice(0, 6)}...{user.walletAddress.slice(-4)}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.status === 'active' ? 'bg-green-100 text-green-700' : 
                      user.status === 'suspended' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {user.status === 'active' ? '活跃' : user.status === 'suspended' ? '已冻结' : '未激活'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex gap-1 flex-wrap">
                      {user.roles?.map((role) => (
                        <span key={role} className={`px-2 py-0.5 rounded text-xs ${
                          role === 'merchant' ? 'bg-green-50 text-green-700' :
                          role === 'agent' ? 'bg-blue-50 text-blue-700' :
                          role === 'developer' ? 'bg-purple-50 text-purple-700' :
                          'bg-indigo-50 text-indigo-700'
                        }`}>
                          {role}
                        </span>
                      )) || <span className="text-gray-400">-</span>}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="relative flex justify-end gap-2">
                      <button 
                        onClick={() => router.push(`/admin/users/${user.id}`)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                        title="查看详情"
                      >
                        <UserCheck className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setActiveMenuId(activeMenuId === user.id ? null : user.id)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <MoreVertical className="w-4 h-4 text-gray-400" />
                      </button>
                      {activeMenuId === user.id && (
                        <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                          <button 
                            onClick={() => { handleStatusChange(user.id, user.status === 'active' ? 'suspended' : 'active'); setActiveMenuId(null); }}
                            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 text-gray-700"
                          >
                            {user.status === 'active' ? '冻结用户' : '激活用户'}
                          </button>
                          <button 
                            onClick={() => { router.push(`/admin/users/${user.id}`); setActiveMenuId(null); }}
                            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 text-gray-700"
                          >
                            查看详情
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 20 && (
          <div className="mt-4 flex justify-between items-center">
            <div className="text-sm text-gray-500">
              显示 {(page - 1) * 20 + 1} - {Math.min(page * 20, total)} / 共 {total} 条
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border rounded-lg disabled:opacity-50"
              >
                上一页
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * 20 >= total}
                className="px-4 py-2 border rounded-lg disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">添加新用户</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">邮箱 *</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="user@example.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">昵称</label>
                <input
                  type="text"
                  value={newUser.nickname}
                  onChange={(e) => setNewUser({ ...newUser, nickname: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="用户昵称"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">密码 *</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="设置密码"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">角色</label>
                <div className="flex flex-wrap gap-2">
                  {['user', 'merchant', 'agent'].map((role) => (
                    <label key={role} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newUser.roles.includes(role)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewUser({ ...newUser, roles: [...newUser.roles, role] });
                          } else {
                            setNewUser({ ...newUser, roles: newUser.roles.filter(r => r !== role) });
                          }
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700 capitalize">{role === 'user' ? '普通用户' : role === 'merchant' ? '商户' : '开发者'}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewUser({ email: '', nickname: '', password: '', roles: ['user'] });
                }}
                className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAddUser}
                disabled={addingUser}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {addingUser ? '创建中...' : '创建用户'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

