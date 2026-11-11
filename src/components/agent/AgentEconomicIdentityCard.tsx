/**
 * AgentEconomicIdentityCard — Agent 经济身份卡（agent-wallet-identity-tangibility 需求 6/7/8）。
 *
 * 把"你拥有的 agent 到底有什么"具象化：钱包地址（复制/查浏览器）、余额、备份状态、
 * 链上身份（4 态：enabled/pending/not_enabled/failed，诚实）、信用、累计赚取、可交易(路线图)。
 * 保留移动端社交优势：一键分享 agent 身份/战绩。状态严格来自后端 DTO（不虚构）。
 *
 * L8-6 S11b: with EXPO_PUBLIC_AGENT_OWN_WALLET_V1_ENABLED=1 and the card carrying `ownWallet` (the backend's main switch
 * on) the wallet block is the own-wallet one: the short address and the check state only (no clipboard, no deposit sheet,
 * W1.2), "收款 / 复制地址" opens the wallet origin, and the share button goes through the share gate G
 * (`ownWalletShareGate.ts`). Everything else is today's card.
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Linking, Share, Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQuery } from '@tanstack/react-query';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import {
  fetchEconomicIdentityCard,
  fetchAgentLedger,
  type EconomicIdentityCard,
  type AgentLedgerItem,
  type CardStatus,
} from '../../services/agentOpsApi';
import { DepositSheet } from '../wallet/DepositSheet';
import {
  agentShareGateMobileEnabledV1,
  complianceLinesV1,
  confirmLegacyCutoverV1,
  ownWalletChainNameV1,
  ownWalletMobileEnabledV1,
  ownWalletSetupAvailableV1,
  ownWalletSetupUrlV1,
  ownWalletViewOfCardV1,
  OWN_WALLET_MOBILE_COPY_V1,
  shortAddressV1,
  startOwnAccountV1,
  walletAccountUrlV1,
  walletOriginV1,
  type OwnWalletViewV1,
} from '../../services/ownWallet';
import { APP_URL } from '../../config/env';
import { ownWalletHttpV1, ownWalletSecureStoreV1, ownWalletVerifyDepsV1 } from '../../services/ownWalletApi';
import { verifyPageLinkV1 } from '../../services/ownWalletIdentityBadge';
import { buildShareMessageV1, decideShareV1, shareSheetV1 } from '../../services/ownWalletShareGate';
import { beginVerifyV1, isDeviceVerifiedV1 } from '../../services/ownWalletVerifyState';

function ledgerLabel(type: string, t: (d: { en: string; zh: string }) => string): string {
  switch (type) {
    case 'x402_pay': return t({ en: 'Pay-per-use API', zh: '按次付费的接口' });
    case 'a2a_commission': return t({ en: 'A2A commission', zh: 'A2A 分佣' });
    case 'identity_register': return t({ en: 'Identity register', zh: '身份注册' });
    case 'earn': return t({ en: 'Earning', zh: '赚取' });
    case 'spend': return t({ en: 'Spend', zh: '支出' });
    default: return type;
  }
}

type Bilingual = { readonly en: string; readonly zh: string };
type Translate = (d: { en: string; zh: string }) => string;
type CardStyles = ReturnType<typeof makeStyles>;

export function AgentEconomicIdentityCard({ agentId }: { agentId: string }) {
  const c = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();

  const q = useQuery({
    queryKey: ['agent-economic-identity', agentId],
    queryFn: () => fetchEconomicIdentityCard(agentId),
    enabled: !!agentId,
    retry: 1,
  });

  const card = q.data;

  const ledgerQ = useQuery({
    queryKey: ['agent-ledger', agentId],
    queryFn: () => fetchAgentLedger(agentId),
    enabled: !!agentId,
    retry: 1,
  });

  // L8-6 S11b: the own-wallet view exists only with the phone switch on AND the card carrying `ownWallet`; with either
  // missing everything below is today's card.
  const ownView: OwnWalletViewV1 | null = card && ownWalletMobileEnabledV1() ? ownWalletViewOfCardV1(card) : null;
  const hasOwnAccount = ownView !== null && (ownView.status === 'pending' || ownView.status === 'active' || ownView.status === 'lost');
  const verifiedQ = useQuery({
    queryKey: ['own-wallet-verified', ownView?.chainId ?? null, ownView?.account ?? null],
    queryFn: () => isDeviceVerifiedV1(ownView?.chainId as number, ownView?.account as string, { store: ownWalletSecureStoreV1 }),
    enabled: ownView !== null && (ownView.status === 'pending' || ownView.status === 'active'),
    retry: false,
  });
  const deviceVerified = verifiedQ.data === true;

  const openUrl = useCallback((url?: string) => {
    if (url) Linking.openURL(url).catch(() => undefined);
  }, []);

  // A wallet origin link that could not be built (no configured origin, a malformed id) is a failure, never a half link.
  const openWalletUrl = useCallback((url: string | null) => {
    if (url === null) {
      Alert.alert(t({ en: 'Error', zh: '错误' }), t(OWN_WALLET_MOBILE_COPY_V1.requestFailed));
      return;
    }
    Linking.openURL(url).catch(() => undefined);
  }, [t]);

  const refetchCard = q.refetch;

  const startOwnAccount = useCallback(async () => {
    const started = await startOwnAccountV1({ agentId, walletOrigin: walletOriginV1(), http: ownWalletHttpV1 });
    if (started.outcome === 'open_wallet') openWalletUrl(started.url);
    else if (started.outcome === 'account_ready') void refetchCard();
    else openWalletUrl(null);
  }, [agentId, openWalletUrl, refetchCard]);

  // 6a / R2-M3: the phone makes a one-time state, keeps it, and puts it only in the link's fragment.
  const startAddressCheck = useCallback(async () => {
    if (!ownView || ownView.chainId === undefined || !ownView.account) return;
    const begun = await beginVerifyV1({ agentId, account: ownView.account, chainId: ownView.chainId }, ownWalletVerifyDepsV1());
    if (begun.ok === false) {
      openWalletUrl(null);
      return;
    }
    openWalletUrl(walletAccountUrlV1(walletOriginV1(), 'verify-device', { chainId: ownView.chainId, account: ownView.account, agentId, state: begun.state }));
  }, [agentId, ownView, openWalletUrl]);

  // W1.2 / R3-M5: the address to copy is shown on the wallet origin's receive page only.
  const openReceive = useCallback(() => {
    if (!ownView || ownView.chainId === undefined || !ownView.account) return;
    openWalletUrl(walletAccountUrlV1(walletOriginV1(), 'receive', { chainId: ownView.chainId, account: ownView.account, agentId }));
  }, [agentId, ownView, openWalletUrl]);

  // S11c: the main site's setup page (the recovery wizard, or the registration signature) for an account the card says is
  // not finished. It needs the owner signed in on the web, like the other web-only steps; the link names the Agent only.
  const openSetup = useCallback(() => {
    openWalletUrl(ownWalletSetupUrlV1(APP_URL, agentId));
  }, [agentId, openWalletUrl]);

  const shareIdentity = useCallback(async (cd: EconomicIdentityCard) => {
    const decision = decideShareV1({
      gateEnabled: agentShareGateMobileEnabledV1(),
      shareGate: cd.shareGate,
      deviceVerified,
      message: buildShareMessageV1(cd, t),
    });
    if (decision.action === 'share') {
      try {
        await Share.share({ message: decision.message });
      } catch {
        // user cancelled
      }
      return;
    }
    // The gate did not let the text out: the sheet says why and what can be started now (appendix C items 4, 4a, 16, 30).
    const view = ownWalletViewOfCardV1(cd);
    const sheet = shareSheetV1({
      variant: decision.action,
      walletStatus: view ? view.status : 'unavailable',
      hasLegacyCustody: view !== null && view.usesLegacyCustody,
      shareGate: cd.shareGate,
      deviceVerified,
      setupAvailable: ownWalletSetupAvailableV1(cd),
    });
    const buttons: Array<{ text: string; style?: 'cancel'; onPress?: () => void }> = [];
    if (sheet.go !== null) buttons.push({ text: t(sheet.go), onPress: () => void (sheet.step === 'create' ? startOwnAccount() : sheet.step === 'setup' ? openSetup() : startAddressCheck()) });
    buttons.push({ text: t(sheet.close), style: 'cancel' });
    Alert.alert(t({ en: 'Share', zh: '分享' }), t(sheet.text), buttons);
  }, [t, deviceVerified, startOwnAccount, startAddressCheck, openSetup]);

  if (q.isLoading) {
    return <View style={styles.card}><ActivityIndicator color={c.accent} /></View>;
  }
  if (q.isError || !card) {
    return (
      <View style={styles.card}>
        <Text style={styles.muted}>{t({ en: 'Failed to load identity card.', zh: '加载身份卡失败。' })}</Text>
      </View>
    );
  }

  // An Agent without an own account shows no ledger rows when the own-wallet view is on: the only rows allowed are on-chain ones (A4, R-d).
  const ledgerItems: AgentLedgerItem[] = ownView !== null && !hasOwnAccount ? [] : (ledgerQ.data ? ledgerQ.data.items : []);
  // The own-wallet block is for an Agent with an own account (or an unreadable status); `none` and `owner_mismatch` keep
  // today's block, with the old wallet named by its source (appendix C items 3 and 23; the label only when an address shows).
  const ownBlockShown = ownView !== null && (hasOwnAccount || ownView.status === 'unavailable');
  const legacyLabel: Bilingual | null =
    ownView !== null && ownView.status === 'none' && card.wallet.address
      ? ownView.legacy !== null ? (ownView.usesLegacyCustody ? OWN_WALLET_MOBILE_COPY_V1.legacyCustodyLabel : OWN_WALLET_MOBILE_COPY_V1.externalWalletLabel) : null
      : null;
  const chainText = ownView !== null ? (ownWalletChainNameV1(card.onchain.chain) ?? card.onchain.chain) : card.onchain.chain;
  const verifyUrl = ownView !== null ? verifyPageLinkV1(card.onchain.identity?.verifyUrl) : null;

  return (
    <View style={styles.wrap} testID="agent-economic-identity-card">
      {/* Header: owner + agent id + share */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.agentId}>{card.agentUniqueId}</Text>
          <Text style={styles.owner}>{t({ en: 'Owned by you', zh: '归属：你' })}</Text>
        </View>
        <TouchableOpacity style={styles.shareBtn} onPress={() => shareIdentity(card)} testID="aeic-share">
          <Text style={styles.shareBtnText}>{t({ en: 'Share', zh: '分享' })}</Text>
        </TouchableOpacity>
      </View>

      {/* Wallet */}
      {ownBlockShown && ownView !== null ? (
        <OwnWalletAddressBlock
          card={card}
          view={ownView}
          verified={deviceVerified}
          onVerify={startAddressCheck}
          onReceive={openReceive}
          onSetUp={openSetup}
          styles={styles}
          c={c}
          t={t}
        />
      ) : (
        <LegacyWalletAddressBlock card={card} openUrl={openUrl} legacyLabel={legacyLabel} styles={styles} c={c} t={t} />
      )}

      {/* Backup */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>🔐 {t({ en: 'Backup', zh: '备份' })}</Text>
          <Badge status={card.backup.status} c={c} styles={styles} t={t} />
        </View>
        {card.backup.status !== 'enabled' ? (
          <Text style={styles.action}>{t({ en: 'Not backed up — save your recovery code to avoid losing the wallet.', zh: '未备份——请保存恢复码，避免丢失钱包。' })}</Text>
        ) : (
          <Text style={styles.muted}>{t({ en: 'Recovery code confirmed.', zh: '恢复码已确认。' })}</Text>
        )}
      </View>

      {/* On-chain identity */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>⛓️ {t({ en: 'On-chain identity', zh: '链上身份' })}</Text>
          <Badge status={card.onchain.status} c={c} styles={styles} t={t} />
        </View>
        {card.onchain.chain ? (
          <View style={styles.row}>
            <Text style={styles.label}>{t({ en: 'Chain', zh: '链' })}</Text>
            <Text style={styles.value}>{chainText}</Text>
          </View>
        ) : null}
        {card.onchain.status === 'pending' ? (
          <Text style={styles.action}>{t({ en: 'Registration pending confirmation…', zh: '注册待链上确认…' })}</Text>
        ) : null}
        {card.onchain.explorerUrl ? (
          <TouchableOpacity onPress={() => openUrl(card.onchain.explorerUrl)}>
            <Text style={styles.link}>{t({ en: 'View tx ↗', zh: '查看交易 ↗' })}</Text>
          </TouchableOpacity>
        ) : null}
        {/* S11b (6e, S10): the public verify page, and an old Agent's way to its own wallet. */}
        {verifyUrl ? (
          <TouchableOpacity onPress={() => openUrl(verifyUrl)} testID="aeic-verify-link">
            <Text style={styles.link}>{t({ en: 'View on-chain identity ↗', zh: '查看链上身份 ↗' })}</Text>
          </TouchableOpacity>
        ) : null}
        {ownView !== null && (ownView.status === 'none' || ownView.status === 'pending') ? (
          <OwnWalletUpgradeBlock
            agentId={agentId}
            view={ownView}
            startOwnAccount={startOwnAccount}
            onChanged={() => void refetchCard()}
            styles={styles}
            t={t}
          />
        ) : null}
      </View>

      {/* Credit + Earnings */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>🎯 {t({ en: 'Credit & earnings', zh: '信用与赚取' })}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{t({ en: 'Credit', zh: '信用' })}</Text>
          <Text style={styles.value}>{card.credit.level} ({card.credit.creditScore})</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{t({ en: 'Transactions', zh: '交易次数' })}</Text>
          <Text style={styles.value}>{card.earnings.totalTx}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{t({ en: 'Volume', zh: '累计金额' })}</Text>
          <Text style={styles.value}>{card.earnings.totalAmount} {card.earnings.currency}</Text>
        </View>
        {card.earnings.totalTx === 0 ? (
          <Text style={styles.muted}>{t({ en: 'No activity yet — let your agent take its first task / order.', zh: '还没有流水——派 agent 接第一个任务/下第一单。' })}</Text>
        ) : null}
      </View>

      {/* Tradable (roadmap) */}
      <View style={[styles.card, styles.roadmapCard]}>
        <Text style={styles.cardTitle}>🔄 {t({ en: 'Transfer / trade', zh: '转让 / 交易' })}</Text>
        <Text style={styles.muted}>{card.tradable.note} · {t({ en: 'Roadmap', zh: '路线图' })}</Text>
      </View>

      {/* 链上活动 / 流水（need 5.1）：X402 付费 / A2A 分佣 / 身份注册 / 支出，可跳浏览器 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🧾 {t({ en: 'Activity', zh: '链上活动 / 流水' })}</Text>
        {ledgerItems.length > 0 ? (
          ledgerItems.slice(0, 8).map((it: AgentLedgerItem) => (
            <TouchableOpacity
              key={it.id}
              style={styles.ledgerRow}
              disabled={!it.explorerUrl}
              onPress={() => openUrl(it.explorerUrl)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.ledgerType}>{ledgerLabel(it.type, t)}</Text>
                {it.counterparty ? (
                  <Text style={styles.ledgerSub}>{it.counterparty.slice(0, 8)}…{it.counterparty.slice(-4)}</Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.ledgerAmt, { color: Number(it.amount) >= 0 ? c.success : c.textPrimary }]}>
                  {Number(it.amount) >= 0 ? '+' : ''}{it.amount} {it.currency}
                </Text>
                {it.txHash ? <Text style={styles.ledgerTx}>{it.explorerUrl ? '↗ ' : ''}{it.txHash.slice(0, 10)}…</Text> : null}
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.muted}>{t({ en: 'No on-chain activity yet.', zh: '还没有链上活动。' })}</Text>
        )}
      </View>

      {/* Compliance */}
      <View style={styles.compliance}>
        {complianceLinesV1(card.compliance.disclosures, ownView, t).map((d, i) => (
          <Text key={i} style={styles.disclosure}>· {d}</Text>
        ))}
      </View>
    </View>
  );
}

/**
 * Today's wallet block (L8-6 S11b moved it out of the card unchanged): the address you can tap to copy, the balance, the
 * explorer link and the deposit sheet. Used whenever the own-wallet view is off. The clipboard and `DepositSheet` live
 * here and nowhere else in this file (source guard).
 */
function LegacyWalletAddressBlock({
  card, openUrl, legacyLabel, styles, c, t,
}: {
  card: EconomicIdentityCard;
  openUrl: (url?: string) => void;
  /** Own-wallet view on, status `none`: where the shown wallet comes from. `null` otherwise (today's block). */
  legacyLabel: Bilingual | null;
  styles: CardStyles;
  c: Palette;
  t: Translate;
}) {
  const [depositOpen, setDepositOpen] = useState(false);

  const copyAddress = useCallback(async (addr?: string) => {
    if (!addr) return;
    await Clipboard.setStringAsync(addr);
    Alert.alert(t({ en: 'Copied', zh: '已复制' }), t({ en: 'Address copied', zh: '地址已复制' }));
  }, [t]);

  const shortAddr = card.wallet.address
    ? `${card.wallet.address.slice(0, 8)}…${card.wallet.address.slice(-6)}`
    : t({ en: 'No wallet', zh: '无钱包' });

  return (
    <>
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>👛 {t({ en: 'Wallet', zh: '钱包' })}</Text>
          <Badge status={card.wallet.status} c={c} styles={styles} t={t} />
        </View>
        {legacyLabel !== null ? <Text style={styles.action} testID="aeic-legacy-label">{t(legacyLabel)}</Text> : null}
        <TouchableOpacity onPress={() => copyAddress(card.wallet.address)} testID="aeic-copy-addr">
          <Text style={styles.addr}>{shortAddr}  <Text style={styles.copyHint}>{card.wallet.address ? t({ en: '(tap to copy)', zh: '(点击复制)' }) : ''}</Text></Text>
        </TouchableOpacity>
        <View style={styles.row}>
          <Text style={styles.label}>{t({ en: 'Balance', zh: '余额' })}</Text>
          <Text style={styles.value}>{card.wallet.balances.platform} {card.wallet.balances.currency}</Text>
        </View>
        {card.wallet.explorerUrl ? (
          <TouchableOpacity onPress={() => openUrl(card.wallet.explorerUrl)}>
            <Text style={styles.link}>{t({ en: 'View on explorer ↗', zh: '在区块浏览器查看 ↗' })}</Text>
          </TouchableOpacity>
        ) : null}
        {card.wallet.type === 'mpc' ? (
          <TouchableOpacity style={styles.depositBtn} onPress={() => setDepositOpen(true)} testID="aeic-deposit">
            <Text style={styles.depositBtnText}>＋ {t({ en: 'Deposit', zh: '充值' })}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <DepositSheet
        visible={depositOpen}
        onClose={() => setDepositOpen(false)}
        walletAddress={card.wallet.address}
        chainId={card.onchain.chain && card.onchain.chain.toLowerCase().includes('bsc') ? 97 : 1439}
      />
    </>
  );
}

/**
 * L8-6 S11b (W1.2, R3-M5): the one way an own account's address appears on the phone. Only the short form and the check
 * state; no full address, no clipboard, no QR code, no deposit sheet. "收款 / 复制地址" opens the wallet origin's receive
 * page, where the address is computed on that device; "核对地址" starts the one-time state round trip. A lost account is
 * greyed out with no action; a deployed account without recovery offers no way to deposit (appendix C item 24).
 */
function OwnWalletAddressBlock({
  card, view, verified, onVerify, onReceive, onSetUp, styles, c, t,
}: {
  card: EconomicIdentityCard;
  view: OwnWalletViewV1;
  verified: boolean;
  onVerify: () => void;
  onReceive: () => void;
  /** S11c: "设置恢复" (appendix C item 24's button), shown only while the chain read says recovery is not installed. */
  onSetUp: () => void;
  styles: CardStyles;
  c: Palette;
  t: Translate;
}) {
  const copy = OWN_WALLET_MOBILE_COPY_V1;
  const lost = view.status === 'lost';
  return (
    <View style={[styles.card, lost ? styles.lostCard : null]} testID="aeic-own-wallet-block">
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>👛 {t({ en: 'Wallet', zh: '钱包' })}</Text>
        <Badge status={card.wallet.status} c={c} styles={styles} t={t} />
      </View>
      {view.status === 'unavailable' || view.account === undefined ? (
        <Text style={styles.action} testID="aeic-own-wallet-unavailable">{t(copy.statusUnavailable)}</Text>
      ) : (
        <>
          <View style={styles.row}>
            <Text style={styles.addr}>{shortAddressV1(view.account)}</Text>
            <Text style={[styles.checkState, { color: verified ? c.success : (c.warning ?? '#d97706') }]} testID="aeic-own-wallet-check-state">
              {t(verified ? copy.verified : copy.unverified)}
            </Text>
          </View>
          {lost ? <Text style={styles.muted}>{t(copy.walletLost)}</Text> : null}
          {!lost && !verified ? <Text style={styles.muted}>{t(copy.badgeNotChecked)}</Text> : null}
          {view.recoveryMissing ? <Text style={styles.errorText} testID="aeic-own-wallet-recovery-missing">{t(copy.recoveryNotSet)}</Text> : null}
          {view.legacy !== null && !lost ? (
            <View style={styles.row}>
              <Text style={styles.label}>{t(view.legacy.label === 'external' ? copy.externalWalletLabel : copy.legacyCustodyLabel)}</Text>
              <Text style={styles.value}>{shortAddressV1(view.legacy.address)}</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.label}>{t({ en: 'Balance', zh: '余额' })}</Text>
            <Text style={styles.value}>{card.wallet.balances.platform} {card.wallet.balances.currency}</Text>
          </View>
          {!lost ? (
            <View style={styles.actionRow}>
              {!verified ? (
                <TouchableOpacity style={styles.smallBtn} onPress={onVerify} testID="aeic-own-wallet-verify">
                  <Text style={styles.smallBtnText}>{t(copy.verifyButton)}</Text>
                </TouchableOpacity>
              ) : null}
              {view.recoveryMissing ? (
                <TouchableOpacity style={styles.smallBtn} onPress={onSetUp} testID="aeic-own-wallet-setup-recovery">
                  <Text style={styles.smallBtnText}>{t(copy.setUpRecoveryButton)}</Text>
                </TouchableOpacity>
              ) : null}
              {!view.recoveryMissing ? (
                <TouchableOpacity style={styles.smallBtn} onPress={onReceive} testID="aeic-own-wallet-receive">
                  <Text style={styles.smallBtnText}>{t(copy.receiveButton)}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

/**
 * L8-6 S11b (6a (ii), appendix C items 21 and 14): an old Agent's way to its own wallet.
 * - `none`: item 21 (only when the Agent really uses the old custody wallet) and "升级到自己的钱包", which starts the first
 *   account path (the wallet origin's create page when a wallet passkey has to be made first).
 * - `pending` with an old custody wallet: the same button, then item 14 with "确认停用" / "先不停". Confirming is one way and
 *   the server asks for a recent sign-in.
 * - `pending` without an old wallet has nothing to confirm here: nothing is rendered.
 */
function OwnWalletUpgradeBlock({
  agentId, view, startOwnAccount, onChanged, styles, t,
}: {
  agentId: string;
  view: OwnWalletViewV1;
  startOwnAccount: () => Promise<void>;
  onChanged: () => void;
  styles: CardStyles;
  t: Translate;
}) {
  const copy = OWN_WALLET_MOBILE_COPY_V1;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (view.status === 'pending' && !view.usesLegacyCustody) return null;

  const confirmCutover = async () => {
    setBusy(true);
    setMessage(null);
    const result = await confirmLegacyCutoverV1({ agentId, http: ownWalletHttpV1 });
    setBusy(false);
    if (result.ok === true) onChanged();
    else setMessage(t(result.code === 'STEP_UP_REQUIRED' ? copy.stepUpRequired : copy.requestFailed));
  };

  const onPress = async () => {
    if (busy) return;
    if (view.status === 'pending') {
      Alert.alert(t(copy.upgradeButton), t(copy.cutoverConfirm), [
        { text: t(copy.cutoverLaterButton), style: 'cancel' },
        { text: t(copy.cutoverConfirmButton), style: 'destructive', onPress: () => void confirmCutover() },
      ]);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await startOwnAccount();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.upgradeBox} testID="aeic-own-wallet-upgrade">
      {view.usesLegacyCustody ? <Text style={styles.muted}>{t(copy.upgradeNotice)}</Text> : null}
      <TouchableOpacity style={styles.smallBtn} onPress={onPress} disabled={busy} testID="aeic-own-wallet-upgrade-button">
        {busy ? <ActivityIndicator size="small" /> : <Text style={styles.smallBtnText}>{t(copy.upgradeButton)}</Text>}
      </TouchableOpacity>
      {message ? <Text style={styles.action}>{message}</Text> : null}
    </View>
  );
}

function Badge({
  status, c, styles, t,
}: {
  status: CardStatus | 'enabled' | 'not_enabled';
  c: Palette;
  styles: ReturnType<typeof makeStyles>;
  t: (d: { en: string; zh: string }) => string;
}) {
  const map: Record<string, { color: string; label: string }> = {
    enabled: { color: c.success, label: t({ en: 'Enabled', zh: '已启用' }) },
    pending: { color: c.warning ?? '#d97706', label: t({ en: 'Pending', zh: '待确认' }) },
    not_enabled: { color: c.textMuted, label: t({ en: 'Not enabled', zh: '未启用' }) },
    failed: { color: c.error, label: t({ en: 'Failed', zh: '失败' }) },
  };
  const { color, label } = map[status] ?? map.not_enabled;
  return (
    <View style={[styles.badge, { backgroundColor: color + '22', borderColor: color + '66' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    wrap: { gap: 12 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    agentId: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    owner: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    shareBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: c.accent + '22', borderWidth: 1, borderColor: c.accent + '66' },
    shareBtnText: { fontSize: 12, fontWeight: '800', color: c.accent },
    card: { backgroundColor: c.bgCard, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: c.border },
    roadmapCard: { opacity: 0.7 },
    lostCard: { opacity: 0.5 },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    addr: { fontSize: 14, color: c.textPrimary, fontWeight: '700', fontFamily: 'monospace' },
    copyHint: { fontSize: 11, color: c.textMuted, fontWeight: '400' },
    checkState: { fontSize: 11, fontWeight: '700' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 2 },
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    smallBtn: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: c.accent + '22', borderWidth: 1, borderColor: c.accent + '66' },
    smallBtnText: { fontSize: 12, fontWeight: '800', color: c.accent },
    upgradeBox: { gap: 6, marginTop: 4 },
    label: { fontSize: 13, color: c.textMuted },
    value: { fontSize: 13, color: c.textPrimary, fontWeight: '600' },
    link: { fontSize: 13, color: c.accent, fontWeight: '700', marginTop: 2 },
    depositBtn: { marginTop: 4, alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: c.accent, },
    depositBtnText: { fontSize: 13, fontWeight: '800', color: '#000' },
    action: { fontSize: 13, color: c.warning ?? '#d97706', lineHeight: 18 },
    errorText: { fontSize: 13, color: c.error, lineHeight: 18 },
    muted: { fontSize: 12, color: c.textMuted, lineHeight: 18 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
    badgeText: { fontSize: 11, fontWeight: '800' },
    compliance: { gap: 4, paddingHorizontal: 4, paddingTop: 4 },
    disclosure: { fontSize: 11, color: c.textMuted, lineHeight: 16 },
    ledgerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.border },
    ledgerType: { fontSize: 13, color: c.textPrimary, fontWeight: '600' },
    ledgerSub: { fontSize: 11, color: c.textMuted, fontFamily: 'monospace' },
    ledgerAmt: { fontSize: 13, fontWeight: '700' },
    ledgerTx: { fontSize: 10, color: c.accent, fontFamily: 'monospace' },
  });
}
