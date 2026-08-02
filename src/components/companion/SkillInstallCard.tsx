/**
 * SkillInstallCard — P-9 wave 9 T15.
 *
 * BottomSheet 70% snap-point that surfaces a skill install confirmation
 * without leaving the current tab. Phase 1 strategy:
 *   - Reuses backend `installSkillToInstance(petId, skillId)` (already shipped).
 *   - Permission-sensitive skills (containing `wallet:write` /
 *     `payment:execute` / `agent:invoke`) emit `trust3-signing-request`
 *     instead of installing directly.
 *   - On install success → emits `voice-greet { scenario: 'milestone',
 *     text: '我学会了 X' }` so VoiceGreetCapsule auto-shows and the ball
 *     pulses whisper for 4s.
 *   - Driven imperatively via `companionSheets.skillInstall.present({
 *     skillId, name, permissions, price })` — Siri intent and PetDetailSheet
 *     "+ 装新的" both call this.
 *
 * Spec: requirements.md R9.1-R9.5, design.md §Components/Core 7.
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
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { colors } from '../../theme/colors';
import { useActivePet } from '../../services/activePet.service';
import { companionEvents } from '../../services/companionEvents.service';
import { skillInstallCardRef, type SkillInstallCardHandle, type SkillInstallPresentOpts } from './sheetRefRegistry';
import { themedStyles } from '../../theme/useTheme';

const SNAP_POINTS = ['70%'];

const RISKY_PERMISSIONS = new Set([
  'wallet:write',
  'wallet:transfer',
  'payment:execute',
  'agent:invoke',
]);

type Phase = 'idle' | 'previewing' | 'installing' | 'success' | 'failed';

export const SkillInstallCard = forwardRef<SkillInstallCardHandle>(
  function SkillInstallCard(_props, externalRef) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const pet = useActivePet();
    const [opts, setOpts] = useState<SkillInstallPresentOpts | null>(null);
    const [phase, setPhase] = useState<Phase>('idle');
    const [error, setError] = useState<string | null>(null);

    const present = useCallback((p: SkillInstallPresentOpts) => {
      setOpts(p);
      setPhase('previewing');
      setError(null);
      sheetRef.current?.present();
    }, []);

    const dismiss = useCallback(() => {
      sheetRef.current?.dismiss();
      setOpts(null);
      setPhase('idle');
      setError(null);
    }, []);

    const handle = useMemo<SkillInstallCardHandle>(
      () => ({ present, dismiss }),
      [present, dismiss],
    );
    useImperativeHandle(externalRef, () => handle, [handle]);
    useEffect(() => {
      skillInstallCardRef.current = handle;
      return () => {
        skillInstallCardRef.current = null;
      };
    }, [handle]);

    const requiresTrust3 = useMemo(() => {
      if (!opts) return false;
      if ((opts.priceUsd ?? 0) > 0) return true;
      return (opts.permissions ?? []).some((p) => RISKY_PERMISSIONS.has(p));
    }, [opts]);

    const handleInstall = useCallback(async () => {
      if (!opts?.skillId) {
        setError('缺少 skillId');
        setPhase('failed');
        return;
      }
      setPhase('installing');
      try {
        if (requiresTrust3) {
          // Emit trust3-signing-request and let Trust3SigningSheet take over.
          // We listen for trust3-signing-completed to actually install.
          // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
          const { createSignRequest } = require(
            '../../services/signRequest.service',
          ) as typeof import('../../services/signRequest.service');
          const req = await createSignRequest({
            reason: 'skill-install',
            metadata: {
              petId: pet.id,
              skillId: opts.skillId,
              skillName: opts.name,
              permissions: opts.permissions ?? [],
              priceUsd: opts.priceUsd ?? 0,
              risk: 'L2',
              riskExplanationZh: `安装 ${opts.name ?? '技能'} 需要 ${opts.permissions?.join(', ') || '相关'} 权限。`,
            },
          });
          if (req.cachedHit && req.signature) {
            await actuallyInstall(opts.skillId, pet.id);
            setPhase('success');
            announceLearned(opts.name);
            setTimeout(() => dismiss(), 1200);
            return;
          }
          // Wait for Trust3 sheet to complete; subscribe once.
          const off = companionEvents.subscribe('trust3-signing-completed', (evt) => {
            if (evt.signRequestId !== req.id) return;
            off();
            (async () => {
              try {
                await actuallyInstall(opts.skillId!, pet.id);
                setPhase('success');
                announceLearned(opts.name);
                setTimeout(() => dismiss(), 1200);
              } catch (err) {
                setError((err as Error).message ?? 'install failed');
                setPhase('failed');
              }
            })();
          });
          companionEvents.emit({
            type: 'trust3-signing-request',
            signRequestId: req.id,
            reason: 'skill-install',
            metadata: req.metadata ?? {},
            expiresAtMs: req.expiresAt ? Date.parse(req.expiresAt) : Date.now() + 60_000,
          });
          // Wait state — Trust3SigningSheet renders above this card.
        } else {
          await actuallyInstall(opts.skillId, pet.id);
          setPhase('success');
          announceLearned(opts.name);
          setTimeout(() => dismiss(), 1200);
        }
      } catch (err) {
        setError((err as Error).message ?? 'install failed');
        setPhase('failed');
      }
    }, [opts, requiresTrust3, pet.id, dismiss]);

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="close"
          opacity={0.4}
        />
      ),
      [],
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
          <View style={styles.header}>
            <Text style={styles.headerEmoji}>🧠</Text>
            <Text style={styles.headerTitle}>{opts?.name ?? '安装技能'}</Text>
          </View>

          <View style={styles.metaRow}>
            {opts?.developer ? <Pill text={opts.developer} /> : null}
            {opts?.version ? <Pill text={`v${opts.version}`} /> : null}
            {opts?.priceUsd && opts.priceUsd > 0 ? (
              <Pill text={`$${opts.priceUsd.toFixed(2)}`} highlight />
            ) : (
              <Pill text="免费" />
            )}
          </View>

          {opts?.description ? (
            <Text style={styles.description}>{opts.description}</Text>
          ) : null}

          {(opts?.permissions ?? []).length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>权限</Text>
              <View style={styles.permRow}>
                {(opts!.permissions ?? []).map((p) => (
                  <View
                    key={p}
                    style={[styles.permPill, RISKY_PERMISSIONS.has(p) ? styles.permPillRisky : null]}
                  >
                    <Text
                      style={[
                        styles.permText,
                        RISKY_PERMISSIONS.has(p) ? styles.permTextRisky : null,
                      ]}
                    >
                      {p}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {requiresTrust3 ? (
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>需要 Trust 3 签名授权后再安装。</Text>
            </View>
          ) : null}

          {phase === 'installing' ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.busyText}>安装中…</Text>
            </View>
          ) : null}
          {phase === 'success' ? (
            <Text style={styles.successText}>✅ 已安装</Text>
          ) : null}
          {phase === 'failed' ? (
            <Text style={styles.failText}>❌ 安装失败:{error}</Text>
          ) : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={dismiss}
              disabled={phase === 'installing'}
              accessibilityLabel="取消"
            >
              <Text style={styles.cancelBtnText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, phase !== 'previewing' ? styles.confirmBtnDisabled : null]}
              onPress={handleInstall}
              disabled={phase !== 'previewing'}
              accessibilityLabel="立即安装"
            >
              <Text style={styles.confirmBtnText}>
                {requiresTrust3 ? '🔐 签名安装' : '立即安装'}
              </Text>
            </TouchableOpacity>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

async function actuallyInstall(skillId: string, petId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { installSkillToInstance } = require('../../services/openclaw.service') as typeof import('../../services/openclaw.service');
  await installSkillToInstance(petId, skillId);
}

function announceLearned(skillName?: string): void {
  companionEvents.emit({
    type: 'voice-greet',
    scenario: 'milestone',
    text: skillName ? `我学会了 ${skillName}` : '我又学了一招',
    lang: 'zh',
  });
  companionEvents.emit({
    type: 'skill-update',
    skillId: 'learned',
    newVersion: '1',
    introducesNewPermissions: false,
  });
}

interface PillProps {
  text: string;
  highlight?: boolean;
}
function Pill({ text, highlight }: PillProps) {
  return (
    <View style={[styles.pill, highlight ? styles.pillHighlight : null]}>
      <Text style={[styles.pillText, highlight ? styles.pillTextHighlight : null]}>{text}</Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  sheetBg: { backgroundColor: colors.bgPrimary, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  handleIndicator: { backgroundColor: colors.border, width: 40 },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerEmoji: { fontSize: 28 },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', flex: 1 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
  },
  pillHighlight: { backgroundColor: colors.accent + '22', borderColor: colors.accent },
  pillText: { color: colors.textPrimary, fontSize: 12 },
  pillTextHighlight: { color: colors.accent, fontWeight: '700' },
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 12 },
  sectionLabel: { color: colors.textMuted, fontSize: 11, marginTop: 14, fontWeight: '600' },
  permRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  permPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.bgCard,
    borderRadius: 6,
    borderColor: colors.border,
    borderWidth: 1,
  },
  permPillRisky: { borderColor: colors.warning, backgroundColor: colors.warning + '15' },
  permText: { color: colors.textPrimary, fontSize: 11 },
  permTextRisky: { color: colors.warning, fontWeight: '600' },
  warnBox: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.warning + '15',
    borderRadius: 10,
    borderColor: colors.warning,
    borderWidth: 1,
  },
  warnText: { color: colors.warning, fontSize: 12, fontWeight: '600' },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  busyText: { color: colors.textPrimary, fontSize: 13 },
  successText: { color: colors.success, fontSize: 13, fontWeight: '700', marginTop: 14 },
  failText: { color: colors.danger, fontSize: 13, marginTop: 14 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    borderColor: colors.border,
    borderWidth: 1,
  },
  cancelBtnText: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  confirmBtn: {
    flex: 2,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  confirmBtnDisabled: { backgroundColor: colors.bgCard },
  confirmBtnText: { color: '#0B1220', fontSize: 14, fontWeight: '700' },
}));
