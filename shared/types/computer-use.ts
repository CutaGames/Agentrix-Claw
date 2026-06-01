/**
 * Agentrix Computer Use — Shared Tool Schemas
 *
 * Codex 借鉴 P0：让 Tauri 桌面端能"看屏幕 + 操作鼠标键盘 + 操作浏览器"。
 *
 * 三层授权（OS 权限 / App 白名单 / 敏感动作弹窗）由桌面端 Rust 层执行，
 * 这里仅定义 LLM tool 接口与风险等级，供 OpenClaw chat 工具注入使用。
 *
 * 红线（Rust 层硬编码拒绝，前端无法绕过）：
 *  - 操作 terminal 类 App（cmd/pwsh/Terminal.app/iTerm.app）
 *  - 操作 Agentrix 自身窗口
 *  - 系统级权限/UAC 弹窗
 *  - 输入 sudo / runas 等提权动词
 *
 * Tier 限制：仅当 TierPreference ≠ 'local' 时启用这些 tool。
 */

/** 风险等级（与 tool-control-plane 对齐）。 */
export type ComputerUseRisk = 'low' | 'medium' | 'high' | 'critical';

/** 鼠标按钮。 */
export type MouseButton = 'left' | 'right' | 'middle';

/** 标准化按键名（子集，跨平台一致）。 */
export type KeyName =
  | 'enter' | 'tab' | 'escape' | 'space' | 'backspace' | 'delete'
  | 'arrow_up' | 'arrow_down' | 'arrow_left' | 'arrow_right'
  | 'home' | 'end' | 'page_up' | 'page_down'
  | 'cmd' | 'ctrl' | 'alt' | 'shift' | 'meta';

export interface ComputerUseClickArgs {
  x: number;
  y: number;
  button?: MouseButton;
  doubleClick?: boolean;
}

export interface ComputerUseTypeArgs {
  text: string;
}

export interface ComputerUseKeyArgs {
  /** 单键或组合：`['ctrl','c']`、`['cmd','shift','t']` */
  combo: KeyName[];
}

export interface ComputerUseScreenshotArgs {
  /** 可选窗口 id，缺省截当前主屏幕 */
  windowId?: string;
  /** 是否在截图中绘制鼠标光标 */
  withCursor?: boolean;
}

export interface ComputerUseWindowTreeArgs {
  /** 仅返回某 App 的窗口；缺省返回全部已授权 App */
  appIdentity?: string;
}

export interface ComputerUseFocusWindowArgs {
  windowId: string;
}

export interface ComputerUseBrowserNavigateArgs {
  url: string;
  /** 默认走独立 profile；true 时使用用户主 Chrome（需 high-risk 审批） */
  useUserProfile?: boolean;
}

export interface ComputerUseBrowserEvalArgs {
  /** 在当前 CDP target 上执行的 JS 表达式 */
  expression: string;
}

export interface ComputerUseBrowserClickSelectorArgs {
  selector: string;
}

/**
 * 每个 tool 的元数据。前端可据此渲染审批 UI。
 */
export interface ComputerUseToolMeta {
  name: string;
  description: string;
  risk: ComputerUseRisk;
  /** 是否允许 "Always allow"。敏感动作（critical）禁止记忆。 */
  allowRemember: boolean;
}

/** 全部 Computer Use tool 元数据清单。 */
export const COMPUTER_USE_TOOLS: ComputerUseToolMeta[] = [
  { name: 'computer_use.click',                   description: 'Move mouse to (x,y) and click.',                          risk: 'medium',   allowRemember: true  },
  { name: 'computer_use.type',                    description: 'Type text into the focused control.',                     risk: 'medium',   allowRemember: true  },
  { name: 'computer_use.key',                     description: 'Press a key combo (e.g. Ctrl+C).',                        risk: 'medium',   allowRemember: true  },
  { name: 'computer_use.scroll',                  description: 'Scroll at current cursor position.',                      risk: 'low',      allowRemember: true  },
  { name: 'computer_use.screenshot',              description: 'Capture a screenshot of screen or window.',               risk: 'low',      allowRemember: true  },
  { name: 'computer_use.window_tree',             description: 'Inspect accessibility tree of an authorized app.',        risk: 'low',      allowRemember: true  },
  { name: 'computer_use.focus_window',            description: 'Bring a window to foreground.',                           risk: 'low',      allowRemember: true  },
  { name: 'computer_use.browser_navigate',        description: 'Open a URL in CDP-controlled browser.',                   risk: 'medium',   allowRemember: true  },
  { name: 'computer_use.browser_eval',            description: 'Evaluate JS in current browser tab.',                     risk: 'high',     allowRemember: false },
  { name: 'computer_use.browser_click_selector',  description: 'Click an element by CSS selector.',                       risk: 'medium',   allowRemember: true  },
  { name: 'computer_use.sensitive_action',        description: 'Marker for account/payment/credential/system settings.',  risk: 'critical', allowRemember: false },
];

/**
 * Rust 红线（mirror 一份给前端用于禁用 UI；真正强制由 Rust 层执行）。
 */
export const COMPUTER_USE_BLOCKED_PROCESSES = {
  windows: ['cmd.exe', 'powershell.exe', 'pwsh.exe', 'WindowsTerminal.exe', 'wt.exe', 'conhost.exe'],
  macos:   ['com.apple.Terminal', 'com.googlecode.iterm2', 'co.zeit.hyper'],
} as const;

/** 判定输入文本是否包含提权动词。Rust 层亦执行同样逻辑。 */
export function containsPrivilegeEscalation(text: string): boolean {
  const lower = text.toLowerCase();
  return /(^|\s)(sudo|runas|gsudo|elevate)\b/.test(lower);
}
