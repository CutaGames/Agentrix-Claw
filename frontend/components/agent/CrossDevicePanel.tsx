'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Monitor,
  Smartphone,
  Watch,
  Globe,
  Wifi,
  WifiOff,
  RefreshCw,
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Laptop,
  Tablet,
  Send,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { agentPresenceApi, type DeviceInfo, type UnifiedDevice, type AgentPresence, type DeviceStats } from '@/lib/api/agent-presence.api';

// ── Types ────────────────────────────────────────────────────────────────────

interface HandoffRecord {
  id: string;
  agentId: string;
  sessionId?: string;
  sourceDeviceId: string;
  sourceDeviceType?: string;
  targetDeviceId?: string;
  targetDeviceType?: string;
  status: 'initiated' | 'accepted' | 'rejected' | 'completed' | 'expired';
  contextSnapshot?: any;
  createdAt: string;
  expiresAt?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function DeviceIcon({ type, className = 'w-5 h-5' }: { type: string; className?: string }) {
  switch (type) {
    case 'desktop': return <Monitor className={className} />;
    case 'laptop': return <Laptop className={className} />;
    case 'mobile': return <Smartphone className={className} />;
    case 'tablet': return <Tablet className={className} />;
    case 'wearable': return <Watch className={className} />;
    default: return <Globe className={className} />;
  }
}

function HandoffStatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    initiated: { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: 'Pending' },
    accepted: { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Accepted' },
    completed: { color: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'Completed' },
    rejected: { color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Rejected' },
    expired: { color: 'bg-neutral-600/20 text-neutral-400 border-neutral-500/30', label: 'Expired' },
  };
  const c = config[status] || config.expired;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${c.color}`}>
      {c.label}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Main Component ───────────────────────────────────────────────────────────

interface CrossDevicePanelProps {
  onNavigate?: (section: string, data?: any) => void;
}

export function CrossDevicePanel({ onNavigate }: CrossDevicePanelProps) {
  const [devices, setDevices] = useState<UnifiedDevice[]>([]);
  const [agents, setAgents] = useState<AgentPresence[]>([]);
  const [stats, setStats] = useState<DeviceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'devices' | 'handoff'>('devices');

  // Handoff form state
  const [showHandoffForm, setShowHandoffForm] = useState(false);
  const [handoffAgent, setHandoffAgent] = useState('');
  const [handoffSource, setHandoffSource] = useState('');
  const [handoffTarget, setHandoffTarget] = useState('');
  const [submittingHandoff, setSubmittingHandoff] = useState(false);

  // ── Data Loading ──

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [deviceResult, agentResult, statsResult] = await Promise.allSettled([
        agentPresenceApi.getUnifiedDevices(),
        agentPresenceApi.listAgents(),
        agentPresenceApi.getDeviceStats(),
      ]);

      if (deviceResult.status === 'fulfilled') setDevices(deviceResult.value);
      if (agentResult.status === 'fulfilled') setAgents(agentResult.value);
      if (statsResult.status === 'fulfilled') setStats(statsResult.value);
    } catch (err) {
      console.error('Failed to load cross-device data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Handoff Actions ──

  const handleInitiateHandoff = async () => {
    if (!handoffAgent || !handoffSource) return;
    setSubmittingHandoff(true);
    try {
      await agentPresenceApi.initiateHandoff({
        agentId: handoffAgent,
        sourceDeviceId: handoffSource,
        targetDeviceId: handoffTarget || undefined,
      });
      setShowHandoffForm(false);
      setHandoffAgent('');
      setHandoffSource('');
      setHandoffTarget('');
      loadData(true);
    } catch (err) {
      console.error('Failed to initiate handoff:', err);
    } finally {
      setSubmittingHandoff(false);
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

  const onlineDevices = devices.filter(d => d.isOnline);
  const offlineDevices = devices.filter(d => !d.isOnline);
  const presenceCount = devices.filter(d => d.source === 'agent-presence').length;
  const desktopCount = devices.filter(d => d.source === 'desktop-sync').length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ArrowRightLeft className="w-6 h-6 text-purple-400" />
            Cross-Device Management
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Unified view across agent-presence &amp; desktop-sync
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHandoffForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm text-white transition-colors"
          >
            <Send className="w-4 h-4" /> New Handoff
          </button>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm text-neutral-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-neutral-400 text-sm mb-1">
            <Monitor className="w-4 h-4" /> Total
          </div>
          <p className="text-2xl font-bold text-white">{stats?.total ?? devices.length}</p>
        </div>
        <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-400 text-sm mb-1">
            <Wifi className="w-4 h-4" /> Online
          </div>
          <p className="text-2xl font-bold text-green-400">{stats?.online ?? onlineDevices.length}</p>
        </div>
        <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-neutral-400 text-sm mb-1">
            <WifiOff className="w-4 h-4" /> Offline
          </div>
          <p className="text-2xl font-bold text-neutral-400">{stats?.offline ?? offlineDevices.length}</p>
        </div>
        <div className="bg-neutral-800/50 border border-blue-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-400 text-sm mb-1">
            <Globe className="w-4 h-4" /> Presence
          </div>
          <p className="text-2xl font-bold text-blue-400">{presenceCount}</p>
        </div>
        <div className="bg-neutral-800/50 border border-purple-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 text-purple-400 text-sm mb-1">
            <Monitor className="w-4 h-4" /> Desktop
          </div>
          <p className="text-2xl font-bold text-purple-400">{desktopCount}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-800/50 p-1 rounded-xl">
        {([
          { key: 'devices' as const, label: 'Devices', icon: <Monitor className="w-4 h-4" /> },
          { key: 'handoff' as const, label: 'Session Handoff', icon: <ArrowRightLeft className="w-4 h-4" /> },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 justify-center ${
              activeTab === tab.key
                ? 'bg-purple-500/20 text-purple-400'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/50'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'devices' && (
        <DeviceListSection
          onlineDevices={onlineDevices}
          offlineDevices={offlineDevices}
        />
      )}

      {activeTab === 'handoff' && (
        <HandoffSection
          agents={agents}
          devices={devices}
          showForm={showHandoffForm}
          onShowForm={() => setShowHandoffForm(true)}
          onHideForm={() => setShowHandoffForm(false)}
          handoffAgent={handoffAgent}
          setHandoffAgent={setHandoffAgent}
          handoffSource={handoffSource}
          setHandoffSource={setHandoffSource}
          handoffTarget={handoffTarget}
          setHandoffTarget={setHandoffTarget}
          submitting={submittingHandoff}
          onSubmit={handleInitiateHandoff}
        />
      )}

      {/* Handoff Form Modal */}
      {showHandoffForm && activeTab !== 'handoff' && (
        <HandoffFormModal
          agents={agents}
          devices={devices}
          handoffAgent={handoffAgent}
          setHandoffAgent={setHandoffAgent}
          handoffSource={handoffSource}
          setHandoffSource={setHandoffSource}
          handoffTarget={handoffTarget}
          setHandoffTarget={setHandoffTarget}
          submitting={submittingHandoff}
          onSubmit={handleInitiateHandoff}
          onClose={() => setShowHandoffForm(false)}
        />
      )}
    </div>
  );
}

// ── Device List Section ──────────────────────────────────────────────────────

function DeviceListSection({
  onlineDevices,
  offlineDevices,
}: {
  onlineDevices: UnifiedDevice[];
  offlineDevices: UnifiedDevice[];
}) {
  return (
    <div className="space-y-6">
      {/* Online Devices */}
      <div>
        <h3 className="text-sm font-semibold text-green-400 mb-3 flex items-center gap-2">
          <Wifi className="w-4 h-4" /> Online ({onlineDevices.length})
        </h3>
        {onlineDevices.length === 0 ? (
          <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl p-6 text-center text-neutral-500 text-sm">
            No devices currently online.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {onlineDevices.map(device => (
              <DeviceCard key={device.id} device={device} />
            ))}
          </div>
        )}
      </div>

      {/* Offline Devices */}
      {offlineDevices.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-400 mb-3 flex items-center gap-2">
            <WifiOff className="w-4 h-4" /> Offline ({offlineDevices.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {offlineDevices.map(device => (
              <DeviceCard key={device.id} device={device} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const isDesktop = source === 'desktop-sync';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
      isDesktop
        ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
        : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    }`}>
      {isDesktop ? 'Desktop' : 'Presence'}
    </span>
  );
}

