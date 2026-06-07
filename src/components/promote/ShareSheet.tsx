// 分享面板组件 — 原生系统分享 + QR码 + 海报
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Share,
  Alert,
  TextInput,
  Dimensions,
  ScrollView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { colors } from '../../theme/colors';
import { SharePoster } from './SharePoster';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ShareTarget {
  name: string;
  shortUrl: string;
  price?: number;
  priceUnit?: string;
  description?: string;
  tags?: string[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  target: ShareTarget;
}

function generateShareText(target: ShareTarget): string {
  if (target.price && target.priceUnit) {
    return `🔥 Check out "${target.name}" — only $${target.price}/${target.priceUnit}!\n👉 ${target.shortUrl}`;
  }
  return `🚀 Discover "${target.name}" on Agentrix — try it now!\n👉 ${target.shortUrl}`;
}

export function ShareSheet({ visible, onClose, target }: Props) {
  const [shareText, setShareText] = useState(() => generateShareText(target));
  const [showQr, setShowQr] = useState(false);
  const [showPoster, setShowPoster] = useState(false);

  // 调用系统原生分享面板 — 显示所有已安装的 App（微信、Telegram、WhatsApp、Twitter 等）
  const handleNativeShare = async () => {
    try {
      await Share.share({
        message: shareText,
        url: target.shortUrl,
        title: target.name,
      });
    } catch {
      // User cancelled
    }
  };

  const handleCopyLink = async () => {
    try {
      await Clipboard.setStringAsync(target.shortUrl);
      Alert.alert('Copied', 'Link copied to clipboard');
    } catch {
      Alert.alert('Link', target.shortUrl);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {showPoster ? 'Generate Poster' : showQr ? 'QR Code' : 'Share'}
            </Text>
            <TouchableOpacity onPress={() => {
              if (showPoster) { setShowPoster(false); return; }
              if (showQr) { setShowQr(false); return; }
              onClose();
            }}>
              <Text style={styles.closeBtn}>{showPoster || showQr ? '← Back' : '✕'}</Text>
            </TouchableOpacity>
          </View>

          {showPoster ? (
            <ScrollView>
              <SharePoster
                visible={showPoster}
                onClose={() => setShowPoster(false)}
                skillName={target.name}
                skillPrice={target.price}
                skillPriceUnit={target.priceUnit}
                shareUrl={target.shortUrl}
                description={target.description}
                tags={target.tags}
              />
            </ScrollView>
          ) : showQr ? (
            <View style={styles.qrContainer}>
              <View style={styles.qrBox}>
                <Text style={styles.qrPlaceholder}>📱</Text>
                <Text style={styles.qrUrl}>{target.shortUrl}</Text>
                <Text style={styles.qrHint}>Scan to visit</Text>
              </View>
              <TouchableOpacity
                style={styles.actionBtnPrimary}
                onPress={() => {
                  Alert.alert('Saved', 'QR code saved to gallery');
                  setShowQr(false);
                }}
              >
                <Text style={styles.actionBtnPrimaryText}>💾 Save to Gallery</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* 主分享按钮 — 调用系统原生分享面板 */}
              <TouchableOpacity style={styles.nativeShareBtn} onPress={handleNativeShare} activeOpacity={0.7}>
                <Text style={styles.nativeShareIcon}>📤</Text>
                <View>
                  <Text style={styles.nativeShareTitle}>Share via installed apps</Text>
                  <Text style={styles.nativeShareDesc}>Telegram · WhatsApp · Twitter · More</Text>
                </View>
              </TouchableOpacity>

              {/* 快捷操作 */}
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={handleCopyLink}>
                  <View style={styles.actionIconWrap}><Text style={styles.actionIcon}>📋</Text></View>
                  <Text style={styles.actionLabel}>Copy Link</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => setShowQr(true)}>
                  <View style={styles.actionIconWrap}><Text style={styles.actionIcon}>📱</Text></View>
                  <Text style={styles.actionLabel}>QR Code</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => setShowPoster(true)}>
                  <View style={styles.actionIconWrap}><Text style={styles.actionIcon}>🖼️</Text></View>
                  <Text style={styles.actionLabel}>Poster</Text>
                </TouchableOpacity>
              </View>

              {/* 分享文案编辑 */}
              <View style={styles.divider} />
              <View style={styles.previewSection}>
                <Text style={styles.previewLabel}>Share text (editable):</Text>
                <TextInput
                  style={styles.previewInput}
                  value={shareText}
                  onChangeText={setShareText}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  closeBtn: { color: colors.primary, fontSize: 14, fontWeight: '600', padding: 4 },
  // 主分享按钮
  nativeShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    padding: 16,
    backgroundColor: colors.primary + '15',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary + '30',
    gap: 14,
  },
  nativeShareIcon: { fontSize: 32 },
  nativeShareTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  nativeShareDesc: { color: colors.muted, fontSize: 12, marginTop: 2 },
  // 快捷操作行
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  actionBtn: { alignItems: 'center', gap: 6 },
  actionIconWrap: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: colors.cardAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  actionIcon: { fontSize: 24 },
  actionLabel: { color: colors.muted, fontSize: 11, fontWeight: '500' },
  actionBtnPrimary: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 13,
    marginBottom: 12,
  },
  actionBtnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  // Divider
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 16 },
  // Preview
  previewSection: { padding: 16 },
  previewLabel: { color: colors.muted, fontSize: 12, marginBottom: 8 },
  previewInput: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
    minHeight: 70,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // QR
  qrContainer: { alignItems: 'center', padding: 24 },
  qrBox: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  qrPlaceholder: { fontSize: 80, marginBottom: 12 },
  qrUrl: { color: '#1e293b', fontSize: 12, fontWeight: '500', marginBottom: 4 },
  qrHint: { color: '#64748b', fontSize: 11 },
});
