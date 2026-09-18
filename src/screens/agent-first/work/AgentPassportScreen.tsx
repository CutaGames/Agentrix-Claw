import React from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAgentPassport } from "../../../hooks/useAgentPassport";
import {
  buildMobileAgentPassportCard,
  getAgentPassportShareText,
  getAgentPassportShareUrl,
  type AgentPassportReadState,
} from "../../../services/agentPassport";
import { socialShareService } from "../../../services/socialShare";
import { getPassportEditorWebUrl } from "../../../services/webHandoff";
import { useI18n } from "../../../stores/i18nStore";
import { type Palette, useThemedStyles } from "../../../theme/useTheme";
import type {
  AgentPassportFact,
  PassportFactTone,
} from "../../../../shared/types/agent-passport-card";
import { useMobileAgentDirectory } from "../useMobileAgentDirectory";

type Lang = "zh" | "en";

function readStateCopy(
  state: AgentPassportReadState,
  lang: Lang,
): { title: string; detail: string } | null {
  const pick = (zh: string, en: string) => (lang === "zh" ? zh : en);
  switch (state.kind) {
    case "ready":
      return null;
    case "unknown":
      return {
        title: pick("正在读取名片…", "Reading the passport…"),
        detail: pick(
          "读到之前，下面的章都按「尚未确认」显示。",
          "Until it arrives every stamp below reads as unconfirmed.",
        ),
      };
    case "unauthorized":
      return {
        title: pick("登录后才能读取名片", "Sign in to read the passport"),
        detail: pick(
          "只有主人能读到确认过的信息；现在每一章都按「尚未确认」显示。",
          "Only the owner can read the confirmed facts; every stamp shows as unconfirmed for now.",
        ),
      };
    case "forbidden":
      return {
        title: pick("这个 Agent 不在你的名下", "This Agent is not yours"),
        detail: pick(
          "名片只对主人展示确认过的信息。",
          "The passport shows confirmed facts to its owner only.",
        ),
      };
    case "error":
      return {
        title: pick("名片暂时读不到", "The passport could not be read"),
        detail: `${pick("原因", "reason")}: ${state.reason}`,
      };
    default:
      return {
        title: pick("名片投影暂时不可用", "Passport projection unavailable"),
        detail: `${pick("原因", "reason")}: ${"reason" in state ? state.reason : state.kind}`,
      };
  }
}

function toneLabel(tone: PassportFactTone, lang: Lang): string {
  if (tone === "ready") return lang === "zh" ? "已盖章" : "stamped";
  if (tone === "todo") return lang === "zh" ? "待补" : "to do";
  return lang === "zh" ? "未确认" : "unconfirmed";
}

/**
 * Agent Passport — Mobile is the secondary, view-only renderer (matrix row 41,
 * integration note §2): the same six stamps, `AGX-` number and hero line the
 * Web card prints from the same projection, plus "share" (the Web public
 * page link) and "edit on Web". Nothing here writes the passport.
 */
