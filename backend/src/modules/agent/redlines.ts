/**
 * 后端红线集合 —— 与 Rust `desktop/src-tauri/src/computer_use/redlines.rs` 对齐。
 *
 * 这些是**不可协商**的安全检查。即使用户在 UI 点了「同意」、即使存在有效授权、
 * 即使会话/任务预算充足,任何命中红线的动作仍必须被拒绝。这是所有更软的策略
 * (白名单 / 单步审批 / scope-of-work)背后的护城河。
 *
 * 双层一致性:
 *  - 桌面侧(原生 GUI / CDP)由 Rust `redlines.rs` 在边界强制执行;
 *  - 后端侧(任务编排 / 分级审批)由本文件强制执行;
 *  - 两份 BLOCKED_PROCESSES / 提权词表必须保持镜像一致。
 *
 * 对应需求:3.5(红线不可绕过)、6.2(禁止 sybil/wash trading/买粉等滥用)。
 * 对应设计:Property 3「红线不可绕过」。
 */

/**
 * 绝不允许被 Computer Use 控制的进程 / 应用名。
 * 镜像自 Rust `redlines.rs::BLOCKED_PROCESSES` 与
 * `shared/types/computer-use.ts::COMPUTER_USE_BLOCKED_PROCESSES`。
 */
export const BLOCKED_PROCESSES: readonly string[] = [
  // 终端 —— 在 shell 内点击/输入是提权向量。
  'cmd.exe',
  'powershell.exe',
  'pwsh.exe',
  'WindowsTerminal.exe',
  'wt.exe',
  'conhost.exe',
  'Terminal.app',
  'iTerm.app',
  'iTerm2.app',
  'Alacritty',
  'com.apple.Terminal',
  'com.googlecode.iterm2',
  'co.zeit.hyper',
  // 自身 —— 永不让 agent 驱动自己的桌面窗口。
  'agentrix-desktop',
  'agentrix-desktop.exe',
  'Agentrix.app',
];

/**
 * 输入/按键文本中疑似提权的子串(大小写不敏感)。
 * 镜像自 Rust `redlines.rs::PRIV_ESCALATION_NEEDLES`。
 */
export const PRIV_ESCALATION_NEEDLES: readonly string[] = [
  'sudo ',
  'sudo\t',
  'runas /',
  'runas.exe',
  ' su -',
  'rm -rf /',
  'rm -rf ~',
  'format c:',
  'format /q',
  'del /f /s /q',
  'diskpart',
  'shutdown -s',
  'shutdown /s',
  'reg delete',
  'registry::',
  'powershell -enc',
  'powershell -e ',
  'iex (',
];

/**
 * 合规滥用红线(需求 6.2)。后端独有(Rust 侧不涉及 crypto 合规语义),
 * 用于拦截 sybil 薅空投 / 批量刷量 / 刷假互动 / wash trading / 无披露付费喊单 / 买粉,
 * 以及对外内容的价格承诺 / 收益保证(需求 14.9)。
 * 匹配在归一化(小写)文本上进行,中英文关键词并存。
 */
export const ABUSE_REDLINE_PATTERNS: readonly { id: string; label: string; pattern: RegExp }[] = [
  { id: 'sybil', label: '多钱包 sybil 薅空投', pattern: /sybil|女巫|多钱包.*(空投|airdrop)|airdrop.*farm|多账号.*(薅|刷)/i },
  { id: 'wash_trading', label: 'wash trading / 对敲刷量', pattern: /wash[\s_-]*trad|对敲|自成交|刷交易量|刷.*交易量|刷量交易/i },
  { id: 'buy_followers', label: '买粉 / 刷粉', pattern: /买粉|刷粉|buy[\s_-]*followers|purchase[\s_-]*followers/i },
  { id: 'fake_engagement', label: '刷假互动 / 机器人互动', pattern: /假互动|刷赞|刷评论|刷转发|fake[\s_-]*engagement|bot[\s_-]*farm|机器人.*(互动|评论|点赞)/i },
  { id: 'fake_volume', label: '刷量 / 刷单', pattern: /刷单|fake[\s_-]*volume|fake[\s_-]*traffic|刷.*流量/i },
  { id: 'undisclosed_shill', label: '无披露付费喊单', pattern: /无披露.*喊单|付费喊单|undisclosed[\s_-]*shill|paid[\s_-]*shill/i },
  // 内容合规(需求 14.9):对外内容不得含价格承诺 / 收益保证(误导性投资暗示)。
  { id: 'price_promise', label: '价格承诺 / 保证上涨', pattern: /价格承诺|保证.{0,4}(上涨|大涨|翻倍|涨[\s\dx倍])|必涨|稳涨|包涨|保本翻倍|guaranteed?[\s_-]*(pump|gains?|price|moon|to[\s_-]*the[\s_-]*moon)|price[\s_-]*(is[\s_-]*)?guaranteed/i },
  { id: 'yield_guarantee', label: '收益保证 / 保本保息', pattern: /收益保证|保证.{0,4}收益|稳赚不赔|稳赚|保本保息|保本付息|旱涝保收|guaranteed?[\s_-]*(yield|returns?|profits?|apy|apr|roi)|risk[\s_-]*free[\s_-]*(returns?|profits?|yield)/i },
];

