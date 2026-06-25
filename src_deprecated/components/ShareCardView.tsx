/**
 * Viral Share Card — generates a shareable image with QR code.
 * Uses react-native-view-shot to capture the card as a PNG,
 * then expo-sharing to show the native share sheet.
 */
import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import ViewShot, { CaptureOptions } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { colors } from '../theme/colors';

export interface ShareCardProps {
  shareUrl: string;
  title?: string;
  subtitle?: string;
  /** Emoji / icon to show in header */
  headerEmoji?: string;
  userName?: string;
  /** Called when share is initiated */
  onShare?: () => void;
}

export function ShareCardView({
  shareUrl,
  title = 'ClawLink',
  subtitle = 'Your AI Agent, Powered by OpenClaw',
  headerEmoji = '🦀',
  userName,
  onShare,
}: ShareCardProps) {
  const viewShotRef = useRef<ViewShot>(null);
  const [capturing, setCapturing] = useState(false);
  const [copied, setCopied] = useState(false);

  const captureAndShare = useCallback(async () => {
    try {
      setCapturing(true);
      onShare?.();

      const canShare = await Sharing.isAvailableAsync();
      if (canShare && viewShotRef.current) {
        const opts: CaptureOptions = { format: 'png', quality: 1, result: 'tmpfile' };
        const uri: string = await (viewShotRef.current as any).capture(opts);
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share ClawLink' });
      } else {
        // Fallback: text share
        await Share.share({ message: `${title}\n${subtitle}\n${shareUrl}`, url: shareUrl });
      }
    } catch (err: any) {
      if (err?.message !== 'User did not share') {
        Alert.alert('Share failed', err?.message ?? 'Unable to share');
      }
    } finally {
      setCapturing(false);
    }
  }, [shareUrl, title, subtitle, onShare]);

  const copyLink = useCallback(async () => {
    await Clipboard.setStringAsync(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  return (
    <View style={styles.wrapper}>
      {/* The card that will be captured as image */}
      <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }} style={styles.card}>
        <LinearGradient
          colors={['#0B1220', '#1a2235']}
          style={styles.cardGradient}
        >
          {/* Header */}
          <View style={styles.cardHeader}>
            <Text style={styles.headerEmoji}>{headerEmoji}</Text>
            <View>
              <Text style={styles.cardTitle}>{title}</Text>
              <Text style={styles.cardSubtitle}>{subtitle}</Text>
            </View>
          </View>

          {/* QR Code */}
          <View style={styles.qrContainer}>
            <QRCode
              value={shareUrl}
              size={150}
              backgroundColor="#ffffff"
              color="#1E293B"
            />
          </View>

          {/* User info */}
          {userName && (
            <Text style={styles.cardUser}>Shared by {userName}</Text>
          )}

          {/* URL shortened preview */}
          <View style={styles.urlBadge}>
            <Text style={styles.urlText} numberOfLines={1}>{shareUrl}</Text>
          </View>

          {/* Footer brand */}
          <Text style={styles.cardFooter}>clawlink.app • Powered by OpenClaw</Text>
        </LinearGradient>
      </ViewShot>

      {/* Action buttons below the card */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          onPress={captureAndShare}
          disabled={capturing}
          activeOpacity={0.8}
        >
          {capturing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>📤 Share Card</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary]}
          onPress={copyLink}
          activeOpacity={0.8}
        >
          <Text style={styles.btnSecondaryText}>
            {copied ? '✓ Copied!' : '🔗 Copy Link'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a3a52',
  },
  cardGradient: { padding: 24, alignItems: 'center', gap: 16 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'flex-start',
  },
  headerEmoji: { fontSize: 36 },
  cardTitle: { color: '#f0f6ff', fontSize: 22, fontWeight: '800' },
  cardSubtitle: { color: '#8ba3be', fontSize: 12, marginTop: 2 },
  qrContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  cardUser: { color: '#8ba3be', fontSize: 13, alignSelf: 'flex-start' },
  urlBadge: {
    backgroundColor: '#0d1626',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  urlText: { color: '#00d4ff', fontSize: 12, fontFamily: 'monospace' },
  cardFooter: { color: '#344a60', fontSize: 11 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16, width: '100%', maxWidth: 340 },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: '#1a77e0' },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2a3a52',
  },
  btnSecondaryText: { color: '#00d4ff', fontWeight: '600', fontSize: 15 },
});
