/**
 * StepScaffold — Soul_Birth 各 Step 的统一外壳。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * design: §2.2(每个 Step 顶部有统一「跳过」入口,调用 skip());覆盖层为全屏接管。
 *
 * 提供:
 *   - 全屏不透明背景(对底层主界面形成接管式覆盖)。
 *   - 右上角统一「跳过」入口(传入 onSkip 即渲染;调用方接 `soulBirthStore.skip()`,R1.5)。
 *   - 标题 / 副标题 / 内容插槽,供后续真实 Step(3.3–3.6/4.2)复用排版。
 *
 * 真实 Step 实现可直接复用本 scaffold,只把内容塞进 children;也可自行接管布局。
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/useTheme';

interface StepScaffoldProps {
  title: string;
  subtitle?: string;
  /** 传入则在右上角渲染统一「跳过」入口(R1.5)。 */
  onSkip?: () => void;
  skipLabel?: string;
  children?: React.ReactNode;
}

export function StepScaffold({
  title,
  subtitle,
  onSkip,
  skipLabel = '跳过',
  children,
}: StepScaffoldProps) {
  return (
    <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
      <View style={styles.fill}>
        {onSkip ? (
          <View style={styles.topBar}>
            <Pressable
              onPress={onSkip}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={skipLabel}
            >
              <Text style={styles.skipText}>{skipLabel}</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.body}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.content}>{children}</View>
        </View>
      </View>
    </SafeAreaView>
  );
}

/**
 * PlaceholderButton — 占位「继续」按钮,仅供 3.2 阶段占位 Step 使用,
 * 用来手动推进到下一步(调用 onComplete)。真实 Step 落地后应移除。
 */
export function PlaceholderButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.placeholderBtn}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.placeholderText}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  skipText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  content: {
    width: '100%',
    alignItems: 'center',
  },
  placeholderBtn: {
    minWidth: 220,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  placeholderText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
}));
