'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  Settings,
  Plus,
  Trash2,
  Edit,
  UserPlus,
  Crown,
  Shield,
  Eye,
  User,
  Loader2,
  MoreVertical,
  LogOut,
} from 'lucide-react';
import {
  workspaceApi,
  WorkspaceInfo,
  WorkspaceMemberInfo,
  WorkspaceType,
  MemberRole,
} from '../../lib/api/workspace.api';

interface WorkspaceManagerProps {
  onWorkspaceSelect?: (workspace: WorkspaceInfo) => void;
}

const WorkspaceTypeLabels: Record<WorkspaceType, string> = {
  [WorkspaceType.PERSONAL]: '个人',
  [WorkspaceType.TEAM]: '团队',
  [WorkspaceType.ENTERPRISE]: '企业',
};

const MemberRoleLabels: Record<MemberRole, string> = {
  [MemberRole.OWNER]: '所有者',
  [MemberRole.ADMIN]: '管理员',
  [MemberRole.MEMBER]: '成员',
  [MemberRole.VIEWER]: '访客',
};

const MemberRoleIcons: Record<MemberRole, React.ReactNode> = {
  [MemberRole.OWNER]: <Crown className="w-4 h-4 text-yellow-500" />,
  [MemberRole.ADMIN]: <Shield className="w-4 h-4 text-blue-500" />,
  [MemberRole.MEMBER]: <User className="w-4 h-4 text-gray-500" />,
  [MemberRole.VIEWER]: <Eye className="w-4 h-4 text-gray-400" />,
};

