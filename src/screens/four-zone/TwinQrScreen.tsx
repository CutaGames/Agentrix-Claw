/**
 * TwinQrScreen — the twin card's QR code full screen (M0, EXPO_PUBLIC_MOBILE_M0=1), for showing someone in person.
 * The link is the same attributed card link the 分身 page already encodes (`twinCardAttributedLink(…, 'qr')`), so a scan
 * counts as the QR channel and nothing about the scanner is recorded. Sharing uses the system share sheet.
 */
import React from 'react';
import { Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { useI18n } from '../../stores/i18nStore';

export interface TwinQrParams {
  link: string;
  name?: string | null;
  headline?: string | null;
}

export function TwinQrScreen() {
  const { language } = useI18n();
  const lang = language === 'zh' ? 'zh' : 'en';
  const params = (useRoute().params ?? {}) as Partial<TwinQrParams>;
  const link = typeof params.link === 'string' && /^https:\/\//.test(params.link) ? params.link : null;
  const name = params.name?.trim() || null;

  return (
    <View style={styles.screen} testID="twin-qr-screen">
      <View style={styles.avatar}><Text style={styles.avatarText}>{(name ?? '·').slice(0, 1).toUpperCase()}</Text></View>
      {name ? <Text style={styles.name}>{name}</Text> : null}
      {params.headline ? <Text style={styles.headline}>{params.headline}</Text> : null}
      <View style={styles.qr} accessible accessibilityLabel={lang === 'zh' ? '分身名片二维码' : 'QR code for your twin card'}>
        {link ? <QRCode value={link} size={236} /> : <Text style={styles.missing}>{lang === 'zh' ? '分身还没公开，暂时没有二维码。' : 'Your twin is not public yet, so there is no code to show.'}</Text>}
      </View>
      <Text style={styles.scan}>{lang === 'zh' ? '扫一扫，和我的 AI 分身聊' : 'Scan to talk to my AI twin'}</Text>
      <Text style={styles.sub}>{lang === 'zh' ? '对方不用装 App' : 'No app needed'}</Text>
      {link ? (
        <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => void Share.share({ message: link })}>
          <Text style={styles.buttonText}>{lang === 'zh' ? '分享链接' : 'Share link'}</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={styles.foot}>Yowo by Agentrix</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', paddingTop: 36, paddingHorizontal: 24 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#0a84c6', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#ffffff', fontSize: 24, fontWeight: '700' },
  name: { color: '#ffffff', fontSize: 22, fontWeight: '700', marginTop: 10 },
  headline: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  qr: { marginTop: 22, padding: 18, borderRadius: 22, backgroundColor: '#ffffff', minWidth: 272, minHeight: 272, alignItems: 'center', justifyContent: 'center' },
  missing: { color: '#475569', fontSize: 14, textAlign: 'center' },
  scan: { color: '#ffffff', fontSize: 16, fontWeight: '600', marginTop: 18 },
  sub: { color: '#94a3b8', fontSize: 12.5, marginTop: 4 },
  button: { marginTop: 22, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  foot: { color: '#64748b', fontSize: 11.5, marginTop: 'auto', marginBottom: 24 },
});
