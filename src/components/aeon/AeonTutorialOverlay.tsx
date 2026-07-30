/**
 * AeonTutorialOverlay — 单一新手引导框架(Task 5.2 / R16)。
 *
 * 复用现有"怎么玩"模式(WorldInteractiveBattleScreen 的 AsyncStorage seen-flag +
 * 覆盖卡片),抽成一个可被任意 Aeon 场景复用的组件:任意房间/场景首次进入弹出引导,
 * 引导玩家在 60s 内完成一个有意义动作(R16.1);完成不强制重复但可随时再看(R16.3);
 * 卡住给上下文提示(R16.4)。一套框架覆盖所有场景(R16.2)——传入 storageKey + steps。
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/useTheme';

export interface AeonTutorialStep {
  icon: string;
  title: string;
  body: string;
}

interface Props {
  /** AsyncStorage 键(每个场景一个,如 'aeon_tutorial_scene_v1')。 */
  storageKey: string;
  title: string;
  steps: AeonTutorialStep[];
  /** 让父级渲染"怎么玩?"按钮时复用同一开关。 */
  controlledOpen?: boolean;
  onClose?: () => void;
  /** 行动召唤按钮文案(引导完成一个有意义动作,R16.1)。 */
  ctaLabel?: string;
  onCta?: () => void;
}

/** 命令式 hook:返回 [open, setOpen, markSeen],父组件挂"怎么玩?"按钮时复用。 */
export function useAeonTutorial(storageKey: string): {
  open: boolean;
  setOpen: (v: boolean) => void;
  markSeen: () => void;
} {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const seen = await AsyncStorage.getItem(storageKey);
        if (!cancelled && !seen) setOpen(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const markSeen = useCallback(() => {
    setOpen(false);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      AsyncStorage.setItem(storageKey, '1').catch(() => {});
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  return { open, setOpen, markSeen };
}

export function AeonTutorialOverlay({
  storageKey,
  title,
  steps,
  controlledOpen,
  onClose,
  ctaLabel,
  onCta,
}: Props) {
  const internal = useAeonTutorial(storageKey);
  const open = controlledOpen != null ? controlledOpen : internal.open;

  const close = useCallback(() => {
    internal.markSeen();
    onClose?.();
  }, [internal, onClose]);

  if (!open) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingBottom: 8 }}>
          {steps.map((s, i) => (
            <View key={i} style={styles.step}>
              <Text style={styles.stepIcon}>{s.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepBody}>{s.body}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
        {ctaLabel ? (
          <TouchableOpacity
            style={styles.cta}
            onPress={() => {
              close();
              onCta?.();
            }}
          >
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.dismiss} onPress={close}>
          <Text style={styles.dismissText}>{ctaLabel ? '稍后再说' : '知道了'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 100,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 12 },
  step: { flexDirection: 'row', gap: 12, marginBottom: 14, alignItems: 'flex-start' },
  stepIcon: { fontSize: 22 },
  stepTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  stepBody: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  cta: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  dismiss: { paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  dismissText: { color: colors.textMuted, fontSize: 13 },
}));
