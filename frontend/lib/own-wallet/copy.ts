/**
 * L8-6 own wallet: the new texts (design appendix C, approved as a batch under A23) that the wallet library itself
 * returns. No existing text is changed (E128). Pages render other appendix C items themselves.
 */
export const OWN_WALLET_COPY_ZH_V1 = {
  /** Appendix C item 31 (R4-L5). `{名字}` is the other Agent's name as this device recorded it. */
  addressBelongsToOtherAgent: '这个地址在这台设备上已经属于另一个 Agent（{名字}），不能再给这个 Agent 用。请联系我们，不要往这个地址充值。',
  /** Appendix C item 17, the red line when the decoded UserOp differs from what the owner typed on the main site. */
  differsFromMainSite: '和你在主站填的不一样，不要签',
} as const;

/**
 * Texts of the wallet origin pages and the main-site address block (S5b). Each is appendix C or a line the design
 * quotes for these pages (W1.2, W2.6 last column, 5.1-5.4); none replaces an existing text.
 */
export const OWN_WALLET_PAGE_COPY_ZH_V1 = {
  /** Appendix C item 8: the header of every wallet origin page. */
  pageHeader: '这里是 Agentrix 钱包签名页（wallet.agentrix.top）。下面显示的内容由这台设备算出，不是服务器发来的文字。',
  /** Appendix C item 26: the receive page header. */
  receiveHeader: '收款地址只在这个页面显示。请确认浏览器地址栏是 wallet.agentrix.top。',
  /** Appendix C item 12: the badge when this device has not checked the address. */
  badgeNotChecked: '这台设备还没核对过这个钱包地址。先去钱包页核对一次。',
  /** W1.2: the receive page when L does not confirm the account. */
  receiveNotChecked: '这台设备还没核对过这个钱包',
  /** Appendix C item 22. */
  unverified: '未核对',
  /** W1.2. */
  verified: '本设备核过',
  /** Appendix C item 27. */
  receiveButton: '收款 / 复制地址',
  /** Part of appendix C item 27, on the receive page itself. */
  copyAddress: '复制地址',
  /** Appendix C item 24 (shown with `install_recovery`). */
  recoveryNotSet: '钱包已建好，但恢复还没设置。设置好之前不能授权自动付款，也先别往里充钱。',
  /** Appendix C item 30. */
  statusUnavailable: '暂时无法核对这个钱包的状态。稍后再试；在这之前不会用旧钱包付款。',
  /** Appendix C item 20 (the "新建钱包" button comes with S6). */
  walletLost: '这个钱包已标为失联：钥匙都找不回来了，钱动不了。可以给这个 Agent 新建一个钱包。',
  /** 5.3: the owner cancelled, or the page refused before asking the authenticator. */
  nothingSigned: '没有签名，什么都没变',
  /** 5.4 item 7. */
  networkUnavailable: '网络暂时不可用，你的签名还没发出去，可以稍后重试',
  /** 5.4 item 5. */
  requestExpired: '请求已过期，请重新发起',
  /** 5.2. */
  newDeviceReady: '这台新设备可以用了',
  /** 5.1: the BS flag of the new wallet passkey. */
  passkeySynced: '这把 passkey 已同步到你的云端钥匙串',
  passkeyDeviceOnly: '只在这台设备上',
  /** 5.1, the main-site entry. */
  createButton: '建独立钱包',
  /** W1.2, the verify page button. */
  verifyButton: '本设备核对',
  signButton: '签名',
  /** W2.6 `deploy_setup`: "钥匙：这台设备上的 passkey（{名字}）". */
  keyOnThisDevice: '钥匙：这台设备上的 passkey（{名字}）',
  /** W2.6 / appendix C item 10: "恢复需要 {N} 票". */
  recoveryVotes: '恢复需要 {N} 票',
  /** W2.6 `register`. */
  registerNote: '登记以后，这个 Agent 的身份由它自己的钱包持有',
  /** W2.6 `add_credential`. */
  addCredentialNote: '加上以后，这把钥匙也能动这笔钱',
  /** W2.6 `remove_credential`. */
  notThisDeviceKey: '不是这台设备记的钥匙',
  /** W2.6 `recover` on a guardian page. */
  guardianFingerprintNote: '和主人新设备上的指纹一样才签',
  /** W2.6 `transfer`. */
  ownVault: '你的金库',
  /** Appendix C item 29 (`wallet_key_belongs_to_other_owner`). */
  walletKeyOtherOwner: '这把钱包钥匙已经用在另一个 Agentrix 账号上了。请在钱包页为这个账号新建一把。',
  /** The card's existing "(已复制)" without the brackets, on the receive page. */
  copied: '已复制',
  /** Appendix C item 6: the recovery code page (S6). */
  recoveryCodeIntro: '这串词只在这台设备上生成，Agentrix 收不到。抄下来放在安全的地方；任何人拿到它都能接管钱包。',
  /** 5.4 step 3: the typed recovery code derives an address that is not a guardian of this wallet. */
  recoveryCodeNotThisWallet: '这个恢复码对应的不是这个钱包',
  /** Appendix C item 35 (R4-L10). */
  guardianNoWallet: '这个页面要在钱包里打开：电脑上请装浏览器钱包扩展，手机上请用钱包 App 里的浏览器打开这个链接。',
  /** Appendix C item 36 (R4-L10). */
  guardianWrongSigner: '这个签名不是来自这个钱包的守护人，没有提交。请换成你被设为守护人的那个钱包地址。',
  /** 5.4 step 2: the new device's button. Not appendix C wording: listed in progress.json for coord (E113 ③). */
  recoverCreateButton: '在这台设备上建新钥匙',
  /** 5.4 step 3. */
  recoverWithCodeButton: '用恢复码恢复',
  /** Appendix C item 19 (R2-L3); `{哈希}` is the release's file SHA-256. */
  offlineToolNotice: '把离线恢复工具下载下来，和恢复码放在一起。Agentrix 不在了，你也能用它取回钱。文件的 SHA-256：{哈希}。',
  /** The recovery card (S6), not appendix C wording: listed in progress.json for coord (E113 ③). */
  offlineToolDownload: '下载离线恢复工具',
  offlineToolScriptHash: '工具页面顶部显示的脚本段 SHA-256：',
  offlineToolNotPublished: '离线恢复工具还没发布。发布以后这里会给下载地址和 SHA-256。',
  /** 5.5, the fixed notice (coord approved), shown before the top-up prompt and before sessions; the owner ticks it. */
  lossNoticeTitle: '如果丢了全部钥匙',
  lossNoticeParagraphs: [
    '这个 Agent 的钱包只认你的钥匙：你的 passkey、你的恢复码、你指定的守护人。Agentrix 没有备份钥匙，也帮不了你恢复。',
    '如果 Agentrix 停止服务或网址失效，你的 passkey 就不能再用了，只有恢复码或守护人能取回资金。',
    '如果这些全部丢了：钱包和金库里的钱再也动不了；这个 Agent 的链上登记会一直留在链上，无法更新也无法吊销。你可以新建 Agent、重新登记，旧的会在你的账户里标成「失联」。',
    '这时 Agentrix 能做的只有撤销平台发的那张链上证书，让别人知道平台不再为这条登记背书；登记本身改不了。',
    '恢复码或守护人被别人拿到，对方可以立刻接管钱包。请像对待银行卡密码一样保管。',
  ],
  /** The recovery card buttons and answers (S6), not appendix C wording: listed in progress.json for coord. */
  lossNoticeCheck: '我读过了，明白',
  lossNoticeConfirmButton: '确认',
  lossNoticeConfirmed: '已确认',
  declareLostButton: '声明失联',
  declareLostWarning: '声明失联不能撤回：这个钱包会标成失联，旧的托管付款不会恢复，平台发的链上证书会被撤销。只有钥匙、恢复码和守护人都找不回来时才声明。',
  declareLostConfirmButton: '确认声明失联',
  declareLostDone: '已声明失联。可以给这个 Agent 新建一个钱包。',
  stepUpRequired: '这一步要求你刚刚登录过。请重新登录，再试一次。',
  recoveryRequestFailed: '没有成功，稍后再试。',
  /** Appendix C item 20, the button. */
  newWalletButton: '新建钱包',
  /** Appendix C item 13 on the `grant_session` page; `{指纹}` is the fingerprint of the key decoded from the UserOp. */
  grantFingerprint: '请确认桌面端显示的指纹和这里一样：{指纹}。不一样就不要确认。',
  /** The `grant_session` lines (S7 part 3), not appendix C wording: listed in progress.json for coord (E113 ③). */
  grantDevice: '设备：{名字}',
  grantPayee: '收款人（只有这一个）',
  grantTotal: '累计上限',
  grantCount: '最多 {N} 次',
  grantPerTransfer: '单笔上限',
  grantPerPayment: '单笔上限（链上没有，这台电脑自己核）：{数额}',
  grantExpires: '到期时间（UTC）：{时间}',
  grantNote: '额度是对这个收款人的总额。到期、撤销或超额以后，这台电脑就不能再付款。',
  /** coord 10-31 (S7 (c)), word for word: shown when the account already has SmartSessions installed. */
  sessionModuleInstalled: '这个钱包已经授权过一台设备；改额度或换设备，需要新建一个钱包',
  /** Appendix C item 9, shown when a grant is refused because no recovery is set (W4.4). */
  recoveryRequired: '还没有恢复手段：丢了 passkey，这笔钱就取不回来。先设置恢复码或守护人。',
} as const;