function DeviceCard({ device }: { device: UnifiedDevice }) {
  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
        device.isOnline
          ? 'border-green-500/20 bg-green-500/5 hover:bg-green-500/10'
          : 'border-neutral-700 bg-neutral-800/30 hover:bg-neutral-800/50'
      }`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
        device.isOnline
          ? 'bg-green-500/20 text-green-400'
          : 'bg-neutral-700/50 text-neutral-500'
      }`}>
        <DeviceIcon type={device.deviceType} className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm text-white truncate">
            {device.deviceName || device.deviceId}
          </p>
          <SourceBadge source={device.source} />
        </div>
        <p className="text-xs text-neutral-500 capitalize">
          {device.deviceType}{device.platform ? ` · ${device.platform}` : ''}
          {device.appVersion ? ` v${device.appVersion}` : ''}
        </p>
        <p className="text-xs text-neutral-600 mt-0.5">
          Last seen: {timeAgo(device.lastSeen)}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className={`flex items-center gap-1.5 text-xs ${
          device.isOnline ? 'text-green-400' : 'text-neutral-500'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            device.isOnline ? 'bg-green-400 animate-pulse' : 'bg-neutral-600'
          }`} />
          {device.isOnline ? 'Online' : 'Offline'}
        </div>
      </div>
    </div>
  );
}

// ── Handoff Section ──────────────────────────────────────────────────────────

