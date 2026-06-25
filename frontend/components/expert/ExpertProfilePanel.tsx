'use client';

import React, { useState, useEffect } from 'react';
import {
  Award,
  Briefcase,
  CheckCircle,
  Clock,
  DollarSign,
  Edit,
  Star,
  TrendingUp,
  Users,
  AlertCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import { useLocalization } from '../../contexts/LocalizationContext';
import {
  expertProfileApi,
  ExpertProfile,
  CapabilityCard,
  SLAMetrics,
  CreateCapabilityCardRequest,
} from '../../lib/api/expert-profile.api';

export function ExpertProfilePanel() {
  const { t } = useLocalization();
  const [profile, setProfile] = useState<ExpertProfile | null>(null);
  const [slaMetrics, setSlaMetrics] = useState<SLAMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const data = await expertProfileApi.getMy();
      setProfile(data);
      if (data) {
        const metrics = await expertProfileApi.getSLAMetrics(data.id);
        setSlaMetrics(metrics);
      }
    } catch (error) {
      console.error('Failed to load expert profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCapabilityCard = async (data: CreateCapabilityCardRequest) => {
    if (!profile) return;
    try {
      await expertProfileApi.addCapabilityCard(profile.id, data);
      await loadProfile();
      setShowAddCard(false);
    } catch (error) {
      console.error('Failed to add capability card:', error);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!profile) return;
    if (!confirm(t({ zh: '确定删除此能力卡？', en: 'Delete this capability card?' }))) return;
    try {
      await expertProfileApi.deleteCapabilityCard(profile.id, cardId);
      await loadProfile();
    } catch (error) {
      console.error('Failed to delete capability card:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="bg-slate-900/50 rounded-lg p-8 text-center">
        <Award className="h-16 w-16 text-slate-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">
          {t({ zh: '创建专家档案', en: 'Create Expert Profile' })}
        </h3>
        <p className="text-slate-400 mb-6">
          {t({ zh: '作为行业专家，您可以提供咨询服务并获得收益', en: 'As an expert, provide consulting services and earn revenue' })}
        </p>
        <button
          onClick={() => setEditing(true)}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          {t({ zh: '开始创建', en: 'Get Started' })}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center">
              <Award className="h-10 w-10 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-white">{profile.displayName}</h2>
                {profile.isVerified && (
                  <CheckCircle className="h-6 w-6 text-green-400" />
                )}
              </div>
              <p className="text-blue-100">{profile.title}</p>
              <p className="text-sm text-blue-200 mt-1">
                {profile.yearsOfExperience} {t({ zh: '年经验', en: 'years experience' })} · {profile.specialty}
              </p>
            </div>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg flex items-center gap-2 transition-colors"
          >
            <Edit className="h-4 w-4" />
            {t({ zh: '编辑', en: 'Edit' })}
          </button>
        </div>
      </div>

      {/* SLA Metrics */}
      {slaMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SLAMetricCard
            icon={<Clock className="h-6 w-6" />}
            label={t({ zh: '平均响应时间', en: 'Avg Response Time' })}
            value={`${slaMetrics.avgResponseTime.toFixed(1)}h`}
            threshold={profile.slaConfig.maxResponseTime}
            thresholdLabel={`SLA: ${profile.slaConfig.maxResponseTime}h`}
            status={slaMetrics.avgResponseTime <= profile.slaConfig.maxResponseTime ? 'good' : 'warning'}
          />
          <SLAMetricCard
            icon={<CheckCircle className="h-6 w-6" />}
            label={t({ zh: '成功率', en: 'Success Rate' })}
            value={`${slaMetrics.successRate.toFixed(1)}%`}
            threshold={profile.slaConfig.minSuccessRate}
            thresholdLabel={`SLA: ${profile.slaConfig.minSuccessRate}%`}
            status={slaMetrics.successRate >= profile.slaConfig.minSuccessRate ? 'good' : 'warning'}
          />
          <SLAMetricCard
            icon={<Star className="h-6 w-6" />}
            label={t({ zh: '满意度', en: 'Satisfaction' })}
            value={`${slaMetrics.satisfactionScore.toFixed(1)}/5`}
            threshold={profile.slaConfig.minSatisfactionScore}
            thresholdLabel={`SLA: ${profile.slaConfig.minSatisfactionScore}/5`}
            status={slaMetrics.satisfactionScore >= profile.slaConfig.minSatisfactionScore ? 'good' : 'warning'}
          />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label={t({ zh: '总咨询数', en: 'Total Consultations' })}
          value={slaMetrics?.totalConsultations || 0}
        />
        <StatCard
          icon={<CheckCircle className="h-5 w-5" />}
          label={t({ zh: '已完成', en: 'Completed' })}
          value={slaMetrics?.completedConsultations || 0}
        />
        <StatCard
          icon={<DollarSign className="h-5 w-5" />}
          label={t({ zh: '总收益', en: 'Total Earnings' })}
          value={`$${profile.totalEarnings.toFixed(2)}`}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label={t({ zh: '待结算', en: 'Pending' })}
          value={`$${profile.pendingEarnings.toFixed(2)}`}
        />
      </div>

      {/* Capability Cards */}
      <div className="bg-slate-900/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            {t({ zh: '能力卡片', en: 'Capability Cards' })}
          </h3>
          <button
            onClick={() => setShowAddCard(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t({ zh: '添加卡片', en: 'Add Card' })}
          </button>
        </div>

        {profile.capabilityCards.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            {t({ zh: '暂无能力卡片', en: 'No capability cards yet' })}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profile.capabilityCards.map((card) => (
              <CapabilityCardItem
                key={card.id}
                card={card}
                onDelete={() => handleDeleteCard(card.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SLAMetricCard({
  icon,
  label,
  value,
  threshold,
  thresholdLabel,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  threshold: number;
  thresholdLabel: string;
  status: 'good' | 'warning' | 'critical';
}) {
  const statusColors = {
    good: 'from-green-500 to-emerald-500',
    warning: 'from-yellow-500 to-orange-500',
    critical: 'from-red-500 to-pink-500',
  };

  return (
    <div className="bg-slate-900/50 rounded-lg p-4">
      <div className={`inline-flex p-3 rounded-lg bg-gradient-to-br ${statusColors[status]} mb-3`}>
        {icon}
      </div>
      <div className="text-sm text-slate-400 mb-1">{label}</div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className="text-xs text-slate-500">{thresholdLabel}</div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-slate-900/50 rounded-lg p-4">
      <div className="flex items-center gap-2 text-slate-400 mb-2">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function CapabilityCardItem({
  card,
  onDelete,
}: {
  card: CapabilityCard;
  onDelete: () => void;
}) {
  const { t } = useLocalization();

  return (
    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-semibold text-white mb-1">{card.name}</h4>
          <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">
            {card.category}
          </span>
        </div>
        <button
          onClick={onDelete}
          className="text-slate-400 hover:text-red-400 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <p className="text-sm text-slate-300 mb-3">{card.description}</p>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">
          <Clock className="h-4 w-4 inline mr-1" />
          {card.estimatedTime}
        </span>
        <span className="text-green-400 font-semibold">
          {card.basePrice} {card.currency}
        </span>
      </div>
    </div>
  );
}