/**
 * 红线动作类型 —— 这些动作类型本身即为红线,任何情况下拒绝。
 */
export const REDLINE_ACTION_TYPES: ReadonlySet<string> = new Set([
  'terminal',
  'shell_exec',
  'sudo',
  'sybil',
  'wash_trading',
  'buy_followers',
]);

export interface RedlineCheck {
  /** true = 通过(非红线);false = 命中红线被拒。 */
  ok: boolean;
  /** 命中红线时的可审计原因。 */
  reason?: string;
  /** 命中的红线规则标识。 */
  rule?: string;
}

const OK: RedlineCheck = { ok: true };

/** 与 Rust `enforce_no_priv_escalation` 对齐:输入文本含提权模式即拒。 */
export function enforceNoPrivEscalation(text: string): RedlineCheck {
  if (!text) return OK;
  const lower = text.toLowerCase();
  for (const needle of PRIV_ESCALATION_NEEDLES) {
    if (lower.includes(needle)) {
      return {
        ok: false,
        rule: 'priv_escalation',
        reason: `input contains privilege-escalation pattern '${needle.trim()}'; refused`,
      };
    }
  }
  return OK;
}

/** 与 Rust `enforce_window_allowed` 对齐:目标进程/应用在黑名单即拒。 */
export function enforceWindowAllowed(appName: string): RedlineCheck {
  if (!appName) return OK;
  const lower = appName.toLowerCase();
  for (const blocked of BLOCKED_PROCESSES) {
    const b = blocked.toLowerCase();
    if (lower === b || lower.includes(b)) {
      return {
        ok: false,
        rule: 'blocked_process',
        reason: `target '${appName}' is on the hardcoded blocklist; refused`,
      };
    }
  }
  return OK;
}

/** 后端合规红线(需求 6.2):文本命中 sybil/wash trading/买粉等滥用模式即拒。 */
export function enforceNoAbuse(text: string): RedlineCheck {
  if (!text) return OK;
  for (const { id, label, pattern } of ABUSE_REDLINE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        ok: false,
        rule: `abuse:${id}`,
        reason: `request matches compliance redline '${label}'; refused`,
      };
    }
  }
  return OK;
}

/**
 * 综合红线检查。命中任一红线即返回 { ok:false }。
 * 检查覆盖:动作类型红线、目标进程黑名单、提权文本、合规滥用文本。
 */
export function checkRedline(action: {
  type?: string;
  targetApp?: string;
  inputText?: string;
  intent?: string;
}): RedlineCheck {
  // 1. 红线动作类型(终端/sudo/sybil/wash trading/买粉)
  if (action.type && REDLINE_ACTION_TYPES.has(action.type)) {
    return {
      ok: false,
      rule: `redline_action:${action.type}`,
      reason: `action type '${action.type}' is a hardcoded redline; refused`,
    };
  }

  // 2. 目标进程黑名单(终端/自身)
  if (action.targetApp) {
    const w = enforceWindowAllowed(action.targetApp);
    if (!w.ok) return w;
  }

  // 3. 提权文本(sudo/rm -rf 等)
  if (action.inputText) {
    const p = enforceNoPrivEscalation(action.inputText);
    if (!p.ok) return p;
  }

  // 4. 合规滥用文本(sybil/wash trading/买粉等),检查 inputText + intent
  const corpus = [action.inputText, action.intent].filter(Boolean).join(' \n ');
  if (corpus) {
    const a = enforceNoAbuse(corpus);
    if (!a.ok) return a;
  }

  return OK;
}
