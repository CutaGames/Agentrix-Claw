// Alliance Intro Screen — mobile version of web /alliance page
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { useI18n, TranslationDescriptor } from '../stores/i18nStore';

interface Props { navigation: any; }

const T = (en: string, zh: string): TranslationDescriptor => ({ en, zh });

const ROLES = [
  { icon: '🧑‍🚀', title: T('Personal / Auto-Earn', '个人用户 / Auto-Earn'), desc: T('Create Agent, auto-execute tasks, earn commission', '一键生成 Agent，自动执行任务，获得联盟返佣'), points: [T('Create Agent in 1 min', '1 分钟创建 Agent'), T('Bind wallet or fiat account', '绑定钱包/法币'), T('Share to earn 0.5% lifetime', '分享获终身 0.5% 分成')] },
  { icon: '🤖', title: T('Agent Developer', 'Agent 开发者'), desc: T('Embed payment & alliance via SDK/API', '通过 SDK/API 嵌入支付与联盟能力'), points: [T('Unified payment + routing', '统一支付+智能路由'), T('Full API & Webhook docs', 'API/Webhook 完整文档'), T('2-3% auto commission', 'Agent 订单 2-3% 自动分润')] },
  { icon: '🏪', title: T('Merchant / Brand', '商户 / 品牌'), desc: T('Agents find customers, collect & settle payments', 'Agent 帮你找客、收款、结算'), points: [T('Unified collection + escrow', '统一收款+托管'), T('Omnichannel tracking', '全渠道订单跟踪'), T('Pay per sale promotion', '联盟推广按成交付费')] },
  { icon: '🧑‍💻', title: T('Plugin Developer', '插件开发者'), desc: T('Promote merchants, earn 0.5% lifetime commission', '推广商户获 0.5% 永久分成'), points: [T('Open SDK & CLI', '开放 SDK & CLI'), T('Marketplace listing rewards', 'Marketplace 上架奖励'), T('Sell subscriptions & API credits', '可售卖订阅/API Credit')] },
];

const INCENTIVES = [
  { title: T('Agent Commission', 'Agent 分润'), detail: T('2% (physical) / 3% (services & digital), instant settlement', '2%（实物）/3%（服务&数字），即时到账') },
  { title: T('Platform Fee', '平台分润'), detail: T('0.5% (physical) / 1% (other) per transaction for ops & ecosystem', '每笔 0.5%（实物）/1%（其他）用于运营') },
  { title: T('Alliance Referral', '联盟返佣'), detail: T('0.5% lifetime commission for promoting merchants, agents & plugins', '推广商户/Agent/插件获 0.5% 永久分佣') },
  { title: T('Bounty Tasks', '任务 / Bounty'), detail: T('Earn rewards for asset listings, data integration, SDK examples', '资产上架、数据接入、SDK 示例可领取奖励') },
];

const STEPS = [
  T('Sign up & complete basic KYC', '注册并完成基础 KYC'),
  T('Choose role & create Agent', '选择角色并开通 Agent'),
  T('Configure payment & referral links', '配置收款与推广链接'),
  T('Start earning in real-time', '开始执行，实时查看收益'),
];

export default function AllianceScreen({ navigation }: Props) {
  const { t } = useI18n();

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      {/* Hero */}
      <View style={s.hero}>
        <Text style={s.badge}>🤝 {t(T('Agentrix Alliance', 'Agentrix 联盟'))}</Text>
        <Text style={s.heroTitle}>{t(T('Join the Alliance,\nEarn Forever', '加入联盟，获得永久收益'))}</Text>
        <Text style={s.heroDesc}>{t(T('Promote merchants for 0.5% lifetime commission. All earnings auto-calculated via smart contracts.', '推广商户获 0.5% 永久分佣，所有收益通过智能合约自动计算结算。'))}</Text>
      </View>

      {/* Roles */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>{t(T('Four Alliance Roles', '四类联盟角色'))}</Text>
        <Text style={s.sectionSub}>{t(T('One account can hold multiple roles', '同一账户可同时扮演多个角色'))}</Text>
        {ROLES.map((role, i) => (
          <View key={i} style={s.roleCard}>
            <View style={s.roleHeader}>
              <Text style={s.roleIcon}>{role.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.roleTitle}>{t(role.title)}</Text>
                <Text style={s.roleDesc}>{t(role.desc)}</Text>
              </View>
            </View>
            {role.points.map((p, j) => (
              <Text key={j} style={s.rolePoint}>  • {t(p)}</Text>
            ))}
          </View>
        ))}
      </View>

      {/* Incentives */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>{t(T('Commission Structure', '分润结构'))}</Text>
        <Text style={s.sectionSub}>{t(T('Transparent, on-chain trackable', '透明可追踪，链上结算'))}</Text>
        {INCENTIVES.map((item, i) => (
          <View key={i} style={s.incentiveCard}>
            <Text style={s.incentiveTitle}>{t(item.title)}</Text>
            <Text style={s.incentiveDetail}>{t(item.detail)}</Text>
          </View>
        ))}
      </View>

      {/* Steps */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>{t(T('4 Steps to Join', '4 步加入'))}</Text>
        <View style={s.stepsRow}>
          {STEPS.map((step, i) => (
            <View key={i} style={s.stepCard}>
              <View style={s.stepNum}><Text style={s.stepNumText}>{i + 1}</Text></View>
              <Text style={s.stepText}>{t(step)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* CTA */}
      <View style={s.cta}>
        <Text style={s.ctaTitle}>{t(T('Build the AI Economy Together', '一起共建 AI 经济联盟'))}</Text>
        <TouchableOpacity style={s.ctaBtn} onPress={() => navigation.navigate('Main')}>
          <Text style={s.ctaBtnText}>{t(T('Get Started', '立即加入'))}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { padding: 24, paddingTop: 16, backgroundColor: '#1e3a8a' },
  badge: { color: '#93c5fd', fontSize: 13, fontWeight: '600', marginBottom: 12 },
  heroTitle: { color: '#fff', fontSize: 28, fontWeight: '800', lineHeight: 36, marginBottom: 12 },
  heroDesc: { color: '#bfdbfe', fontSize: 14, lineHeight: 22 },
  section: { padding: 20 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 4 },
  sectionSub: { color: colors.muted, fontSize: 13, marginBottom: 16 },
  roleCard: { backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  roleHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  roleIcon: { fontSize: 28 },
  roleTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  roleDesc: { color: colors.muted, fontSize: 13, marginTop: 2 },
  rolePoint: { color: '#93c5fd', fontSize: 13, marginTop: 4 },
  incentiveCard: { backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  incentiveTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  incentiveDetail: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  stepsRow: { gap: 10 },
  stepCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  stepNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  stepText: { color: colors.muted, fontSize: 13, flex: 1 },
  cta: { margin: 20, padding: 24, borderRadius: 16, backgroundColor: '#4f46e5', alignItems: 'center' },
  ctaTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  ctaBtn: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14 },
  ctaBtnText: { color: '#4f46e5', fontSize: 16, fontWeight: '700' },
});
