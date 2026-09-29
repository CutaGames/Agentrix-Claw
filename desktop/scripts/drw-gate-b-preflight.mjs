#!/usr/bin/env node
/**
 * DRW Gate B 预检（只读）。在 owner 的电脑上、准备启动桌面应用的同一个终端里运行：
 *
 *   node scripts/drw-gate-b-preflight.mjs          # 表格
 *   node scripts/drw-gate-b-preflight.mjs --json   # 机器可读
 *
 * 只检查，不改任何东西：不写钥匙串、不装 CLI、不发网络请求、不启动 agent 进程
 * （只跑 `agent --version`）。输出里不会出现任何秘密值：钥匙串只看"有没有"，
 * 环境变量只报告是不是恰好为 "1"。
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
export const KEYCHAIN_SERVICE = "agentrix.developer_runtime";
export const KEYCHAIN_CHANNEL_ACCOUNT = "channel_bearer_v1";
/** CURSOR_ACP_LOCAL_COMMAND_LOCK：program "agent"，args ["acp"]。 */
export const LOCKED_PROGRAM = "agent";

/**
 * 已知缺口：代码里还没有的环节。在补上之前 Gate B 跑不通，预检照实报告。
 * 详见清单第 4 节和 REQ-desktop-012。
 */
export const KNOWN_GAPS = [
  {
    id: "gap-channel-credential",
    detail:
      "产品代码里没有任何地方把通道凭据写进钥匙串（只有 Rust 测试 harness 写）。Gate B 只能按清单手动放入；正式做法待定（REQ-desktop-012）。",
  },
  {
    id: "gap-first-bind",
    detail:
      "首次绑定没有客户端接线：没人调用 POST /v1/developer/runtime/binding/bootstraps；它要求已有 machine 和已信任的 workspace，而这两条记录只能由绑定之后的 heartbeat 写入（先有鸡还是先有蛋）。待定（REQ-desktop-012）。",
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
 * @param {() => "present"|"absent"|"unknown"} probe.keychainChannelCredential
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

  const binaryName = platform === "win32" ? "agentrix-desktop.exe" : "agentrix-desktop";
  const builtProfile = ["release", "debug"].find((profile) =>
    probe.isFile(join(probe.desktopRoot, "src-tauri", "target", profile, binaryName)),
  );
  results.push(
    builtProfile
      ? check("desktop-binary", "pass", `已构建：src-tauri/target/${builtProfile}/${binaryName}`)
      : check("desktop-binary", "fail", "还没有构建桌面应用（npm run build 之后 cargo build，或 npm run tauri build）"),
  );

  const credential = probe.keychainChannelCredential();
  results.push(
    credential === "present"
      ? check("channel-credential", "pass", `钥匙串里有 ${KEYCHAIN_SERVICE} / ${KEYCHAIN_CHANNEL_ACCOUNT}（没有读取内容）`)
      : credential === "absent"
        ? check("channel-credential", "fail", `钥匙串里没有 ${KEYCHAIN_SERVICE} / ${KEYCHAIN_CHANNEL_ACCOUNT}；按清单第 3.4 步手动放入`)
        : check("channel-credential", "manual", "这个平台上预检不检查钥匙串，按清单第 3.4 步自行确认"),
  );

  results.push(check("backend", "manual", "后端 DRW 开关、canonical tenant（tenant:assign）由 release / backend 确认，预检不发网络请求"));

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

function realKeychainChannelCredential() {
  if (process.platform !== "darwin") return "unknown";
  // 不带 -w / -g：不输出秘密；stdout、stderr 都丢掉，只看退出码。
  const result = spawnSync("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_CHANNEL_ACCOUNT], {
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
    keychainChannelCredential: realKeychainChannelCredential,
  });
  process.stdout.write(argv.includes("--json") ? `${JSON.stringify(results, null, 2)}\n` : `${formatTable(results)}\n`);
  process.exitCode = exitCodeFor(results);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
