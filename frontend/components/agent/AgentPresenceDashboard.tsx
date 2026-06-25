'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  MessageSquare,
  Shield,
  Wifi,
  WifiOff,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  Monitor,
  Smartphone,
  Watch,
  Globe,
  Send,
  Eye,
  Users,
  Activity,
  BarChart3,
  Loader2,
} from 'lucide-react';
import {
  agentPresenceApi,
  type AgentPresence,
  type ConversationEvent,
  type ChannelHealth,
  type TimelineStats,
  type DeviceInfo,
} from '@/lib/api/agent-presence.api';

// ── Sub-components ───────────────────────────────────────────────────────────

function ChannelIcon({ platform }: { platform: string }) {
  const icons: Record<string, string> = {
    telegram: '✈️',
    discord: '🎮',
    twitter: '🐦',
    slack: '💬',
    feishu: '🪶',
    wecom: '🏢',
    whatsapp: '📱',
    mobile: '📲',
    desktop: '🖥️',
    web: '🌐',
    wearable: '⌚',
  };
  return <span className="text-base">{icons[platform] || '📡'}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-500/20 text-green-400 border-green-500/30',
    inactive: 'bg-neutral-600/20 text-neutral-400 border-neutral-500/30',
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    approved: 'bg-green-500/20 text-green-400 border-green-500/30',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    delivered: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${colors[status] || colors.inactive}`}>
      {status}
    </span>
  );
}

function DelegationBadge({ level }: { level: string }) {
  const config: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    observer: { label: 'Observer', color: 'text-neutral-400', icon: <Eye className="w-3 h-3" /> },
    assistant: { label: 'Assistant', color: 'text-blue-400', icon: <Bot className="w-3 h-3" /> },
    representative: { label: 'Representative', color: 'text-purple-400', icon: <Send className="w-3 h-3" /> },
    autonomous: { label: 'Autonomous', color: 'text-green-400', icon: <Activity className="w-3 h-3" /> },
  };
  const c = config[level] || config.observer;
  return (
    <span className={`flex items-center gap-1 text-xs ${c.color}`}>
      {c.icon} {c.label}
    </span>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

interface AgentPresenceDashboardProps {
  onNavigate?: (section: string, data?: any) => void;
}

export function AgentPresenceDashboard({ onNavigate }: AgentPresenceDashboardProps) {
  const [agents, setAgents] = useState<AgentPresence[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentPresence | null>(null);
  const [timeline, setTimeline] = useState<ConversationEvent[]>([]);
  const [timelineStats, setTimelineStats] = useState<TimelineStats | null>(null);
  const [channelHealth, setChannelHealth] = useState<ChannelHealth>({});
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ConversationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'timeline' | 'approvals' | 'channels' | 'devices'>('timeline');
  const [approvalText, setApprovalText] = useState<Record<string, string>>({});
  const [processingApproval, setProcessingApproval] = useState<string | null>(null);

  // ── Data Loading ──

  const loadData = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);

      const [agentList, health, deviceList] = await Promise.allSettled([
        agentPresenceApi.listAgents(),
        agentPresenceApi.getChannelHealth(),
        agentPresenceApi.getAllDevices(),
      ]);

      if (agentList.status === 'fulfilled') setAgents(agentList.value);
      if (health.status === 'fulfilled') setChannelHealth(health.value);
      if (deviceList.status === 'fulfilled') setDevices(deviceList.value);

      // Auto-select first agent
      if (agentList.status === 'fulfilled' && agentList.value.length > 0 && !selectedAgent) {
        setSelectedAgent(agentList.value[0]);
      }
    } catch (err) {
      console.error('Failed to load agent presence data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedAgent]);

  const loadAgentData = useCallback(async (agent: AgentPresence) => {
    try {
      const [tl, stats] = await Promise.allSettled([
        agentPresenceApi.getTimeline(agent.id, { limit: 50 }),
        agentPresenceApi.getTimelineStats(agent.id),
      ]);

      if (tl.status === 'fulfilled') {
        setTimeline(tl.value);
        setPendingApprovals(tl.value.filter(e => e.approvalStatus === 'pending'));
      }
      if (stats.status === 'fulfilled') setTimelineStats(stats.value);
    } catch (err) {
      console.error('Failed to load agent data:', err);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (selectedAgent) loadAgentData(selectedAgent);
  }, [selectedAgent, loadAgentData]);

  // ── Approval Actions ──

  const handleApprove = async (eventId: string) => {
    const text = approvalText[eventId];
    if (!text?.trim()) return;
    setProcessingApproval(eventId);
    try {
      await agentPresenceApi.approveReply(eventId, text);
      setPendingApprovals(prev => prev.filter(e => e.id !== eventId));
      if (selectedAgent) loadAgentData(selectedAgent);
    } catch (err) {
      console.error('Failed to approve:', err);
    } finally {
      setProcessingApproval(null);
    }
  };

  const handleReject = async (eventId: string) => {
    setProcessingApproval(eventId);
    try {
      await agentPresenceApi.rejectReply(eventId);
      setPendingApprovals(prev => prev.filter(e => e.id !== eventId));
      if (selectedAgent) loadAgentData(selectedAgent);
    } catch (err) {
      console.error('Failed to reject:', err);
    } finally {
      setProcessingApproval(null);
    }
  };

  // ── Render ──

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  const channelPlatforms = Object.keys(channelHealth);
  const connectedChannels = channelPlatforms.filter(p => channelHealth[p]?.connected);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bot className="w-6 h-6 text-blue-400" />
            Agent Presence
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Unified timeline, approvals & channel management
          </p>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm text-neutral-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-neutral-400 text-sm mb-1">
            <Bot className="w-4 h-4" /> Agents
          </div>
          <p className="text-2xl font-bold text-white">{agents.length}</p>
        </div>
        <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-neutral-400 text-sm mb-1">
            <MessageSquare className="w-4 h-4" /> Events
          </div>
          <p className="text-2xl font-bold text-white">{timelineStats?.totalEvents ?? 0}</p>
        </div>
        <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-neutral-400 text-sm mb-1">
            <Wifi className="w-4 h-4" /> Channels
          </div>
          <p className="text-2xl font-bold text-white">
            {connectedChannels.length}/{channelPlatforms.length}
          </p>
        </div>
        <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-neutral-400 text-sm mb-1">
            <AlertTriangle className="w-4 h-4" /> Pending
          </div>
          <p className="text-2xl font-bold text-yellow-400">{pendingApprovals.length}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Agent List (Left Sidebar) */}
        <div className="lg:col-span-1 bg-neutral-800/30 border border-neutral-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800">
            <h3 className="font-semibold text-sm text-neutral-300">My Agents</h3>
          </div>
          <div className="divide-y divide-neutral-800">
            {agents.length === 0 ? (
              <div className="p-4 text-center text-neutral-500 text-sm">
                No agents yet. Create one to get started.
              </div>
            ) : (
              agents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent)}
                  className={`w-full text-left px-4 py-3 transition-colors hover:bg-neutral-700/30 ${
                    selectedAgent?.id === agent.id ? 'bg-blue-500/10 border-l-2 border-blue-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-white truncate">{agent.name}</span>
                    <ChevronRight className="w-4 h-4 text-neutral-500 flex-shrink-0" />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <DelegationBadge level={agent.delegationLevel} />
                    <StatusBadge status={agent.status} />
                  </div>
                  {agent.channelBindings && agent.channelBindings.length > 0 && (
                    <div className="flex gap-1 mt-1.5">
                      {agent.channelBindings.map(b => (
                        <ChannelIcon key={b.platform} platform={b.platform} />
                      ))}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Main Panel (Right) */}
        <div className="lg:col-span-3 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-neutral-800/50 p-1 rounded-xl">
            {([
              { key: 'timeline', label: 'Timeline', icon: <Clock className="w-4 h-4" /> },
              { key: 'approvals', label: `Approvals (${pendingApprovals.length})`, icon: <Shield className="w-4 h-4" /> },
              { key: 'channels', label: 'Channels', icon: <Globe className="w-4 h-4" /> },
              { key: 'devices', label: 'Devices', icon: <Monitor className="w-4 h-4" /> },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 justify-center ${
                  activeTab === tab.key
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/50'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="bg-neutral-800/30 border border-neutral-800 rounded-2xl overflow-hidden min-h-[400px]">
            {activeTab === 'timeline' && (
              <TimelinePanel
                events={timeline}
                stats={timelineStats}
                agentName={selectedAgent?.name}
              />
            )}
            {activeTab === 'approvals' && (
              <ApprovalsPanel
                approvals={pendingApprovals}
                approvalText={approvalText}
                setApprovalText={setApprovalText}
                onApprove={handleApprove}
                onReject={handleReject}
                processingId={processingApproval}
              />
            )}
            {activeTab === 'channels' && (
              <ChannelsPanel health={channelHealth} />
            )}
            {activeTab === 'devices' && (
              <DevicesPanel devices={devices} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Timeline Panel ───────────────────────────────────────────────────────────

function TimelinePanel({
  events,
  stats,
  agentName,
}: {
  events: ConversationEvent[];
  stats: TimelineStats | null;
  agentName?: string;
}) {
  return (
    <div>
      {/* Stats Bar */}
      {stats && (
        <div className="px-5 py-3 border-b border-neutral-800 flex items-center gap-6 text-sm">
          <span className="text-neutral-400">
            <BarChart3 className="w-4 h-4 inline mr-1" />
            {stats.totalEvents} total events
          </span>
          {stats.lastEventAt && (
            <span className="text-neutral-500">
              Last: {new Date(stats.lastEventAt).toLocaleString()}
            </span>
          )}
          <div className="flex gap-2 ml-auto">
            {Object.entries(stats.channelBreakdown).map(([ch, count]) => (
              <span key={ch} className="flex items-center gap-1 text-xs text-neutral-400 bg-neutral-800 px-2 py-1 rounded">
                <ChannelIcon platform={ch} /> {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Event List */}
      <div className="divide-y divide-neutral-800/50 max-h-[500px] overflow-y-auto">
        {events.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No timeline events yet{agentName ? ` for ${agentName}` : ''}.</p>
          </div>
        ) : (
          events.map(event => (
            <div key={event.id} className="px-5 py-3 hover:bg-neutral-800/20 transition-colors">
              <div className="flex items-start gap-3">
                <div className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  event.direction === 'inbound'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-purple-500/20 text-purple-400'
                }`}>
                  {event.direction === 'inbound' ? '←' : '→'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <ChannelIcon platform={event.channel} />
                    <span className="text-xs text-neutral-400">{event.channel}</span>
                    <span className="text-xs text-neutral-500">•</span>
                    <span className="text-xs text-neutral-500">{event.role}</span>
                    {event.approvalStatus && <StatusBadge status={event.approvalStatus} />}
                    {event.externalSenderName && (
                      <span className="text-xs text-neutral-400">{event.externalSenderName}</span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-200 break-words">{event.content}</p>
                  <p className="text-xs text-neutral-600 mt-1">
                    {new Date(event.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Approvals Panel ──────────────────────────────────────────────────────────

function ApprovalsPanel({
  approvals,
  approvalText,
  setApprovalText,
  onApprove,
  onReject,
  processingId,
}: {
  approvals: ConversationEvent[];
  approvalText: Record<string, string>;
  setApprovalText: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  processingId: string | null;
}) {
  return (
    <div className="divide-y divide-neutral-800/50 max-h-[500px] overflow-y-auto">
      {approvals.length === 0 ? (
        <div className="p-8 text-center text-neutral-500">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No pending approvals. All caught up!</p>
        </div>
      ) : (
        approvals.map(event => (
          <div key={event.id} className="px-5 py-4">
            <div className="flex items-center gap-2 mb-2">
              <ChannelIcon platform={event.channel} />
              <span className="text-sm font-medium text-neutral-300">{event.channel}</span>
              {event.externalSenderName && (
                <span className="text-xs text-neutral-500">from {event.externalSenderName}</span>
              )}
              <span className="text-xs text-neutral-600 ml-auto">
                {new Date(event.createdAt).toLocaleString()}
              </span>
            </div>

            {/* Original message */}
            <div className="bg-neutral-800/50 rounded-lg p-3 mb-3">
              <p className="text-sm text-neutral-300">{event.content}</p>
            </div>

            {/* Reply input */}
            <textarea
              value={approvalText[event.id] || ''}
              onChange={e => setApprovalText(prev => ({ ...prev, [event.id]: e.target.value }))}
              placeholder="Edit reply before approving..."
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 resize-none focus:outline-none focus:border-blue-500/50"
              rows={2}
            />

            {/* Actions */}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => onApprove(event.id)}
                disabled={!approvalText[event.id]?.trim() || processingId === event.id}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:hover:bg-green-600 rounded-lg text-sm text-white transition-colors"
              >
                {processingId === event.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Approve & Send
              </button>
              <button
                onClick={() => onReject(event.id)}
                disabled={processingId === event.id}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600/20 hover:bg-red-600/40 rounded-lg text-sm text-red-400 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Channels Panel ───────────────────────────────────────────────────────────

function ChannelsPanel({ health }: { health: ChannelHealth }) {
  const platforms = Object.keys(health);

  return (
    <div className="p-5">
      {platforms.length === 0 ? (
        <div className="text-center text-neutral-500 py-8">
          <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No channel adapters registered.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {platforms.map(platform => {
            const h = health[platform];
            return (
              <div
                key={platform}
                className={`border rounded-xl p-4 transition-colors ${
                  h.connected
                    ? 'border-green-500/30 bg-green-500/5'
                    : 'border-red-500/30 bg-red-500/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <ChannelIcon platform={platform} />
                  <div className="flex-1">
                    <p className="font-medium text-sm text-white capitalize">{platform}</p>
                    <p className="text-xs text-neutral-400">
                      {h.connected ? 'Connected' : 'Disconnected'}
                    </p>
                  </div>
                  {h.connected ? (
                    <Wifi className="w-5 h-5 text-green-400" />
                  ) : (
                    <WifiOff className="w-5 h-5 text-red-400" />
                  )}
                </div>
                {h.details && (
                  <div className="mt-2 text-xs text-neutral-500">
                    {Object.entries(h.details).map(([k, v]) => (
                      <span key={k} className="mr-3">{k}: {String(v)}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Devices Panel ────────────────────────────────────────────────────────────

function DevicesPanel({ devices }: { devices: DeviceInfo[] }) {
  const deviceIcon = (type: string) => {
    switch (type) {
      case 'desktop': return <Monitor className="w-5 h-5" />;
      case 'mobile': return <Smartphone className="w-5 h-5" />;
      case 'wearable': return <Watch className="w-5 h-5" />;
      default: return <Globe className="w-5 h-5" />;
    }
  };

  return (
    <div className="p-5">
      {devices.length === 0 ? (
        <div className="text-center text-neutral-500 py-8">
          <Monitor className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No devices registered yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {devices.map(device => (
            <div
              key={device.id}
              className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                device.isOnline
                  ? 'border-green-500/20 bg-green-500/5'
                  : 'border-neutral-700 bg-neutral-800/30'
              }`}
            >
              <div className={`${device.isOnline ? 'text-green-400' : 'text-neutral-500'}`}>
                {deviceIcon(device.deviceType)}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">
                  {device.deviceName || device.deviceId}
                </p>
                <p className="text-xs text-neutral-500 capitalize">{device.deviceType}</p>
              </div>
              <div className="text-right">
                <div className={`flex items-center gap-1 text-xs ${
                  device.isOnline ? 'text-green-400' : 'text-neutral-500'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${device.isOnline ? 'bg-green-400' : 'bg-neutral-600'}`} />
                  {device.isOnline ? 'Online' : 'Offline'}
                </div>
                <p className="text-xs text-neutral-600 mt-0.5">
                  {new Date(device.lastSeen).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AgentPresenceDashboard;
