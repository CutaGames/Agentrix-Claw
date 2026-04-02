/**
 * SocialListenerScreen — Agent Social Bridge
 *
 * Manages social platform connections, reply strategy config per platform,
 * approval queue for agent draft replies, and live event log.
 *
 * Backend endpoints used:
 *   GET  /social/callback/status           — platform status + webhook URLs
 *   POST /social/callback/telegram/setup   — register Telegram webhook
 *   GET  /social/events                    — recent events (persisted)
 *   GET  /social/events/pending            — events awaiting reply approval
 *   POST /social/events/:id/approve        — approve agent draft reply
 *   POST /social/events/:id/reject         — reject agent draft reply
 *   GET  /social/reply-config              — reply strategy configs
 *   POST /social/reply-config/:platform    — save reply strategy
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Linking } from 'react-native';
import { colors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { useI18n } from '../../stores/i18nStore';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlatformStatus {
  telegram: { connected: boolean; botUsername: string; webhookUrl: string };
  discord:  { connected: boolean; clientId: string; interactionsUrl: string };
  twitter:  { connected: boolean; webhookUrl: string };
  feishu?:   { connected: boolean; appId?: string; webhookUrl?: string };
  wecom?:    { connected: boolean; corpId?: string; webhookUrl?: string };
  slack?:    { connected: boolean; botToken?: string; webhookUrl?: string };
  whatsapp?: { connected: boolean; phoneNumberId?: string; webhookUrl?: string };
}

interface SocialEvent {
  id: string;
  platform: 'telegram' | 'discord' | 'twitter' | 'feishu' | 'wecom' | 'slack' | 'whatsapp';
  eventType: 'mention' | 'dm' | 'message' | 'command';
  senderId: string;
  senderName?: string;
  text: string;
  replyStatus: 'pending' | 'approved' | 'rejected' | 'sent' | 'failed' | 'auto_sent';
  agentDraftReply?: string;
  finalReply?: string;
  createdAt: string;
}

type ReplyStrategy = 'auto' | 'approval' | 'notify_only' | 'disabled';

interface ReplyConfig {
  id: string;
  platform: 'telegram' | 'discord' | 'twitter';
  strategy: ReplyStrategy;
  replyPrompt?: string;
  replyLanguage: string;
  enabled: boolean;
}

type ScreenTab = 'connections' | 'approvals' | 'events';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PLATFORM_META: Record<string, { icon: string; color: string; label: string }> = {
  telegram: { icon: '✈️', color: '#229ED9', label: 'Telegram' },
  discord:  { icon: '🎮', color: '#5865F2', label: 'Discord' },
  twitter:  { icon: '𝕏', color: '#1a1a2e', label: 'Twitter / X' },
  feishu:   { icon: '🪶', color: '#3370FF', label: '飞书 / Feishu' },
  wecom:    { icon: '💼', color: '#2BAD13', label: '企业微信 / WeCom' },
  slack:    { icon: '💬', color: '#4A154B', label: 'Slack' },
  whatsapp: { icon: '📱', color: '#25D366', label: 'WhatsApp' },
};

const COMING_SOON_PLATFORMS = [
  { icon: '🐧', label: 'QQ', color: '#12B7F5' },
  { icon: '📌', label: '钉钉 / DingTalk', color: '#0089FF' },
];

function copyToClipboard(text: string, label: string) {
  Clipboard.setStringAsync(text).catch(() => {});
  Alert.alert('Copied!', `${label} copied to clipboard.`);
}

// ── Guided Setup Steps ────────────────────────────────────────────────────────

function TelegramGuide({ botUsername, webhookUrl, onSetup, settingUp, t }: {
  botUsername: string;
  webhookUrl: string;
  onSetup: () => void;
  settingUp: boolean;
  t: any;
}) {
  return (
    <View style={styles.guideContainer}>
      <Text style={styles.guideTitle}>{t({ en: '📖 Quick Setup Guide', zh: '📖 快速设置指南' })}</Text>
      
      <View style={styles.guideStep}>
        <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.stepTitle}>{t({ en: 'Register Webhook (One-Tap)', zh: '注册 Webhook（一键完成）' })}</Text>
          <Text style={styles.stepDesc}>{t({ en: 'Tap the button below to automatically register the webhook with your Telegram bot.', zh: '点击下方按钮自动向你的 Telegram 机器人注册 Webhook。' })}</Text>
          <TouchableOpacity
            style={[styles.guideBtn, settingUp && { opacity: 0.6 }]}
            onPress={onSetup}
            disabled={settingUp}
          >
            {settingUp ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.guideBtnText}>⚡ {t({ en: 'Register Webhook', zh: '注册 Webhook' })}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.guideStep}>
        <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.stepTitle}>{t({ en: 'Open your Telegram Bot', zh: '打开你的 Telegram 机器人' })}</Text>
          <Text style={styles.stepDesc}>{t({ en: `Open @${botUsername} in Telegram and send /start to activate it.`, zh: `在 Telegram 中打开 @${botUsername}，发送 /start 来激活。` })}</Text>
          <TouchableOpacity
            style={styles.guideBtnOutline}
            onPress={() => Linking.openURL(`https://t.me/${botUsername}`)}
          >
            <Text style={styles.guideBtnOutlineText}>💬 {t({ en: 'Open Bot in Telegram', zh: '在 Telegram 中打开机器人' })}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.guideStep}>
        <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.stepTitle}>{t({ en: 'Start Chatting!', zh: '开始聊天！' })}</Text>
          <Text style={styles.stepDesc}>{t({ en: 'Send any text or voice message to your bot. Your AI agent will automatically reply and events will appear below.', zh: '向机器人发送任意文字或语音消息，你的 AI 智能体会自动回复，事件也会显示在下方。' })}</Text>
        </View>
      </View>
    </View>
  );
}

function DiscordGuide({ clientId, interactionsUrl, t }: { clientId: string; interactionsUrl: string; t: any }) {
  return (
    <View style={styles.guideContainer}>
      <Text style={styles.guideTitle}>{t({ en: '📖 Discord Setup Guide', zh: '📖 Discord 设置指南' })}</Text>
      
      <View style={styles.guideStep}>
        <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.stepTitle}>{t({ en: 'Open Discord Developer Portal', zh: '打开 Discord 开发者门户' })}</Text>
          <Text style={styles.stepDesc}>{t({ en: 'Go to your application settings in the Discord Developer Portal.', zh: '进入 Discord 开发者门户中的应用设置。' })}</Text>
          <TouchableOpacity
            style={styles.guideBtnOutline}
            onPress={() => Linking.openURL(`https://discord.com/developers/applications/${clientId}/information`)}
          >
            <Text style={styles.guideBtnOutlineText}>🔗 {t({ en: 'Open Dev Portal', zh: '打开开发者门户' })}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.guideStep}>
        <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.stepTitle}>{t({ en: 'Set Interactions URL', zh: '设置交互 URL' })}</Text>
          <Text style={styles.stepDesc}>{t({ en: 'Copy the Interactions URL below and paste it in your Discord app\'s "Interactions Endpoint URL" field.', zh: '复制下方的交互 URL，粘贴到 Discord 应用的「Interactions Endpoint URL」字段。' })}</Text>
          <TouchableOpacity
            style={styles.guideBtnOutline}
            onPress={() => copyToClipboard(interactionsUrl, 'Interactions URL')}
          >
            <Text style={styles.guideBtnOutlineText}>📋 {t({ en: 'Copy Interactions URL', zh: '复制交互 URL' })}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.guideStep}>
        <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.stepTitle}>{t({ en: 'Invite Bot to Server', zh: '邀请机器人到服务器' })}</Text>
          <Text style={styles.stepDesc}>{t({ en: 'Add the bot to your Discord server using OAuth2 → Bot permissions. Your AI agent will respond to mentions and commands.', zh: '使用 OAuth2 → Bot 权限将机器人添加到你的 Discord 服务器。你的 AI 智能体会自动回复提及和命令。' })}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Platform Card ─────────────────────────────────────────────────────────────

function PlatformCard({
  platform,
  status,
  onSetupTelegram,
  settingUp,
  expanded,
  onToggleExpand,
  t,
}: {
  platform: string;
  status: PlatformStatus;
  onSetupTelegram: () => void;
  settingUp: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  t: any;
}) {
  const meta = PLATFORM_META[platform] || { icon: '🔗', color: '#888', label: platform };
  const platData = (status as any)?.[platform];
  const connected = platData?.connected ?? false;
  const webhookUrl = platData?.webhookUrl || platData?.interactionsUrl || '';

  const subtitle =
    platform === 'telegram'
      ? `@${status.telegram?.botUsername || '—'}`
      : platform === 'discord'
      ? `Client: ${status.discord?.clientId || '—'}`
      : platform === 'feishu'
      ? `App: ${(status as any).feishu?.appId || '—'}`
      : platform === 'wecom'
      ? `Corp: ${(status as any).wecom?.corpId || '—'}`
      : platform === 'slack'
      ? 'Events API'
      : platform === 'whatsapp'
      ? `Phone: ${(status as any).whatsapp?.phoneNumberId || '—'}`
      : 'Account Activity API';

  return (
    <View style={[styles.card, { borderLeftColor: meta.color, borderLeftWidth: 3 }]}>
      <TouchableOpacity style={styles.cardHeader} onPress={onToggleExpand} activeOpacity={0.7}>
        <Text style={styles.cardIcon}>{meta.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{meta.label}</Text>
          <Text style={styles.cardSub}>{subtitle}</Text>
        </View>
        <View style={[styles.statusDot, { backgroundColor: connected ? '#22c55e' : '#f59e0b' }]} />
        <Text style={[styles.statusLabel, { color: connected ? '#22c55e' : '#f59e0b' }]}>
          {connected ? t({ en: 'Ready', zh: '已就绪' }) : t({ en: 'Config needed', zh: '需要配置' })}
        </Text>
        <Text style={styles.expandArrow}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <>
          {/* Webhook URL row */}
          <TouchableOpacity
            style={styles.urlRow}
            onPress={() => copyToClipboard(webhookUrl, 'Webhook URL')}
            activeOpacity={0.7}
          >
            <Text style={styles.urlText} numberOfLines={1}>{webhookUrl}</Text>
            <Text style={styles.copyIcon}>📋</Text>
          </TouchableOpacity>

          {/* Platform-specific guided setup */}
          {platform === 'telegram' && (
            <TelegramGuide
              botUsername={status.telegram.botUsername}
              webhookUrl={status.telegram.webhookUrl}
              onSetup={onSetupTelegram}
              settingUp={settingUp}
              t={t}
            />
          )}

          {platform === 'discord' && (
            <DiscordGuide
              clientId={status.discord.clientId}
              interactionsUrl={status.discord.interactionsUrl}
              t={t}
            />
          )}

          {platform === 'twitter' && (
            <View style={styles.guideContainer}>
              <Text style={styles.guideTitle}>{t({ en: '📖 Twitter/X Setup Guide', zh: '📖 Twitter/X 设置指南' })}</Text>
              <View style={styles.guideStep}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{t({ en: 'Open Twitter Developer Portal', zh: '打开 Twitter 开发者门户' })}</Text>
                  <Text style={styles.stepDesc}>
                    {t({ en: 'Go to developer.x.com, create a project, and navigate to Account Activity API settings.', zh: '前往 developer.x.com，创建项目，然后进入 Account Activity API 设置。' })}
                  </Text>
                  <TouchableOpacity
                    style={styles.guideBtnOutline}
                    onPress={() => Linking.openURL('https://developer.x.com')}
                  >
                    <Text style={styles.guideBtnOutlineText}>🔗 {t({ en: 'Open Developer Portal', zh: '打开开发者门户' })}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.guideStep}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{t({ en: 'Register Webhook URL', zh: '注册 Webhook URL' })}</Text>
                  <Text style={styles.stepDesc}>
                    {t({ en: 'Copy the webhook URL above and paste it in the Account Activity API → Webhook URL field.', zh: '复制上方的 Webhook URL，粘贴到 Account Activity API → Webhook URL 字段。' })}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Enterprise platform guides */}
          {platform === 'feishu' && (
            <View style={styles.guideContainer}>
              <Text style={styles.guideTitle}>{t({ en: '📖 Feishu / Lark Setup', zh: '📖 飞书设置指南' })}</Text>
              <View style={styles.guideStep}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{t({ en: 'Create Feishu App', zh: '创建飞书应用' })}</Text>
                  <Text style={styles.stepDesc}>
                    {t({ en: 'Go to open.feishu.cn → Create App → Enable Bot capability → Set Event Subscription URL.', zh: '前往 open.feishu.cn → 创建应用 → 开启机器人能力 → 设置事件订阅 URL。' })}
                  </Text>
                  <TouchableOpacity
                    style={styles.guideBtnOutline}
                    onPress={() => Linking.openURL('https://open.feishu.cn')}
                  >
                    <Text style={styles.guideBtnOutlineText}>🔗 {t({ en: 'Open Feishu Developer', zh: '打开飞书开放平台' })}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.guideStep}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{t({ en: 'Configure App ID & Secret', zh: '配置 App ID 和 App Secret' })}</Text>
                  <Text style={styles.stepDesc}>
                    {t({ en: 'Set FEISHU_APP_ID and FEISHU_APP_SECRET in server environment variables.', zh: '在服务器环境变量中设置 FEISHU_APP_ID 和 FEISHU_APP_SECRET。' })}
                  </Text>
                </View>
              </View>
              <View style={styles.guideStep}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{t({ en: 'Add Bot to Group', zh: '将机器人添加到群组' })}</Text>
                  <Text style={styles.stepDesc}>
                    {t({ en: 'Add the bot to a Feishu group. Users can @mention the bot to trigger AI conversations.', zh: '将机器人添加到飞书群组。用户可以 @提及 机器人来触发 AI 对话。' })}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {(platform === 'wecom' || platform === 'slack' || platform === 'whatsapp') && (
            <View style={styles.guideContainer}>
              <Text style={styles.guideTitle}>📖 {meta.label} Setup</Text>
              <View style={styles.guideStep}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{t({ en: 'Configure credentials on server', zh: '在服务器配置凭证' })}</Text>
                  <Text style={styles.stepDesc}>
                    {t({
                      en: `Set the required environment variables for ${meta.label}. See the deployment docs for details.`,
                      zh: `为 ${meta.label} 设置所需的环境变量，详见部署文档。`,
                    })}
                  </Text>
                </View>
              </View>
              <View style={styles.guideStep}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{t({ en: 'Set webhook URL', zh: '设置 Webhook URL' })}</Text>
                  <Text style={styles.stepDesc}>
                    {t({ en: 'Copy the webhook URL above and paste it in the platform\'s developer settings.', zh: '复制上方的 Webhook URL，粘贴到平台开发者设置中。' })}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ── Strategy Config ──────────────────────────────────────────────────────────

const STRATEGY_OPTIONS: { value: ReplyStrategy; label: string; labelZh: string; icon: string; desc: string; descZh: string }[] = [
  { value: 'auto', label: 'Auto Reply', labelZh: '自动回复', icon: '⚡', desc: 'Agent replies instantly without approval', descZh: 'Agent 自动回复，无需审核' },
  { value: 'approval', label: 'Approval Queue', labelZh: '审核队列', icon: '👁️', desc: 'Agent drafts reply, you approve before sending', descZh: 'Agent 草拟回复，你审核后发送' },
  { value: 'notify_only', label: 'Notify Only', labelZh: '仅通知', icon: '🔔', desc: 'Show events but don\'t generate replies', descZh: '显示事件但不生成回复' },
  { value: 'disabled', label: 'Disabled', labelZh: '已禁用', icon: '🚫', desc: 'Ignore all events from this platform', descZh: '忽略此平台所有事件' },
];

function StrategyPicker({ platform, configs, t }: {
  platform: 'telegram' | 'discord' | 'twitter';
  configs: ReplyConfig[];
  t: any;
}) {
  const qc = useQueryClient();
  const config = configs.find((c) => c.platform === platform);
  const currentStrategy = config?.strategy ?? 'approval';

  const saveMut = useMutation({
    mutationFn: (strategy: ReplyStrategy) =>
      apiFetch(`/social/reply-config/${platform}`, {
        method: 'POST',
        body: JSON.stringify({ strategy, enabled: strategy !== 'disabled' }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reply-configs'] }),
  });

  const meta = PLATFORM_META[platform];
  return (
    <View style={styles.strategyCard}>
      <View style={styles.strategyHeader}>
        <Text style={{ fontSize: 18 }}>{meta.icon}</Text>
        <Text style={styles.strategyPlatform}>{meta.label}</Text>
      </View>
      <View style={styles.strategyOptions}>
        {STRATEGY_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.strategyOption,
              currentStrategy === opt.value && styles.strategyOptionActive,
            ]}
            onPress={() => saveMut.mutate(opt.value)}
          >
            <Text style={styles.strategyIcon}>{opt.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[
                styles.strategyLabel,
                currentStrategy === opt.value && styles.strategyLabelActive,
              ]}>
                {t({ en: opt.label, zh: opt.labelZh })}
              </Text>
              <Text style={styles.strategyDesc}>{t({ en: opt.desc, zh: opt.descZh })}</Text>
            </View>
            {currentStrategy === opt.value && <Text style={styles.strategyCheck}>✓</Text>}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Approval Queue Item ─────────────────────────────────────────────────────

function ApprovalItem({ event, t }: { event: SocialEvent; t: any }) {
  const qc = useQueryClient();
  const [editedReply, setEditedReply] = useState(event.agentDraftReply ?? '');

  const approveMut = useMutation({
    mutationFn: () =>
      apiFetch(`/social/events/${event.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ finalReply: editedReply }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-approvals'] });
      qc.invalidateQueries({ queryKey: ['social-events'] });
    },
  });

  const rejectMut = useMutation({
    mutationFn: () =>
      apiFetch(`/social/events/${event.id}/reject`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-approvals'] });
      qc.invalidateQueries({ queryKey: ['social-events'] });
    },
  });

  const meta = PLATFORM_META[event.platform] ?? PLATFORM_META.twitter;

  return (
    <View style={styles.approvalCard}>
      {/* Incoming message */}
      <View style={styles.approvalIncoming}>
        <Text style={{ fontSize: 16 }}>{meta.icon}</Text>
        <View style={{ flex: 1 }}>
          <View style={styles.eventMeta}>
            <Text style={styles.eventSender}>{event.senderName || event.senderId}</Text>
            <Text style={styles.eventType}>{event.eventType}</Text>
          </View>
          <Text style={styles.eventText} numberOfLines={3}>{event.text}</Text>
        </View>
      </View>

      {/* Agent draft */}
      <View style={styles.approvalDraft}>
        <Text style={styles.approvalDraftLabel}>🤖 {t({ en: 'Agent Draft Reply', zh: 'Agent 草拟回复' })}</Text>
        <TextInput
          style={styles.approvalInput}
          value={editedReply}
          onChangeText={setEditedReply}
          multiline
          placeholder={t({ en: 'Edit reply before sending...', zh: '发送前编辑回复...' })}
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {/* Actions */}
      <View style={styles.approvalActions}>
        <TouchableOpacity
          style={[styles.approvalBtn, styles.approvalBtnReject]}
          onPress={() => rejectMut.mutate()}
          disabled={rejectMut.isPending}
        >
          <Text style={styles.approvalBtnRejectText}>✕ {t({ en: 'Reject', zh: '拒绝' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.approvalBtn, styles.approvalBtnApprove]}
          onPress={() => approveMut.mutate()}
          disabled={approveMut.isPending}
        >
          {approveMut.isPending ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.approvalBtnApproveText}>✓ {t({ en: 'Approve & Send', zh: '批准并发送' })}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export function SocialListenerScreen() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<ScreenTab>('connections');
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>('telegram');

  // Platform status
  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['social-listener-status'],
    queryFn: () => apiFetch<{ ok: boolean; platforms: PlatformStatus }>('/social/callback/status'),
    retry: false,
  });

  // Events (persisted)
  const { data: eventsData, isLoading: eventsLoading, refetch: refetchEvents } = useQuery({
    queryKey: ['social-events'],
    queryFn: () => apiFetch<{ ok: boolean; events: SocialEvent[] }>('/social/events?limit=50'),
    refetchInterval: 10000,
    retry: false,
  });

  // Pending approvals
  const { data: pendingData, isLoading: pendingLoading, refetch: refetchPending } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn: () => apiFetch<{ ok: boolean; events: SocialEvent[] }>('/social/events/pending'),
    refetchInterval: 15000,
    retry: false,
  });

  // Reply configs
  const { data: configsData } = useQuery({
    queryKey: ['reply-configs'],
    queryFn: () => apiFetch<{ ok: boolean; configs: ReplyConfig[] }>('/social/reply-config'),
    retry: false,
  });

  const setupMut = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; description?: string; webhookUrl?: string }>(
        '/social/callback/telegram/setup',
        { method: 'POST' },
      ),
    onSuccess: (res) => {
      if (res.ok) {
        Alert.alert(
          t({ en: '✅ Webhook Registered', zh: '✅ Webhook 已注册' }),
          t({ en: 'Telegram bot is now receiving messages.', zh: 'Telegram 机器人现已开始接收消息。' }),
        );
      } else {
        Alert.alert(t({ en: 'Setup Failed', zh: '设置失败' }), res.description ?? '');
      }
      qc.invalidateQueries({ queryKey: ['social-listener-status'] });
    },
    onError: (e: any) => Alert.alert(t({ en: 'Error', zh: '错误' }), e.message ?? ''),
  });

  const onRefresh = useCallback(() => {
    refetchStatus();
    refetchEvents();
    refetchPending();
  }, [refetchStatus, refetchEvents, refetchPending]);

  const status = statusData?.platforms;
  const events: SocialEvent[] = eventsData?.events ?? [];
  const pending: SocialEvent[] = pendingData?.events ?? [];
  const configs: ReplyConfig[] = configsData?.configs ?? [];

  const TABS: { key: ScreenTab; label: string; labelZh: string; icon: string; badge?: number }[] = [
    { key: 'connections', label: 'Connections', labelZh: '连接', icon: '🔗' },
    { key: 'approvals', label: 'Approvals', labelZh: '审核', icon: '👁️', badge: pending.length },
    { key: 'events', label: 'Events', labelZh: '事件', icon: '📥' },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={statusLoading && eventsLoading}
          onRefresh={onRefresh}
          tintColor={colors.accent}
        />
      }
    >
      {/* Header */}
      <View style={styles.headerBox}>
        <Text style={styles.headerTitle}>🌐 {t({ en: 'Agent Social Bridge', zh: 'Agent 社交桥接' })}</Text>
        <Text style={styles.headerSub}>
          {t({ en: 'Your Agent listens on Telegram, Discord, Twitter, Feishu & more — draft replies, approve or auto-send.', zh: '你的 Agent 在 Telegram、Discord、Twitter、飞书等平台上监听消息——草拟回复、审核或自动发送。' })}
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.screenTabs}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.screenTab, activeTab === tab.key && styles.screenTabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={styles.screenTabIcon}>{tab.icon}</Text>
            <Text style={[styles.screenTabText, activeTab === tab.key && styles.screenTabTextActive]}>
              {t({ en: tab.label, zh: tab.labelZh })}
            </Text>
            {tab.badge !== undefined && tab.badge > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{tab.badge}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ─── Connections Tab ──────────────────────────────────────────────── */}
      {activeTab === 'connections' && (
        <>
          {statusLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
          ) : status ? (
            <>
              <PlatformCard
                platform="telegram" status={status}
                onSetupTelegram={() => setupMut.mutate()} settingUp={setupMut.isPending}
                expanded={expandedPlatform === 'telegram'}
                onToggleExpand={() => setExpandedPlatform(expandedPlatform === 'telegram' ? null : 'telegram')}
                t={t}
              />
              <PlatformCard
                platform="discord" status={status}
                onSetupTelegram={() => {}} settingUp={false}
                expanded={expandedPlatform === 'discord'}
                onToggleExpand={() => setExpandedPlatform(expandedPlatform === 'discord' ? null : 'discord')}
                t={t}
              />
              <PlatformCard
                platform="twitter" status={status}
                onSetupTelegram={() => {}} settingUp={false}
                expanded={expandedPlatform === 'twitter'}
                onToggleExpand={() => setExpandedPlatform(expandedPlatform === 'twitter' ? null : 'twitter')}
                t={t}
              />

              {/* Enterprise platforms */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>🏢 {t({ en: 'Enterprise Platforms', zh: '企业平台' })}</Text>
              </View>
              {(['feishu', 'wecom', 'slack', 'whatsapp'] as const).map((p) => (
                <PlatformCard
                  key={p}
                  platform={p} status={status}
                  onSetupTelegram={() => {}} settingUp={false}
                  expanded={expandedPlatform === p}
                  onToggleExpand={() => setExpandedPlatform(expandedPlatform === p ? null : p)}
                  t={t}
                />
              ))}

              {/* Coming soon */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>🔮 {t({ en: 'Coming Soon', zh: '即将上线' })}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {COMING_SOON_PLATFORMS.map((p) => (
                  <View key={p.label} style={[styles.comingSoonChip, { borderColor: p.color + '44' }]}>
                    <Text style={{ fontSize: 16 }}>{p.icon}</Text>
                    <Text style={[styles.comingSoonText, { color: p.color }]}>{p.label}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {t({ en: 'Could not load status', zh: '无法加载状态' })}</Text>
              <TouchableOpacity onPress={() => refetchStatus()} style={styles.retryBtn}>
                <Text style={styles.retryText}>{t({ en: 'Retry', zh: '重试' })}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Reply Strategy Config */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>⚙️ {t({ en: 'Reply Strategy', zh: '回复策略' })}</Text>
          </View>
          {(['telegram', 'discord', 'twitter', 'feishu', 'wecom', 'slack', 'whatsapp'] as const).map((p) => (
            <StrategyPicker key={p} platform={p} configs={configs} t={t} />
          ))}
        </>
      )}

      {/* ─── Approvals Tab ───────────────────────────────────────────────── */}
      {activeTab === 'approvals' && (
        <>
          {pendingLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
          ) : pending.length === 0 ? (
            <View style={styles.emptyEvents}>
              <Text style={styles.emptyEventsIcon}>✅</Text>
              <Text style={styles.emptyEventsText}>
                {t({ en: 'No pending approvals. Agent draft replies will appear here when using "Approval Queue" strategy.', zh: '没有待审核项。使用"审核队列"策略时，Agent 草拟的回复会显示在这里。' })}
              </Text>
            </View>
          ) : (
            pending.map((ev) => <ApprovalItem key={ev.id} event={ev} t={t} />)
          )}
        </>
      )}

      {/* ─── Events Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'events' && (
        <>
          {eventsLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
          ) : events.length === 0 ? (
            <View style={styles.emptyEvents}>
              <Text style={styles.emptyEventsIcon}>📭</Text>
              <Text style={styles.emptyEventsText}>
                {t({ en: 'No events yet. Connect a platform and send a message to see events here.', zh: '暂无事件。连接平台并发送消息后，事件会显示在这里。' })}
              </Text>
            </View>
          ) : (
            events.map((ev) => {
              const meta = PLATFORM_META[ev.platform] ?? PLATFORM_META.twitter;
              const statusColor =
                ev.replyStatus === 'sent' || ev.replyStatus === 'auto_sent' ? '#22c55e'
                : ev.replyStatus === 'pending' ? '#f59e0b'
                : ev.replyStatus === 'rejected' || ev.replyStatus === 'failed' ? '#ef4444'
                : colors.textMuted;
              return (
                <View key={ev.id} style={styles.eventRow}>
                  <Text style={styles.eventIcon}>{meta.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={styles.eventMeta}>
                      <Text style={styles.eventSender}>{ev.senderName || ev.senderId || 'unknown'}</Text>
                      <Text style={styles.eventType}>{ev.eventType}</Text>
                      <View style={[styles.replyStatusBadge, { backgroundColor: statusColor + '22' }]}>
                        <Text style={[styles.replyStatusText, { color: statusColor }]}>{ev.replyStatus}</Text>
                      </View>
                    </View>
                    <Text style={styles.eventText} numberOfLines={2}>{ev.text}</Text>
                    {ev.finalReply && (
                      <View style={styles.replyPreview}>
                        <Text style={styles.replyPreviewLabel}>🤖 {t({ en: 'Replied:', zh: '已回复：' })}</Text>
                        <Text style={styles.replyPreviewText} numberOfLines={1}>{ev.finalReply}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, gap: 12, paddingBottom: 40 },

  headerBox: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  headerSub: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },

  tipBox: {
    flexDirection: 'row',
    backgroundColor: '#2563eb15',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#2563eb33',
    alignItems: 'flex-start',
  },
  tipIcon: { fontSize: 18, marginTop: 1 },
  tipText: { flex: 1, fontSize: 13, color: '#60a5fa', lineHeight: 19, fontWeight: '500' },

  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { fontSize: 24 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  cardSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 11, fontWeight: '700' },
  expandArrow: { fontSize: 10, color: colors.textMuted, marginLeft: 4 },

  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  urlText: { flex: 1, fontSize: 11, color: colors.textMuted, fontFamily: 'monospace' },
  copyIcon: { fontSize: 14 },

  // Guided Setup
  guideContainer: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 14,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  guideTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  guideStep: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNumber: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.accent + '22',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  stepNumberText: { fontSize: 13, fontWeight: '800', color: colors.accent },
  stepTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  stepDesc: { fontSize: 12, color: colors.textSecondary, lineHeight: 18, marginBottom: 8 },
  guideBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  guideBtnText: { fontSize: 13, fontWeight: '700', color: '#000' },
  guideBtnOutline: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.accent + '55',
    backgroundColor: colors.accent + '11',
  },
  guideBtnOutlineText: { fontSize: 13, fontWeight: '600', color: colors.accent },

  cardActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: {
    flex: 1,
    minWidth: 100,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  actionBtnText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  actionBtnTextPrimary: { fontSize: 12, color: '#000', fontWeight: '700' },

  setupNote: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  setupNoteText: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },

  errorBox: { alignItems: 'center', padding: 24, gap: 12 },
  errorText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 8, backgroundColor: colors.accent, borderRadius: 10 },
  retryText: { color: '#000', fontWeight: '700', fontSize: 13 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  emptyEvents: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 8,
  },
  emptyEventsIcon: { fontSize: 32 },
  emptyEventsText: { fontSize: 13, color: colors.textMuted, lineHeight: 18, textAlign: 'center' },

  eventRow: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventIcon: { fontSize: 18, marginTop: 2 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' },
  eventSender: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  eventType: { fontSize: 10, color: colors.accent, backgroundColor: colors.accent + '22', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, fontWeight: '600', overflow: 'hidden' },
  eventTime: { fontSize: 10, color: colors.textMuted, marginLeft: 'auto' },
  eventText: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },

  // Screen Tabs
  screenTabs: { flexDirection: 'row', gap: 6 },
  screenTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 10, borderRadius: 12,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
  },
  screenTabActive: { backgroundColor: colors.accent + '22', borderColor: colors.accent },
  screenTabIcon: { fontSize: 14 },
  screenTabText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  screenTabTextActive: { color: colors.accent },
  tabBadge: {
    backgroundColor: '#ef4444', borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  tabBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  // Strategy Config
  strategyCard: {
    backgroundColor: colors.bgCard, borderRadius: 14, padding: 14, gap: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  strategyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  strategyPlatform: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  strategyOptions: { gap: 6 },
  strategyOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, borderRadius: 10,
    backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: 'transparent',
  },
  strategyOptionActive: { borderColor: colors.accent, backgroundColor: colors.accent + '11' },
  strategyIcon: { fontSize: 16, width: 24, textAlign: 'center' },
  strategyLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  strategyLabelActive: { color: colors.accent },
  strategyDesc: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  strategyCheck: { fontSize: 14, fontWeight: '800', color: colors.accent },

  // Approval Queue
  approvalCard: {
    backgroundColor: colors.bgCard, borderRadius: 14, padding: 14, gap: 12,
    borderWidth: 1, borderColor: '#f59e0b44',
  },
  approvalIncoming: { flexDirection: 'row', gap: 10 },
  approvalDraft: {
    backgroundColor: colors.bgSecondary, borderRadius: 10, padding: 10, gap: 6,
    borderLeftWidth: 3, borderLeftColor: colors.accent,
  },
  approvalDraftLabel: { fontSize: 11, fontWeight: '700', color: colors.accent },
  approvalInput: {
    fontSize: 13, color: colors.textPrimary, lineHeight: 19,
    minHeight: 60, textAlignVertical: 'top',
  },
  approvalActions: { flexDirection: 'row', gap: 8 },
  approvalBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  approvalBtnReject: { backgroundColor: '#ef444422', borderWidth: 1, borderColor: '#ef444444' },
  approvalBtnRejectText: { fontSize: 13, fontWeight: '700', color: '#ef4444' },
  approvalBtnApprove: { backgroundColor: colors.accent, borderWidth: 1, borderColor: colors.accent },
  approvalBtnApproveText: { fontSize: 13, fontWeight: '700', color: '#000' },

  // Reply Status Badge
  replyStatusBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 },
  replyStatusText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },

  // Reply Preview
  replyPreview: {
    flexDirection: 'row', gap: 4, marginTop: 4, paddingTop: 4,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  replyPreviewLabel: { fontSize: 10, color: colors.accent },
  replyPreviewText: { fontSize: 10, color: colors.textMuted, flex: 1 },

  // Coming soon
  comingSoonChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, backgroundColor: colors.bgCard,
  },
  comingSoonText: { fontSize: 13, fontWeight: '600' },
});
