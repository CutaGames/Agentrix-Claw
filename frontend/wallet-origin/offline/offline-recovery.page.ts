/**
 * L8-6 S6 offline recovery tool, the page script (design decision 3d, A10). `scripts/build-offline-tool.mjs` bundles this
 * file and `lib/own-wallet/offline-recovery.ts` into one script and inlines it into `offline-recovery.html`: one
 * self-contained file, no external resource, no Agentrix host. The only network peer is the node the owner types in.
 *
 * Plain DOM: every text is set with `textContent`, nothing is built from HTML. The recovery code, the software key and
 * the guardian signatures stay in this page's memory; nothing is stored.
 */
import {
  OfflineRpcError,
  createOfflineRpcV1,
  formatNativeV1,
  formatUnitsTextV1,
  generateSoftKeyV1,
  offlineRecoveryWalletV1,
  offlineTokenListV1,
  planAddKeyV1,
  readOfflineFactsV1,
  runAddKeyV1,
  runTransferV1,
  type OfflineActionResultV1,
  type OfflineFactsV1,
  type OfflineReadOptionsV1,
  type OfflineRpcTransportV1,
  type OfflineRpcV1,
  type OfflineSoftKeyV1,
  type OfflineSubmitDepsV1,
} from '../../lib/own-wallet/offline-recovery';
import { OWN_WALLET_CHAIN_IDS_V1, type OwnWalletChainIdV1 } from '../../../shared/types/agent-own-wallet';

const CHAIN_NAMES: Readonly<Record<OwnWalletChainIdV1, string>> = { 97: 'BNB Smart Chain 测试网（97）', 84532: 'Base Sepolia（84532）' };
const NATIVE_SYMBOLS: Readonly<Record<OwnWalletChainIdV1, string>> = { 97: 'tBNB', 84532: 'ETH' };

/** Texts of the tool. New wording (listed in progress.json for coord); none replaces an existing text. */
export const OFFLINE_COPY_ZH_V1 = {
  scriptHashLabel: '这个页面正在执行的脚本段 SHA-256：',
  scriptHashPending: '计算中…',
  scriptHashUnavailable: '这个浏览器算不出脚本的 SHA-256，请不要在这里输入恢复码。',
  readFirst: '先在第 1 步读取链上状态。',
  reasons: {
    rpc_url_invalid: '节点地址不对：要 https 开头（本机节点可以用 http://localhost），不要带空格。',
    rpc_url_not_allowed: '这个工具不连 Agentrix 的地址。请填你自己选的公共节点或自己的节点。',
    rpc_unavailable: '连不上这个节点。检查地址和网络，稍后再试。',
    rpc_chain_mismatch: '这个节点不是你选的那条链。',
    rpc_answer_invalid: '节点的回答读不懂。换一个节点再试。',
    rpc_method_not_allowed: '内部错误：请求了不允许的方法。',
    rpc_error: '节点报错：',
    account_invalid: '钱包地址不对。',
    module_not_pinned: '链上这个合约和工具钉住的不一样（或不存在）。这条链不是预期的那条，停下来，不要继续。合约：',
    account_not_deployed: '这个地址在链上还没有账户代码，没有恢复手段可用。',
    recovery_not_installed: '这个钱包没有装恢复模块，离线恢复用不了。',
    no_guardians: '这个钱包的恢复模块里没有守护人，离线恢复用不了。',
    recovery_code_invalid: '恢复码不对：要 12 个词，用空格隔开。',
    recovery_code_not_this_wallet: '内部错误：付款地址和恢复码不一致。',
    signature_malformed: '有一条守护人签名格式不对（每条是 0x 开头、130 位十六进制，一行一条）。第几条：',
    signer_not_guardian: '有一条签名不是这个钱包的守护人签的，没有提交。第几条：',
    threshold_not_met: '签名不够：',
    payer_balance_low: '恢复码的地址里原生币不够付这笔交易的 gas。先往这个地址转一点：',
    userop_rejected: '节点预演这笔操作失败（链上会拒）：',
    send_failed: '节点拒绝了这笔交易：',
    receipt_timeout: '等了很久没有回执。交易可能还没打包，稍后用下面的交易哈希到区块浏览器上看：',
    transaction_failed: '交易上链了但失败了。交易哈希：',
    userop_failed: '交易上链了，但钱包里的这笔操作失败了。交易哈希：',
    key_not_added: '交易成功了，但没在链上读到新钥匙。先别继续，到区块浏览器上看这笔交易。交易哈希：',
    destination_invalid: '收款地址不对，或和钱包自己一样。',
    nothing_to_move: '钱包里没有可转的余额（或没勾选）。',
  },
} as const;

export interface OfflinePageEnvV1 {
  subtle: SubtleCrypto;
  transport?: OfflineRpcTransportV1;
  sleep(ms: number): Promise<void>;
  now(): number;
  /** Tests only (a fake node has fake code); the auto-mount at the bottom never sets it, so the pinned hashes decide. */
  readOptions?: OfflineReadOptionsV1;
}

type ReasonKey = keyof typeof OFFLINE_COPY_ZH_V1.reasons;

