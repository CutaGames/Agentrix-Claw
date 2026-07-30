/**
 * NftMintScreen — Sprint I #25
 *
 * NFT minting flow for pet skins / whole pets.
 * Per cross-platform PRD §5.7.4 + §9.1:
 *   - Skins can be minted as on-chain NFTs for provenance
 *   - Whole pets (soul + skin + wallet) can be minted for auction transfer
 *   - Chain: ERC-721 on Base/Polygon (configurable)
 *   - Quota: Free 0/mo, Lite 2, Plus 10, Pro ∞, Elite ∞
 *
 * Backend: POST /api/v1/pet-nft/mint
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { apiFetch } from '../../services/api';
import { fetchMyQuota } from '../../services/subscription.api';
import { themedStyles } from '../../theme/useTheme';

// ── Types ────────────────────────────────────────────────────

interface MintableAsset {
  id: string;
  type: 'skin' | 'pet';
  name: string;
  thumbnail_url: string | null;
  clan: string;
  already_minted: boolean;
  token_id: string | null;
  contract_address: string | null;
}

interface MintRequest {
  asset_id: string;
  asset_type: 'skin' | 'pet';
  chain: 'base' | 'polygon';
}

interface MintResult {
  success: boolean;
  token_id: string;
  contract_address: string;
  tx_hash: string;
  opensea_url: string;
  message: string;
}

// ── API ──────────────────────────────────────────────────────

async function fetchMintableAssets(): Promise<{ items: MintableAsset[] }> {
  return apiFetch('/v1/pet-nft/mintable');
}

async function mintAsset(request: MintRequest): Promise<MintResult> {
  return apiFetch('/v1/pet-nft/mint', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

// ── Component ────────────────────────────────────────────────

export function NftMintScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();

  const [selectedChain, setSelectedChain] = useState<'base' | 'polygon'>('base');
  const [minting, setMinting] = useState<string | null>(null);

  const assetsQ = useQuery({
    queryKey: ['nft-mintable'],
    queryFn: fetchMintableAssets,
    staleTime: 30_000,
  });

  const quotaQ = useQuery({
    queryKey: ['me-quota'],
    queryFn: fetchMyQuota,
    staleTime: 60_000,
  });

  const mintMut = useMutation({
    mutationFn: mintAsset,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['nft-mintable'] });
      Alert.alert(
        t({ en: '🎉 Minted!', zh: '🎉 铸造成功！' }),
        t({
          en: `Token #${result.token_id} on ${selectedChain}. TX: ${result.tx_hash.slice(0, 10)}...`,
          zh: `Token #${result.token_id} 在 ${selectedChain} 链上。TX: ${result.tx_hash.slice(0, 10)}...`,
        }),
      );
      setMinting(null);
    },
    onError: (err: any) => {
      Alert.alert(t({ en: 'Mint Failed', zh: '铸造失败' }), err?.message ?? 'Unknown error');
      setMinting(null);
    },
  });

  const handleMint = useCallback((asset: MintableAsset) => {
    if (asset.already_minted) {
      Alert.alert(
        t({ en: 'Already Minted', zh: '已铸造' }),
        t({ en: `Token #${asset.token_id} on ${asset.contract_address?.slice(0, 10)}...`, zh: `Token #${asset.token_id}` }),
      );
      return;
    }

    Alert.alert(
      t({ en: 'Mint NFT', zh: '铸造 NFT' }),
      t({
        en: `Mint "${asset.name}" as NFT on ${selectedChain}? This action is irreversible.`,
        zh: `将「${asset.name}」铸造为 ${selectedChain} 链上 NFT？此操作不可逆。`,
      }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Mint', zh: '铸造' }),
          onPress: () => {
            setMinting(asset.id);
            mintMut.mutate({
              asset_id: asset.id,
              asset_type: asset.type,
              chain: selectedChain,
            });
          },
        },
      ],
    );
  }, [selectedChain, mintMut, t]);

  const assets = assetsQ.data?.items ?? [];
  const nftQuota = quotaQ.data?.nft_mint_monthly_free ?? 0;
  const mintedThisMonth = assets.filter((a) => a.already_minted).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🪙 {t({ en: 'NFT Mint', zh: 'NFT 铸造' })}</Text>
      <Text style={styles.subtitle}>
        {t({
          en: 'Mint your pet skins or whole pets as on-chain NFTs for provenance and trading.',
          zh: '将皮肤或完整主宠铸造为链上 NFT，用于确权和交易。',
        })}
      </Text>

      {/* Quota info */}
      <View style={styles.quotaCard}>
        <Text style={styles.quotaText}>
          {t({ en: 'Monthly quota', zh: '本月配额' })}: {mintedThisMonth} / {nftQuota === -1 ? '∞' : nftQuota}
        </Text>
        <Text style={styles.quotaHint}>
          {nftQuota === 0
            ? t({ en: 'Upgrade to Lite+ to mint NFTs', zh: '升级到 Lite+ 解锁 NFT 铸造' })
            : t({ en: 'Free mints reset monthly', zh: '免费铸造每月重置' })}
        </Text>
      </View>

      {/* Chain selector */}
      <View style={styles.chainRow}>
        <Text style={styles.chainLabel}>{t({ en: 'Chain', zh: '链' })}:</Text>
        <TouchableOpacity
          style={[styles.chainBtn, selectedChain === 'base' && styles.chainBtnActive]}
          onPress={() => setSelectedChain('base')}
        >
          <Text style={[styles.chainBtnText, selectedChain === 'base' && styles.chainBtnTextActive]}>Base</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chainBtn, selectedChain === 'polygon' && styles.chainBtnActive]}
          onPress={() => setSelectedChain('polygon')}
        >
          <Text style={[styles.chainBtnText, selectedChain === 'polygon' && styles.chainBtnTextActive]}>Polygon</Text>
        </TouchableOpacity>
      </View>

      {/* Asset list */}
      {assetsQ.isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
      ) : assets.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            {t({ en: 'No mintable assets. Create skins first.', zh: '暂无可铸造资产，先创建皮肤。' })}
          </Text>
        </View>
      ) : (
        assets.map((asset) => (
          <View key={asset.id} style={[styles.assetCard, asset.already_minted && styles.assetCardMinted]}>
            <View style={styles.assetRow}>
              <View style={styles.assetThumb}>
                {asset.thumbnail_url ? (
                  <Image source={{ uri: asset.thumbnail_url }} style={styles.assetImg} resizeMode="cover" />
                ) : (
                  <Text style={styles.assetEmoji}>{asset.type === 'pet' ? '🐾' : '👕'}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.assetName}>{asset.name}</Text>
                <Text style={styles.assetMeta}>
                  {asset.type === 'pet' ? '🐾 Pet' : '👕 Skin'} · {asset.clan}
                </Text>
                {asset.already_minted && (
                  <Text style={styles.mintedLabel}>
                    ✓ Token #{asset.token_id}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.mintBtn, asset.already_minted && styles.mintBtnMinted]}
                onPress={() => handleMint(asset)}
                disabled={minting === asset.id}
              >
                {minting === asset.id ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.mintBtnText}>
                    {asset.already_minted
                      ? t({ en: 'View', zh: '查看' })
                      : t({ en: 'Mint', zh: '铸造' })}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: 16 },
  quotaCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  quotaText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  quotaHint: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  chainRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  chainLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  chainBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chainBtnActive: { borderColor: colors.accent, backgroundColor: colors.accent + '15' },
  chainBtnText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  chainBtnTextActive: { color: colors.accent },
  emptyBox: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  assetCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  assetCardMinted: { borderColor: '#22c55e40', backgroundColor: '#22c55e08' },
  assetRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  assetThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  assetImg: { width: '100%', height: '100%' },
  assetEmoji: { fontSize: 22 },
  assetName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  assetMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  mintedLabel: { fontSize: 11, color: '#22c55e', fontWeight: '600', marginTop: 2 },
  mintBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  mintBtnMinted: { backgroundColor: '#22c55e30' },
  mintBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
}));
