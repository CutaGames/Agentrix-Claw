'use client';

import React from 'react';
import { Monitor, Smartphone, Globe, Watch, Glasses, Crown } from 'lucide-react';
import type { FabricDevice } from './VoiceInput';

interface FabricDeviceBarProps {
  devices: FabricDevice[];
  onSwitchPrimary?: (deviceId: string) => void;
}

const DEVICE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  phone: Smartphone,
  desktop: Monitor,
  web: Globe,
  glass: Glasses,
  watch: Watch,
};

const DEVICE_LABELS: Record<string, string> = {
  phone: '手机',
  desktop: '桌面',
  web: '浏览器',
  glass: '眼镜',
  watch: '手表',
};

/**
 * FabricDeviceBar — Compact inline bar showing all devices in the current voice session.
 * The primary device shows a crown icon. Clicking a non-primary device triggers switch.
 */
export function FabricDeviceBar({ devices, onSwitchPrimary }: FabricDeviceBarProps) {
  if (devices.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/50 border border-slate-700/40 text-xs">
      <span className="text-slate-500 mr-1">设备:</span>
      {devices.map((device) => {
        const Icon = DEVICE_ICONS[device.deviceType] || Globe;
        const label = DEVICE_LABELS[device.deviceType] || device.deviceType;

        return (
          <button
            key={device.deviceId}
            type="button"
            onClick={() => {
              if (!device.isPrimary && onSwitchPrimary) {
                onSwitchPrimary(device.deviceId);
              }
            }}
            className={`
              flex items-center gap-1 px-1.5 py-0.5 rounded
              transition-colors duration-150
              ${device.isPrimary
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-700/40 text-slate-400 hover:bg-slate-600/50 hover:text-slate-300'}
            `}
            title={
              device.isPrimary
                ? `${label} (主设备 — 当前输入源)`
                : `切换 ${label} 为主设备`
            }
          >
            {device.isPrimary && <Crown className="w-3 h-3" />}
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
