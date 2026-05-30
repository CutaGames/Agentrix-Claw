/**
 * PetDetailSheet — long-press the companion ball ⇒ 85% BottomSheet
 * surfacing the pet's full status across wallet, skills, cross-device,
 * companion actions, co-raising, and settings.
 *
 * Phase 1 strategy (T6):
 *   - 9 sections per design.md §Components/Core 3.
 *   - Phase 1 is **navigational hub** style: most sections are 1-row CTAs
 *     that route into existing screens (Wardrobe / SoulPicker / Breed /
 *     Wallet / etc). The wallet + skills + cross-device cards do show
 *     live counts up top so the sheet feels alive.
 *   - Section subcomponents are React.memo'd so editing one (e.g. user
 *     toggling a switch in CompanionActions) doesn't re-render the whole
 *     sheet (R10.4 perf budget).
 *   - Pull-down ≥ 30% dismisses (default @gorhom behavior at snap 85%).
 *
 * Spec: requirements.md R4.1 / R4.2 / R4.4 / R4.6 / R4.7 / R4.9.
 */
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { colors } from '../../theme/colors';
import { useActivePet } from '../../services/activePet.service';
import { useAuthStore } from '../../stores/authStore';
import { navRefNavigate } from '../../navigation/navigationRef';
import { getCompanionMode } from '../../services/petMode';
import { companionEvents } from '../../services/companionEvents.service';
import {
  petDetailSheetRef,
  type PetDetailSheetHandle,
  type PetDetailSection,
} from './sheetRefRegistry';

const SNAP_POINTS = ['85%'];

