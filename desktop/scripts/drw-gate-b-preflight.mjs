#!/usr/bin/env node
/**
 * DRW Gate B 预检（只读）。在 owner 的电脑上、准备启动桌面应用的同一个终端里运行：
 *
 *   node scripts/drw-gate-b-preflight.mjs          # 表格
 *   node scripts/drw-gate-b-preflight.mjs --json   # 机器可读
 *
 * 只检查，不改任何东西：不写钥匙串、不装 CLI、不发网络请求、不启动 agent 进程
 * （只跑 `agent --version`）。输出里不会出现任何秘密值：钥匙串只看"有没有"，
 * 环境变量只报告是不是恰好为要求的值，不回显。
 *
 * 退出码：0 全部通过；1 有未通过项；2 没有未通过项，但还有已知缺口（Gate B 仍被挡住）。
 * 检查清单见 docs/drw-gate-b-checklist.zh-CN.md。
 */
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 与 src-tauri/src/developer_runtime/types.rs 一致。 */
export const RUNTIME_FLAGS = ["DEVELOPER_RUNTIME_CHANNEL_V1_ENABLED", "DEVELOPER_ADAPTER_CURSOR_ACP_ENABLED"];
/** 与 types.rs 的 ENV_API_TARGET 一致：只认 "staging"（REQ-desktop-026）。Gate B 在 staging 上跑。 */
export const API_TARGET_ENV = "AGENTRIX_API_TARGET";
export const GATE_B_TARGET = "staging";
export const KEYCHAIN_SERVICE = "agentrix.developer_runtime";
export const KEYCHAIN_SERVICE_STAGING = "agentrix.developer_runtime.staging";
/** 与 enrollment.rs 的 KEYRING_ENROLLMENT_STATE 一致：点过"绑定这台电脑"才会有。 */
export const KEYCHAIN_ENROLLMENT_ACCOUNT = "enrollment_v1";
/** 与 types.rs 的 KEYRING_CHANNEL_TOKEN 一致：绑定时签发的运行时凭据。 */
export const KEYCHAIN_CHANNEL_ACCOUNT = "channel_bearer_v1";
/** 与 staging_gate.rs 一致：staging 门禁请求头的值（REQ-desktop-026），只检查有没有。 */
export const STAGING_GATE_SERVICE = "agentrix-staging-gate";
export const STAGING_GATE_ACCOUNT = "staging-key";
/** CURSOR_ACP_LOCAL_COMMAND_LOCK：program "agent"，args ["acp"]。 */
export const LOCKED_PROGRAM = "agent";
export const APP_NAME = "Agentrix Desktop";
/** 预检只看文件在不在，不核对版本。 */
const BINARY_VERSION_NOTE = "预检不核对版本：要确认它带 E32 接线和目标切换，也就是清单第 3.3 步说的 T5 版本";

/**
 * 已知缺口：还没定下来的环节。在补上之前 Gate B 跑不通，预检照实报告。
 * 详见清单第 4 节。
 */
export const KNOWN_GAPS = [
  {
    id: "gap-staging-access",
    detail:
      "staging 的公开地址要等 OA-56（owner 批准、加 DNS）；socket.io 和 CORS 预检怎么过门禁还在等 release 答复（REQ-desktop-026 12:35 补充）。",
  },
];

function candidates(program, platform) {
  return platform === "win32" ? [`${program}.exe`, `${program}.cmd`, `${program}.bat`, program] : [program];
}

/** 与 process.rs 的 resolve_cli_in_dirs 同样的规则：只在给定目录里找精确文件名。 */
export function resolveOnPath(program, pathValue, platform, isFile) {
  for (const dir of String(pathValue || "").split(platform === "win32" ? ";" : delimiter)) {
    if (!dir) continue;
    for (const name of candidates(program, platform)) {
      const full = join(dir, name);
      if (isFile(full)) return full;
    }
  }
  return null;
}

/** Cursor 安装脚本在 macOS / Linux 上的默认位置。 */
export function wellKnownAgentPaths(home, platform) {
  if (platform === "win32") return [join(home, "AppData", "Local", "cursor-agent", "agent.cmd")];
  return [join(home, ".local", "bin", "agent")];
}