export function AgentPassportScreen({ route }: any) {
  const { t, language } = useI18n();
  const lang: Lang = language === "zh" ? "zh" : "en";
  const styles = useThemedStyles(makeStyles);
  const agentId =
    typeof route?.params?.agentId === "string" ? route.params.agentId : "";
  const directory = useMobileAgentDirectory(agentId);
  const agent = directory.model.agents.find((item) => item.agentId === agentId);
  const { state, refetch } = useAgentPassport(agentId || undefined);
  const projection = state.kind === "ready" ? state.data : null;

  const card = React.useMemo(
    () =>
      buildMobileAgentPassportCard({
        name: agent?.displayName ?? "",
        agentAccountId: agentId || null,
        passport: projection,
      }),
    [agent?.displayName, agentId, projection],
  );
  const notice = readStateCopy(state, lang);
  const shareUrl = projection
    ? getAgentPassportShareUrl(card, projection.agentRef)
    : null;

  const onShare = async () => {
    if (!shareUrl) return;
    await socialShareService.share({
      title: card.name,
      // The shared formatter already ends with the link; no second url field.
      message: getAgentPassportShareText(card, lang, shareUrl),
    });
  };

  const stampedLine =
    lang === "zh"
      ? `${card.readyCount}/${card.facts.length} 项已盖章 · ${card.stage.zh}`
      : `${card.readyCount}/${card.facts.length} stamped · ${card.stage.en}`;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      testID="agent-passport-screen"
    >
      <Text style={styles.eyebrow}>AGENT</Text>
      <Text style={styles.title}>{t({ en: "Passport", zh: "名片" })}</Text>

      {notice ? (
        <View style={styles.notice} testID={`agent-passport-read-state-${state.kind}`}>
          <Text style={styles.noticeTitle}>{notice.title}</Text>
          <Text style={styles.noticeText}>{notice.detail}</Text>
          {state.kind === "error" ? (
            <TouchableOpacity
              style={styles.noticeButton}
              onPress={refetch}
              testID="agent-passport-retry"
            >
              <Text style={styles.noticeButtonText}>
                {t({ en: "Read again", zh: "重新读取" })}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View
        style={[
          styles.passport,
          { backgroundColor: card.theme.bg[1], borderColor: card.theme.line },
        ]}
        testID="agent-passport-card"
      >
        <Text style={[styles.passportName, { color: card.theme.ink }]} testID="agent-passport-name">
          {card.name}
        </Text>
        <Text style={[styles.passportNumber, { color: card.theme.accent }]} testID="agent-passport-number">
          {card.number}
        </Text>
        <Text style={[styles.passportHero, { color: card.theme.ink }]} testID="agent-passport-hero">
          {card.hero[lang]}
        </Text>
        <Text style={[styles.passportMeta, { color: card.theme.inkMuted }]} testID="agent-passport-stage">
          {stampedLine}
        </Text>
        {card.evidence.issuedOn ? (
          <Text style={[styles.passportMeta, { color: card.theme.inkMuted }]}>
            {lang === "zh" ? `签发于 ${card.evidence.issuedOn}` : `Issued ${card.evidence.issuedOn}`}
          </Text>
        ) : null}
        <Text style={[styles.passportTagline, { color: card.theme.inkMuted }]}>
          {card.tagline[lang]}
        </Text>
      </View>

      <View style={styles.facts} testID="agent-passport-facts">
        {card.facts.map((fact: AgentPassportFact) => (
          <View
            key={fact.id}
            style={styles.fact}
            testID={`agent-passport-fact-${fact.id}`}
          >
            <View style={styles.factHeader}>
              <Text style={styles.factLabel}>{fact.label[lang]}</Text>
              <Text
                style={
                  fact.tone === "ready"
                    ? styles.toneReady
                    : fact.tone === "todo"
                      ? styles.toneTodo
                      : styles.toneUnknown
                }
              >
                {toneLabel(fact.tone, lang)}
              </Text>
            </View>
            <Text style={styles.factValue}>{fact.value[lang]}</Text>
            {fact.why[lang] ? (
              <Text style={styles.factWhy}>{fact.why[lang]}</Text>
            ) : null}
          </View>
        ))}
      </View>

      {card.visas.length > 0 ? (
        <View style={styles.facts} testID="agent-passport-visas">
          <Text style={styles.sectionTitle}>
            {t({ en: "Entries", zh: "签证页" })}
          </Text>
          {card.visas.map((visa) => (
            <Text key={visa.id} style={styles.factValue}>
              {visa.label[lang]}
            </Text>
          ))}
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.primaryButton, !shareUrl && styles.disabled]}
        disabled={!shareUrl}
        onPress={() => void onShare()}
        testID="agent-passport-share"
      >
        <Text style={styles.primaryButtonText}>
          {t({ en: "Share passport", zh: "分享名片" })}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => void Linking.openURL(getPassportEditorWebUrl())}
        testID="agent-passport-edit-web"
      >
        <Text style={styles.secondaryButtonText}>
          {t({ en: "Edit the introduction on Web", zh: "在 Web 修改自我介绍" })}
        </Text>
      </TouchableOpacity>
      <Text style={styles.helper}>
        {t({
          en: "Read-only here. The introduction, theme and share scopes are edited on Web; the share link opens the Web public page, which shows ranges only and never the account id.",
          zh: "此处只读：自我介绍、主题与分享范围在 Web 修改；分享链接打开 Web 公开页，公开只显示区间，不含账号 ID。",
        })}
      </Text>
    </ScrollView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 18, paddingBottom: 48, gap: 14 },
    eyebrow: {
      color: c.accent,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.2,
    },
    title: { color: c.textPrimary, fontSize: 28, fontWeight: "800" },
    sectionTitle: { color: c.textPrimary, fontSize: 15, fontWeight: "700" },
    notice: {
      backgroundColor: "#fff7dd",
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: "#ead8a2",
      gap: 4,
    },
    noticeTitle: { color: "#5f4b22", fontSize: 14, fontWeight: "800" },
    noticeText: { color: "#75633c", fontSize: 12, lineHeight: 18 },
    noticeButton: { alignSelf: "flex-start", marginTop: 6 },
    noticeButtonText: { color: "#5f4b22", fontSize: 12, fontWeight: "800" },
    passport: {
      borderRadius: 22,
      padding: 18,
      borderWidth: 1,
      gap: 6,
    },
    passportName: { fontSize: 22, fontWeight: "800" },
    passportNumber: { fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
    passportHero: { fontSize: 16, fontWeight: "700", lineHeight: 22, marginTop: 6 },
    passportMeta: { fontSize: 12, lineHeight: 18 },
    passportTagline: { fontSize: 11, lineHeight: 16, marginTop: 6 },
    facts: {
      backgroundColor: c.bgCard,
      borderRadius: 16,
      padding: 15,
      borderWidth: 1,
      borderColor: c.border,
      gap: 12,
    },
    fact: { gap: 3 },
    factHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },
    factLabel: { color: c.textPrimary, fontSize: 14, fontWeight: "800" },
    factValue: { color: c.textSecondary, fontSize: 13, lineHeight: 20 },
    factWhy: { color: c.textMuted, fontSize: 11, lineHeight: 16 },
    toneReady: { color: "#25855a", fontSize: 11, fontWeight: "800" },
    toneTodo: { color: "#b75d20", fontSize: 11, fontWeight: "800" },
    toneUnknown: { color: c.textMuted, fontSize: 11, fontWeight: "800" },
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
    },
    secondaryButtonText: { color: c.textPrimary, fontSize: 15, fontWeight: "700" },
    disabled: { opacity: 0.45 },
    helper: {
      color: c.textMuted,
      fontSize: 11,
      lineHeight: 16,
      textAlign: "center",
    },
  });
}