export const PetDetailSheet = forwardRef<PetDetailSheetHandle>(
  function PetDetailSheet(_props, externalRef) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const scrollRef = useRef<ScrollView>(null);
    // Navigate via shared navigationRef — NOT useNavigation() (which throws
    // at the CompanionLayer sibling position; root cause of the dead ball).
    const navigation = useMemo(
      () => ({ navigate: (...args: any[]) => navRefNavigate(...args) }),
      [],
    );
    const pet = useActivePet();
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const instances = useAuthStore((s) => s.user?.openClawInstances ?? []);

    // P1a — real data for hero / wallet / skills (was hardcoded placeholders).
    const [detail, setDetail] = useState<import('../../services/petDetail.api').PetDetailData | null>(null);
    const loadDetail = useCallback(async () => {
      try {
        const { fetchPetDetailData } = await import('../../services/petDetail.api');
        const data = await fetchPetDetailData();
        setDetail(data);
      } catch (err) {
        console.warn('[PetDetailSheet] loadDetail failed:', err);
      }
    }, []);

    const present = useCallback(() => {
      // P-9 wave 14 (T24.2): perf budget is P95 ≤ 250ms from emit →
      // sheet visible at 85% snap.
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const perfMod = require('../../services/companionPerf') as typeof import('../../services/companionPerf');
      const perfTok = perfMod.beginMark('pet-detail-sheet-present');
      // R4.6: long-press is blocked while signing. The ball already
      // suppresses long-press in that mode, but double-check defense
      // here in case present() is called from another path (push, intent).
      const mode = getCompanionMode();
      if (mode === 'signing') return;
      if (!isAuthenticated) {
        // R4.9 graceful degradation — surface a Toast via voiceDiagnostics
        // but don't open the sheet. Routing to login is the caller's job.
        try {
          companionEvents.emit({
            type: 'mode-changed',
            from: mode,
            to: mode,
            source: 'pet-detail-blocked-not-auth',
          });
        } catch {
          /* ignore */
        }
        navigation.navigate('Auth', { screen: 'Login' });
        return;
      }
      sheetRef.current?.present();
      perfMod.endMark(perfTok);
      // Kick off real-data fetch (best-effort, non-blocking).
      void loadDetail();
    }, [isAuthenticated, navigation, loadDetail]);

    const dismiss = useCallback(() => {
      sheetRef.current?.dismiss();
    }, []);

    const expandSection = useCallback((section: PetDetailSection) => {
      // Phase 1 — best-effort scroll. Each section subcomponent registers
      // its layout y in the parent's ref map.
      const y = sectionLayoutsRef.current[section];
      if (typeof y === 'number') {
        scrollRef.current?.scrollTo({ y, animated: true });
      }
    }, []);

    const handle = useMemo<PetDetailSheetHandle>(
      () => ({ present, dismiss, expandSection }),
      [present, dismiss, expandSection],
    );

    useImperativeHandle(externalRef, () => handle, [handle]);

    useEffect(() => {
      petDetailSheetRef.current = handle;
      return () => {
        petDetailSheetRef.current = null;
      };
    }, [handle]);

    const sectionLayoutsRef = useRef<Partial<Record<PetDetailSection, number>>>({});
    const onSectionLayout = useCallback(
      (section: PetDetailSection) => (e: any) => {
        sectionLayoutsRef.current[section] = e.nativeEvent.layout.y;
      },
      [],
    );

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="close"
          opacity={0.45}
        />
      ),
      [],
    );

    const navigateAndDismiss = useCallback(
      (target: () => void) => {
        try {
          target();
        } finally {
          dismiss();
        }
      },
      [dismiss],
    );

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={SNAP_POINTS}
        index={0}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handleIndicator}
        enableDismissOnClose
      >
        <BottomSheetView style={styles.container}>
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <HeroBlock
              pet={pet}
              detail={detail}
              hasMultiplePets={instances.length > 1}
              onSwitchPet={() =>
                navigateAndDismiss(() => navigation.navigate('MyAgents'))
              }
            />

            <StatusOverviewSection detail={detail} />

            <View onLayout={onSectionLayout('wallet')}>
              <WalletCardSection
                detail={detail}
                onOpenWallet={() =>
                  navigateAndDismiss(() =>
                    navigation.navigate('Main', {
                      screen: 'Me',
                      params: { screen: 'WalletConnect' },
                    }),
                  )
                }
                onTransfer={() =>
                  navigateAndDismiss(() => navigation.navigate('QuickPay'))
                }
                onTrust3Demo={async () => {
                  // P-9 wave 4 (T7.6 stub): create a real sign-request via
                  // the backend queue and emit `trust3-signing-request` so
                  // the Trust3SigningSheet flows end-to-end. The sheet
                  // takes over from here (locks the ball, runs biometric,
                  // POSTs /complete). Phase 1 wallet plumbing reuses this
                  // path for marketplace, remote-control, etc.
                  try {
                    const { createSignRequest } = await import(
                      '../../services/signRequest.service'
                    );
                    const row = await createSignRequest({
                      reason: 'wallet-transfer',
                      metadata: {
                        petId: pet.id,
                        summary: {
                          from: '我的钱包',
                          to: pet.name + ' AgentAccount',
                          amount: '0.10 USDC',
                          gas: '~$0.01',
                        },
                        risk: 'L1',
                        riskExplanationZh:
                          '小额内部转账。完成后会立即写入 wallet-delta 事件,你能在浮球看到回执。',
                      },
                      timeoutSeconds: 60,
                    });
                    if (row.cachedHit && row.signature) {
                      // Already signed — surface as wallet-delta directly.
                      companionEvents.emit({
                        type: 'wallet-delta',
                        delta: 0.1,
                        currency: 'USDC',
                        source: 'transfer-out',
                        petId: pet.id,
                      });
                      return;
                    }
                    companionEvents.emit({
                      type: 'trust3-signing-request',
                      signRequestId: row.id,
                      reason: row.reason,
                      metadata: (row.metadata as Record<string, unknown>) ?? {},
                      expiresAtMs: row.expiresAt
                        ? Date.parse(row.expiresAt)
                        : Date.now() + 60_000,
                    });
                    // Don't dismiss — Trust3SigningSheet stacks above.
                  } catch (err) {
                    console.warn('[PetDetailSheet] trust3 demo failed:', err);
                  }
                }}
              />
            </View>

            <View onLayout={onSectionLayout('skills')}>
              <SkillsCardSection
                detail={detail}
                onOpenInstall={() =>
                  navigateAndDismiss(() =>
                    navigation.navigate('Main', {
                      screen: 'Plaza',
                      params: { screen: 'Skills' },
                    }),
                  )
                }
                onMySkills={() =>
                  navigateAndDismiss(() =>
                    navigation.navigate('Main', {
                      screen: 'Me',
                      params: { screen: 'MySkills' },
                    }),
                  )
                }
              />
            </View>

            <View onLayout={onSectionLayout('cross-device')}>
              <CrossDeviceCardSection
                originDeviceId={pet.id}
                instances={instances}
                onManageDevices={() =>
                  navigateAndDismiss(() =>
                    navigation.navigate('Main', {
                      screen: 'Me',
                      params: { screen: 'WearableHub' },
                    }),
                  )
                }
              />
            </View>

            <View onLayout={onSectionLayout('companion-actions')}>
              <CompanionActionsGridSection
                onAction={(target) => navigateAndDismiss(target)}
                navigation={navigation}
              />
            </View>

            <View onLayout={onSectionLayout('co-raising')}>
              <CoRaisingEntrySection
                onPress={() =>
                  navigateAndDismiss(() =>
                    navigation.navigate('Main', {
                      screen: 'Plaza',
                      params: { screen: 'CoRaisingInvite' },
                    }),
                  )
                }
              />
            </View>

            <View onLayout={onSectionLayout('settings')}>
              <SettingsEntrySection
                onPress={() =>
                  navigateAndDismiss(() =>
                    navigation.navigate('Main', {
                      screen: 'Me',
                      params: { screen: 'CompanionSettings' },
                    }),
                  )
                }
              />
            </View>

            <View style={{ height: 32 }} />
          </ScrollView>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

