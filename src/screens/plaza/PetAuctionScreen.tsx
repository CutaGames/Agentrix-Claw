/**
 * PetAuctionScreen — Sprint G #17
 *
 * Whole-pet auction MVP. Shows pets listed for auction with:
 *   - Bloodline / clan / level / achievement count
 *   - Current bid + time remaining
 *   - "Place Bid" CTA (requires Mobile Trust 3 for L2+ amounts)
 *
 * Phase 1 MVP: browse + bid. Phase 2: list your own pet + NFT mint.
 *
 * Backend: GET /api/v1/marketplace/pets?mode=auction
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { apiFetch } from '../../services/api';
import { themedStyles } from '../../theme/useTheme';

// ── Types ────────────────────────────────────────────────────

interface PetAuctionItem {
  id: string;
  pet_name: string;
  soul_template_id: string;
  clan: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  level: number;
  intimacy_xp: number;
  achievement_count: number;
  skin_count: number;
  thumbnail_url: string | null;
  seller_name: string;
  starting_bid_usd: number;
  current_bid_usd: number | null;
  bid_count: number;
  auction_ends_at: string;
  has_nft: boolean;
  bloodline_rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

interface PetAuctionListResponse {
  items: PetAuctionItem[];
  total: number;
  next_cursor: string | null;
}

// ── API ──────────────────────────────────────────────────────

async function fetchPetAuctions(cursor?: string): Promise<PetAuctionListResponse> {
  const qs = new URLSearchParams();
  qs.set('mode', 'auction');
  qs.set('limit', '20');
  if (cursor) qs.set('cursor', cursor);
  return apiFetch<PetAuctionListResponse>(`/v1/marketplace/pets?${qs.toString()}`);
}

async function placeBid(petId: string, amountUsd: number): Promise<{ success: boolean; message: string }> {
  return apiFetch(`/v1/marketplace/pets/${petId}/bid`, {
    method: 'POST',
    body: JSON.stringify({ amount_usd: amountUsd }),
  });
}

// ── Helpers ──────────────────────────────────────────────────

const CLAN_EMOJI: Record<string, string> = {
  A: '🦾', B: '🍳', C: '📚', D: '🎮', E: '💎', F: '🏡',
};

const RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#f59e0b',
};

function timeRemaining(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return 'Ended';
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ── Component ────────────────────────────────────────────────

export function PetAuctionScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const auctionsQ = useQuery({
    queryKey: ['pet-auctions'],
    queryFn: () => fetchPetAuctions(),
    staleTime: 30_000,
  });

  const bidMut = useMutation({
    mutationFn: ({ petId, amount }: { petId: string; amount: number }) => placeBid(petId, amount),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pet-auctions'] });
      Alert.alert(t({ en: 'Bid Placed!', zh: '出价成功！' }), result.message);
    },
    onError: (err: any) => {
      Alert.alert(t({ en: 'Bid Failed', zh: '出价失败' }), err?.message ?? 'Unknown error');
    },
  });

  const handleBid = useCallback((item: PetAuctionItem) => {
    const minBid = (item.current_bid_usd ?? item.starting_bid_usd) + 1;
    Alert.prompt?.(
      t({ en: `Bid on ${item.pet_name}`, zh: `对 ${item.pet_name} 出价` }),
      t({ en: `Minimum bid: $${minBid.toFixed(2)}`, zh: `最低出价：$${minBid.toFixed(2)}` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Place Bid', zh: '出价' }),
          onPress: (value) => {
            const amount = parseFloat(value || '0');
            if (amount < minBid) {
              Alert.alert(t({ en: 'Too Low', zh: '出价过低' }), t({ en: `Minimum is $${minBid}`, zh: `最低 $${minBid}` }));
              return;
            }
            bidMut.mutate({ petId: item.id, amount });
          },
        },
      ],
      'plain-text',
      String(minBid),
      'decimal-pad',
    ) ?? Alert.alert(
      t({ en: `Bid on ${item.pet_name}`, zh: `对 ${item.pet_name} 出价` }),
      t({ en: `Place a bid of $${minBid.toFixed(2)}?`, zh: `出价 $${minBid.toFixed(2)}？` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Confirm', zh: '确认' }),
          onPress: () => bidMut.mutate({ petId: item.id, amount: minBid }),
        },
      ],
    );
  }, [bidMut, t]);

  const items = auctionsQ.data?.items ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={auctionsQ.isRefetching}
          onRefresh={() => auctionsQ.refetch()}
          tintColor={colors.accent}
        />
      }
    >
      <Text style={styles.title}>🧬 {t({ en: 'Pet Auction', zh: '主宠拍卖' })}</Text>
      <Text style={styles.subtitle}>
        {t({
          en: 'Bid on whole pets with bloodline, achievements, and wallet history. Winner gets full ownership.',
          zh: '对带血统、成就、钱包记录的完整主宠出价。赢家获得完整所有权。',
        })}
      </Text>

      {auctionsQ.isLoading && items.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyEmoji}>🏷️</Text>
          <Text style={styles.emptyText}>
            {t({
              en: 'No pets currently up for auction. Check back later!',
              zh: '暂无主宠拍卖中，稍后再来看看！',
            })}
          </Text>
        </View>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.thumbWrap}>
                {item.thumbnail_url ? (
                  <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <Text style={styles.thumbEmoji}>{CLAN_EMOJI[item.clan] || '🐾'}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.petName}>{item.pet_name}</Text>
                <Text style={styles.petMeta}>
                  Lv.{item.level} · {CLAN_EMOJI[item.clan]} {item.clan} · 🏆 {item.achievement_count} · 👕 {item.skin_count}
                </Text>
                <View style={styles.rarityRow}>
                  <View style={[styles.rarityBadge, { backgroundColor: RARITY_COLORS[item.bloodline_rarity] + '30' }]}>
                    <Text style={[styles.rarityText, { color: RARITY_COLORS[item.bloodline_rarity] }]}>
                      {item.bloodline_rarity.toUpperCase()}
                    </Text>
                  </View>
                  {item.has_nft && (
                    <View style={styles.nftBadge}>
                      <Text style={styles.nftText}>NFT</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.bidRow}>
              <View>
                <Text style={styles.bidLabel}>
                  {item.current_bid_usd
                    ? t({ en: 'Current Bid', zh: '当前出价' })
                    : t({ en: 'Starting Bid', zh: '起拍价' })}
                </Text>
                <Text style={styles.bidAmount}>
                  ${(item.current_bid_usd ?? item.starting_bid_usd).toFixed(2)}
                </Text>
                <Text style={styles.bidCount}>
                  {item.bid_count} {t({ en: 'bids', zh: '次出价' })} · ⏱ {timeRemaining(item.auction_ends_at)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.bidBtn}
                onPress={() => handleBid(item)}
                disabled={bidMut.isPending}
              >
                <Text style={styles.bidBtnText}>
                  {t({ en: 'Place Bid', zh: '出价' })}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sellerText}>
              {t({ en: 'Seller', zh: '卖家' })}: @{item.seller_name}
            </Text>
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
  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  // Card
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  cardHeader: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  thumbWrap: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%' },
  thumbEmoji: { fontSize: 28 },
  petName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  petMeta: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  rarityRow: { flexDirection: 'row', gap: 6 },
  rarityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  rarityText: { fontSize: 10, fontWeight: '800' },
  nftBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: '#f59e0b20' },
  nftText: { fontSize: 10, fontWeight: '800', color: '#f59e0b' },
  // Bid
  bidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bidLabel: { fontSize: 11, color: colors.textMuted },
  bidAmount: { fontSize: 20, fontWeight: '800', color: colors.accent, marginVertical: 2 },
  bidCount: { fontSize: 11, color: colors.textMuted },
  bidBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  bidBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sellerText: { fontSize: 11, color: colors.textMuted, marginTop: 8 },
}));
