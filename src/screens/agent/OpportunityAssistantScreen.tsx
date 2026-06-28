/**
 * OpportunityAssistantScreen — 对话式「全网机会助手」（移动端，一站式：检索 + 卡片 + 接单/下单）。
 *
 * 用对话交互完成「在对话框里检索 → 展示结果卡片 → 围栏内接单/购买/订阅/跳转」的闭环：
 *  - 用户输入自然语言（如「找远程任务」「有什么空投」「搜预测市场」），或点品类快捷 chip；
 *  - 助手气泡 + 结果卡片：复用 `searchAggregatedOpportunities`（→ `POST /ard/search`，内部+聚合外部
 *    混合排序，带来源徽标/能力位/GMV）；
 *  - 每张卡可在 spendingLimits 双围栏内「接单/购买/订阅/下注」：复用 `participateInListing`
 *    （→ `POST /ard/participate`，L3 执行核 + 围栏 + L4 结算 + 单一费率源）；仅链接发现的条目
 *    显示「跳转外部」；超限/降级/外部态均结构化内联反馈；
 *  - 顶部「📰 机会日报」chip 跳转 DigestPoster 生成可转发海报。
 *
 * 设计取舍：不侵入复杂的主聊天屏（streaming/voice/local-infer），而是专建一个轻量、可控、
 * 自洽的对话式机会界面，零回归风险，直达变现闭环。后端检索/代成交已就绪（/ard/search、
 * /ard/participate），本屏纯前端编排。
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  searchAggregatedOpportunities,
  participateInListing,
  AGG_CATEGORY_ORDER,
  type AggCategory,
  type AggregatedListing,
  type ParticipationAction,
  type ParticipateResult,
} from '../../services/aggregatedMarket.api';

type Role = 'user' | 'assistant';

interface ChatMsg {
  id: string;
  role: Role;
  text?: string;
  /** 助手消息携带的检索结果卡片。 */
  cards?: AggregatedListing[];
}

const CATEGORY_LABEL: Record<AggCategory, { en: string; zh: string }> = {
  task: { en: 'Tasks', zh: '任务' },
  prediction: { en: 'Predictions', zh: '预测' },
  skill: { en: 'Skills', zh: '技能' },
  agent_rental: { en: 'Agents', zh: 'Agent' },
  resource: { en: 'Resources', zh: '资源' },
};

/** 品类 → 代成交动作 + 动作中文标签。 */
function actionForCategory(c: AggCategory | null): {
  action: ParticipationAction;
  label: { en: string; zh: string };
} {
  switch (c) {
    case 'prediction':
      return { action: 'purchase', label: { en: 'Bet', zh: '下注' } };
    case 'skill':
    case 'resource':
      return { action: 'purchase', label: { en: 'Buy', zh: '购买' } };
    case 'agent_rental':
      return { action: 'subscribe', label: { en: 'Hire', zh: '雇佣' } };
    case 'task':
    default:
      return { action: 'accept', label: { en: 'Accept', zh: '接单' } };
  }
}

/** 极简意图：从自然语言里猜品类（命中关键词），否则 null（全部）。 */
function guessCategory(text: string): AggCategory | null {
  const s = text.toLowerCase();
  if (/(空投|airdrop|未发币|撸毛)/.test(s)) return null; // 空投单列，见下
  if (/(任务|接单|赏金|外包|工作|job|task|bounty|gig)/.test(s)) return 'task';
  if (/(预测|赔率|下注|polymarket|kalshi|predict|odds)/.test(s)) return 'prediction';
  if (/(技能|skill|工具|tool)/.test(s)) return 'skill';
  if (/(租|雇|agent|助理)/.test(s)) return 'agent_rental';
  if (/(资源|api|数据|订阅|resource|feed)/.test(s)) return 'resource';
  return null;
}

let _seq = 0;
const nextId = () => `m${Date.now().toString(36)}-${_seq++}`;

