/**
 * AgentOpsHubScreen — landing hub for Crypto-Native Agent Ops (Agent 自运营).
 *
 * On-the-go surface: navigation cards into the consumer-facing + monitoring
 * slice (due diligence / monitors / deliverables / reliability / economic
 * status). Heavy execution (browser CDP automation) lives on desktop; mobile
 * is for submitting, viewing and monitoring.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import type { MeStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MeStackParamList, 'AgentOpsHub'>;

interface HubCard {
  route: keyof MeStackParamList;
  testID: string;
  icon: string;
  title: { en: string; zh: string };
  desc: { en: string; zh: string };
}

const CARDS: HubCard[] = [
  {
    route: 'AgentOpsDueDiligence',
    testID: 'ao-due-diligence',
    icon: '🔍',
    title: { en: 'Due Diligence', zh: '尽职调查' },
    desc: {
      en: 'Research a token, wallet, contract or project — structured report with sources.',
      zh: '调研代币 / 钱包 / 合约 / 项目，生成带来源的结构化报告。',
    },
  },
  {
    route: 'AgentOpsMonitors',
    testID: 'ao-monitors',
    icon: '📡',
    title: { en: 'Monitors', zh: '监控告警' },
    desc: {
      en: 'Price / liquidation / unlock / governance / airdrop-window watchers.',
      zh: '价格 / 清算 / 解锁 / 治理 / 空投窗口的周期监控。',
    },
  },
  {
    route: 'AgentOpsDeliverables',
    testID: 'ao-deliverables',
    icon: '📦',
    title: { en: 'Deliverables', zh: '交付物' },
    desc: {
      en: 'Review task deliverables, share, and spot-check quality.',
      zh: '查看任务交付物，分享并进行人工抽检。',
    },
  },
  {
    route: 'AgentOpsReliability',
    testID: 'ao-reliability',
    icon: '📊',
    title: { en: 'Reliability', zh: '可靠性指标' },
    desc: {
      en: 'Autonomous completion, quality pass rate, latency, cold-start funnel.',
      zh: '自主完成率、质量合格率、时延、冷启动漏斗。',
    },
  },
  {
    route: 'AgentOpsEconomicStatus',
    testID: 'ao-economic-status',
    icon: '⛓️',
    title: { en: 'Economic Status', zh: '经济身份状态' },
    desc: {
      en: 'Wallet / limit / credit / on-chain / capabilities — real status, no fake placeholders.',
      zh: '钱包 / 限额 / 信用 / 链上 / 能力的真实状态，不做空占位。',
    },
  },
];

export function AgentOpsHubScreen() {
  const navigation = useNavigation<Nav>();
  const c = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="agent-ops-hub">
      <View style={styles.intro}>
        <Text style={styles.introTitle}>🛠 {t({ en: 'Agent Ops', zh: 'Agent 自运营' })}</Text>
        <Text style={styles.introDesc}>
          {t({
            en: 'Your crypto-native agent works for you: research, monitoring, deliverables and accountable economics. Fund moves always need your signature.',
            zh: '你的 crypto-native Agent 为你工作：尽调、监控、交付物与可问责的经济身份。资金操作始终需要你签名。',
          })}
        </Text>
      </View>

      {CARDS.map((card) => (
        <TouchableOpacity
          key={card.route}
          style={styles.card}
          activeOpacity={0.85}
          testID={card.testID}
          onPress={() => navigation.navigate(card.route as any)}
        >
          <Text style={styles.cardIcon}>{card.icon}</Text>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{t(card.title)}</Text>
            <Text style={styles.cardDesc}>{t(card.desc)}</Text>
          </View>
          <Text style={styles.cardArrow}>›</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.footnote}>
        {t({
          en: 'Tip: heavy browser automation runs on the desktop app. This screen is for submitting and monitoring on the go.',
          zh: '提示：复杂的浏览器自动化在桌面端执行，本页面用于随时提交与监控。',
        })}
      </Text>
    </ScrollView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 16, paddingBottom: 40, gap: 12 },
    intro: { gap: 6, marginBottom: 4 },
    introTitle: { fontSize: 22, fontWeight: '800', color: c.textPrimary },
    introDesc: { fontSize: 13, color: c.textSecondary, lineHeight: 19 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bgCard,
      borderRadius: 16,
      padding: 16,
      gap: 14,
      borderWidth: 1,
      borderColor: c.border,
    },
    cardIcon: { fontSize: 26, width: 34, textAlign: 'center' },
    cardBody: { flex: 1, gap: 3 },
    cardTitle: { fontSize: 16, fontWeight: '700', color: c.textPrimary },
    cardDesc: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
    cardArrow: { fontSize: 22, color: c.textMuted },
    footnote: { fontSize: 11, color: c.textMuted, lineHeight: 16, marginTop: 8, textAlign: 'center' },
  });
}
