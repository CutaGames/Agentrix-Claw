import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Share,
  Dimensions,
} from 'react-native';
import { colors } from '../theme/colors';
import { socialShareService } from '../services/socialShare';

// QRCode — loaded lazily so the app doesn't crash if SVG isn't linked
let QRCode: any = null;
try { QRCode = require('react-native-qrcode-svg').default; } catch (_) {}

const { width: SW } = Dimensions.get('window');

interface ShareBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  shareContent: {
    title?: string;
    message: string;
    url?: string;
  };
  onCopy?: () => void;
}

export function ShareBottomSheet({
  visible,
  onClose,
  title = '分享',
  shareContent,
  onCopy,
}: ShareBottomSheetProps) {
  const handleShare = async () => {
    await socialShareService.share(shareContent);
    onClose();
  };

  const handleCopy = async () => {
    const textToCopy = shareContent.url || shareContent.message;
    await socialShareService.copyToClipboard(textToCopy);
    onCopy?.();
    onClose();
  };

  const qrValue = shareContent.url ||
    `https://agentrix.top/r/${encodeURIComponent(shareContent.title || 'share')}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>

          {/* === Referral Poster Card === */}
          <View style={styles.poster}>
            {/* Commission badge */}
            <View style={styles.posterBadgeRow}>
              <View style={styles.commissionBadge}>
                <Text style={styles.commissionText}>💰 佣金追踪链接</Text>
              </View>
              <View style={styles.refBadge}>
                <Text style={styles.refBadgeText}>• REFERRAL</Text>
              </View>
            </View>

            {/* QR code + content */}
            <View style={styles.posterBody}>
              {QRCode ? (
                <View style={styles.qrWrapper}>
                  <QRCode
                    value={qrValue}
                    size={SW < 370 ? 88 : 100}
                    backgroundColor="transparent"
                    color={colors.text || '#fff'}
                  />
                  <Text style={styles.qrHint}>扫码加入</Text>
                </View>
              ) : null}
              <View style={styles.posterContent}>
                {shareContent.title ? (
                  <Text style={styles.posterTitle} numberOfLines={2}>
                    {shareContent.title}
                  </Text>
                ) : null}
                <Text style={styles.posterMsg} numberOfLines={4}>
                  {shareContent.message}
                </Text>
                {shareContent.url ? (
                  <Text style={styles.posterUrl} numberOfLines={1}>
                    {shareContent.url}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
              <Text style={styles.actionIcon}>📤</Text>
              <Text style={styles.actionLabel}>分享</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCopy}>
              <Text style={styles.actionIcon}>📋</Text>
              <Text style={styles.actionLabel}>复制链接</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>取消</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

interface ShareButtonProps {
  onPress: () => void;
  style?: any;
  size?: 'small' | 'medium' | 'large';
}

export function ShareButton({ onPress, style, size = 'medium' }: ShareButtonProps) {
  const iconSizes = {
    small: 16,
    medium: 20,
    large: 24,
  };
  const paddingSizes = {
    small: 6,
    medium: 10,
    large: 14,
  };

  return (
    <TouchableOpacity
      style={[
        styles.shareButton,
        { padding: paddingSizes[size] },
        style,
      ]}
      onPress={onPress}
    >
      <Text style={{ fontSize: iconSizes[size] }}>📤</Text>
    </TouchableOpacity>
  );
}

interface QuickShareProps {
  type: 'payment' | 'agent' | 'airdrop' | 'earnings' | 'invite';
  data: any;
  children?: React.ReactNode;
  buttonStyle?: any;
}

export function QuickShare({ type, data, children, buttonStyle }: QuickShareProps) {
  const [showSheet, setShowSheet] = React.useState(false);
  const [shareContent, setShareContent] = React.useState({
    title: '',
    message: '',
    url: '',
  });

  const handlePress = () => {
    let content = { title: '', message: '', url: '' };

    switch (type) {
      case 'payment':
        content = {
          title: data.merchantName ? `向 ${data.merchantName} 付款` : '收款链接',
          message: `请支付 ${data.amount} ${data.currency || 'USDC'}`,
          url: data.paymentUrl,
        };
        break;
      case 'agent':
        content = {
          title: `分享 Agent: ${data.agentName}`,
          message: `🤖 试试这个 Agent: ${data.agentName}`,
          url: data.agentUrl,
        };
        break;
      case 'airdrop':
        content = {
          title: `${data.projectName} 空投`,
          message: `🎁 发现空投: ${data.projectName}，预估 ${data.estimatedValue}`,
          url: data.claimUrl,
        };
        break;
      case 'earnings':
        content = {
          title: 'Agentrix 收益',
          message: `📈 我在 Agentrix 上收益 ${data.totalEarnings}！`,
          url: 'https://agentrix.io/download',
        };
        break;
      case 'invite':
        content = {
          title: '邀请加入 Agentrix',
          message: `🚀 使用邀请码 ${data.inviteCode || ''} 注册 Agentrix`,
          url: data.referralUrl,
        };
        break;
    }

    setShareContent(content);
    setShowSheet(true);
  };

  return (
    <>
      {children ? (
        <TouchableOpacity onPress={handlePress} style={buttonStyle}>
          {children}
        </TouchableOpacity>
      ) : (
        <ShareButton onPress={handlePress} style={buttonStyle} />
      )}
      <ShareBottomSheet
        visible={showSheet}
        onClose={() => setShowSheet(false)}
        shareContent={shareContent}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 14,
  },
  // === Poster card ===
  poster: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  posterBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  commissionBadge: {
    backgroundColor: '#f59e0b20',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#f59e0b55',
  },
  commissionText: { fontSize: 11, color: '#f59e0b', fontWeight: '700' },
  refBadge: {
    backgroundColor: '#22c55e15',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  refBadgeText: { fontSize: 10, color: '#22c55e', fontWeight: '800', letterSpacing: 0.5 },
  posterBody: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  qrWrapper: {
    alignItems: 'center',
    gap: 4,
  },
  qrHint: { fontSize: 9, color: colors.textSecondary, textAlign: 'center', marginTop: 2 },
  posterContent: { flex: 1 },
  posterTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 4 },
  posterMsg: { fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: 4 },
  posterUrl: { fontSize: 11, color: colors.primary, marginTop: 2 },
  // === Actions ===
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 16,
  },
  actionBtn: { alignItems: 'center', gap: 4 },
  actionIcon: { fontSize: 30 },
  actionLabel: { fontSize: 12, color: colors.text, fontWeight: '500' },
  cancelButton: {
    backgroundColor: colors.background,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  shareButton: {
    backgroundColor: colors.cardBackground,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