export function OpportunityAssistantScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const listRef = useRef<FlatList<ChatMsg>>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: nextId(),
      role: 'assistant',
      text: t({
        en: 'Hi! Ask me to find tasks, predictions, airdrops, skills or agents across the network. Tap a chip or type, e.g. "find remote tasks".',
        zh: '你好！我可以帮你检索全网的任务、预测、空投、技能、Agent。点下方品类或直接输入，例如「找远程任务」。',
      }),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // 各卡片的代成交进行态 / 结果（按 identifier 索引）。
  const [busyCard, setBusyCard] = useState<string | null>(null);
  const [cardResult, setCardResult] = useState<Record<string, ParticipateResult>>({});

  const append = useCallback((m: ChatMsg) => {
    setMessages((prev) => [...prev, m]);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const runSearch = useCallback(
    async (rawText: string, forcedCategory?: AggCategory | null) => {
      const text = rawText.trim();
      if (!text && forcedCategory === undefined) return;
      append({ id: nextId(), role: 'user', text: text || (forcedCategory ? t(CATEGORY_LABEL[forcedCategory]) : t({ en: 'All', zh: '全部' })) });
      setLoading(true);
      try {
        const category =
          forcedCategory !== undefined ? forcedCategory : guessCategory(text);
        const listings = await searchAggregatedOpportunities({
          text,
          category: category ?? undefined,
          pageSize: 8,
        });
        if (!listings.length) {
          append({
            id: nextId(),
            role: 'assistant',
            text: t({ en: 'No matching opportunities. Try another category or keyword.', zh: '没有找到匹配的机会，换个品类或关键词试试。' }),
          });
        } else {
          append({
            id: nextId(),
            role: 'assistant',
            text: t({ en: `Found ${listings.length} opportunities:`, zh: `为你找到 ${listings.length} 条机会：` }),
            cards: listings,
          });
        }
      } catch (e: any) {
        append({
          id: nextId(),
          role: 'assistant',
          text: t({ en: 'Search failed, please retry.', zh: '检索失败，请重试。' }),
        });
      } finally {
        setLoading(false);
      }
    },
    [append, t],
  );

  const onSend = useCallback(() => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    void runSearch(text);
  }, [input, loading, runSearch]);

  const onParticipate = useCallback(
    async (listing: AggregatedListing) => {
      const { action } = actionForCategory(listing.category);
      // 仅链接发现条目：直接跳转外部，不走代成交。
      if (!listing.canAccept) {
        if (listing.externalUrl) {
          Linking.openURL(listing.externalUrl).catch(() => {});
        } else {
          Alert.alert(t({ en: 'External only', zh: '仅外部跳转' }), t({ en: 'This listing is link-discovery only.', zh: '该条目仅支持跳转外部成交。' }));
        }
        return;
      }
      setBusyCard(listing.identifier);
      try {
        const result = await participateInListing({ listing, action });
        setCardResult((prev) => ({ ...prev, [listing.identifier]: result }));
        // backend_gap / external 态给出可读提示。
        if (result.status === 'backend_gap') {
          append({ id: nextId(), role: 'assistant', text: t({ en: 'On-chain accept backend is not online yet.', zh: '围栏内代成交后端尚未上线，可先跳转外部成交。' }) });
        }
      } catch (e: any) {
        setCardResult((prev) => ({
          ...prev,
          [listing.identifier]: { ok: false, status: 'rejected', reason: String(e?.message || 'failed') },
        }));
      } finally {
        setBusyCard(null);
      }
    },
    [append, t],
  );

  const renderCard = (listing: AggregatedListing) => {
    const { label } = actionForCategory(listing.category);
    const result = cardResult[listing.identifier];
    const busy = busyCard === listing.identifier;
    const priceText =
      listing.gmv > 0 ? `${listing.gmv.toLocaleString()} ${listing.currency}` : t({ en: 'price varies', zh: '价格待定' });
    return (
      <View key={listing.identifier} style={styles.card}>
        <Text style={styles.cardTitle} numberOfLines={2}>{listing.displayName}</Text>
        <View style={styles.badgeRow}>
          <Text style={[styles.badge, listing.internal ? styles.badgeInternal : styles.badgeExternal]}>
            {listing.internal ? t({ en: 'Internal', zh: '自营' }) : listing.source}
          </Text>
          {listing.category ? <Text style={styles.badgeCat}>{t(CATEGORY_LABEL[listing.category])}</Text> : null}
          <Text style={styles.price}>{priceText}</Text>
        </View>
        {listing.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{listing.description}</Text>
        ) : null}

        {result ? (
          <Text style={[styles.resultLine, result.ok ? styles.resultOk : styles.resultWarn]}>
            {result.ok
              ? t({ en: `Done · ${result.status}`, zh: `已成交 · ${result.status}` })
              : result.status === 'backend_gap'
                ? t({ en: 'Accept backend pending; use external link.', zh: '代成交后端待上线，请用跳转外部' })
                : t({ en: `Not completed: ${result.reason || result.status}`, zh: `未完成：${result.reason || result.status}` })}
          </Text>
        ) : null}

        <View style={styles.cardBtnRow}>
          <TouchableOpacity
            style={[styles.cardBtn, styles.cardBtnPrimary, busy && styles.cardBtnDisabled]}
            disabled={busy}
            onPress={() => onParticipate(listing)}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.cardBtnPrimaryText}>
                {listing.canAccept ? t(label) : t({ en: 'Open', zh: '跳转' })}
              </Text>
            )}
          </TouchableOpacity>
          {listing.externalUrl ? (
            <TouchableOpacity
              style={[styles.cardBtn, styles.cardBtnGhost]}
              onPress={() => Linking.openURL(listing.externalUrl!).catch(() => {})}
              activeOpacity={0.85}
            >
              <Text style={styles.cardBtnGhostText}>{t({ en: 'Details', zh: '详情' })}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const renderMessage = ({ item }: { item: ChatMsg }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubbleRow, isUser ? styles.rowRight : styles.rowLeft]}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          {item.text ? (
            <Text style={[styles.bubbleText, isUser && styles.userText]}>{item.text}</Text>
          ) : null}
          {item.cards?.map(renderCard)}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {/* 品类快捷 chip */}
      <View style={styles.chipBar}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={['all', ...AGG_CATEGORY_ORDER, 'digest'] as const}
          keyExtractor={(c) => c}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item: c }) => {
            if (c === 'digest') {
              return (
                <TouchableOpacity style={[styles.chip, styles.chipAccent]} onPress={() => navigation.navigate('DigestPoster')}>
                  <Text style={styles.chipAccentText}>📰 {t({ en: 'Daily Digest', zh: '机会日报' })}</Text>
                </TouchableOpacity>
              );
            }
            const label = c === 'all' ? t({ en: 'All', zh: '全部' }) : t(CATEGORY_LABEL[c as AggCategory]);
            return (
              <TouchableOpacity
                style={styles.chip}
                disabled={loading}
                onPress={() => runSearch('', c === 'all' ? null : (c as AggCategory))}
              >
                <Text style={styles.chipText}>{label}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.listBody}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />

      {loading ? (
        <View style={styles.typing}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.typingText}>{t({ en: 'Searching…', zh: '正在检索全网…' })}</Text>
        </View>
      ) : null}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={t({ en: 'Find tasks / predictions / airdrops…', zh: '找任务 / 预测 / 空投 / 技能…' })}
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={onSend}
          returnKeyType="search"
          editable={!loading}
        />
        <TouchableOpacity style={[styles.sendBtn, (!input.trim() || loading) && styles.cardBtnDisabled]} onPress={onSend} disabled={!input.trim() || loading}>
          <Text style={styles.sendBtnText}>{t({ en: 'Send', zh: '发送' })}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  chipBar: { borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bgSecondary },
  chipRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, marginRight: 8 },
  chipText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  chipAccent: { backgroundColor: colors.accent, borderColor: colors.accent, marginRight: 8 },
  chipAccentText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  listBody: { padding: 14, paddingBottom: 20 },
  bubbleRow: { marginBottom: 12, flexDirection: 'row' },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '88%', borderRadius: 16, padding: 12 },
  assistantBubble: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  userBubble: { backgroundColor: colors.accent },
  bubbleText: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  userText: { color: '#fff' },
  card: { marginTop: 10, backgroundColor: colors.bgPrimary, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
  cardTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  badge: { fontSize: 10, fontWeight: '800', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  badgeInternal: { color: '#fff', backgroundColor: '#16a34a' },
  badgeExternal: { color: '#fff', backgroundColor: '#6366f1' },
  badgeCat: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, backgroundColor: colors.bgCard, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  price: { marginLeft: 'auto', color: colors.textPrimary, fontSize: 12, fontWeight: '700' },
  cardDesc: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 6 },
  resultLine: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  resultOk: { color: '#16a34a' },
  resultWarn: { color: '#d97706' },
  cardBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  cardBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardBtnPrimary: { backgroundColor: colors.accent },
  cardBtnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  cardBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  cardBtnGhostText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  cardBtnDisabled: { opacity: 0.5 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  typingText: { color: colors.textMuted, fontSize: 12 },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgSecondary },
  input: { flex: 1, backgroundColor: colors.bgCard, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, fontSize: 14 },
  sendBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 },
  sendBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});

export default OpportunityAssistantScreen;