/**
 * S10, the public verify page `/verify/agent/<chainId>/<agentId>`. Appendix C items 18, 28, 32 and 33 word for word; the
 * other lines are not appendix C wording and are listed in progress.json for coord (E113 ③).
 */
export const OWN_WALLET_VERIFY_COPY_ZH_V1 = {
  title: '核对 Agent 的链上身份',
  intro: '这个页面在你的浏览器里直接读公开链和登记文件，不经过 Agentrix 的服务器，也不需要登录。',
  checking: '正在从链上读取…',
  verdicts: {
    confirmed: '这条登记有效：由这个 Agent 自己的钱包持有，登记文件和链上摘要一致。',
    revoked: '这条登记已吊销（链上已转到 0x…dEaD），不能再恢复。',
    /** Appendix C item 18 (without its button: on this page the visitor is not the owner). */
    revoke_pending: '已停用这个 Agent 的身份和自动付款。链上的登记还要你签一次才会改成已吊销。',
    transferred: '这条登记已不在原来的 Agent 账户里，不能当作这个 Agent 的身份。',
    not_own_account: '持有这条登记的地址不是 Agentrix 独立钱包（只认主人钥匙的智能账户），不能当作这个 Agent 的身份。',
    file_mismatch: '登记文件和链上记录不一致：文件被改过，或不是这条登记的文件。',
    chain_only: '登记文件现在取不到（或不在 Agentrix 托管），下面只显示链上的部分。',
    registry_changed: '链上的登记合约和我们核过的版本不一样，暂不给结论。',
    not_found: '链上没有这个编号的登记。',
    unavailable: '暂时读不到链上数据。稍后再试；在这之前不要把它当作已核对。',
  },
  /** Appendix C item 28, `{地址}` twice: the holder, then the vault. */
  heldBy: '这条登记由账户 {地址} 持有，它写的金库是 {地址}。',
  sameKeys: 'Agent 账户和金库由同一组钥匙控制。',
  differentKeys: '账户和金库不是同一组钥匙。',
  labelChain: '链',
  labelAgentId: '登记编号',
  labelHolder: '持有人',
  labelFile: '登记文件',
  labelOnchainDigest: '链上的文件摘要',
  labelFileDigest: '本页算出的文件摘要',
  labelCard: '登记文件里写的名片',
  labelCertificate: '平台证书（EAS）',
  certificateValid: '平台证书有效（由 Agentrix 签发，只表示平台为这条登记背书）。',
  certificateMismatch: '这张证书和这条登记对不上，不算数。',
  certificateNotChecked: '这个链接没有带证书编号，没有核对平台证书。',
  certificateNotConfigured: '这个页面还没配置平台证书的签发地址，没有核对平台证书。',
  certificateUnavailable: '暂时读不到平台证书。',
  /** Appendix C item 32. */
  certificateRevokePending: '平台证书撤销待完成。',
  /** Appendix C item 33. */
  certificateRevoked: '平台已撤销这张证书。',
  cliTitle: '自己核对（命令行，只用 curl、jq、sha256sum、xxd）',
} as const;