function HandoffSection({
  agents,
  devices,
  showForm,
  onShowForm,
  onHideForm,
  handoffAgent,
  setHandoffAgent,
  handoffSource,
  setHandoffSource,
  handoffTarget,
  setHandoffTarget,
  submitting,
  onSubmit,
}: {
  agents: AgentPresence[];
  devices: DeviceInfo[];
  showForm: boolean;
  onShowForm: () => void;
  onHideForm: () => void;
  handoffAgent: string;
  setHandoffAgent: (v: string) => void;
  handoffSource: string;
  setHandoffSource: (v: string) => void;
  handoffTarget: string;
  setHandoffTarget: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const onlineDevices = devices.filter(d => d.isOnline);

  return (
    <div className="space-y-6">
      {/* Handoff Form */}
      <div className="bg-neutral-800/30 border border-neutral-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Send className="w-4 h-4 text-purple-400" /> Initiate Session Handoff
          </h3>
        </div>

        <p className="text-sm text-neutral-400 mb-4">
          Transfer an active agent session from one device to another. The target device will receive a notification to accept.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Agent */}
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Agent</label>
            <select
              value={handoffAgent}
              onChange={e => setHandoffAgent(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
            >
              <option value="">Select agent...</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Source Device */}
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">From Device</label>
            <select
              value={handoffSource}
              onChange={e => setHandoffSource(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
            >
              <option value="">Select source...</option>
              {devices.map(d => (
                <option key={d.id} value={d.deviceId}>
                  {d.deviceName || d.deviceId} ({d.deviceType})
                  {d.isOnline ? ' - Online' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Target Device */}
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">To Device (optional)</label>
            <select
              value={handoffTarget}
              onChange={e => setHandoffTarget(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
            >
              <option value="">Broadcast to all...</option>
              {onlineDevices
                .filter(d => d.deviceId !== handoffSource)
                .map(d => (
                  <option key={d.id} value={d.deviceId}>
                    {d.deviceName || d.deviceId} ({d.deviceType})
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onSubmit}
            disabled={!handoffAgent || !handoffSource || submitting}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:hover:bg-purple-600 rounded-lg text-sm text-white transition-colors"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRightLeft className="w-4 h-4" />
            )}
            Initiate Handoff
          </button>
          {!handoffAgent && handoffSource && (
            <span className="text-xs text-yellow-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Select an agent to continue
            </span>
          )}
        </div>
      </div>

      {/* How It Works */}
      <div className="bg-neutral-800/30 border border-neutral-800 rounded-2xl p-6">
        <h3 className="font-semibold text-white mb-4">How Session Handoff Works</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { step: '1', title: 'Initiate', desc: 'Select agent & source device to start handoff', icon: <Send className="w-5 h-5" /> },
            { step: '2', title: 'Notify', desc: 'Target device(s) receive the handoff request', icon: <Smartphone className="w-5 h-5" /> },
            { step: '3', title: 'Accept', desc: 'Target device accepts and receives session context', icon: <CheckCircle2 className="w-5 h-5" /> },
            { step: '4', title: 'Continue', desc: 'Resume conversation seamlessly on new device', icon: <ArrowRightLeft className="w-5 h-5" /> },
          ].map(s => (
            <div key={s.step} className="text-center">
              <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center">
                {s.icon}
              </div>
              <p className="text-sm font-medium text-white">{s.title}</p>
              <p className="text-xs text-neutral-500 mt-1">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Handoff Form Modal ───────────────────────────────────────────────────────

function HandoffFormModal({
  agents,
  devices,
  handoffAgent,
  setHandoffAgent,
  handoffSource,
  setHandoffSource,
  handoffTarget,
  setHandoffTarget,
  submitting,
  onSubmit,
  onClose,
}: {
  agents: AgentPresence[];
  devices: DeviceInfo[];
  handoffAgent: string;
  setHandoffAgent: (v: string) => void;
  handoffSource: string;
  setHandoffSource: (v: string) => void;
  handoffTarget: string;
  setHandoffTarget: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const onlineDevices = devices.filter(d => d.isOnline);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 w-full max-w-lg mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-purple-400" /> New Session Handoff
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Agent</label>
            <select
              value={handoffAgent}
              onChange={e => setHandoffAgent(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
            >
              <option value="">Select agent...</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-neutral-500 mb-1 block">From Device</label>
            <select
              value={handoffSource}
              onChange={e => setHandoffSource(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
            >
              <option value="">Select source...</option>
              {devices.map(d => (
                <option key={d.id} value={d.deviceId}>
                  {d.deviceName || d.deviceId} ({d.deviceType})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-neutral-500 mb-1 block">To Device (optional - leave blank to broadcast)</label>
            <select
              value={handoffTarget}
              onChange={e => setHandoffTarget(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
            >
              <option value="">Broadcast to all online devices</option>
              {onlineDevices
                .filter(d => d.deviceId !== handoffSource)
                .map(d => (
                  <option key={d.id} value={d.deviceId}>
                    {d.deviceName || d.deviceId} ({d.deviceType})
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm text-neutral-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!handoffAgent || !handoffSource || submitting}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Initiate
          </button>
        </div>
      </div>
    </div>
  );
}

export default CrossDevicePanel;
