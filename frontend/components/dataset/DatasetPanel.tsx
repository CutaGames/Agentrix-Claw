'use client';

import React, { useState, useEffect } from 'react';
import {
  Database,
  Upload,
  Plus,
  Play,
  Pause,
  Trash2,
  Eye,
  Settings,
  FileText,
  Lock,
  DollarSign,
  Activity,
} from 'lucide-react';
import { useLocalization } from '../../contexts/LocalizationContext';
import {
  datasetApi,
  Dataset,
  DatasetStatus,
  VectorizationStatus,
  PrivacyLevel,
} from '../../lib/api/dataset.api';
import { VectorizationMonitor } from './VectorizationMonitor';
import { PrivacyFunnelSlider } from './PrivacyFunnelSlider';

export function DatasetPanel() {
  const { t } = useLocalization();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [showVectorizationModal, setShowVectorizationModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    try {
      setLoading(true);
      const response = await datasetApi.list({ limit: 50 });
      setDatasets(response.items);
    } catch (error) {
      console.error('Failed to load datasets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartVectorization = async (dataset: Dataset) => {
    setSelectedDataset(dataset);
    setShowVectorizationModal(true);
  };

  const handleUpdatePrivacy = async (dataset: Dataset) => {
    setSelectedDataset(dataset);
    setShowPrivacyModal(true);
  };

  const handleDeleteDataset = async (id: string) => {
    if (!confirm(t({ zh: '确定删除此数据集？', en: 'Delete this dataset?' }))) return;
    try {
      await datasetApi.delete(id);
      await loadDatasets();
    } catch (error) {
      console.error('Failed to delete dataset:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {t({ zh: '数据集管理', en: 'Dataset Management' })}
          </h2>
          <p className="text-slate-400 mt-1">
            {t({
              zh: '管理您的数据资产，支持向量化和隐私保护',
              en: 'Manage your data assets with vectorization and privacy protection',
            })}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t({ zh: '导入数据', en: 'Import Data' })}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label={t({ zh: '总数据集', en: 'Total Datasets' })}
          value={datasets.length}
          icon={<Database className="h-5 w-5" />}
        />
        <StatCard
          label={t({ zh: '已向量化', en: 'Vectorized' })}
          value={datasets.filter((d) => d.vectorizationStatus === 'completed').length}
          icon={<Activity className="h-5 w-5" />}
        />
        <StatCard
          label={t({ zh: '总行数', en: 'Total Rows' })}
          value={datasets.reduce((sum, d) => sum + d.totalRows, 0).toLocaleString()}
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard
          label={t({ zh: '总查询', en: 'Total Queries' })}
          value="0"
          icon={<Eye className="h-5 w-5" />}
        />
      </div>

      {/* Dataset List */}
      <div className="space-y-4">
        {datasets.length === 0 ? (
          <div className="bg-slate-900/30 rounded-lg p-12 text-center">
            <Database className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 mb-4">
              {t({ zh: '暂无数据集', en: 'No datasets yet' })}
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              {t({ zh: '导入第一个数据集', en: 'Import First Dataset' })}
            </button>
          </div>
        ) : (
          datasets.map((dataset) => (
            <DatasetCard
              key={dataset.id}
              dataset={dataset}
              onStartVectorization={() => handleStartVectorization(dataset)}
              onUpdatePrivacy={() => handleUpdatePrivacy(dataset)}
              onDelete={() => handleDeleteDataset(dataset.id)}
            />
          ))
        )}
      </div>

      {/* Modals */}
      {showVectorizationModal && selectedDataset && (
        <VectorizationMonitor
          datasetId={selectedDataset.id}
          onClose={() => setShowVectorizationModal(false)}
        />
      )}

      {showPrivacyModal && selectedDataset && (
        <PrivacyModal
          dataset={selectedDataset}
          onClose={() => setShowPrivacyModal(false)}
          onSave={async () => {
            await loadDatasets();
            setShowPrivacyModal(false);
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900/50 rounded-lg p-4">
      <div className="flex items-center gap-2 text-slate-400 mb-2">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function DatasetCard({
  dataset,
  onStartVectorization,
  onUpdatePrivacy,
  onDelete,
}: {
  dataset: Dataset;
  onStartVectorization: () => void;
  onUpdatePrivacy: () => void;
  onDelete: () => void;
}) {
  const { t } = useLocalization();

  const statusColors: Record<DatasetStatus, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400',
    processing: 'bg-blue-500/20 text-blue-400',
    ready: 'bg-green-500/20 text-green-400',
    failed: 'bg-red-500/20 text-red-400',
    archived: 'bg-slate-500/20 text-slate-400',
  };

  const vectorizationColors: Record<VectorizationStatus, string> = {
    pending: 'text-slate-400',
    indexing: 'text-blue-400',
    completed: 'text-green-400',
    failed: 'text-red-400',
  };

  return (
    <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-700">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-white">{dataset.name}</h3>
            <span className={`px-2 py-1 text-xs rounded-full ${statusColors[dataset.status]}`}>
              {dataset.status}
            </span>
          </div>
          {dataset.description && (
            <p className="text-sm text-slate-400 mb-3">{dataset.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onUpdatePrivacy}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title={t({ zh: '隐私设置', en: 'Privacy Settings' })}
          >
            <Lock className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
            title={t({ zh: '删除', en: 'Delete' })}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="text-sm">
          <div className="text-slate-500 mb-1">{t({ zh: '数据类型', en: 'Type' })}</div>
          <div className="text-white font-medium uppercase">{dataset.dataType}</div>
        </div>
        <div className="text-sm">
          <div className="text-slate-500 mb-1">{t({ zh: '行数', en: 'Rows' })}</div>
          <div className="text-white font-medium">{dataset.totalRows.toLocaleString()}</div>
        </div>
        <div className="text-sm">
          <div className="text-slate-500 mb-1">{t({ zh: '向量化', en: 'Vectorization' })}</div>
          <div className={`font-medium ${vectorizationColors[dataset.vectorizationStatus]}`}>
            {dataset.vectorizationStatus}
          </div>
        </div>
        <div className="text-sm">
          <div className="text-slate-500 mb-1">{t({ zh: '隐私级别', en: 'Privacy' })}</div>
          <div className="text-white font-medium">L{dataset.privacyLevel}</div>
        </div>
      </div>

      {/* Progress Bar for Processing */}
      {dataset.status === 'processing' && dataset.totalRows > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-slate-400">{t({ zh: '处理进度', en: 'Progress' })}</span>
            <span className="text-white">
              {Math.round((dataset.processedRows / dataset.totalRows) * 100)}%
            </span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${(dataset.processedRows / dataset.totalRows) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-4 border-t border-slate-700">
        {dataset.vectorizationStatus === 'pending' && (
          <button
            onClick={onStartVectorization}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 text-sm transition-colors"
          >
            <Play className="h-4 w-4" />
            {t({ zh: '开始向量化', en: 'Start Vectorization' })}
          </button>
        )}
        {dataset.vectorizationStatus === 'indexing' && (
          <button className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg flex items-center gap-2 text-sm cursor-not-allowed">
            <Activity className="h-4 w-4 animate-pulse" />
            {t({ zh: '向量化中...', en: 'Indexing...' })}
          </button>
        )}
        {dataset.pricingModel !== 'free' && (
          <div className="flex items-center gap-2 text-sm text-slate-400 ml-auto">
            <DollarSign className="h-4 w-4" />
            <span>
              {dataset.pricingModel === 'per_query'
                ? `${dataset.pricePerQuery} ${dataset.currency}/query`
                : `${dataset.pricePerRow} ${dataset.currency}/row`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function PrivacyModal({
  dataset,
  onClose,
  onSave,
}: {
  dataset: Dataset;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useLocalization();
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>(dataset.privacyLevel);
  const [preview, setPreview] = useState<{ before: any[]; after: any[] } | null>(null);

  useEffect(() => {
    loadPreview();
  }, [privacyLevel]);

  const loadPreview = async () => {
    try {
      const data = await datasetApi.getPrivacyPreview(dataset.id, privacyLevel);
      setPreview(data);
    } catch (error) {
      console.error('Failed to load privacy preview:', error);
    }
  };

  const handleSave = async () => {
    try {
      await datasetApi.updatePrivacy(dataset.id, privacyLevel);
      onSave();
    } catch (error) {
      console.error('Failed to update privacy:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg max-w-2xl w-full p-6">
        <h3 className="text-xl font-bold text-white mb-4">
          {t({ zh: '隐私设置', en: 'Privacy Settings' })}
        </h3>

        <PrivacyFunnelSlider
          level={privacyLevel}
          onChange={setPrivacyLevel}
          preview={preview || { before: '', after: '' }}
        />

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            {t({ zh: '保存', en: 'Save' })}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            {t({ zh: '取消', en: 'Cancel' })}
          </button>
        </div>
      </div>
    </div>
  );
}
