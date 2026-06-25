'use client';

import React from 'react';
import { Lock, Eye, EyeOff, Shield, Database, Hash } from 'lucide-react';
import { PrivacyLevel } from '../../lib/api/dataset.api';

export interface PrivacyFunnelSliderProps {
  level: PrivacyLevel;
  onChange: (level: PrivacyLevel) => void;
  preview: {
    before: string | any;
    after: string | any;
  };
}

const privacyLevels = [
  {
    level: 1 as PrivacyLevel,
    label: 'Original Data',
    description: 'No anonymization - full access to raw data',
    icon: Eye,
    color: 'from-red-500 to-orange-500',
    features: ['Full field access', 'No masking', 'Maximum utility'],
  },
  {
    level: 2 as PrivacyLevel,
    label: 'Partial Masking',
    description: 'Sensitive fields (name, phone, email) are masked',
    icon: EyeOff,
    color: 'from-orange-500 to-yellow-500',
    features: ['PII masking', 'Email hashing', 'Phone obfuscation'],
  },
  {
    level: 3 as PrivacyLevel,
    label: 'Fuzzy Data',
    description: 'Dates rounded, amounts ranged, locations generalized',
    icon: Shield,
    color: 'from-yellow-500 to-green-500',
    features: ['Date fuzzing', 'Amount ranges', 'Location generalization'],
  },
  {
    level: 4 as PrivacyLevel,
    label: 'Aggregated',
    description: 'Only statistical summaries, no individual records',
    icon: Database,
    color: 'from-green-500 to-blue-500',
    features: ['Statistical summaries', 'Aggregate metrics', 'No individual data'],
  },
  {
    level: 5 as PrivacyLevel,
    label: 'Fully Anonymous',
    description: 'Differential privacy with noise injection',
    icon: Hash,
    color: 'from-blue-500 to-purple-500',
    features: ['Differential privacy', 'Noise injection', 'K-anonymity'],
  },
];

export function PrivacyFunnelSlider({ level, onChange, preview }: PrivacyFunnelSliderProps) {
  const currentLevel = privacyLevels.find((l) => l.level === level) || privacyLevels[0];
  const Icon = currentLevel.icon;

  return (
    <div className="space-y-6">
      {/* Visual Slider */}
      <div className="relative">
        {/* Background Track */}
        <div className="h-2 bg-slate-700 rounded-full mb-8" />

        {/* Level Markers */}
        <div className="absolute top-0 left-0 right-0 flex justify-between">
          {privacyLevels.map((privacyLevel) => {
            const isActive = privacyLevel.level === level;
            const isPast = privacyLevel.level < level;
            const LevelIcon = privacyLevel.icon;

            return (
              <button
                key={privacyLevel.level}
                onClick={() => onChange(privacyLevel.level)}
                className="relative flex flex-col items-center group"
              >
                {/* Marker Dot */}
                <div
                  className={`w-6 h-6 rounded-full border-4 transition-all ${
                    isActive
                      ? 'border-white bg-blue-500 scale-125'
                      : isPast
                      ? 'border-blue-400 bg-blue-500'
                      : 'border-slate-600 bg-slate-700 group-hover:border-slate-500'
                  }`}
                />

                {/* Label */}
                <div className="absolute top-8 w-24 text-center">
                  <div
                    className={`text-xs font-medium mb-1 ${
                      isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-400'
                    }`}
                  >
                    L{privacyLevel.level}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Current Level Info */}
      <div className={`bg-gradient-to-r ${currentLevel.color} rounded-lg p-6 text-white`}>
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white/20 rounded-lg">
            <Icon className="h-8 w-8" />
          </div>
          <div className="flex-1">
            <h4 className="text-xl font-bold mb-2">{currentLevel.label}</h4>
            <p className="text-white/90 mb-4">{currentLevel.description}</p>
            <div className="grid grid-cols-3 gap-2">
              {currentLevel.features.map((feature, idx) => (
                <div
                  key={idx}
                  className="px-3 py-1 bg-white/20 rounded-full text-sm text-center"
                >
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Comparison */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-3">
            <Eye className="h-4 w-4" />
            <span className="text-sm font-medium">Before</span>
          </div>
          <div className="bg-slate-900/50 rounded p-3 font-mono text-xs text-slate-300 overflow-auto max-h-32">
            {typeof preview.before === 'string'
              ? preview.before
              : JSON.stringify(preview.before, null, 2)}
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-3">
            <Lock className="h-4 w-4" />
            <span className="text-sm font-medium">After (Level {level})</span>
          </div>
          <div className="bg-slate-900/50 rounded p-3 font-mono text-xs text-slate-300 overflow-auto max-h-32">
            {typeof preview.after === 'string'
              ? preview.after
              : JSON.stringify(preview.after, null, 2)}
          </div>
        </div>
      </div>

      {/* Privacy vs Utility Trade-off */}
      <div className="bg-slate-800/50 rounded-lg p-4">
        <div className="text-sm font-medium text-slate-300 mb-3">Privacy vs Utility Trade-off</div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Privacy Protection</span>
            <div className="flex-1 mx-4 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${(level / 5) * 100}%` }}
              />
            </div>
            <span className="text-sm text-white font-medium">{(level / 5) * 100}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Data Utility</span>
            <div className="flex-1 mx-4 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${((6 - level) / 5) * 100}%` }}
              />
            </div>
            <span className="text-sm text-white font-medium">{((6 - level) / 5) * 100}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
