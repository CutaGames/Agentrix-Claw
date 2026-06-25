/**
 * ShopQuickOrder — shop 卡「流内快捷下单」底部弹层(World Creation & Feed · task 3.5)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design,ui-design}.md
 *   - 对照 ui-design.md §3「shop 卡的流内快捷下单」:
 *       🛒 美式 ¥18   [－] 1 [＋]   [ 下单 ]   ← 流内直接交易(Economy_Bridge)
 *   - _Requirements:
 *       5.7 —— shop 卡可在流内直接下单(走需求 7 的权威交易),无需先进入完整体验。
 *       7.1 —— 经服务端权威 Economy_Bridge 计算并扣款;客户端展示价仅为提示。
 *       7.2 —— 失败/被拒时余额不变,返回结构化原因(ECONOMY_REJECTED)。
 *
 * 接线:作为 `CreationCard.onShopOrder` 的落点(CreationFeedScreen 持有打开态)。
 * 纯下单逻辑(可下单 offering 筛选 / 数量夹取 / 展示价 / 构造权威请求 / 结果解析)
 * 全部在无 RN 依赖的 `services/shopQuickOrder.ts`,本组件只负责呈现与交互编排。
 *
 * 关键约束:
 *   - **绝不在客户端伪造成交成功**:仅当服务端 `invoke(order)` 返回 `outcome:'ok'`
 *     才显示成功;金额以服务端 `authoritativeAmount` 为准(需求 7.1)。
 *   - 展示价(单价/小计)一律标注"仅供参考",不参与扣款。
 *   - 乐观 UI 仅用于**非金融**反馈(如按钮按压态/加载态),不预判成交结果。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';

import { colors } from '../../../theme/colors';
import { invokeCreation } from '../../../services/creationApi';
import { useAuthStore } from '../../../stores/authStore';
import {
  selectOrderableOfferings,
  pickDefaultOffering,
  offeringMaxQuantity,
  clampQuantity,
  canDecrement,
  canIncrement,
  isSoldOut,
  offeringUnitDisplayPrice,
  displayLineTotal,
  formatDisplayPrice,
  buildOrderInvokeRequest,
  interpretInvokeResponse,
  MIN_QUANTITY,
  type ShopOrderResult,
} from '../../../services/shopQuickOrder';
import type { CreationDiscoveryItem, Offering } from '../../../../shared/types/creation';
import type { WorldCreationErrorCode } from '../../../../shared/types/world-creation';
import { themedStyles } from '../../../theme/useTheme';

type Translate = (d: { zh: string; en: string }) => string;

/** 结构化错误码 → 友好文案(需求 7.2:返回结构化原因)。 */
const ERROR_COPY: Partial<Record<WorldCreationErrorCode, { zh: string; en: string }>> = {
  ECONOMY_REJECTED: { zh: '交易被拒,余额未变动。', en: 'Transaction rejected. Your balance is unchanged.' },
  QUOTA_EXCEEDED: { zh: '超出额度限制,下单未完成。', en: 'Quota exceeded. Order not completed.' },
  CAP_DENIED: { zh: '没有下单权限。', en: 'Not authorized to order.' },
  RESOURCE_EXCEEDED: { zh: '库存不足,请减少数量。', en: 'Insufficient stock. Reduce quantity.' },
};

export interface ShopQuickOrderProps {
  /** 待下单的 shop 创作;为 null 时弹层关闭。 */
  item: CreationDiscoveryItem | null;
  /** 弹层可见性(= item 非空)。 */
  visible: boolean;
  /** 关闭弹层。 */
  onClose: () => void;
  /** 底部安全区。 */
  bottomInset: number;
  /** i18n 翻译函数。 */
  t: Translate;
  /** 成交后回调(供上层更新成交计数等;可空)。 */
  onOrdered?: (item: CreationDiscoveryItem, result: Extract<ShopOrderResult, { ok: true }>) => void;
}

type Phase = 'form' | 'submitting' | 'success' | 'error';

