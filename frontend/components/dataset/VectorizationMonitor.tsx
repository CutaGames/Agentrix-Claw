'use client';

import React, { useState, useEffect } from 'react';
import { Activity, CheckCircle, AlertCircle, XCircle, Clock } from 'lucide-react';
import { datasetApi, VectorizationProgress } from '../../lib/api/dataset.api';

export interface VectorizationMonitorProps {
  datasetId: string;
  onClose?: () => void;
}

export function VectorizationMonitor({ datasetId, onClose }: VectorizationMonitorProps) {
  const [progress, setProgress] = useState<VectorizationProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProgress();
    const interval = setInterval(loadProgress, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, [datasetId]);

  const loadProgress = async () => {
    try {
      const data = await datasetApi.getVectorizationProgress(datasetId);
      setProgress(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load vectorization progress:', error);
      setLoading(false);
    }
  };

  if (loading || !progress) {
    return (
      <div className="bg-slate-900/50 rounded-lg p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const percentage =
    progress.totalRows > 0 ? (progress.processedRows / progress.totalRows) * 100 : 0;

  const statusConfig = {
    pending: {
      icon: Clock,
      color: 'text-slate-400',
      bgColor: 'bg-slate-500/20',
      label: 'Pending',
    },
    indexing: {
      icon: Activity,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/20',
      label: 'Indexing',
    },
    completed: {
      icon: CheckCircle,
      color: 'text-green-400',
      bgColor: 'bg-green-500/20',
      label: 'Completed',
    },
    failed: {
      icon: XCircle,
      color: 'text-red-400',
      bgColor: 'bg-red-500/20',
      label: 'Failed',
    },
  };

  const config = statusConfig[progress.status];
  const Icon = config.icon;

  const healthColors = {
    good: 'text-green-400',
    degraded: 'text-yellow-400',
    poor: 'text-red-400',
  };

  return (
    <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-lg ${config.bgColor}`}>
            <Icon className={`h-6 w-6 ${config.color} ${progress.status === 'indexing' ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Vectorization Status</h3>
            <p className="text-sm text-slate-400">{config.label}</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <XCircle className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Progress Bar */}
      {progress.status === 'indexing' && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-slate-400">
              {progress.processedRows.toLocaleString()} / {progress.totalRows.toLocaleString()} rows
            </span>
            <span className="text-white font-medium">{percentage.toFixed(1)}%</span>
          </div>
          <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatBox
          label="Total Rows"
          value={progress.totalRows.toLocaleString()}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatBox
          label="Processed"
          value={progress.processedRows.toLocaleString()}
          icon={<CheckCircle className="h-4 w-4" />}
        />
        <StatBox
          label="Vector Dims"
          value={progress.vectorDimensions.toString()}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatBox
          label="Time Left"
          value={formatTime(progress.estimatedTimeRemaining)}
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Quality Metrics */}
      <div className="bg-slate-800/50 rounded-lg p-4">
        <div className="text-sm font-medium text-slate-300 mb-3">Quality Metrics</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Embedding Coverage</span>
            <span className="text-sm font-medium text-white">
              {(progress.quality.embeddingCoverage * 100).toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Index Health</span>
            <span className={`text-sm font-medium ${healthColors[progress.quality.indexHealth]}`}>
              {progress.quality.indexHealth.toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800/50 rounded-lg p-3">
      <div className="flex items-center gap-2 text-slate-400 mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-lg font-bold text-white">{value}</div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (seconds === 0) return '--';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