function reasonText(reasonCode: string, extra?: string): string {
  const base = (OFFLINE_COPY_ZH_V1.reasons as Record<string, string>)[reasonCode] ?? `出错：${reasonCode}`;
  return extra ? `${base}${extra}` : base;
}

async function hexSha256(subtle: SubtleCrypto, text: string): Promise<string> {
  const digest = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(text) as BufferSource));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Wires the tool's elements (ids in `offline-recovery.html`). Does nothing when an element is missing. */
export function mountOfflineRecoveryV1(doc: Document, env: OfflinePageEnvV1): void {
  const el = <T extends HTMLElement>(id: string): T | null => doc.getElementById(id) as T | null;
  const chain = el<HTMLSelectElement>('chain');
  const rpcInput = el<HTMLInputElement>('rpc');
  const accountInput = el<HTMLInputElement>('account');
  const readButton = el<HTMLButtonElement>('read');
  const factsOut = el('facts');
  const phraseInput = el<HTMLTextAreaElement>('phrase');
  const sigsInput = el<HTMLTextAreaElement>('extra-sigs');
  const prepareButton = el<HTMLButtonElement>('prepare');
  const addKeyButton = el<HTMLButtonElement>('add-key');
  const addKeyOut = el('add-key-out');
  const toInput = el<HTMLInputElement>('to');
  const nativeBox = el<HTMLInputElement>('move-native');
  const tokenBox = el<HTMLInputElement>('move-token');
  const transferButton = el<HTMLButtonElement>('transfer');
  const transferOut = el('transfer-out');
  const hashOut = el('script-hash');
  const tokenList = el('token-list');
  if (!chain || !rpcInput || !accountInput || !readButton || !factsOut || !phraseInput || !sigsInput || !prepareButton || !addKeyButton || !addKeyOut || !toInput || !nativeBox || !tokenBox || !transferButton || !transferOut) return;

  // The pinned tokens of both chains, listed so the owner can see which assets step 3 moves.
  if (tokenList) {
    tokenList.textContent = offlineTokenListV1()
      .map((t) => `${CHAIN_NAMES[t.chainId]}：${NATIVE_SYMBOLS[t.chainId]} 和 ${t.symbol}（${t.address}）`)
      .join('\n');
  }
  for (const id of OWN_WALLET_CHAIN_IDS_V1) {
    const option = doc.createElement('option');
    option.value = String(id);
    option.textContent = CHAIN_NAMES[id];
    chain.appendChild(option);
  }

  if (hashOut) {
    hashOut.textContent = OFFLINE_COPY_ZH_V1.scriptHashPending;
    const script = doc.getElementById('offline-recovery-script');
    if (script && script.textContent) {
      hexSha256(env.subtle, script.textContent).then(
        (h) => {
          hashOut.textContent = h;
        },
        () => {
          hashOut.textContent = OFFLINE_COPY_ZH_V1.scriptHashUnavailable;
        },
      );
    } else {
      hashOut.textContent = OFFLINE_COPY_ZH_V1.scriptHashUnavailable;
    }
  }

  let rpc: OfflineRpcV1 | null = null;
  let facts: OfflineFactsV1 | null = null;
  let key: OfflineSoftKeyV1 | null = null;
  let keyAdded = false;

  const busy = (button: HTMLButtonElement, on: boolean) => {
    button.disabled = on;
  };
  const failure = (r: { reasonCode: string; detail?: string; index?: number; have?: number; need?: number; module?: string; txHash?: string }): string => {
    let extra = r.detail ?? '';
    if (r.index !== undefined) extra = String(r.index + 1);
    if (r.have !== undefined) extra = `需要 ${r.need} 个守护人的签名，现在有 ${r.have} 个。`;
    if (r.module) extra = r.module;
    if (r.txHash) extra = r.txHash;
    return reasonText(r.reasonCode as ReasonKey, extra);
  };
  const rpcFailure = (error: unknown): string => {
    if (error instanceof OfflineRpcError) return reasonText(error.reasonCode, error.detail);
    return `出错：${error instanceof Error ? error.message : 'unknown'}`;
  };
  const payerDeps = (phrase: string): OfflineSubmitDepsV1 | null => {
    const wallet = offlineRecoveryWalletV1(phrase);
    if (!wallet || !rpc) return null;
    return { rpc, payer: { address: wallet.address, signTransaction: (tx) => wallet.signTransaction(tx) }, sleep: env.sleep, now: env.now };
  };

  readButton.addEventListener('click', () => {
    busy(readButton, true);
    factsOut.textContent = '…';
    facts = null;
    key = null;
    keyAdded = false;
    (async () => {
      try {
        const chainId = Number(chain.value) as OwnWalletChainIdV1;
        rpc = createOfflineRpcV1({ chainId, rpcUrl: rpcInput.value, ...(env.transport ? { transport: env.transport } : {}) });
        const result = await readOfflineFactsV1(rpc, accountInput.value, env.readOptions);
        if (result.ok === false) {
          factsOut.textContent = failure(result);
          return;
        }
        facts = result.facts;
        const f = result.facts;
        factsOut.textContent = [
          `链：${CHAIN_NAMES[f.chainId]}`,
          `钱包：${f.account}`,
          `守护人（${f.guardians.length} 个，需要 ${f.threshold} 个签名）：`,
          ...f.guardians.map((g) => `  ${g}`),
          `${NATIVE_SYMBOLS[f.chainId]} 余额：${formatNativeV1(f.nativeWei)}`,
          `${f.token.symbol} 余额：${formatUnitsTextV1(f.token.amount, f.token.decimals)}（合约 ${f.token.address}）`,
          '三个合约（EntryPoint、WebAuthn 验证器、恢复模块）的代码和钉住的一致。',
        ].join('\n');
      } catch (error) {
        factsOut.textContent = rpcFailure(error);
      } finally {
        busy(readButton, false);
      }
    })();
  });

  prepareButton.addEventListener('click', () => {
    if (!facts || !rpc) {
      addKeyOut.textContent = OFFLINE_COPY_ZH_V1.readFirst;
      return;
    }
    busy(prepareButton, true);
    (async () => {
      try {
        if (!key) key = await generateSoftKeyV1(env.subtle);
        const plan = await planAddKeyV1(rpc as OfflineRpcV1, (facts as OfflineFactsV1).account, key);
        addKeyOut.textContent = [
          `临时钥指纹：${key.fingerprint}（只在这个页面的内存里；关掉页面就没了）`,
          `要签的哈希（32 字节）：${plan.userOpHash}`,
          `需要 ${(facts as OfflineFactsV1).threshold} 个守护人签名；你的恢复码算 1 个。`,
          '其他守护人：在钱包里对上面这串哈希做 personal_sign（原文是这 32 个字节，不是这 66 个字符），把 0x 开头的签名一行一条贴到下面。',
        ].join('\n');
      } catch (error) {
        addKeyOut.textContent = rpcFailure(error);
      } finally {
        busy(prepareButton, false);
      }
    })();
  });

  addKeyButton.addEventListener('click', () => {
    if (!facts || !rpc) {
      addKeyOut.textContent = OFFLINE_COPY_ZH_V1.readFirst;
      return;
    }
    const deps = payerDeps(phraseInput.value);
    if (!deps) {
      addKeyOut.textContent = reasonText('recovery_code_invalid');
      return;
    }
    busy(addKeyButton, true);
    addKeyOut.textContent = '…';
    (async () => {
      try {
        if (!key) key = await generateSoftKeyV1(env.subtle);
        const extra = sigsInput.value.split('\n').map((l) => l.trim()).filter(Boolean);
        const result: OfflineActionResultV1<{ txHash: string }> = await runAddKeyV1(deps, { facts: facts as OfflineFactsV1, key, phrase: phraseInput.value, extraSignatures: extra, onPlan: (p) => (addKeyOut.textContent = `要签的哈希：${p.userOpHash}\n提交中…`) });
        if (result.ok === false) {
          addKeyOut.textContent = failure(result);
          return;
        }
        keyAdded = true;
        addKeyOut.textContent = `成功：临时钥已加进钱包。交易哈希：${result.txHash}\n现在可以做第 3 步。`;
      } catch (error) {
        addKeyOut.textContent = rpcFailure(error);
      } finally {
        busy(addKeyButton, false);
      }
    })();
  });

  transferButton.addEventListener('click', () => {
    if (!facts || !rpc || !key || !keyAdded) {
      transferOut.textContent = '先完成第 2 步（临时钥加进钱包）。';
      return;
    }
    const deps = payerDeps(phraseInput.value);
    if (!deps) {
      transferOut.textContent = reasonText('recovery_code_invalid');
      return;
    }
    busy(transferButton, true);
    transferOut.textContent = '…';
    (async () => {
      try {
        const result = await runTransferV1(deps, {
          facts: facts as OfflineFactsV1,
          key: key as OfflineSoftKeyV1,
          to: toInput.value,
          moveNative: nativeBox.checked,
          moveToken: tokenBox.checked,
          readOptions: env.readOptions,
          onPlan: (p) => {
            if (p.shows.kind === 'transfer') {
              transferOut.textContent = [`转到：${p.shows.to}`, `${NATIVE_SYMBOLS[(facts as OfflineFactsV1).chainId]}：${formatNativeV1(p.shows.nativeWei)}`, `${(facts as OfflineFactsV1).token.symbol}：${formatUnitsTextV1(p.shows.tokenAmount, (facts as OfflineFactsV1).token.decimals)}`, '提交中…'].join('\n');
            }
          },
        });
        transferOut.textContent = result.ok === false ? failure(result) : `成功：已转出。交易哈希：${result.txHash}`;
      } catch (error) {
        transferOut.textContent = rpcFailure(error);
      } finally {
        busy(transferButton, false);
      }
    })();
  });
}

// Runs in the built file; in tests and in other bundles there is no such element, so nothing happens.
if (typeof document !== 'undefined' && document.getElementById('offline-recovery-script') && typeof crypto !== 'undefined' && crypto.subtle) {
  mountOfflineRecoveryV1(document, { subtle: crypto.subtle, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now: () => Date.now() });
}