/** Appendix C item 28 with the holder and the vault filled in. */
export function verifyHeldByTextV1(holder: string, vault: string | null | undefined): string {
  return OWN_WALLET_VERIFY_COPY_ZH_V1.heldBy.replace('{地址}', holder).replace('{地址}', vault && vault.length > 0 ? vault : '—');
}

/** Appendix C item 17 titles (W2.6 last column). */
export function ownWalletPurposeTitleV1(purpose: string, values: { name?: string; votes?: number } = {}): string | null {
  const name = values.name && values.name.length > 0 ? values.name : '?';
  switch (purpose) {
    case 'deploy_setup':
      return values.name !== undefined ? `你要签的是：建这个钱包，并在链上登记 ${name}` : '你要签的是：建这个钱包';
    case 'install_recovery':
      return `你要签的是：设置恢复，恢复需要 ${values.votes ?? '?'} 票`;
    case 'register':
      return `你要签的是：在链上登记 ${name}`;
    case 'revoke_registration':
      return `你要签的是：吊销 ${name} 的链上身份，吊销以后不能撤回`;
    case 'grant_session':
      return `你要签的是：授权 ${name} 在额度内自动付款`;
    default:
      return null;
  }
}

/** Appendix C item 31 with the other Agent's name filled in. */
export function addressBelongsToOtherAgentTextV1(otherAgentName: string | undefined): string {
  return OWN_WALLET_COPY_ZH_V1.addressBelongsToOtherAgent.replace('{名字}', otherAgentName && otherAgentName.length > 0 ? otherAgentName : '?');
}