/** 装好的应用（内测包拖进"应用程序"）里的可执行文件。只列 macOS；Windows 用源码构建的。 */
export function installedAppBinaries(home, platform) {
  if (platform !== "darwin") return [];
  const inner = join(`${APP_NAME}.app`, "Contents", "MacOS", "agentrix-desktop");
  return [join("/Applications", inner), join(home, "Applications", inner)];
}

/** 启动这个目标时开发者运行时用的钥匙串服务名（与 types.rs 的 ApiTarget::keyring_service 一致）。 */
export function keychainServiceFor(targetValue) {
  return targetValue === GATE_B_TARGET ? KEYCHAIN_SERVICE_STAGING : KEYCHAIN_SERVICE;
}

function check(id, status, detail) {
  return { id, status, detail };
}

/**
 * 纯函数：给定探针结果，给出检查项。`probe` 的每个函数都可以在测试里替换。
 * @param {object} probe
 * @param {string} probe.platform            process.platform
 * @param {Record<string,string|undefined>} probe.env
 * @param {string} probe.home
 * @param {string} probe.desktopRoot          desktop/ 目录
 * @param {(path: string) => boolean} probe.isFile
 * @param {(file: string) => {status: number|null, stdout: string}} probe.agentVersion
 * @param {(service: string, account: string) => "present"|"absent"|"unknown"} probe.keychainEntry
 */
export function runPreflight(probe) {
  const results = [];
  const { platform, env } = probe;

  results.push(
    check(
      "platform",
      platform === "darwin" || platform === "win32" ? "pass" : "manual",
      platform === "darwin" ? "macOS" : platform === "win32" ? "Windows" : `${platform}（没在这个平台上准备过 Gate B）`,
    ),
  );

  const onPath = resolveOnPath(LOCKED_PROGRAM, env.PATH, platform, probe.isFile);
  if (onPath) {
    results.push(check("agent-cli", "pass", `在 PATH 里找到 ${LOCKED_PROGRAM}`));
    const version = probe.agentVersion(onPath);
    const firstLine = String(version.stdout || "").split(/\r?\n/)[0].trim().slice(0, 80);
    results.push(
      version.status === 0 && firstLine
        ? check("agent-version", "pass", `agent --version：${firstLine}`)
        : check("agent-version", "fail", "agent --version 没有正常返回；先在终端里跑一次 agent，确认已登录 Cursor"),
    );
  } else {
    const elsewhere = wellKnownAgentPaths(probe.home, platform).find((path) => probe.isFile(path));
    results.push(
      check(
        "agent-cli",
        "fail",
        elsewhere
          ? `PATH 里没有 ${LOCKED_PROGRAM}，但默认安装位置有。把它所在目录加进 PATH，并从这个终端启动桌面应用（从访达或 Dock 打开的应用拿不到终端的 PATH）`
          : `没有找到 ${LOCKED_PROGRAM}。按 Cursor 文档安装 Cursor CLI（OA-09）`,
      ),
    );
  }

  for (const flag of RUNTIME_FLAGS) {
    const value = env[flag];
    results.push(
      check(
        `env-${flag}`,
        value === "1" ? "pass" : "fail",
        value === "1" ? `${flag}=1` : `${flag} ${value === undefined ? "没有设置" : "不是 \"1\""}；必须恰好是 "1"，并且在启动桌面应用的同一个终端里设置`,
      ),
    );
  }

  const target = env[API_TARGET_ENV];
  results.push(
    target === GATE_B_TARGET
      ? check(`env-${API_TARGET_ENV}`, "pass", `${API_TARGET_ENV}=${GATE_B_TARGET}：绑定、登录和运行时通道都连 staging`)
      : check(
          `env-${API_TARGET_ENV}`,
          "fail",
          `${API_TARGET_ENV} ${target === undefined ? "没有设置" : `不是 "${GATE_B_TARGET}"`}；Gate B 在 staging 上跑，不设就连生产。在启动桌面应用的同一个终端里设置`,
        ),
  );

  const binaryName = platform === "win32" ? "agentrix-desktop.exe" : "agentrix-desktop";
  const builtProfile = ["release", "debug"].find((profile) =>
    probe.isFile(join(probe.desktopRoot, "src-tauri", "target", profile, binaryName)),
  );
  const installed = installedAppBinaries(probe.home, platform).find((path) => probe.isFile(path));
  results.push(
    builtProfile
      ? check("desktop-binary", "pass", `源码构建：src-tauri/target/${builtProfile}/${binaryName}（${BINARY_VERSION_NOTE}）`)
      : installed
        ? check("desktop-binary", "pass", `已安装：${installed}（${BINARY_VERSION_NOTE}）`)
        : check("desktop-binary", "fail", `没有找到桌面应用：把内测包里的 ${APP_NAME}.app 拖进"应用程序"，或者从源码构建（清单第 3.3 步）`),
  );

  if (target === GATE_B_TARGET) {
    const gate = probe.keychainEntry(STAGING_GATE_SERVICE, STAGING_GATE_ACCOUNT);
    results.push(
      gate === "present"
        ? check("staging-gate-key", "pass", `钥匙串里有 ${STAGING_GATE_SERVICE} / ${STAGING_GATE_ACCOUNT}（没有读取内容）`)
        : gate === "absent"
          ? check("staging-gate-key", "fail", `钥匙串里没有 ${STAGING_GATE_SERVICE} / ${STAGING_GATE_ACCOUNT}：staging 的 /api/** 会返回 403。按清单第 3.4 步放进去（值找 release 要）`)
          : check("staging-gate-key", "manual", "这个平台上预检不检查钥匙串，按清单第 3.4 步自行确认"),
    );
  }

  const service = keychainServiceFor(target);
  const enrollment = probe.keychainEntry(service, KEYCHAIN_ENROLLMENT_ACCOUNT);
  results.push(
    enrollment === "present"
      ? check("binding", "pass", `钥匙串里有 ${service} / ${KEYCHAIN_ENROLLMENT_ACCOUNT}（没有读取内容）；在应用里确认"已绑定"`)
      : enrollment === "absent"
        ? check("binding", "manual", `还没绑定：启动后在"这台电脑 → 绑定这台电脑"里点一次（清单第 3.5 步）`)
        : check("binding", "manual", "这个平台上预检不检查钥匙串，在应用里看绑定状态"),
  );

  results.push(check("backend", "manual", "staging 的开关、canonical tenant（tenant:assign）由 release / backend 确认，预检不发网络请求"));

  for (const gap of KNOWN_GAPS) results.push(check(gap.id, "blocked", gap.detail));
  return results;
}

