import React from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AGENT_HOME_DEFAULT_SURFACES } from "../../../navigation/agent-first/iaContract";
import type { MobileAgentOption } from "../../../services/mobileAgentEconomyModel";
import { isMobileV6FeatureEnabled } from "../../../services/mobileV6FeatureFlags";
import { useI18n } from "../../../stores/i18nStore";
import { useThemedStyles, type Palette } from "../../../theme/useTheme";
import { useMobileAgentDirectory } from "../useMobileAgentDirectory";

function shortId(value?: string): string {
  if (!value) return "—";
  return value.length > 18 ? `${value.slice(0, 9)}…${value.slice(-6)}` : value;
}

const SURFACE_COPY = {
  Companion: {
    emoji: "🐾",
    title: { en: "Companion", zh: "伙伴" },
    subtitle: { en: "Talk and hand off", zh: "对话与接力" },
  },
  HardwareAssurance: {
    emoji: "🔐",
    title: { en: "Soul Core", zh: "Soul Core" },
    subtitle: { en: "Identity & optional hardware", zh: "身份与可选硬件" },
  },
} as const;

function AgentSelector({
  visible,
  agents,
  selectedAgentId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  agents: MobileAgentOption[];
  selectedAgentId?: string;
  onSelect: (agentId: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>
            {t({ en: "Choose an Agent", zh: "选择 Agent" })}
          </Text>
          <Text style={styles.sheetHint}>
            {t({
              en: "Switching changes only this mobile session. It never changes canonical Primary ownership.",
              zh: "切换仅影响本次移动端会话，不会修改 canonical Primary 或所有权。",
            })}
          </Text>
          {agents.length === 0 ? (
            <Text style={styles.muted}>
              {t({
                en: "No owned Agent mapping is available.",
                zh: "暂无可用的已归属 Agent 映射。",
              })}
            </Text>
          ) : null}
          {agents.map((agent) => (
            <TouchableOpacity
              key={agent.agentId}
              style={[
                styles.agentRow,
                selectedAgentId === agent.agentId && styles.agentRowActive,
              ]}
              onPress={() => onSelect(agent.agentId)}
              testID={`agent-option-${agent.agentId}`}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>✦</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{agent.displayName}</Text>
                <Text style={styles.muted}>
                  {shortId(agent.agentId)} · {agent.runtimeStatus}
                </Text>
              </View>
              <Text style={styles.chevron}>
                {selectedAgentId === agent.agentId ? "✓" : "›"}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>
              {t({ en: "Close", zh: "关闭" })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export function AgentHomeScreen({ navigation }: any) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const directory = useMobileAgentDirectory();
  const [selectorOpen, setSelectorOpen] = React.useState(false);
  const context = directory.model.context;
  const selected = directory.model.agents.find(
    (agent) => agent.agentId === directory.model.selectedAgentId,
  );
  const economyEnabled = isMobileV6FeatureEnabled("mobile.agent_economy_v1");

  const openPrimary = () => {
    if (context.kind !== "ready") {
      setSelectorOpen(true);
      return;
    }
    navigation.navigate("GoalComposer", {
      agentId: context.context.agentId,
    });
  };

  const openSurface = (
    surface: (typeof AGENT_HOME_DEFAULT_SURFACES)[number],
  ) => {
    if (surface === "Companion") {
      navigation.navigate("Companion");
      return;
    }
    if (selected) {
      navigation.navigate("HardwareAssurance", { agentId: selected.agentId });
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      testID="agent-home-screen"
    >
      <Text style={styles.eyebrow}>
        {t({ en: "YOUR AGENT", zh: "你的 AGENT" })}
      </Text>
      <TouchableOpacity
        style={styles.heroCard}
        onPress={() => setSelectorOpen(true)}
        testID="agent-switcher"
      >
        <View style={styles.heroAvatar}>
          <Text style={styles.heroAvatarText}>✦</Text>
        </View>
        <View style={styles.flex}>
          <Text
            style={styles.heroTitle}
            testID="agent-selected-name"
            numberOfLines={1}
          >
            {selected?.displayName ??
              t({ en: "Choose an Agent", zh: "选择一个 Agent" })}
          </Text>
          <Text style={styles.heroSubtitle}>
            {selected
              ? `${shortId(selected.agentId)} · ${selected.runtimeStatus}`
              : t({
                  en: "Multiple Agents are supported",
                  zh: "支持拥有和切换多个 Agent",
                })}
          </Text>
        </View>
        <Text style={styles.chevron}>⌄</Text>
      </TouchableOpacity>

      {context.kind !== "ready" ? (
        <View style={styles.notice} testID={`read-state-${context.kind}`}>
          <Text style={styles.noticeTitle}>
            {t({
              en: "Agent context is not ready",
              zh: "Agent 上下文尚未就绪",
            })}
          </Text>
          <Text style={styles.noticeText}>{context.reason}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>
        {t({ en: "Talk with your Agent", zh: "和 Agent 沟通" })}
      </Text>
      <View style={styles.grid} testID="agent-communication-surfaces">
        <TouchableOpacity
          style={styles.featureCard}
          onPress={() =>
            navigation.navigate("Companion", { screen: "VoiceChat" })
          }
          testID="agent-open-voice-chat"
        >
          <Text style={styles.featureEmoji}>🎙️</Text>
          <Text style={styles.cardTitle}>
            {t({ en: "Voice conversation", zh: "语音对话" })}
          </Text>
          <Text style={styles.muted}>
            {t({ en: "Duplex STT / TTS", zh: "双工 STT / TTS" })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.featureCard}
          onPress={() =>
            navigation.navigate("Companion", { screen: "SummonRoot" })
          }
          testID="agent-open-text-chat"
        >
          <Text style={styles.featureEmoji}>💬</Text>
          <Text style={styles.cardTitle}>
            {t({ en: "Text chat", zh: "文本 Chat" })}
          </Text>
          <Text style={styles.muted}>
            {t({ en: "Streaming conversation", zh: "流式对话" })}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.notice} testID="agent-call-contract-unavailable">
        <Text style={styles.noticeTitle}>
          {t({ en: "Incoming voice / video calls", zh: "来电语音 / 视频通话" })}
        </Text>
        <Text style={styles.noticeText}>
          {t({
            en: "Unavailable until a live callSessionRef and incoming-call contract are published. Chat voice remains available.",
            zh: "等待 live callSessionRef 与来电合同发布；Chat 语音仍可正常使用。",
          })}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>
        {t({ en: "Give Agent a one-time goal", zh: "交代一个一次性目标" })}
      </Text>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={openPrimary}
        testID="agent-primary-goal"
      >
        <Text style={styles.primaryButtonText}>
          {context.kind === "ready"
            ? t({ en: "Give Agent a goal", zh: "交给 Agent 一个目标" })
            : t({ en: "Choose an Agent", zh: "选择 Agent" })}
        </Text>
      </TouchableOpacity>
      <Text style={styles.helper}>
        {t({
          en: "Spoken or typed goals are one-time. IDE, CLI and file side effects are handed to Work/Desktop.",
          zh: "口述或输入的目标均为一次性；IDE、CLI 与文件副作用会交接到 Work/Desktop。",
        })}
      </Text>
      {!economyEnabled ? (
        <Text style={styles.helper}>
          {t({
            en: "Agent Economy live submission is not enabled in this build. Drafting remains available.",
            zh: "此构建未开启 Agent Economy live 提交；仍可查看并编辑目标草稿。",
          })}
        </Text>
      ) : null}

      <Text style={styles.sectionTitle}>
        {t({ en: "Soul Core & Trust", zh: "Soul Core 与信任" })}
      </Text>
      <View style={styles.trustCard} testID="agent-trust-summary">
        <View style={styles.trustRow}>
          <Text style={styles.cardTitle}>Soul Core</Text>
          <Text
            style={
              selected?.canonicalMapping === "ready"
                ? styles.readyText
                : styles.warningText
            }
          >
            {selected?.canonicalMapping === "ready"
              ? t({ en: "Active mapping", zh: "映射正常" })
              : t({ en: "Unavailable", zh: "不可用" })}
          </Text>
        </View>
        <View style={styles.trustRow}>
          <Text style={styles.cardTitle}>
            {t({ en: "Context", zh: "上下文" })}
          </Text>
          <Text
            style={
              context.kind === "ready" ? styles.readyText : styles.warningText
            }
          >
            {context.kind === "ready"
              ? t({ en: "Agent-scoped", zh: "已按 Agent 隔离" })
              : context.kind}
          </Text>
        </View>
        <View style={styles.trustRow}>
          <Text style={styles.cardTitle}>
            {t({ en: "Trust projection", zh: "信任投影" })}
          </Text>
          <Text style={styles.muted}>
            {t({
              en: "Contextual · no universal score",
              zh: "按上下文展示 · 不使用万能总分",
            })}
          </Text>
        </View>
      </View>

      {directory.model.agents.length === 0 ? (
        <View style={styles.notice} testID="agent-create-unavailable">
          <Text style={styles.noticeTitle}>
            {t({ en: "Create Agent", zh: "创建 Agent" })}
          </Text>
          <Text style={styles.noticeText}>
            {t({
              en: "The canonical create-and-initialize-Soul-Core command is not available on this Mobile build yet.",
              zh: "当前 Mobile 构建尚未提供 canonical“创建 Agent 并初始化 Soul Core”命令。",
            })}
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>
        {t({ en: "Agent surfaces", zh: "Agent 能力入口" })}
      </Text>
      <View style={styles.grid} testID="agent-home-default-surfaces">
        {AGENT_HOME_DEFAULT_SURFACES.map((surface) => {
          const copy = SURFACE_COPY[surface];
          const disabled = surface === "HardwareAssurance" && !selected;
          return (
            <TouchableOpacity
              key={surface}
              style={[styles.featureCard, disabled && styles.disabled]}
              onPress={() => openSurface(surface)}
              disabled={disabled}
              testID={`agent-home-surface-${surface}`}
            >
              <Text style={styles.featureEmoji}>{copy.emoji}</Text>
              <Text style={styles.cardTitle}>{t(copy.title)}</Text>
              <Text style={styles.muted}>{t(copy.subtitle)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <AgentSelector
        visible={selectorOpen}
        agents={directory.model.agents}
        selectedAgentId={directory.model.selectedAgentId}
        onSelect={(agentId) => {
          directory.selectAgent(agentId);
          setSelectorOpen(false);
        }}
        onClose={() => setSelectorOpen(false)}
      />
    </ScrollView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 18, paddingBottom: 48, gap: 14 },
    flex: { flex: 1 },
    eyebrow: {
      color: c.accent,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.2,
    },
    heroCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: "#fff4e8",
      borderRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: "#f2d6bc",
    },
    heroAvatar: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#e98b5f",
    },
    heroAvatarText: { color: "#fff", fontSize: 25, fontWeight: "800" },
    heroTitle: { color: c.textPrimary, fontSize: 20, fontWeight: "800" },
    heroSubtitle: { color: c.textSecondary, fontSize: 12, marginTop: 3 },
    sectionTitle: {
      color: c.textPrimary,
      fontSize: 18,
      fontWeight: "800",
      marginTop: 8,
    },
    cardTitle: { color: c.textPrimary, fontSize: 15, fontWeight: "700" },
    muted: { color: c.textMuted, fontSize: 12, lineHeight: 18 },
    helper: {
      color: c.textMuted,
      fontSize: 11,
      lineHeight: 16,
      textAlign: "center",
    },
    primaryButton: {
      backgroundColor: "#df744f",
      minHeight: 52,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
    },
    primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    secondaryButton: {
      minHeight: 46,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: c.border,
      marginTop: 8,
    },
    secondaryButtonText: {
      color: c.textPrimary,
      fontSize: 15,
      fontWeight: "700",
    },
    disabled: { opacity: 0.45 },
    notice: {
      backgroundColor: "#fff7dd",
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: "#ead8a2",
    },
    noticeTitle: { color: "#5f4b22", fontSize: 14, fontWeight: "800" },
    noticeText: {
      color: "#75633c",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },
    trustCard: {
      backgroundColor: c.bgCard,
      borderRadius: 18,
      padding: 15,
      borderWidth: 1,
      borderColor: c.border,
      gap: 12,
    },
    trustRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },
    readyText: { color: "#25855a", fontSize: 12, fontWeight: "800" },
    warningText: { color: "#b75d20", fontSize: 12, fontWeight: "800" },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    featureCard: {
      width: "48%",
      minHeight: 122,
      backgroundColor: c.bgCard,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
    },
    featureEmoji: { fontSize: 27, marginBottom: 8 },
    chevron: { color: c.textMuted, fontSize: 20, marginLeft: 8 },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(45,36,31,0.45)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: c.bgPrimary,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingBottom: 34,
      gap: 10,
      maxHeight: "80%",
    },
    sheetTitle: { color: c.textPrimary, fontSize: 22, fontWeight: "800" },
    sheetHint: { color: c.textSecondary, fontSize: 12, lineHeight: 18 },
    agentRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 12,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgCard,
    },
    agentRowActive: { borderColor: "#df744f", backgroundColor: "#fff4e8" },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#f1ddd0",
    },
    avatarText: { color: "#b85e3f", fontWeight: "800" },
  });
}
