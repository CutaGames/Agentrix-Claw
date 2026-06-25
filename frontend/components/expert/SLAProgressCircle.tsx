'use client';

import React from 'react';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

export interface SLAProgressCircleProps {
  metrics: {
    avgResponseTime: number; // hours
    successRate: number; // 0-100%
    satisfactionScore: number; // 0-5
  };
  thresholds: {
    responseTimeMax: number; // hours
    successRateMin: number; // %
    satisfactionMin: number; // 0-5
  };
}

export function SLAProgressCircle({ metrics, thresholds }: SLAProgressCircleProps) {
  const getStatus = (value: number, threshold: number, isInverted: boolean = false): 'good' | 'warning' | 'critical' => {
    const comparison = isInverted ? value <= threshold : value >= threshold;
    if (comparison) return 'good';
    
    const diff = isInverted 
      ? ((value - threshold) / threshold) * 100
      : ((threshold - value) / threshold) * 100;
    
    return diff > 20 ? 'critical' : 'warning';
  };

  const responseStatus = getStatus(metrics.avgResponseTime, thresholds.responseTimeMax, true);
  const successStatus = getStatus(metrics.successRate, thresholds.successRateMin);
  const satisfactionStatus = getStatus(metrics.satisfactionScore, thresholds.satisfactionMin);

  return (
    <div className="grid grid-cols-3 gap-6">
      <MetricCircle
        label="Response Time"
        value={`${metrics.avgResponseTime.toFixed(1)}h`}
        threshold={`SLA: ${thresholds.responseTimeMax}h`}
        percentage={(1 - metrics.avgResponseTime / (thresholds.responseTimeMax * 2)) * 100}
        status={responseStatus}
      />
      <MetricCircle
        label="Success Rate"
        value={`${metrics.successRate.toFixed(1)}%`}
        threshold={`SLA: ${thresholds.successRateMin}%`}
        percentage={metrics.successRate}
        status={successStatus}
      />
      <MetricCircle
        label="Satisfaction"
        value={`${metrics.satisfactionScore.toFixed(1)}/5`}
        threshold={`SLA: ${thresholds.satisfactionMin}/5`}
        percentage={(metrics.satisfactionScore / 5) * 100}
        status={satisfactionStatus}
      />
    </div>
  );
}

function MetricCircle({
  label,
  value,
  threshold,
  percentage,
  status,
}: {
  label: string;
  value: string;
  threshold: string;
  percentage: number;
  status: 'good' | 'warning' | 'critical';
}) {
  const statusColors = {
    good: { stroke: '#10b981', bg: 'from-green-500 to-emerald-500', icon: CheckCircle },
    warning: { stroke: '#f59e0b', bg: 'from-yellow-500 to-orange-500', icon: AlertTriangle },
    critical: { stroke: '#ef4444', bg: 'from-red-500 to-pink-500', icon: XCircle },
  };

  const config = statusColors[status];
  const Icon = config.icon;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (Math.min(percentage, 100) / 100) * circumference;

  return (
    <div className="bg-slate-900/50 rounded-lg p-6 flex flex-col items-center">
      {/* SVG Circle */}
      <div className="relative w-32 h-32 mb-4">
        <svg className="transform -rotate-90 w-full h-full">
          {/* Background circle */}
          <circle
            cx="64"
            cy="64"
            r="45"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className="text-slate-700"
          />
          {/* Progress circle */}
          <circle
            cx="64"
            cy="64"
            r="45"
            stroke={config.stroke}
            strokeWidth="8"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon className="h-6 w-6 mb-1" style={{ color: config.stroke }} />
          <div className="text-xl font-bold text-white">{value}</div>
        </div>
      </div>

      {/* Labels */}
      <div className="text-center">
        <div className="text-sm font-medium text-slate-300 mb-1">{label}</div>
        <div className="text-xs text-slate-500">{threshold}</div>
      </div>
    </div>
  );
}
