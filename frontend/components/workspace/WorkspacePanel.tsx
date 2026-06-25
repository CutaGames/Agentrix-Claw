'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Settings,
  UserPlus,
  Shield,
  Trash2,
  Edit,
  ExternalLink,
  Check,
  X,
  Crown,
  Clock,
} from 'lucide-react';
import { useLocalization } from '../../contexts/LocalizationContext';

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
  settings?: {
    isPublic: boolean;
    allowInvites: boolean;
    maxMembers: number;
  };
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  userEmail: string;
  userName: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: string;
}

export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  workspaceName: string;
  inviterName: string;
  invitedEmail: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: string;
  createdAt: string;
}

export function WorkspacePanel() {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<'my-spaces' | 'joined' | 'invitations'>('my-spaces');
  const [myWorkspaces, setMyWorkspaces] = useState<Workspace[]>([]);
  const [joinedWorkspaces, setJoinedWorkspaces] = useState<Workspace[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Mock data - replace with actual API calls
      if (activeTab === 'my-spaces') {
        setMyWorkspaces([
          {
            id: '1',
            name: 'Personal Workspace',
            description: 'My personal agent development space',
            ownerId: 'user1',
            memberCount: 1,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
            settings: { isPublic: false, allowInvites: true, maxMembers: 10 },
          },
        ]);
      } else if (activeTab === 'joined') {
        setJoinedWorkspaces([
          {
            id: '2',
            name: 'Team Alpha',
            description: 'Collaborative AI development',
            ownerId: 'user2',
            memberCount: 5,
            createdAt: '2026-01-10T00:00:00Z',
            updatedAt: '2026-01-15T00:00:00Z',
          },
        ]);
      } else {
        setInvitations([
          {
            id: '1',
            workspaceId: '3',
            workspaceName: 'Project Beta',
            inviterName: 'John Doe',
            invitedEmail: 'me@example.com',
            status: 'pending',
            expiresAt: '2026-01-25T00:00:00Z',
            createdAt: '2026-01-18T00:00:00Z',
          },
        ]);
      }
    } catch (error) {
      console.error('Failed to load workspace data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    // API call to accept invitation
    console.log('Accepting invitation:', invitationId);
    loadData();
  };

  const handleDeclineInvitation = async (invitationId: string) => {
    // API call to decline invitation
    console.log('Declining invitation:', invitationId);
    loadData();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {t({ zh: '工作空间', en: 'Workspaces' })}
          </h2>
          <p className="text-slate-400 mt-1">
            {t({ zh: '管理您的协作空间和团队', en: 'Manage your collaborative spaces and teams' })}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t({ zh: '创建空间', en: 'Create Space' })}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-700">
        <TabButton
          active={activeTab === 'my-spaces'}
          onClick={() => setActiveTab('my-spaces')}
          label={t({ zh: '我的空间', en: 'My Spaces' })}
          count={myWorkspaces.length}
        />
        <TabButton
          active={activeTab === 'joined'}
          onClick={() => setActiveTab('joined')}
          label={t({ zh: '已加入', en: 'Joined' })}
          count={joinedWorkspaces.length}
        />
        <TabButton
          active={activeTab === 'invitations'}
          onClick={() => setActiveTab('invitations')}
          label={t({ zh: '邀请', en: 'Invitations' })}
          count={invitations.filter((i) => i.status === 'pending').length}
        />
      </div>

      {/* Content */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <>
            {activeTab === 'my-spaces' &&
              (myWorkspaces.length === 0 ? (
                <EmptyState
                  message={t({ zh: '您还没有创建任何工作空间', en: 'No workspaces created yet' })}
                  actionLabel={t({ zh: '创建第一个空间', en: 'Create First Space' })}
                  onAction={() => setShowCreateModal(true)}
                />
              ) : (
                myWorkspaces.map((workspace) => (
                  <WorkspaceCard key={workspace.id} workspace={workspace} isOwner={true} />
                ))
              ))}

            {activeTab === 'joined' &&
              (joinedWorkspaces.length === 0 ? (
                <EmptyState message={t({ zh: '您还未加入任何工作空间', en: 'No joined workspaces' })} />
              ) : (
                joinedWorkspaces.map((workspace) => (
                  <WorkspaceCard key={workspace.id} workspace={workspace} isOwner={false} />
                ))
              ))}

            {activeTab === 'invitations' &&
              (invitations.length === 0 ? (
                <EmptyState message={t({ zh: '暂无待处理的邀请', en: 'No pending invitations' })} />
              ) : (
                invitations.map((invitation) => (
                  <InvitationCard
                    key={invitation.id}
                    invitation={invitation}
                    onAccept={() => handleAcceptInvitation(invitation.id)}
                    onDecline={() => handleDeclineInvitation(invitation.id)}
                  />
                ))
              ))}
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 font-medium transition-colors relative ${
        active
          ? 'text-blue-400 border-b-2 border-blue-400'
          : 'text-slate-400 hover:text-slate-300'
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
            active ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-700 text-slate-400'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function WorkspaceCard({ workspace, isOwner }: { workspace: Workspace; isOwner: boolean }) {
  const { t } = useLocalization();

  return (
    <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-700 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-white">{workspace.name}</h3>
            {isOwner && (
              <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full flex items-center gap-1">
                <Crown className="h-3 w-3" />
                {t({ zh: '所有者', en: 'Owner' })}
              </span>
            )}
          </div>
          {workspace.description && (
            <p className="text-sm text-slate-400">{workspace.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          {isOwner && (
            <>
              <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
                <Edit className="h-4 w-4" />
              </button>
              <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
                <Settings className="h-4 w-4" />
              </button>
            </>
          )}
          <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-6 text-sm text-slate-400">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          <span>
            {workspace.memberCount} {t({ zh: '成员', en: 'members' })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          <span>{t({ zh: '创建于', en: 'Created' })} {new Date(workspace.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      {isOwner && (
        <div className="mt-4 pt-4 border-t border-slate-700">
          <button className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-2 transition-colors">
            <UserPlus className="h-4 w-4" />
            {t({ zh: '邀请成员', en: 'Invite Members' })}
          </button>
        </div>
      )}
    </div>
  );
}

function InvitationCard({
  invitation,
  onAccept,
  onDecline,
}: {
  invitation: WorkspaceInvitation;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useLocalization();
  const daysLeft = Math.ceil(
    (new Date(invitation.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-700">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white mb-2">{invitation.workspaceName}</h3>
          <p className="text-sm text-slate-400 mb-3">
            {t({ zh: '邀请人', en: 'Invited by' })}: {invitation.inviterName}
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock className="h-3 w-3" />
            <span>
              {daysLeft > 0
                ? t({ zh: `${daysLeft} 天后过期`, en: `Expires in ${daysLeft} days` })
                : t({ zh: '已过期', en: 'Expired' })}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onAccept}
            disabled={daysLeft <= 0}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 transition-colors"
          >
            <Check className="h-4 w-4" />
            {t({ zh: '接受', en: 'Accept' })}
          </button>
          <button
            onClick={onDecline}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2 transition-colors"
          >
            <X className="h-4 w-4" />
            {t({ zh: '拒绝', en: 'Decline' })}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="bg-slate-900/30 rounded-lg p-12 text-center">
      <Users className="h-16 w-16 text-slate-600 mx-auto mb-4" />
      <p className="text-slate-400 mb-4">{message}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