// ─── Section components (placed below the sheet for readability) ─────────

interface HeroBlockProps {
  pet: ReturnType<typeof useActivePet>;
  detail: import('../../services/petDetail.api').PetDetailData | null;
  hasMultiplePets: boolean;
  onSwitchPet: () => void;
}
const HeroBlock = React.memo(function HeroBlock({
  pet,
  detail,
  hasMultiplePets,
  onSwitchPet,
}: HeroBlockProps) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { xpProgress, emotionEmoji } = require('../../services/petDetail.api') as typeof import('../../services/petDetail.api');
  const ps = detail?.pet ?? null;
  const level = ps?.intimacy_level ?? null;
  const xp = ps?.intimacy_xp ?? 0;
  const energy = detail?.energy ?? null;
  const prog = level != null ? xpProgress(level, xp) : null;

  const metaText =
    ps == null
      ? '加载中…'
      : `Lv ${level} · 心情${emotionEmoji(ps.emotion)}` +
        (energy != null ? ` · 能量 ${Math.round(energy)}%` : '');

  return (
    <View style={styles.hero}>
      <View style={styles.heroAvatar}>
        <Text style={styles.heroAvatarEmoji}>🐾</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 16 }}>
        <View style={styles.heroNameRow}>
          <Text style={styles.heroName}>{pet.name}</Text>
          {hasMultiplePets ? (
            <TouchableOpacity onPress={onSwitchPet} hitSlop={8} accessibilityLabel="切换宠物">
              <Text style={styles.heroSwitch}>切换 ▾</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={styles.heroMeta}>{metaText}</Text>
        <View style={styles.xpBarBg}>
          <View style={[styles.xpBarFill, { width: `${prog?.pct ?? 0}%` }]} />
        </View>
      </View>
    </View>
  );
});

const StatusOverviewSection = React.memo(function StatusOverviewSection({
  detail,
}: {
  detail: import('../../services/petDetail.api').PetDetailData | null;
}) {
  const emotion = detail?.pet?.emotion ?? null;
  const action =
    emotion === 'sleepy' || emotion === 'tired'
      ? '它有点累了,在休息'
      : emotion === 'focused'
        ? '它正在专注工作'
        : emotion === 'excited' || emotion === 'happy'
          ? '它心情不错,陪着你'
          : '它正陪你逛集市';
  return (
    <View style={styles.statusOverview}>
      <Text style={styles.statusActionText}>它在做什么:{action}</Text>
      <View style={styles.statusDeviceRow}>
        <Text style={styles.statusDeviceEmoji}>📱</Text>
        <Text style={styles.statusDeviceEmojiDim}>🖥</Text>
        <Text style={styles.statusDeviceEmojiDim}>⌚</Text>
        <Text style={styles.statusDeviceEmojiDim}>👓</Text>
      </View>
    </View>
  );
});