export function WorkspaceManager({ onWorkspaceSelect }: WorkspaceManagerProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceInfo | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'workspaces' | 'members' | 'settings'>('workspaces');

  // 创建表单状态
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    type: WorkspaceType.PERSONAL,
  });

  // 邀请表单状态
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: MemberRole.MEMBER,
  });

  // 加载工作空间列表
  const loadWorkspaces = async () => {
    try {
      setLoading(true);
      const data = await workspaceApi.getMyWorkspaces();
      setWorkspaces(data);
      if (data.length > 0 && !selectedWorkspace) {
        setSelectedWorkspace(data[0]);
      }
    } catch (err: any) {
      setError(err.message || '加载工作空间失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载成员列表
  const loadMembers = async (workspaceId: string) => {
    try {
      setMembersLoading(true);
      const data = await workspaceApi.getMembers(workspaceId);
      setMembers(data);
    } catch (err: any) {
      console.error('加载成员失败:', err);
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  useEffect(() => {
    if (selectedWorkspace) {
      loadMembers(selectedWorkspace.id);
      onWorkspaceSelect?.(selectedWorkspace);
    }
  }, [selectedWorkspace]);

  // 创建工作空间
  const handleCreate = async () => {
    try {
      const newWorkspace = await workspaceApi.create(createForm);
      setWorkspaces([...workspaces, newWorkspace]);
      setSelectedWorkspace(newWorkspace);
      setShowCreateModal(false);
      setCreateForm({ name: '', description: '', type: WorkspaceType.PERSONAL });
    } catch (err: any) {
      setError(err.message || '创建工作空间失败');
    }
  };

  // 邀请成员
  const handleInvite = async () => {
    if (!selectedWorkspace) return;
    try {
      const newMember = await workspaceApi.inviteMember(selectedWorkspace.id, inviteForm);
      setMembers([...members, newMember]);
      setShowInviteModal(false);
      setInviteForm({ email: '', role: MemberRole.MEMBER });
    } catch (err: any) {
      setError(err.message || '邀请成员失败');
    }
  };

  // 移除成员
  const handleRemoveMember = async (memberId: string) => {
    if (!selectedWorkspace || !confirm('确定要移除该成员吗？')) return;
    try {
      await workspaceApi.removeMember(selectedWorkspace.id, memberId);
      setMembers(members.filter((m) => m.id !== memberId));
    } catch (err: any) {
      setError(err.message || '移除成员失败');
    }
  };

  // 删除工作空间
  const handleDelete = async (workspace: WorkspaceInfo) => {
    if (!confirm(`确定要删除工作空间 "${workspace.name}" 吗？此操作不可恢复。`)) return;
    try {
      await workspaceApi.delete(workspace.id);
      setWorkspaces(workspaces.filter((w) => w.id !== workspace.id));
      if (selectedWorkspace?.id === workspace.id) {
        setSelectedWorkspace(workspaces[0] || null);
      }
    } catch (err: any) {
      setError(err.message || '删除工作空间失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 错误提示 */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            关闭
          </button>
        </div>
      )}

      {/* 标签页 */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab('workspaces')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'workspaces'
              ? 'bg-indigo-500/20 text-indigo-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Building2 className="w-4 h-4 inline mr-2" />
          工作空间
        </button>
        <button
          onClick={() => setActiveTab('members')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'members'
              ? 'bg-indigo-500/20 text-indigo-400'
              : 'text-gray-400 hover:text-white'
          }`}
          disabled={!selectedWorkspace}
        >
          <Users className="w-4 h-4 inline mr-2" />
          成员管理
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'settings'
              ? 'bg-indigo-500/20 text-indigo-400'
              : 'text-gray-400 hover:text-white'
          }`}
          disabled={!selectedWorkspace}
        >
          <Settings className="w-4 h-4 inline mr-2" />
          设置
        </button>
      </div>

      {/* 工作空间列表 */}
      {activeTab === 'workspaces' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">我的工作空间</h3>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              创建工作空间
            </button>
          </div>

          {workspaces.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>还没有工作空间</p>
              <p className="text-sm mt-2">创建一个工作空间开始团队协作</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {workspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  onClick={() => setSelectedWorkspace(workspace)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    selectedWorkspace?.id === workspace.id
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {workspace.logoUrl ? (
                        <img
                          src={workspace.logoUrl}
                          alt={workspace.name}
                          className="w-10 h-10 rounded-lg"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-white" />
                        </div>
                      )}
                      <div>
                        <h4 className="font-medium text-white">{workspace.name}</h4>
                        <span className="text-xs text-gray-400">
                          {WorkspaceTypeLabels[workspace.type]}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(workspace);
                      }}
                      className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {workspace.description && (
                    <p className="mt-2 text-sm text-gray-400 line-clamp-2">
                      {workspace.description}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {workspace.memberCount || 1} 成员
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 成员管理 */}
      {activeTab === 'members' && selectedWorkspace && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">
              {selectedWorkspace.name} - 成员列表
            </h3>
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              邀请成员
            </button>
          </div>

          {membersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>暂无成员数据</p>
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10"
                >
                  <div className="flex items-center gap-3">
                    {member.user?.avatarUrl ? (
                      <img
                        src={member.user.avatarUrl}
                        alt={member.user.nickname || ''}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center">
                        <User className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-white">
                        {member.user?.nickname || member.user?.email || '未知用户'}
                      </p>
                      <p className="text-sm text-gray-400">{member.user?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-white/5 text-sm">
                      {MemberRoleIcons[member.role]}
                      {MemberRoleLabels[member.role]}
                    </span>
                    {member.role !== MemberRole.OWNER && (
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 设置 */}
      {activeTab === 'settings' && selectedWorkspace && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">{selectedWorkspace.name} - 设置</h3>
          <div className="p-6 rounded-xl bg-white/5 border border-white/10">
            <p className="text-gray-400">工作空间设置功能开发中...</p>
          </div>
        </div>
      )}

      {/* 创建工作空间模态框 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-4">创建工作空间</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">名称</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-indigo-500 focus:outline-none"
                  placeholder="输入工作空间名称"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">描述</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-indigo-500 focus:outline-none"
                  placeholder="可选：描述这个工作空间的用途"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">类型</label>
                <select
                  value={createForm.type}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, type: e.target.value as WorkspaceType })
                  }
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value={WorkspaceType.PERSONAL}>个人</option>
                  <option value={WorkspaceType.TEAM}>团队</option>
                  <option value={WorkspaceType.ENTERPRISE}>企业</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!createForm.name.trim()}
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 邀请成员模态框 */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-4">邀请成员</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">邮箱</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-indigo-500 focus:outline-none"
                  placeholder="输入成员邮箱"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">角色</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, role: e.target.value as MemberRole })
                  }
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value={MemberRole.MEMBER}>成员</option>
                  <option value={MemberRole.ADMIN}>管理员</option>
                  <option value={MemberRole.VIEWER}>访客</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowInviteModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleInvite}
                disabled={!inviteForm.email.trim()}
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                邀请
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
