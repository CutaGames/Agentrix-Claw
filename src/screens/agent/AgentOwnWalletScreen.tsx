/**
 * AgentOwnWalletScreen — where `agentrix://wallet-verified?state=…&account=…&chainId=…` lands (L8-6 S11b, design 6a).
 *
 * The wallet origin's "本设备核对" page sends the owner back here after it checked the account on that device. This screen
 * accepts the link only for a one-time `state` the phone made and is still waiting for, with the account and chain the
 * phone stored and the card shows now (`acceptVerifiedLinkV1`); then the identity card shows "本设备核过". The link alone proves
 * nothing, so an unknown, expired, used or mismatching link only gets the failure line and changes nothing.
 * Registered, and reachable by the deep link, only with EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED=1.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import type { MeStackParamList } from '../../navigation/types';
import { ownWalletMobileEnabledV1, OWN_WALLET_MOBILE_COPY_V1 } from '../../services/ownWallet';
import { ownWalletAcceptDepsV1 } from '../../services/ownWalletApi';
import { acceptVerifiedLinkV1 } from '../../services/ownWalletVerifyState';

type OwnWalletRoute = RouteProp<MeStackParamList, 'AgentOwnWallet'>;

export function AgentOwnWalletScreen() {
  const route = useRoute<OwnWalletRoute>();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const c = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const [phase, setPhase] = useState<'checking' | 'done' | 'failed'>('checking');
  // The state is spent by the first check; a second run (re-render, a link delivered twice) must not overwrite the answer.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!ownWalletMobileEnabledV1()) {
      setPhase('failed');
      return;
    }
    void acceptVerifiedLinkV1(route.params, ownWalletAcceptDepsV1()).then((result) => {
      if (result.ok === true) {
        void queryClient.invalidateQueries({ queryKey: ['own-wallet-verified'] });
        setPhase('done');
      } else {
        setPhase('failed');
      }
    });
  }, [route.params, queryClient]);

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Profile');
  };

  return (
    <View style={styles.container} testID="agent-own-wallet-screen">
      {phase === 'checking' ? (
        <ActivityIndicator color={c.accent} />
      ) : (
        <>
          <Text style={phase === 'done' ? styles.done : styles.failed} testID="agent-own-wallet-result">
            {t(phase === 'done' ? OWN_WALLET_MOBILE_COPY_V1.verifyDone : OWN_WALLET_MOBILE_COPY_V1.verifyFailed)}
          </Text>
          <TouchableOpacity style={styles.btn} onPress={goBack} testID="agent-own-wallet-back">
            <Text style={styles.btnText}>{t(OWN_WALLET_MOBILE_COPY_V1.verifyBack)}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bgPrimary, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
    done: { fontSize: 15, color: c.success, fontWeight: '700', textAlign: 'center', lineHeight: 22 },
    failed: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 21 },
    btn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, backgroundColor: c.accent + '22', borderWidth: 1, borderColor: c.accent + '66' },
    btnText: { fontSize: 13, fontWeight: '800', color: c.accent },
  });
}