interface WalletCardProps {
  detail: import('../../services/petDetail.api').PetDetailData | null;
  onOpenWallet: () => void;
  onTransfer: () => void;
  onTrust3Demo: () => void;
}
const WalletCardSection = React.memo(function WalletCardSection({
  detail,
  onOpenWallet,
  onTransfer,
  onTrust3Demo,
}: WalletCardProps) {
  const axp = detail?.axp ?? null;
  const axpText = axp ? String(axp.balance) : '—';
  const usdText =
    axp && typeof axp.usd_value_cents === 'number'
      ? `$${(axp.usd_value_cents / 100).toFixed(2)}`
      : '—';
  return (
    <SectionCard
      title="💰 钱包"
      subtitle="它的 AgentAccount + 我的钱包"
    >
      <View style={styles.walletRow}>
        <View style={styles.walletCol}>
          <Text style={styles.walletLabel}>AXP</Text>
          <Text style={styles.walletValue}>{axpText}</Text>
        </View>
        <View style={styles.walletCol}>
          <Text style={styles.walletLabel}>≈ USD</Text>
          <Text style={styles.walletValue}>{usdText}</Text>
        </View>
        <View style={styles.walletCol}>
          <Text style={styles.walletLabel}>USDC</Text>
          <Text style={styles.walletValue}>—</Text>
        </View>
      </View>
      <View style={styles.cardActionRow}>
        <ActionButton label="转账" onPress={onTransfer} />
        <ActionButton label="试签名" onPress={onTrust3Demo} variant="ghost" />
        <ActionButton label="打开钱包" onPress={onOpenWallet} variant="ghost" />
      </View>
    </SectionCard>
  );
});

interface SkillsCardProps {
  detail: import('../../services/petDetail.api').PetDetailData | null;
  onOpenInstall: () => void;
  onMySkills: () => void;
}
const SkillsCardSection = React.memo(function SkillsCardSection({
  detail,
  onOpenInstall,
  onMySkills,
}: SkillsCardProps) {
  const skins = detail?.skins ?? [];
  // P1a — surface the user's REAL owned skins (skin = the pet's installed
  // visual capability) instead of three hardcoded pills. Falls back to a
  // hint when the user hasn't acquired any yet.
  const pills = skins.slice(0, 3);
  return (
    <SectionCard title="🧠 技能 / 皮肤" subtitle="已拥有 / 安装新的">
      <View style={styles.skillRow}>
        {pills.length > 0 ? (
          pills.map((s) => (
            <Text key={s.id} style={styles.skillItemText} numberOfLines={1}>
              {s.format === 'vrm' ? '🧸' : '🎨'} {s.display_name}
            </Text>
          ))
        ) : (
          <Text style={styles.skillItemText}>
            {detail == null ? '加载中…' : '还没有皮肤,去市场逛逛'}
          </Text>
        )}
      </View>
      <View style={styles.cardActionRow}>
        <ActionButton label="装新的" onPress={onOpenInstall} />
        <ActionButton label="我的技能" onPress={onMySkills} variant="ghost" />
      </View>
    </SectionCard>
  );
});

interface CrossDeviceCardProps {
  onManageDevices: () => void;
  originDeviceId: string;
  instances: Array<{ id: string; name: string; status?: string }>;
}
const CrossDeviceCardSection = React.memo(function CrossDeviceCardSection({
  onManageDevices,
  originDeviceId,
  instances,
}: CrossDeviceCardProps) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { RemoteControlPanel } = require('./RemoteControlPanel') as typeof import('./RemoteControlPanel');
  // `presence:device.list` backend API doesn't exist yet (T0 audit), so we
  // surface the user's real OpenClaw instances as the cross-device list +
  // always show 📱 (this device) online. Phase 2 swaps to the live topic.
  const activeInstances = instances.filter((i) => i.status === 'active');
  return (
    <SectionCard title="🔗 跨端" subtitle="同一只宠物 · 同一份记忆">
      <View style={styles.deviceListRow}>
        <DevicePill emoji="📱" name="本机" online />
        {activeInstances.length > 0 ? (
          <DevicePill emoji="🖥" name={`实例 ×${activeInstances.length}`} online />
        ) : (
          <DevicePill emoji="🖥" name="桌面" online={false} />
        )}
        <DevicePill emoji="⌚" name="手表" online={false} />
      </View>
      <RemoteControlPanel originDeviceId={originDeviceId} />
      <View style={styles.cardActionRow}>
        <ActionButton label="管理设备" onPress={onManageDevices} variant="ghost" />
      </View>
    </SectionCard>
  );
});