/**
 * 流内快捷下单底部弹层。展示可下单 offering + 数量步进 + 展示价 + 下单按钮,
 * 下单走权威 `invoke(order)`,按结果渲染成功/失败态。
 */
export function ShopQuickOrder({
  item,
  visible,
  onClose,
  bottomInset,
  t,
  onOrdered,
}: ShopQuickOrderProps) {
  const accountId = useAuthStore((s) => s.user?.id);

  const orderables = useMemo<Offering[]>(
    () => (item ? selectOrderableOfferings(item) : []),
    [item],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(MIN_QUANTITY);
  const [phase, setPhase] = useState<Phase>('form');
  const [result, setResult] = useState<ShopOrderResult | null>(null);

  // 每次打开/切换创作:重置为默认 offering + 数量 1 + 表单态。
  useEffect(() => {
    if (!visible) return;
    const def = pickDefaultOffering(orderables);
    setSelectedId(def?.id ?? null);
    setQuantity(MIN_QUANTITY);
    setPhase('form');
    setResult(null);
  }, [visible, orderables]);

  const selectedOffering = useMemo<Offering | null>(
    () => orderables.find((o) => o.id === selectedId) ?? null,
    [orderables, selectedId],
  );

  const maxQty = offeringMaxQuantity(selectedOffering);
  const soldOut = isSoldOut(selectedOffering);
  const unitPrice = offeringUnitDisplayPrice(selectedOffering);
  const lineTotal = displayLineTotal(selectedOffering, quantity);

  const onSelectOffering = useCallback((id: string) => {
    setSelectedId(id);
    setQuantity(MIN_QUANTITY);
  }, []);

  const onDecrement = useCallback(() => {
    setQuantity((q) => clampQuantity(q - 1, maxQty));
  }, [maxQty]);

  const onIncrement = useCallback(() => {
    setQuantity((q) => clampQuantity(q + 1, maxQty));
  }, [maxQty]);

  const onConfirm = useCallback(async () => {
    if (!item || !selectedOffering || phase === 'submitting') return;
    // 下单本人账户;未登录则提示(权威结算需鉴权主体)。
    if (!accountId) {
      setResult({
        ok: false,
        code: 'CAP_DENIED',
        detail: t({ zh: '请先登录后再下单。', en: 'Please sign in to order.' }),
      });
      setPhase('error');
      return;
    }
    const qty = clampQuantity(quantity, maxQty);
    if (qty < MIN_QUANTITY) return;

    setPhase('submitting');
    try {
      const req = buildOrderInvokeRequest({
        offeringId: selectedOffering.id,
        quantity: qty,
        onBehalfOfAccountId: accountId,
      });
      const res = await invokeCreation(item.id, req);
      const interpreted = interpretInvokeResponse(res);
      setResult(interpreted);
      if (interpreted.ok) {
        setPhase('success');
        onOrdered?.(item, interpreted);
      } else {
        setPhase('error');
      }
    } catch {
      // 网络/未知错误:同样不预判成交,按失败处理(余额由服务端保证不变,需求 7.2)。
      setResult({
        ok: false,
        code: 'ECONOMY_REJECTED',
        detail: t({ zh: '网络异常,下单未完成。', en: 'Network error. Order not completed.' }),
      });
      setPhase('error');
    }
  }, [item, selectedOffering, phase, accountId, quantity, maxQty, t, onOrdered]);

  if (!item) return null;

  const title = item.title;
  const hasOrderable = orderables.length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          testID="shop-quick-order-sheet"
          style={[styles.sheet, { paddingBottom: bottomInset + 16 }]}
          onPress={() => {}}
        >
          {/* 抓手 */}
          <View style={styles.grabber} />

          {/* 标题 */}
          <Text style={styles.shopTitle} numberOfLines={1}>
            🛒 {title}
          </Text>

          {phase === 'success' && result?.ok ? (
            <SuccessView result={result} t={t} onClose={onClose} />
          ) : !hasOrderable ? (
            <EmptyView t={t} onClose={onClose} />
          ) : (
            <>
              {/* ── offering 选择(>1 个时可选) ── */}
              {orderables.length > 1 ? (
                <ScrollView style={styles.offeringList} keyboardShouldPersistTaps="handled">
                  {orderables.map((o) => {
                    const selected = o.id === selectedId;
                    const oUnit = offeringUnitDisplayPrice(o);
                    const oSoldOut = isSoldOut(o);
                    return (
                      <Pressable
                        key={o.id}
                        testID={`shop-quick-order-offering-${o.id}`}
                        accessibilityRole="button"
                        style={[styles.offeringRow, selected && styles.offeringRowSelected]}
                        onPress={() => onSelectOffering(o.id)}
                        disabled={oSoldOut}
                      >
                        <View style={styles.offeringInfo}>
                          <Text style={[styles.offeringName, oSoldOut && styles.dimText]} numberOfLines={1}>
                            {o.name}
                          </Text>
                          {o.description ? (
                            <Text style={styles.offeringDesc} numberOfLines={1}>
                              {o.description}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={[styles.offeringPrice, oSoldOut && styles.dimText]}>
                          {oSoldOut ? t({ zh: '售罄', en: 'Sold out' }) : formatDisplayPrice(oUnit)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : (
                // 单一 offering:直接展示名称 + 单价
                <View style={styles.singleOffering}>
                  <Text style={styles.offeringName} numberOfLines={1}>
                    {selectedOffering?.name}
                  </Text>
                  <Text style={styles.offeringPrice}>
                    {soldOut ? t({ zh: '售罄', en: 'Sold out' }) : formatDisplayPrice(unitPrice)}
                  </Text>
                </View>
              )}

              {/* ── 数量步进 ── */}
              <View style={styles.qtyRow}>
                <Text style={styles.qtyLabel}>{t({ zh: '数量', en: 'Qty' })}</Text>
                <View style={styles.stepper}>
                  <Pressable
                    testID="shop-quick-order-decrement"
                    accessibilityRole="button"
                    accessibilityLabel={t({ zh: '减少数量', en: 'Decrease' })}
                    style={[styles.stepBtn, !canDecrement(quantity) && styles.stepBtnDisabled]}
                    onPress={onDecrement}
                    disabled={!canDecrement(quantity) || phase === 'submitting'}
                  >
                    <Text style={styles.stepBtnText}>－</Text>
                  </Pressable>
                  <Text testID="shop-quick-order-qty" style={styles.qtyValue}>
                    {quantity}
                  </Text>
                  <Pressable
                    testID="shop-quick-order-increment"
                    accessibilityRole="button"
                    accessibilityLabel={t({ zh: '增加数量', en: 'Increase' })}
                    style={[styles.stepBtn, !canIncrement(quantity, maxQty) && styles.stepBtnDisabled]}
                    onPress={onIncrement}
                    disabled={!canIncrement(quantity, maxQty) || phase === 'submitting'}
                  >
                    <Text style={styles.stepBtnText}>＋</Text>
                  </Pressable>
                </View>
              </View>
              {typeof maxQty === 'number' && maxQty > 0 ? (
                <Text style={styles.stockHint}>{t({ zh: '库存', en: 'Stock' })} {maxQty}</Text>
              ) : null}

              {/* ── 展示价(仅供参考;权威金额以服务端为准,需求 7.1) ── */}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>{t({ zh: '合计(仅供参考)', en: 'Total (est.)' })}</Text>
                <Text style={styles.totalValue}>{formatDisplayPrice(lineTotal)}</Text>
              </View>
              <Text style={styles.authoritativeNote}>
                {t({
                  zh: '最终金额由服务端权威计算,下单后扣款。',
                  en: 'Final amount is computed by the server at checkout.',
                })}
              </Text>

              {/* ── 失败态:结构化原因(需求 7.2) ── */}
              {phase === 'error' && result && !result.ok ? (
                <View style={styles.errorBox} testID="shop-quick-order-error">
                  <Text style={styles.errorText}>
                    ⚠️ {result.detail || t(ERROR_COPY[result.code] ?? ERROR_COPY.ECONOMY_REJECTED!)}
                  </Text>
                </View>
              ) : null}

              {/* ── 下单按钮(权威路径) ── */}
              <Pressable
                testID="shop-quick-order-confirm"
                accessibilityRole="button"
                style={[
                  styles.confirmBtn,
                  (soldOut || phase === 'submitting') && styles.confirmBtnDisabled,
                ]}
                onPress={onConfirm}
                disabled={soldOut || phase === 'submitting'}
              >
                {phase === 'submitting' ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.confirmBtnText}>
                    {soldOut
                      ? t({ zh: '已售罄', en: 'Sold out' })
                      : phase === 'error'
                        ? t({ zh: '重试下单', en: 'Retry order' })
                        : t({ zh: '下单', en: 'Place order' })}
                  </Text>
                )}
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** 下单成功态(展示服务端权威金额)。 */
function SuccessView({
  result,
  t,
  onClose,
}: {
  result: Extract<ShopOrderResult, { ok: true }>;
  t: Translate;
  onClose: () => void;
}) {
  return (
    <View style={styles.resultBox} testID="shop-quick-order-success">
      <Text style={styles.successEmoji}>✅</Text>
      <Text style={styles.successTitle}>{t({ zh: '下单成功', en: 'Order placed' })}</Text>
      {typeof result.authoritativeAmount === 'number' ? (
        <Text style={styles.successAmount}>
          {t({ zh: '已扣款', en: 'Charged' })} {result.authoritativeAmount} AXP
        </Text>
      ) : null}
      <Pressable
        testID="shop-quick-order-done"
        accessibilityRole="button"
        style={styles.confirmBtn}
        onPress={onClose}
      >
        <Text style={styles.confirmBtnText}>{t({ zh: '完成', en: 'Done' })}</Text>
      </Pressable>
    </View>
  );
}

/** 无可下单 offering 的兜底态。 */
function EmptyView({ t, onClose }: { t: Translate; onClose: () => void }) {
  return (
    <View style={styles.resultBox} testID="shop-quick-order-empty">
      <Text style={styles.emptyText}>
        {t({ zh: '这个店铺暂无可直接下单的商品,进店看看吧。', en: 'No quick-order items. Enter the shop to browse.' })}
      </Text>
      <Pressable accessibilityRole="button" style={styles.confirmBtn} onPress={onClose}>
        <Text style={styles.confirmBtnText}>{t({ zh: '知道了', en: 'Got it' })}</Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 12,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 4,
  },
  shopTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },

  offeringList: { maxHeight: 220 },
  offeringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.input,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  offeringRowSelected: { borderColor: colors.accent },
  offeringInfo: { flex: 1, marginRight: 12 },
  offeringName: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  offeringDesc: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  offeringPrice: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  dimText: { color: colors.textMuted },
  singleOffering: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },

  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qtyLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.4 },
  stepBtnText: { color: colors.textPrimary, fontSize: 22, fontWeight: '700', lineHeight: 24 },
  qtyValue: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', minWidth: 28, textAlign: 'center' },
  stockHint: { color: colors.textMuted, fontSize: 12, textAlign: 'right' },

  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  totalLabel: { color: colors.textSecondary, fontSize: 14 },
  totalValue: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  authoritativeNote: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },

  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 10,
    padding: 12,
  },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600' },

  confirmBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  confirmBtnDisabled: { backgroundColor: colors.border },
  confirmBtnText: { color: colors.textInverse, fontSize: 16, fontWeight: '800' },

  resultBox: { alignItems: 'center', gap: 10, paddingVertical: 12 },
  successEmoji: { fontSize: 48 },
  successTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  successAmount: { color: colors.textSecondary, fontSize: 14 },
  emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
}));

export default ShopQuickOrder;