export function exitCodeFor(results) {
  if (results.some((item) => item.status === "fail")) return 1;
  if (results.some((item) => item.status === "blocked")) return 2;
  return 0;
}

const STATUS_TEXT = { pass: "通过", fail: "未通过", manual: "人工确认", blocked: "已知缺口" };

export function formatTable(results) {
  return results.map((item) => `[${STATUS_TEXT[item.status] || item.status}] ${item.id}：${item.detail}`).join("\n");
}

// ── 真实探针 ──────────────────────────────────────────────────────────────

function realIsFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function realAgentVersion(file) {
  const result = spawnSync(file, ["--version"], { encoding: "utf8", timeout: 5000, shell: process.platform === "win32" });
  return { status: result.status, stdout: result.stdout || "" };
}

function realKeychainEntry(service, account) {
  if (process.platform !== "darwin") return "unknown";
  // 不带 -w / -g：不输出秘密；stdout、stderr 都丢掉，只看退出码。
  const result = spawnSync("security", ["find-generic-password", "-s", service, "-a", account], {
    stdio: "ignore",
    timeout: 5000,
  });
  if (result.status === 0) return "present";
  if (result.status === 44) return "absent"; // errSecItemNotFound
  return "unknown";
}

function main(argv) {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const results = runPreflight({
    platform: process.platform,
    env: process.env,
    home: homedir(),
    desktopRoot: existsSync(desktopRoot) ? desktopRoot : process.cwd(),
    isFile: realIsFile,
    agentVersion: realAgentVersion,
    keychainEntry: realKeychainEntry,
  });
  process.stdout.write(argv.includes("--json") ? `${JSON.stringify(results, null, 2)}\n` : `${formatTable(results)}\n`);
  process.exitCode = exitCodeFor(results);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