interface CompanionActionsGridProps {
  onAction: (target: () => void) => void;
  navigation: any;
}
const CompanionActionsGridSection = React.memo(function CompanionActionsGridSection({
  onAction,
  navigation,
}: CompanionActionsGridProps) {
  // P-9 Q1 — nav targets now point at the registered Me-stack routes
  // (T6.7 re-home). `inPlace` actions (feed / greet) run without
  // dismissing the sheet so the user sees the pet react immediately.
  const meRoute = (screen: string) => () =>
    navigation.navigate('Main', { screen: 'Me', params: { screen } });

  const items: Array<{
    emoji: string;
    label: string;
    inPlace?: boolean;
    target: () => void;
  }> = [
    {
      emoji: '🍖',
      label: '喂食',
      inPlace: true,
      target: () => {
        // Q1: real backend call — POST /v1/pet/intimacy { xp }. Optimistic
        // mode-change so the ball reacts instantly; failure is non-fatal
        // (it's an enhancement, not a blocking flow).
        companionEvents.emit({
          type: 'mode-changed',
          from: 'companion',
          to: 'whisper',
          source: 'feed-action',
        });
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const { feedPet } = require('../../services/mobilePetSdk') as typeof import('../../services/mobilePetSdk');
        void feedPet(5).catch(() => {
          /* enhancement only — surfacing an error toast is out of Q1 scope */
        });
      },
    },
    {
      emoji: '🎙',
      label: '打招呼',
      inPlace: true,
      target: () => {
        // P-9 wave 6 — call backend /v1/pet/greet via scheduler so the
        // text is Bedrock-generated when possible (fallback templates
        // otherwise). The scheduler emits voice-greet event itself.
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const { triggerVoiceGreet } = require('../../services/voiceGreetScheduler.service') as typeof import('../../services/voiceGreetScheduler.service');
        void triggerVoiceGreet('manual');
      },
    },
    { emoji: '👕', label: '衣柜', target: meRoute('PetWardrobe') },
    { emoji: '💫', label: '灵魂', target: meRoute('SoulPicker') },
    { emoji: '🧬', label: '繁育', target: meRoute('PetBreed') },
    { emoji: '🧠', label: '记忆', target: meRoute('MemoryManagement') },
    { emoji: '🎮', label: '玩乐', target: meRoute('PetPlayground') },
    {
      emoji: '✨',
      label: '创造新',
      target: () =>
        navigation.navigate('Main', {
          screen: 'World',
          params: { screen: 'WorldRoot' },
        }),
    },
  ];
  return (
    <SectionCard title="🐾 陪伴动作" subtitle="点一下,马上回应">
      <View style={styles.actionGrid}>
        {items.map((it) => (
          <TouchableOpacity
            key={it.label}
            style={styles.actionGridItem}
            onPress={() => (it.inPlace ? it.target() : onAction(it.target))}
            accessibilityLabel={it.label}
          >
            <Text style={styles.actionGridEmoji}>{it.emoji}</Text>
            <Text style={styles.actionGridLabel}>{it.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SectionCard>
  );
});

interface CoRaisingEntryProps {
  onPress: () => void;
}
const CoRaisingEntrySection = React.memo(function CoRaisingEntrySection({
  onPress,
}: CoRaisingEntryProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} accessibilityLabel="共养">
      <Text style={styles.rowEmoji}>👨‍👩‍👧</Text>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>邀请朋友共养</Text>
        <Text style={styles.rowSub}>多人陪伴,记忆共享</Text>
      </View>
      <Text style={styles.rowArrow}>›</Text>
    </TouchableOpacity>
  );
});

interface SettingsEntryProps {
  onPress: () => void;
}
const SettingsEntrySection = React.memo(function SettingsEntrySection({
  onPress,
}: SettingsEntryProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} accessibilityLabel="陪伴设置">
      <Text style={styles.rowEmoji}>⚙️</Text>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>陪伴设置</Text>
        <Text style={styles.rowSub}>勿扰、问候、推送、Trust 与签名</Text>
      </View>
      <Text style={styles.rowArrow}>›</Text>
    </TouchableOpacity>
  );
});

