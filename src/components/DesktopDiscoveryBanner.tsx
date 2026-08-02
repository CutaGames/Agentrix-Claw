/**
 * DesktopDiscoveryBanner.tsx
 *
 * Shows a thin toast banner when an Agentrix Desktop instance is detected
 * online for the current user. Tapping it triggers session handoff.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import {
  startDeviceDiscovery,
  stopDeviceDiscovery,
  onDevicesChanged,
  getMobileDeviceId,
  type DiscoveredDevice,
} from '../services/deviceDiscovery.service';
import { apiFetch } from '../services/api';

type HandoffMessage = {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: number;
};

interface Props {
  /** Current chat sessionId — used to hand off this session */
  sessionId?: string;
  agentId?: string;
  instanceName?: string;
  messages?: HandoffMessage[];
}

export default function DesktopDiscoveryBanner({ sessionId, agentId, instanceName, messages = [] }: Props) {
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [handingOff, setHandingOff] = useState(false);

  useEffect(() => {
    startDeviceDiscovery();
    const unsub = onDevicesChanged(setDevices);
    return () => {
      unsub();
      stopDeviceDiscovery();
    };
  }, []);

  const handleHandoff = useCallback(async (device: DiscoveredDevice) => {
    if (!sessionId || !agentId || handingOff) return;
    setHandingOff(true);
    try {
      await apiFetch('/agent-presence/handoffs', {
        method: 'POST',
        body: JSON.stringify({
          agentId,
          sessionId,
          sourceDeviceId: getMobileDeviceId(),
          sourceDeviceType: 'mobile',
          targetDeviceId: device.deviceId,
          targetDeviceType: 'desktop',
          contextSnapshot: {
            title: instanceName || 'Mobile handoff',
            messages: messages.slice(-10),
            initiatedAt: Date.now(),
          },
        }),
      });
      Alert.alert('Agentrix', 'Handoff sent to desktop.');
    } catch (error: any) {
      Alert.alert('Agentrix', error?.message || 'Failed to hand off session.');
    }
    setHandingOff(false);
  }, [agentId, handingOff, instanceName, messages, sessionId]);

  if (devices.length === 0) return null;

  const device = devices[0];

  return (
    <TouchableOpacity
      style={styles.banner}
      activeOpacity={0.8}
      onPress={() => handleHandoff(device)}
    >
      <Text style={styles.icon}>🖥️</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>
          Agentrix Desktop detected
        </Text>
        <Text style={styles.subtitle}>
          {device.deviceName || device.platform || 'Desktop'} • Tap to hand off session
        </Text>
      </View>
      {handingOff && <Text style={styles.sending}>…</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e40af',
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 10,
  },
  icon: { fontSize: 20 },
  title: { color: '#fff', fontSize: 13, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 1 },
  sending: { color: '#fff', fontSize: 16 },
});