// ─── Reusable building blocks ────────────────────────────────────────────

interface SectionCardProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}
function SectionCard({ title, subtitle, children }: SectionCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
}
function ActionButton({ label, onPress, variant = 'primary' }: ActionButtonProps) {
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        variant === 'ghost' ? styles.actionBtnGhost : styles.actionBtnPrimary,
      ]}
      onPress={onPress}
      accessibilityLabel={label}
    >
      <Text
        style={[
          styles.actionBtnText,
          variant === 'ghost' ? styles.actionBtnTextGhost : styles.actionBtnTextPrimary,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

interface DevicePillProps {
  emoji: string;
  name: string;
  online: boolean;
}
function DevicePill({ emoji, name, online }: DevicePillProps) {
  return (
    <View style={[styles.devicePill, online ? styles.devicePillOnline : styles.devicePillOffline]}>
      <Text style={styles.devicePillEmoji}>{emoji}</Text>
      <Text style={[styles.devicePillName, online ? null : styles.devicePillNameDim]}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: colors.bgPrimary,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  handleIndicator: { backgroundColor: colors.border, width: 40 },
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },

  // Hero
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 12,
  },
  heroAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bgCard,
    borderColor: colors.accent,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarEmoji: { fontSize: 40 },
  heroNameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  heroName: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  heroSwitch: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  heroMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  xpBarBg: {
    height: 6,
    backgroundColor: colors.bgCard,
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  xpBarFill: { height: '100%', backgroundColor: colors.accent },

  // Status overview
  statusOverview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusActionText: { color: colors.textPrimary, fontSize: 13, fontWeight: '500' },
  statusDeviceRow: { flexDirection: 'row', gap: 6 },
  statusDeviceEmoji: { fontSize: 18 },
  statusDeviceEmojiDim: { fontSize: 18, opacity: 0.35 },

  // SectionCard
  card: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    borderColor: colors.border,
    borderWidth: 1,
  },
  cardTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  cardSubtitle: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  cardBody: { marginTop: 10 },

  // Wallet
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  walletCol: { flex: 1, alignItems: 'center' },
  walletLabel: { color: colors.textMuted, fontSize: 11 },
  walletValue: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginTop: 2 },

  cardActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },

  // Skills
  skillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillItemText: {
    color: colors.textPrimary,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.bgPrimary,
    borderColor: colors.border,
    borderWidth: 1,
  },

  // Cross-device
  deviceListRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  devicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  devicePillOnline: {
    backgroundColor: colors.accent + '22',
    borderColor: colors.accent,
  },
  devicePillOffline: {
    backgroundColor: colors.bgPrimary,
    borderColor: colors.border,
  },
  devicePillEmoji: { fontSize: 14 },
  devicePillName: { color: colors.textPrimary, fontSize: 12 },
  devicePillNameDim: { color: colors.textMuted },

  // Action grid
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionGridItem: {
    width: '23%',
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.bgPrimary,
    borderRadius: 10,
    borderColor: colors.border,
    borderWidth: 1,
    marginBottom: 8,
  },
  actionGridEmoji: { fontSize: 22 },
  actionGridLabel: { color: colors.textPrimary, fontSize: 11, marginTop: 6, fontWeight: '600' },

  // Row entry
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    marginTop: 10,
    borderColor: colors.border,
    borderWidth: 1,
  },
  rowEmoji: { fontSize: 22, marginRight: 12 },
  rowText: { flex: 1 },
  rowTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  rowArrow: { color: colors.textMuted, fontSize: 18, fontWeight: '600' },

  // Buttons
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionBtnPrimary: { backgroundColor: colors.accent },
  actionBtnGhost: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
  actionBtnTextPrimary: { color: '#0B1220' },
  actionBtnTextGhost: { color: colors.textPrimary },
});
